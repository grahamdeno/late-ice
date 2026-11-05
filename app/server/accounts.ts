// Accounts, sign-in, the draft pool, captain roster tools, and name privacy.
// Model: a `players` row is a slot. Scanned sheets create slots; registered
// users get linked to slots (claim or captain match) or get new slots by draft.
// Linking is reversible (captain can release a wrong claim). Merging two slots
// is explicit and logged.
import crypto from "node:crypto";
import type { Express, Request, Response, NextFunction } from "express";
import { sqlite, LEVEL_START } from "./db";
import { similarity } from "./services";

const q = <T = any>(sql: string, ...p: any[]) => sqlite.prepare(sql).all(...p) as T[];
const one = <T = any>(sql: string, ...p: any[]) => sqlite.prepare(sql).get(...p) as T | undefined;
const run = (sql: string, ...p: any[]) => sqlite.prepare(sql).run(...p);

/* ---------- schema ---------- */

function hasColumn(table: string, col: string) {
  return q<{ name: string }>(`PRAGMA table_info(${table})`).some((c) => c.name === col);
}
function addColumn(table: string, col: string, def: string) {
  if (!hasColumn(table, col)) sqlite.exec(`ALTER TABLE ${table} ADD COLUMN ${col} ${def}`);
}

export function migrateAccounts() {
  sqlite.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    phone TEXT UNIQUE NOT NULL,
    name TEXT,
    number TEXT,
    position TEXT,
    home_rink_id INTEGER REFERENCES rinks(id),
    status TEXT NOT NULL DEFAULT 'available',
    status_until TEXT,
    hidden INTEGER NOT NULL DEFAULT 0,
    created_at TEXT DEFAULT (datetime('now'))
  );
  CREATE TABLE IF NOT EXISTS auth_codes (
    phone TEXT PRIMARY KEY,
    code_hash TEXT NOT NULL,
    expires_at INTEGER NOT NULL,
    attempts INTEGER NOT NULL DEFAULT 0,
    sends INTEGER NOT NULL DEFAULT 0,
    window_start INTEGER NOT NULL
  );
  CREATE TABLE IF NOT EXISTS sessions (
    token_hash TEXT PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id),
    created_at TEXT DEFAULT (datetime('now')),
    last_seen TEXT DEFAULT (datetime('now'))
  );
  CREATE TABLE IF NOT EXISTS team_roles (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    team_id INTEGER NOT NULL REFERENCES teams(id),
    user_id INTEGER NOT NULL REFERENCES users(id),
    role TEXT NOT NULL,
    created_at TEXT DEFAULT (datetime('now')),
    UNIQUE(team_id, user_id, role)
  );
  CREATE TABLE IF NOT EXISTS roster_actions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    team_id INTEGER NOT NULL REFERENCES teams(id),
    actor_user_id INTEGER REFERENCES users(id),
    action TEXT NOT NULL,
    player_id INTEGER,
    target_user_id INTEGER,
    detail TEXT,
    created_at TEXT DEFAULT (datetime('now'))
  );
  CREATE TABLE IF NOT EXISTS notifications (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL REFERENCES users(id),
    kind TEXT NOT NULL,
    title TEXT NOT NULL,
    body TEXT,
    link TEXT,
    team_id INTEGER,
    player_id INTEGER,
    read_at TEXT,
    created_at TEXT DEFAULT (datetime('now'))
  );
  CREATE TABLE IF NOT EXISTS hide_requests (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    player_id INTEGER NOT NULL REFERENCES players(id),
    contact TEXT,
    note TEXT,
    created_at TEXT DEFAULT (datetime('now'))
  );
  `);
  addColumn("players", "user_id", "INTEGER REFERENCES users(id)");
  addColumn("players", "hidden", "INTEGER NOT NULL DEFAULT 0");
  addColumn("players", "display_name", "TEXT");
  addColumn("roster_entries", "source", "TEXT DEFAULT 'sheet'");
  addColumn("roster_entries", "added_at", "TEXT");
  sqlite.exec("CREATE INDEX IF NOT EXISTS players_user ON players(user_id)");
}

/* ---------- name privacy ---------- */

/** "Mike Tolliver" -> "Mike T." ; "Tolliver" -> "T." ; "#9" stays. Unclaimed names never go out in full. */
export function obfuscate(name: string) {
  const t = name.trim().split(/\s+/).filter(Boolean);
  if (!t.length) return "Player";
  if (t.length === 1) return /^[#\d]/.test(t[0]) ? t[0] : `${t[0][0].toUpperCase()}.`;
  const last = t[t.length - 1].replace(/[^A-Za-z]/g, "");
  return `${t[0]} ${last ? last[0].toUpperCase() + "." : ""}`.trim();
}

function displayFor(p: any): string {
  if (p.hidden) {
    const n = one<{ number: string | null }>("SELECT number FROM roster_entries WHERE player_id=? AND number IS NOT NULL LIMIT 1", p.id)?.number;
    return n ? `Player #${n}` : "Hidden player";
  }
  if (p.user_id) {
    const u = one<any>("SELECT name, hidden FROM users WHERE id=?", p.user_id);
    if (u?.hidden) {
      const n = one<{ number: string | null }>("SELECT number FROM roster_entries WHERE player_id=? AND number IS NOT NULL LIMIT 1", p.id)?.number;
      return n ? `Player #${n}` : "Hidden player";
    }
    if (u?.name) return u.name;
  }
  return obfuscate(p.name);
}

export function refreshDisplay(playerId: number) {
  const p = one<any>("SELECT * FROM players WHERE id=?", playerId);
  if (p) run("UPDATE players SET display_name=? WHERE id=?", displayFor(p), p.id);
}
export function refreshAllDisplay() {
  const tx = sqlite.transaction(() => {
    for (const p of q<any>("SELECT * FROM players")) {
      const d = displayFor(p);
      if (d !== p.display_name) run("UPDATE players SET display_name=? WHERE id=?", d, p.id);
    }
  });
  tx();
}

/* ---------- sign-in ---------- */

export function normalizePhone(raw: string | undefined | null): string | null {
  const d = String(raw || "").replace(/\D/g, "");
  if (d.length === 10) return `+1${d}`;
  if (d.length === 11 && d.startsWith("1")) return `+${d}`;
  return null;
}
const sha = (s: string) => crypto.createHash("sha256").update(s).digest("hex");
const CODE_TTL = 10 * 60 * 1000;
const SEND_WINDOW = 60 * 60 * 1000;
const MAX_SENDS = 5;
const MAX_ATTEMPTS = 5;

const twilio = () => {
  const sid = process.env.TWILIO_ACCOUNT_SID, token = process.env.TWILIO_AUTH_TOKEN;
  const from = process.env.TWILIO_FROM, svc = process.env.TWILIO_MESSAGING_SERVICE_SID;
  return sid && token && (from || svc) ? { sid, token, from, svc } : null;
};
/** Without a text provider the pilot runs in test mode: the code comes back in the response. */
export const smsTestMode = () => !twilio() && process.env.SMS_TEST_MODE !== "0";

export async function sendText(to: string, body: string) {
  const t = twilio();
  if (!t) { console.log(`[sms:test] to ${to}: ${body}`); return; }
  const form = new URLSearchParams({ To: to, Body: body });
  if (t.svc) form.set("MessagingServiceSid", t.svc); else form.set("From", t.from!);
  const res = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${t.sid}/Messages.json`, {
    method: "POST",
    headers: { Authorization: "Basic " + Buffer.from(`${t.sid}:${t.token}`).toString("base64"), "Content-Type": "application/x-www-form-urlencoded" },
    body: form,
  });
  if (!res.ok) throw Object.assign(new Error("Couldn't send the text. Try again in a minute."), { status: 502, detail: await res.text() });
}

export interface AuthedRequest extends Request { user?: any }

export function userFromRequest(req: Request) {
  const h = req.headers.authorization || "";
  const m = h.match(/^Bearer\s+(.+)$/i);
  if (!m) return null;
  const s = one<any>("SELECT * FROM sessions WHERE token_hash=?", sha(m[1].trim()));
  if (!s) return null;
  run("UPDATE sessions SET last_seen=datetime('now') WHERE token_hash=?", s.token_hash);
  return one<any>("SELECT * FROM users WHERE id=?", s.user_id) ?? null;
}

const err = (status: number, message: string, extra: object = {}) => Object.assign(new Error(message), { status, ...extra });

function requireUser(req: AuthedRequest) {
  const u = userFromRequest(req);
  if (!u) throw err(401, "Sign in first.");
  return u;
}

/* ---------- helpers ---------- */

function notify(userId: number, n: { kind: string; title: string; body?: string; link?: string; teamId?: number; playerId?: number }) {
  run(
    "INSERT INTO notifications (user_id,kind,title,body,link,team_id,player_id) VALUES (?,?,?,?,?,?,?)",
    userId, n.kind, n.title, n.body ?? null, n.link ?? null, n.teamId ?? null, n.playerId ?? null,
  );
}
function logAction(teamId: number, actor: number | null, action: string, playerId: number | null, targetUser: number | null, detail?: object) {
  run(
    "INSERT INTO roster_actions (team_id,actor_user_id,action,player_id,target_user_id,detail) VALUES (?,?,?,?,?,?)",
    teamId, actor, action, playerId, targetUser, detail ? JSON.stringify(detail) : null,
  );
}

function teamOrThrow(teamId: number) {
  const t = one<any>("SELECT t.*, l.rink_id, l.level FROM teams t JOIN leagues l ON l.id=t.league_id WHERE t.id=?", teamId);
  if (!t) throw err(404, "Team not found");
  return t;
}
export function captainOf(teamId: number) {
  return one<any>(
    "SELECT u.id, u.name FROM team_roles r JOIN users u ON u.id=r.user_id WHERE r.team_id=? AND r.role='captain' ORDER BY r.id LIMIT 1", teamId,
  ) ?? null;
}
function isCaptain(userId: number, teamId: number) {
  return !!one("SELECT 1 FROM team_roles WHERE team_id=? AND user_id=? AND role='captain'", teamId, userId);
}
function requireCaptain(user: any, teamId: number) {
  const t = teamOrThrow(teamId);
  if (!isCaptain(user.id, teamId)) throw err(403, "Only the team captain can do that.");
  return t;
}
function onTeam(userId: number, teamId: number) {
  return !!one("SELECT 1 FROM roster_entries re JOIN players p ON p.id=re.player_id WHERE re.team_id=? AND p.user_id=?", teamId, userId);
}
function slotOnTeam(teamId: number, playerId: number) {
  const s = one<any>(
    "SELECT p.*, re.number, re.source FROM roster_entries re JOIN players p ON p.id=re.player_id WHERE re.team_id=? AND re.player_id=?", teamId, playerId,
  );
  if (!s) throw err(404, "That player isn't on this team's roster.");
  return s;
}
function userOrThrow(userId: number) {
  const u = one<any>("SELECT * FROM users WHERE id=?", userId);
  if (!u || !u.name) throw err(404, "That player hasn't finished registering.");
  return u;
}
function cleanNumber(n: unknown) {
  const s = String(n ?? "").replace(/[^0-9]/g, "").slice(0, 2);
  return s || null;
}
const POSITIONS = new Set(["F", "D", "G"]);
const STATUSES = new Set(["available", "ir", "away", "resting"]);

export function publicUser(u: any) {
  if (!u) return null;
  const rink = u.home_rink_id ? one<any>("SELECT id,name FROM rinks WHERE id=?", u.home_rink_id) : null;
  return {
    id: u.id, phone: u.phone, name: u.name, number: u.number, position: u.position, homeRink: rink,
    status: u.status, statusUntil: u.status_until, hidden: !!u.hidden, profileComplete: !!(u.name && u.position && u.home_rink_id),
  };
}

/** Merge slot `fromId` into `intoId`: stats, history, imports and roster spots move; the from slot is deleted. */
export function mergePlayers(fromId: number, intoId: number) {
  if (fromId === intoId) throw err(400, "Pick two different players.");
  const a = one<any>("SELECT * FROM players WHERE id=?", fromId), b = one<any>("SELECT * FROM players WHERE id=?", intoId);
  if (!a || !b) throw err(404, "Player not found");
  if (a.user_id && b.user_id && a.user_id !== b.user_id) throw err(409, "Both are linked to different registered players. Release one first.");
  const tx = sqlite.transaction(() => {
    run("UPDATE player_game_stats SET player_id=? WHERE player_id=?", intoId, fromId);
    run("UPDATE rating_history SET player_id=? WHERE player_id=?", intoId, fromId);
    run("UPDATE player_imports SET player_id=? WHERE player_id=?", intoId, fromId);
    run("UPDATE hide_requests SET player_id=? WHERE player_id=?", intoId, fromId);
    for (const re of q<any>("SELECT * FROM roster_entries WHERE player_id=?", fromId)) {
      const has = one<any>("SELECT * FROM roster_entries WHERE team_id=? AND player_id=?", re.team_id, intoId);
      if (has) { if (!has.number && re.number) run("UPDATE roster_entries SET number=? WHERE id=?", re.number, has.id); run("DELETE FROM roster_entries WHERE id=?", re.id); }
      else run("UPDATE roster_entries SET player_id=? WHERE id=?", intoId, re.id);
    }
    // Keep the rating with more evidence behind it; games add up.
    const keep = (a.games_rated || 0) > (b.games_rated || 0) ? a : b;
    run(
      "UPDATE players SET rating=?, games_rated=?, user_id=COALESCE(user_id,?), claimed=MAX(claimed,?), hidden=MAX(hidden,?) WHERE id=?",
      keep.rating, (a.games_rated || 0) + (b.games_rated || 0), a.user_id, a.claimed || 0, a.hidden || 0, intoId,
    );
    run("UPDATE notifications SET player_id=? WHERE player_id=?", intoId, fromId);
    run("DELETE FROM players WHERE id=?", fromId);
    refreshDisplay(intoId);
  });
  tx();
}

function linkSlot(playerId: number, userId: number) {
  run("UPDATE players SET user_id=?, claimed=1 WHERE id=?", userId, playerId);
  const u = one<any>("SELECT * FROM users WHERE id=?", userId);
  if (u?.position && u.position !== "G") {
    const p = one<any>("SELECT position FROM players WHERE id=?", playerId);
    if (p && p.position !== "G") run("UPDATE players SET position=? WHERE id=?", u.position, playerId);
  }
  refreshDisplay(playerId);
}
function unlinkSlot(playerId: number) {
  run("UPDATE players SET user_id=NULL, claimed=0 WHERE id=?", playerId);
  refreshDisplay(playerId);
}

/** Unlinked slots at the user's home rink that look like them: name similarity, number as a tiebreaker. */
export function suggestionsFor(u: any) {
  if (!u?.name || !u.home_rink_id) return [];
  const rows = q<any>(
    `SELECT p.id, p.name, p.display_name, p.rating, re.number, t.id team_id, t.name team_name, t.color, t.logo, l.level
     FROM roster_entries re JOIN players p ON p.id=re.player_id JOIN teams t ON t.id=re.team_id JOIN leagues l ON l.id=t.league_id
     WHERE p.user_id IS NULL AND l.rink_id=? AND l.level<>'DEMO'`, u.home_rink_id,
  );
  const first = (s: string) => (s.trim().split(/\s+/)[0] || "").replace(/[^a-z]/gi, "").toLowerCase();
  const lastInit = (s: string) => { const t = s.trim().split(/\s+/); return t.length > 1 ? t[t.length - 1][0]?.toLowerCase() : ""; };
  return rows
    .map((r) => {
      let score = similarity(u.name, r.name);
      // "Graham DeNoyer" vs a posted "Graham D.": same first name and last initial is a strong hint.
      if (first(u.name) && first(u.name) === first(r.name) && lastInit(u.name) && lastInit(u.name) === lastInit(r.name)) score = Math.max(score, 0.8);
      if (u.number && r.number && u.number === r.number) score += 0.2;
      return { ...r, score };
    })
    .filter((r) => r.score >= 0.6)
    .sort((a, b) => b.score - a.score)
    .slice(0, 5)
    .map(({ name: _real, display_name, ...r }) => ({ ...r, name: display_name }));
}

/* ---------- routes ---------- */

const wrap = (fn: (req: AuthedRequest, res: Response) => any) => (req: Request, res: Response, _next: NextFunction) =>
  Promise.resolve()
    .then(() => fn(req as AuthedRequest, res))
    .catch((e: any) => {
      if (!e?.status) console.error(e);
      res.status(e?.status || 500).json({ message: e?.status ? e.message : "Something went wrong on the server." });
    });

export function registerAccountRoutes(app: Express) {
  migrateAccounts();
  refreshAllDisplay();

  /* sign-in */
  app.get("/api/auth/config", (_req, res) => res.json({ smsTestMode: smsTestMode() }));

  app.post("/api/auth/start", wrap(async (req, res) => {
    const phone = normalizePhone(req.body?.phone);
    if (!phone) throw err(400, "Enter a 10-digit US mobile number.");
    const now = Date.now();
    const row = one<any>("SELECT * FROM auth_codes WHERE phone=?", phone);
    const inWindow = row && now - row.window_start < SEND_WINDOW;
    if (inWindow && row.sends >= MAX_SENDS) throw err(429, "Too many codes for this number. Try again in an hour.");
    const code = String(crypto.randomInt(0, 1_000_000)).padStart(6, "0");
    run(
      `INSERT INTO auth_codes (phone,code_hash,expires_at,attempts,sends,window_start) VALUES (?,?,?,0,1,?)
       ON CONFLICT(phone) DO UPDATE SET code_hash=excluded.code_hash, expires_at=excluded.expires_at, attempts=0,
         sends=CASE WHEN ?=1 THEN auth_codes.sends+1 ELSE 1 END, window_start=CASE WHEN ?=1 THEN auth_codes.window_start ELSE excluded.window_start END`,
      phone, sha(phone + code), now + CODE_TTL, now, inWindow ? 1 : 0, inWindow ? 1 : 0,
    );
    await sendText(phone, `Late Ice code: ${code}. It expires in 10 minutes.`);
    res.json({ sent: true, phone, ...(smsTestMode() ? { testCode: code } : {}) });
  }));

  app.post("/api/auth/verify", wrap((req, res) => {
    const phone = normalizePhone(req.body?.phone);
    const code = String(req.body?.code || "").replace(/\D/g, "");
    if (!phone || code.length !== 6) throw err(400, "Enter the six-digit code.");
    const row = one<any>("SELECT * FROM auth_codes WHERE phone=?", phone);
    if (!row || row.expires_at < Date.now()) throw err(400, "That code expired. Send a new one.");
    if (row.attempts >= MAX_ATTEMPTS) throw err(429, "Too many tries. Send a new code.");
    if (row.code_hash !== sha(phone + code)) {
      run("UPDATE auth_codes SET attempts=attempts+1 WHERE phone=?", phone);
      throw err(400, "That code doesn't match.");
    }
    run("DELETE FROM auth_codes WHERE phone=?", phone);
    let user = one<any>("SELECT * FROM users WHERE phone=?", phone);
    if (!user) user = one<any>("SELECT * FROM users WHERE id=?", run("INSERT INTO users (phone) VALUES (?)", phone).lastInsertRowid);
    const token = crypto.randomBytes(32).toString("base64url");
    run("INSERT INTO sessions (token_hash,user_id) VALUES (?,?)", sha(token), user.id);
    res.json({ token, user: publicUser(user) });
  }));

  app.post("/api/auth/logout", wrap((req, res) => {
    const m = (req.headers.authorization || "").match(/^Bearer\s+(.+)$/i);
    if (m) run("DELETE FROM sessions WHERE token_hash=?", sha(m[1].trim()));
    res.json({ ok: true });
  }));

  /* me */
  app.get("/api/me", wrap((req, res) => {
    const u = userFromRequest(req);
    if (!u) return res.status(401).json({ message: "Not signed in" });
    const slots = q<any>(
      `SELECT p.id, p.display_name name, p.rating, p.games_rated, p.position, re.number, re.source, t.id team_id, t.name team_name, t.color, t.logo, l.id league_id, l.level, l.name league_name
       FROM players p JOIN roster_entries re ON re.player_id=p.id JOIN teams t ON t.id=re.team_id JOIN leagues l ON l.id=t.league_id
       WHERE p.user_id=? ORDER BY l.sort`, u.id,
    ).map((s) => ({ ...s, captain: captainOf(s.team_id), isCaptain: isCaptain(u.id, s.team_id) }));
    const captainTeams = q<any>(
      "SELECT t.id, t.name, t.color, t.logo, l.level, l.rink_id FROM team_roles r JOIN teams t ON t.id=r.team_id JOIN leagues l ON l.id=t.league_id WHERE r.user_id=? AND r.role='captain'", u.id,
    );
    const notifications = q<any>("SELECT * FROM notifications WHERE user_id=? ORDER BY id DESC LIMIT 30", u.id);
    const unread = one<{ c: number }>("SELECT COUNT(*) c FROM notifications WHERE user_id=? AND read_at IS NULL", u.id)!.c;
    res.json({ user: publicUser(u), slots, captainTeams, notifications, unread, suggestions: suggestionsFor(u) });
  }));

  app.patch("/api/me", wrap((req, res) => {
    const u = requireUser(req);
    const b = req.body || {};
    const next = { ...u };
    if (b.name !== undefined) {
      const n = String(b.name).trim().replace(/\s+/g, " ").slice(0, 60);
      if (n.split(" ").length < 2) throw err(400, "First and last name, so your captain knows it's you.");
      next.name = n;
    }
    if (b.number !== undefined) next.number = cleanNumber(b.number);
    if (b.position !== undefined) { if (!POSITIONS.has(b.position)) throw err(400, "Pick forward, defense or goalie."); next.position = b.position; }
    if (b.homeRinkId !== undefined) { if (!one("SELECT 1 FROM rinks WHERE id=?", Number(b.homeRinkId))) throw err(400, "Pick your home rink."); next.home_rink_id = Number(b.homeRinkId); }
    if (b.status !== undefined) { if (!STATUSES.has(b.status)) throw err(400, "Unknown status."); next.status = b.status; next.status_until = b.status === "ir" || b.status === "away" ? (b.statusUntil || null) : null; }
    if (b.hidden !== undefined) next.hidden = b.hidden ? 1 : 0;
    run(
      "UPDATE users SET name=?, number=?, position=?, home_rink_id=?, status=?, status_until=?, hidden=? WHERE id=?",
      next.name, next.number, next.position, next.home_rink_id, next.status, next.status_until, next.hidden, u.id,
    );
    for (const p of q<{ id: number }>("SELECT id FROM players WHERE user_id=?", u.id)) refreshDisplay(p.id);
    res.json({ user: publicUser(one("SELECT * FROM users WHERE id=?", u.id)) });
  }));

  app.post("/api/me/notifications/read", wrap((req, res) => {
    const u = requireUser(req);
    run("UPDATE notifications SET read_at=datetime('now') WHERE user_id=? AND read_at IS NULL", u.id);
    res.json({ ok: true });
  }));

  app.get("/api/rinks", (_req, res) => res.json(q("SELECT id, name, address FROM rinks ORDER BY name")));

  /* player self-claim */
  app.post("/api/players/:id/claim", wrap((req, res) => {
    const u = requireUser(req);
    if (!u.name) throw err(400, "Finish your profile first.");
    const p = one<any>("SELECT * FROM players WHERE id=?", Number(req.params.id));
    if (!p) throw err(404, "Player not found");
    if (p.user_id === u.id) return res.json({ ok: true });
    if (p.user_id) throw err(409, "Someone already claimed this player. Ask your captain to sort it out.");
    const teams = q<any>("SELECT re.team_id, re.number, t.name FROM roster_entries re JOIN teams t ON t.id=re.team_id WHERE re.player_id=?", p.id);
    linkSlot(p.id, u.id);
    for (const t of teams) {
      logAction(t.team_id, u.id, "claim", p.id, u.id);
      const cap = captainOf(t.team_id);
      if (cap && cap.id !== u.id) {
        notify(cap.id, {
          kind: "claim", teamId: t.team_id, playerId: p.id, link: `/team/${t.team_id}`,
          title: `${u.name} claimed ${t.number ? "#" + t.number : "a spot"} on ${t.name}`,
          body: "If that's not them, release the claim from the roster.",
        });
      }
    }
    res.json({ ok: true });
  }));

  /* anyone can hide a name, no account needed */
  app.post("/api/players/:id/hide", wrap((req, res) => {
    const p = one<any>("SELECT * FROM players WHERE id=?", Number(req.params.id));
    if (!p) throw err(404, "Player not found");
    run("INSERT INTO hide_requests (player_id,contact,note) VALUES (?,?,?)", p.id, String(req.body?.contact || "").slice(0, 120) || null, String(req.body?.note || "").slice(0, 500) || null);
    run("UPDATE players SET hidden=1 WHERE id=?", p.id);
    refreshDisplay(p.id);
    res.json({ ok: true, name: one<any>("SELECT display_name FROM players WHERE id=?", p.id).display_name });
  }));

  app.post("/api/players/:id/unhide", wrap((req, res) => {
    const u = requireUser(req);
    const p = one<any>("SELECT * FROM players WHERE id=?", Number(req.params.id));
    if (!p) throw err(404, "Player not found");
    const teamIds = q<{ team_id: number }>("SELECT team_id FROM roster_entries WHERE player_id=?", p.id).map((r) => r.team_id);
    if (p.user_id !== u.id && !teamIds.some((t) => isCaptain(u.id, t))) throw err(403, "Only the player or their captain can show this name again.");
    run("UPDATE players SET hidden=0 WHERE id=?", p.id);
    refreshDisplay(p.id);
    res.json({ ok: true });
  }));

  /* captaincy */
  app.post("/api/teams/:id/captain", wrap((req, res) => {
    const u = requireUser(req);
    const teamId = Number(req.params.id);
    const t = teamOrThrow(teamId);
    if (t.is_sample) throw err(400, "Placeholder teams can't have captains. Scan a real sheet first.");
    const cap = captainOf(teamId);
    if (cap) {
      if (cap.id === u.id) return res.json({ ok: true });
      if (!onTeam(u.id, teamId)) throw err(403, "Only players on this roster can contest the captain.");
      logAction(teamId, u.id, "contest", null, cap.id);
      notify(cap.id, { kind: "contest", teamId, link: `/team/${teamId}`, title: `${u.name} says they're the captain of ${t.name}`, body: "Talk it out. A rink admin can reassign the captain." });
      return res.status(202).json({ ok: true, contested: true });
    }
    if (!onTeam(u.id, teamId)) throw err(403, "Claim your spot on this roster first, then you can take the captain role.");
    run("INSERT OR IGNORE INTO team_roles (team_id,user_id,role) VALUES (?,?,'captain')", teamId, u.id);
    logAction(teamId, u.id, "captain", null, u.id);
    res.json({ ok: true });
  }));

  app.post("/api/teams/:id/captain/step-down", wrap((req, res) => {
    const u = requireUser(req);
    const teamId = Number(req.params.id);
    requireCaptain(u, teamId);
    run("DELETE FROM team_roles WHERE team_id=? AND user_id=? AND role='captain'", teamId, u.id);
    logAction(teamId, u.id, "step_down", null, u.id);
    res.json({ ok: true });
  }));

  app.patch("/api/teams/:id", wrap((req, res) => {
    const u = requireUser(req);
    const teamId = Number(req.params.id);
    const t = requireCaptain(u, teamId);
    const name = req.body?.name !== undefined ? String(req.body.name).trim().slice(0, 50) : t.name;
    const color = req.body?.color !== undefined ? String(req.body.color) : t.color;
    if (!name) throw err(400, "Team name can't be empty.");
    if (!/^#[0-9a-fA-F]{6}$/.test(color)) throw err(400, "Pick a color.");
    run("UPDATE teams SET name=?, color=? WHERE id=?", name, color, teamId);
    logAction(teamId, u.id, "edit_team", null, null, { from: { name: t.name, color: t.color }, to: { name, color } });
    res.json({ ok: true });
  }));

  /* captain roster view: who's registered, who isn't, recent actions */
  app.get("/api/teams/:id/manage", wrap((req, res) => {
    const u = requireUser(req);
    const teamId = Number(req.params.id);
    const t = requireCaptain(u, teamId);
    const slots = q<any>(
      `SELECT p.id, p.display_name name, p.rating, p.position, p.hidden, p.user_id, re.number, re.source,
         u.name user_name, u.status, u.status_until,
         (SELECT COUNT(*) FROM player_game_stats s WHERE s.player_id=p.id AND s.team_id=re.team_id) gp
       FROM roster_entries re JOIN players p ON p.id=re.player_id LEFT JOIN users u ON u.id=p.user_id
       WHERE re.team_id=? ORDER BY CAST(re.number AS INTEGER), p.display_name`, teamId,
    ).map((s) => ({ ...s, registered: !!s.user_id, user_name: s.user_id ? s.user_name : null }));
    const actions = q<any>(
      `SELECT a.*, au.name actor, tu.name target, p.display_name player FROM roster_actions a
       LEFT JOIN users au ON au.id=a.actor_user_id LEFT JOIN users tu ON tu.id=a.target_user_id LEFT JOIN players p ON p.id=a.player_id
       WHERE a.team_id=? ORDER BY a.id DESC LIMIT 25`, teamId,
    );
    res.json({ team: { id: t.id, name: t.name, color: t.color, logo: t.logo, level: t.level, rinkId: t.rink_id }, slots, actions });
  }));

  /* the draft pool: registered players at a rink, visible to captains there */
  app.get("/api/pool", wrap((req, res) => {
    const u = requireUser(req);
    const rinkId = Number(req.query.rink || u.home_rink_id || 0);
    const captainHere = one("SELECT 1 FROM team_roles r JOIN teams t ON t.id=r.team_id JOIN leagues l ON l.id=t.league_id WHERE r.user_id=? AND r.role='captain' AND l.rink_id=?", u.id, rinkId);
    if (!captainHere) throw err(403, "The draft pool is for captains at this rink.");
    const rows = q<any>(
      `SELECT u.id, u.name, u.number, u.position, u.status, u.status_until, u.created_at FROM users u
       WHERE u.home_rink_id=? AND u.name IS NOT NULL ORDER BY u.name`, rinkId,
    ).map((x) => {
      const slots = q<any>(
        `SELECT t.id team_id, t.name team_name, l.level, p.rating, p.games_rated FROM players p JOIN roster_entries re ON re.player_id=p.id
         JOIN teams t ON t.id=re.team_id JOIN leagues l ON l.id=t.league_id WHERE p.user_id=? AND l.level<>'DEMO'`, x.id,
      );
      const rated = slots.filter((s) => s.games_rated > 0).sort((a, b) => b.games_rated - a.games_rated)[0];
      return { ...x, teams: slots.map((s) => ({ id: s.team_id, name: s.team_name, level: s.level })), rating: rated?.rating ?? slots[0]?.rating ?? null };
    });
    res.json({ rinkId, players: rows });
  }));

  /* draft: pull a registered player onto the team */
  app.post("/api/teams/:id/draft", wrap((req, res) => {
    const u = requireUser(req);
    const teamId = Number(req.params.id);
    const t = requireCaptain(u, teamId);
    const target = userOrThrow(Number(req.body?.userId));
    if (target.home_rink_id !== t.rink_id) throw err(400, "That player's home rink is somewhere else.");
    if (onTeam(target.id, teamId)) throw err(409, `${target.name} is already on ${t.name}.`);
    const number = cleanNumber(req.body?.number ?? target.number);
    if (number) {
      const clash = one<any>("SELECT p.id, p.display_name, p.user_id FROM roster_entries re JOIN players p ON p.id=re.player_id WHERE re.team_id=? AND re.number=?", teamId, number);
      if (clash) {
        throw err(409, clash.user_id
          ? `#${number} is taken by ${clash.display_name}. Pick another number.`
          : `There's already a #${number} on the roster (${clash.display_name}) from a scanned sheet. If that's ${target.name}, use Match instead so the stats move over.`,
          { clashPlayerId: clash.id });
      }
    }
    const tx = sqlite.transaction(() => {
      // One person keeps one player record across teams when they already have one.
      let pid = one<{ id: number }>("SELECT id FROM players WHERE user_id=? ORDER BY games_rated DESC, id LIMIT 1", target.id)?.id;
      if (!pid) {
        const key = target.name.toLowerCase().replace(/[^a-z]/g, "");
        pid = Number(run(
          "INSERT INTO players (name,name_key,position,rating,claimed,user_id) VALUES (?,?,?,?,1,?)",
          target.name, key, target.position || "F", LEVEL_START[t.level] ?? 3.8, target.id,
        ).lastInsertRowid);
      }
      run("INSERT INTO roster_entries (team_id,player_id,number,source,added_at) VALUES (?,?,?,'draft',datetime('now'))", teamId, pid, number);
      refreshDisplay(pid);
      logAction(teamId, u.id, "draft", pid, target.id, { number });
      if (target.id !== u.id) {
        notify(target.id, {
          kind: "draft", teamId, playerId: pid, link: "/me",
          title: `${u.name} added you to ${t.name}${number ? ` as #${number}` : ""}`,
          body: "Not your team? Decline it from your profile.",
        });
      }
      return pid;
    });
    res.json({ ok: true, playerId: tx() });
  }));

  /* player declines a draft */
  app.post("/api/me/decline/:teamId", wrap((req, res) => {
    const u = requireUser(req);
    const teamId = Number(req.params.teamId);
    const t = teamOrThrow(teamId);
    const re = one<any>("SELECT re.* FROM roster_entries re JOIN players p ON p.id=re.player_id WHERE re.team_id=? AND p.user_id=?", teamId, u.id);
    if (!re) throw err(404, "You're not on that roster.");
    if (re.source !== "draft") throw err(400, "You're on this roster from a scanned sheet. Ask your captain to remove you.");
    run("DELETE FROM roster_entries WHERE id=?", re.id);
    logAction(teamId, u.id, "decline", re.player_id, u.id);
    const cap = captainOf(teamId);
    if (cap && cap.id !== u.id) notify(cap.id, { kind: "decline", teamId, link: `/team/${teamId}`, title: `${u.name} declined ${t.name}` });
    run("DELETE FROM team_roles WHERE team_id=? AND user_id=?", teamId, u.id);
    res.json({ ok: true });
  }));

  /* match: link a registered player to a sheet slot; stats and rating stay with the slot */
  app.post("/api/teams/:id/match", wrap((req, res) => {
    const u = requireUser(req);
    const teamId = Number(req.params.id);
    const t = requireCaptain(u, teamId);
    const slot = slotOnTeam(teamId, Number(req.body?.playerId));
    const target = userOrThrow(Number(req.body?.userId));
    if (slot.user_id === target.id) return res.json({ ok: true });
    if (slot.user_id) throw err(409, "That spot is already linked to a registered player. Release it first.");
    if (target.home_rink_id !== t.rink_id) throw err(400, "That player's home rink is somewhere else.");
    const tx = sqlite.transaction(() => {
      // If the player was drafted onto this team already, fold that empty draft spot into the sheet slot.
      const drafted = one<any>("SELECT p.* FROM roster_entries re JOIN players p ON p.id=re.player_id WHERE re.team_id=? AND p.user_id=?", teamId, target.id);
      if (drafted && drafted.id !== slot.id) {
        const otherTeams = one<{ c: number }>("SELECT COUNT(*) c FROM roster_entries WHERE player_id=? AND team_id<>?", drafted.id, teamId)!.c;
        const hasGames = one<{ c: number }>("SELECT COUNT(*) c FROM player_game_stats WHERE player_id=?", drafted.id)!.c;
        if (!otherTeams && !hasGames) mergePlayers(drafted.id, slot.id);
        else run("DELETE FROM roster_entries WHERE team_id=? AND player_id=?", teamId, drafted.id);
      }
      linkSlot(slot.id, target.id);
      logAction(teamId, u.id, "match", slot.id, target.id, { number: slot.number });
      if (target.id !== u.id) {
        notify(target.id, {
          kind: "match", teamId, playerId: slot.id, link: `/player/${slot.id}`,
          title: `${u.name} matched you to ${slot.number ? "#" + slot.number : "a spot"} on ${t.name}`,
          body: "Your stats and rating from the scanned sheets are now on your profile.",
        });
      }
    });
    tx();
    res.json({ ok: true });
  }));

  /* release: undo a claim or a match */
  app.post("/api/teams/:id/slots/:playerId/release", wrap((req, res) => {
    const u = requireUser(req);
    const teamId = Number(req.params.id);
    const t = requireCaptain(u, teamId);
    const slot = slotOnTeam(teamId, Number(req.params.playerId));
    if (!slot.user_id) return res.json({ ok: true });
    const was = slot.user_id;
    if (slot.source === "draft") {
      // A drafted spot has no sheet history; releasing it removes it.
      run("DELETE FROM roster_entries WHERE team_id=? AND player_id=?", teamId, slot.id);
    } else {
      unlinkSlot(slot.id);
    }
    logAction(teamId, u.id, "release", slot.id, was);
    if (was !== u.id) notify(was, { kind: "release", teamId, link: `/team/${teamId}`, title: `${t.name}'s captain released your claim on ${slot.number ? "#" + slot.number : "a spot"}`, body: "If that was you, talk to your captain." });
    res.json({ ok: true });
  }));

  /* remove a spot from the roster (games already played keep their lines) */
  app.post("/api/teams/:id/slots/:playerId/remove", wrap((req, res) => {
    const u = requireUser(req);
    const teamId = Number(req.params.id);
    const t = requireCaptain(u, teamId);
    const slot = slotOnTeam(teamId, Number(req.params.playerId));
    run("DELETE FROM roster_entries WHERE team_id=? AND player_id=?", teamId, slot.id);
    if (slot.user_id) run("DELETE FROM team_roles WHERE team_id=? AND user_id=? AND user_id<>?", teamId, slot.user_id, u.id);
    logAction(teamId, u.id, "remove", slot.id, slot.user_id ?? null, { number: slot.number });
    if (slot.user_id && slot.user_id !== u.id) notify(slot.user_id, { kind: "remove", teamId, link: `/team/${teamId}`, title: `You were taken off ${t.name}'s roster` });
    res.json({ ok: true });
  }));

  /* merge two spots that are the same person (spelling variants, a misread number) */
  app.post("/api/teams/:id/merge", wrap((req, res) => {
    const u = requireUser(req);
    const teamId = Number(req.params.id);
    requireCaptain(u, teamId);
    const from = slotOnTeam(teamId, Number(req.body?.fromId));
    const into = slotOnTeam(teamId, Number(req.body?.intoId));
    // Keep the registered one if only one is registered.
    const [a, b] = from.user_id && !into.user_id ? [into, from] : [from, into];
    mergePlayers(a.id, b.id);
    logAction(teamId, u.id, "merge", b.id, b.user_id ?? null, { merged: a.id, numbers: [a.number, b.number] });
    res.json({ ok: true, playerId: b.id });
  }));
}
