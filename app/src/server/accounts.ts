import "server-only";
// Accounts, the draft pool, captain roster tools and name privacy.
// Model: a `players` row is a slot. Scanned sheets create slots; registered users get
// linked to slots (claim or captain match) or get new slots by draft. Linking is
// reversible (the captain can release a wrong claim). Merging two slots is explicit and logged.
import { one, q, sql, type Tx } from "./db";
import { HttpError, LEVEL_START, similarity } from "./services";
import { supabaseAdmin } from "./supabase";
import { audit, grant, grantsOf, require_, revokeRole, teamRoleOf, type Action, type Scope } from "./permissions";

const err = (status: number, message: string, extra: Record<string, unknown> = {}) => new HttpError(status, message, extra);

/* ---------- name privacy ---------- */

/** "Mike Tolliver" -> "Mike T." ; "Tolliver" -> "T." ; "#9" stays. Unclaimed names never go out in full. */
export function obfuscate(name: string) {
  const t = name.trim().split(/\s+/).filter(Boolean);
  if (!t.length) return "Player";
  if (t.length === 1) return /^[#\d]/.test(t[0]) ? t[0] : `${t[0][0].toUpperCase()}.`;
  const last = t[t.length - 1].replace(/[^A-Za-z]/g, "");
  return `${t[0]} ${last ? last[0].toUpperCase() + "." : ""}`.trim();
}

async function hiddenLabel(db: Tx, playerId: number) {
  const n = (await one<{ number: string | null }>(db, "SELECT number FROM roster_entries WHERE player_id=$1 AND number IS NOT NULL LIMIT 1", [playerId]))?.number;
  return n ? `Player #${n}` : "Hidden player";
}

async function displayFor(db: Tx, p: any): Promise<string> {
  if (p.hidden) return hiddenLabel(db, p.id);
  if (p.user_id) {
    const u = await one<any>(db, "SELECT name, hidden FROM users WHERE id=$1", [p.user_id]);
    if (u?.hidden) return hiddenLabel(db, p.id);
    if (u?.name) return u.name;
  }
  return obfuscate(p.name);
}

export async function refreshDisplay(db: Tx, playerId: number) {
  const p = await one<any>(db, "SELECT * FROM players WHERE id=$1", [playerId]);
  if (p) await q(db, "UPDATE players SET display_name=$1 WHERE id=$2", [await displayFor(db, p), p.id]);
}
/** Refresh players whose display name is missing (new from a sheet) or all of them. */
export async function refreshDisplays(db: Tx, all = false) {
  const rows = await q<any>(db, all ? "SELECT * FROM players" : "SELECT * FROM players WHERE display_name IS NULL");
  for (const p of rows) {
    const d = await displayFor(db, p);
    if (d !== p.display_name) await q(db, "UPDATE players SET display_name=$1 WHERE id=$2", [d, p.id]);
  }
}

/* ---------- sign-in ---------- */

const tokenCache = new Map<string, { authId: string; email: string | null; exp: number }>();

/** Emails are stored and matched lowercase. */
export function normEmail(email: string | null | undefined) {
  const e = String(email || "").trim().toLowerCase();
  return e && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e) ? e : null;
}

async function authUser(req: Request) {
  const m = (req.headers.get("authorization") || "").match(/^Bearer\s+(.+)$/i);
  if (!m) return null;
  const token = m[1].trim();
  const hit = tokenCache.get(token);
  if (hit && hit.exp > Date.now()) return hit;
  const { data, error } = await supabaseAdmin().auth.getUser(token);
  if (error || !data?.user) return null;
  const v = { authId: data.user.id, email: normEmail(data.user.email), exp: Date.now() + 60_000 };
  if (tokenCache.size > 5000) tokenCache.clear();
  tokenCache.set(token, v);
  return v;
}

/** The signed-in Late Ice user, created on first sight of a verified Supabase email sign-in. */
export async function userFromRequest(req: Request) {
  const a = await authUser(req);
  if (!a) return null;
  let u = await one<any>(sql, "SELECT * FROM users WHERE auth_id=$1", [a.authId]);
  if (!u) {
    if (!a.email) return null;
    // Supabase verified this address, so its owner owns the matching Late Ice account.
    u = await one<any>(
      sql,
      `INSERT INTO users (auth_id, email) VALUES ($1,$2)
       ON CONFLICT (email) DO UPDATE SET auth_id=EXCLUDED.auth_id RETURNING *`,
      [a.authId, a.email],
    );
  }
  if (!u) return null;
  // An account merged into another stays as a record of history; it can't be signed into.
  if (u.merged_into) throw err(410, "This account was moved to a new email. Sign in with that one.");
  await bootstrapAdmin(u);
  return u;
}

let adminExists = false;
/** The first admin comes from a server setting, so no personal email sits in the public code. */
async function bootstrapAdmin(u: any) {
  if (adminExists) return;
  const want = normEmail(process.env.BOOTSTRAP_ADMIN_EMAIL);
  if (!want) return;
  if (await one(sql, "SELECT 1 FROM role_grants WHERE role='admin' AND revoked_at IS NULL LIMIT 1")) { adminExists = true; return; }
  if (u.email !== want) return;
  await sql.begin(async (tx) => {
    if (await one(tx, "SELECT 1 FROM role_grants WHERE role='admin' AND revoked_at IS NULL LIMIT 1")) return;
    await grant(tx, u.id, "admin", null, null, "bootstrap admin");
    await audit(tx, u.id, "grant.admin", { type: "user", id: u.id }, undefined, { role: "admin" }, "bootstrap");
  });
  adminExists = true;
}

export async function requireUser(req: Request) {
  const u = await userFromRequest(req);
  if (!u) throw err(401, "Sign in first.");
  return u;
}

/* ---------- helpers ---------- */

export async function notify(db: Tx, userId: number, n: { kind: string; title: string; body?: string; link?: string; teamId?: number; playerId?: number }) {
  await q(db, "INSERT INTO notifications (user_id,kind,title,body,link,team_id,player_id) VALUES ($1,$2,$3,$4,$5,$6,$7)",
    [userId, n.kind, n.title, n.body ?? null, n.link ?? null, n.teamId ?? null, n.playerId ?? null]);
}
export async function logAction(db: Tx, teamId: number, actor: number | null, action: string, playerId: number | null, targetUser: number | null, detail?: object) {
  await q(db, "INSERT INTO roster_actions (team_id,actor_user_id,action,player_id,target_user_id,detail) VALUES ($1,$2,$3,$4,$5,$6)",
    [teamId, actor, action, playerId, targetUser, detail ? JSON.stringify(detail) : null]);
}

export async function teamOrThrow(db: Tx, teamId: number) {
  const t = await one<any>(db, "SELECT t.*, l.rink_id, l.level FROM teams t JOIN leagues l ON l.id=t.league_id WHERE t.id=$1", [teamId]);
  if (!t) throw err(404, "Team not found");
  return t;
}
export async function captainOf(db: Tx, teamId: number) {
  return (await one<any>(db,
    "SELECT u.id, u.name FROM role_grants r JOIN users u ON u.id=r.user_id WHERE r.scope_type='team' AND r.scope_id=$1 AND r.role='captain' AND r.revoked_at IS NULL LIMIT 1",
    [teamId])) ?? null;
}
export async function assistantsOf(db: Tx, teamId: number) {
  return q<any>(db,
    "SELECT u.id, u.name, r.granted_at FROM role_grants r JOIN users u ON u.id=r.user_id WHERE r.scope_type='team' AND r.scope_id=$1 AND r.role='assistant_captain' AND r.revoked_at IS NULL ORDER BY r.granted_at, r.id",
    [teamId]);
}
export async function isCaptain(db: Tx, userId: number, teamId: number) {
  return (await teamRoleOf(db, userId, teamId)) === "captain";
}
/** Check a team action and return the team. */
export async function requireTeam(db: Tx, user: any, teamId: number, action: Action = "roster.manage") {
  const t = await teamOrThrow(db, teamId);
  await require_(db, user, action, { teamId, leagueId: t.league_id, rinkId: t.rink_id });
  return t;
}
export const requireCaptain = (db: Tx, user: any, teamId: number) => requireTeam(db, user, teamId, "roster.manage");
export async function userCan(db: Tx, user: any, action: Action, scope: Scope) {
  const { can } = await import("./permissions");
  return can(db, user, action, scope);
}

/** Captain leaves: the longest-serving assistant takes over, or the role opens up. */
export async function vacateCaptain(db: Tx, teamId: number, actor: number | null, note: string) {
  const cap = await captainOf(db, teamId);
  if (cap) await revokeRole(db, cap.id, "captain", teamId, actor, note);
  const [next] = await assistantsOf(db, teamId);
  const t = await teamOrThrow(db, teamId);
  if (next) {
    await revokeRole(db, next.id, "assistant_captain", teamId, actor, "promoted to captain");
    await grant(db, next.id, "captain", teamId, actor, "promoted: captain left");
    await logAction(db, teamId, actor, "captain", null, next.id, { promoted: true });
    for (const m of await teamUserIds(db, teamId)) {
      await notify(db, m, { kind: "captain", teamId, link: `/team/${teamId}`, title: `${next.name} is now captain of ${t.name}` });
    }
  } else {
    for (const m of await teamUserIds(db, teamId)) {
      await notify(db, m, { kind: "captain", teamId, link: `/team/${teamId}`, title: `${t.name} needs a captain`, body: "Anyone on the roster can take the role from the team page." });
    }
  }
}

/** Someone left a roster: their team roles end with it. */
export async function leaveTeamRoles(db: Tx, userId: number, teamId: number, actor: number | null) {
  const role = await teamRoleOf(db, userId, teamId);
  if (role === "assistant_captain") await revokeRole(db, userId, "assistant_captain", teamId, actor, "left roster");
  if (role === "captain") await vacateCaptain(db, teamId, actor, "left roster");
}

export async function teamUserIds(db: Tx, teamId: number) {
  return (await q<{ user_id: number }>(db,
    "SELECT DISTINCT p.user_id FROM roster_entries re JOIN players p ON p.id=re.player_id WHERE re.team_id=$1 AND p.user_id IS NOT NULL", [teamId])).map((r) => r.user_id);
}

/** Roles for display: "Captain, Hammer'd Heads" and so on. */
export async function rolesSummary(db: Tx, user: any) {
  const out = [];
  for (const g of await grantsOf(db, user)) {
    let where: string | null = null;
    if (g.scope_type === "team") where = (await one<any>(db, "SELECT name FROM teams WHERE id=$1", [g.scope_id]))?.name ?? null;
    if (g.scope_type === "league") where = (await one<any>(db, "SELECT name FROM leagues WHERE id=$1", [g.scope_id]))?.name ?? null;
    if (g.scope_type === "rink") where = (await one<any>(db, "SELECT name FROM rinks WHERE id=$1", [g.scope_id]))?.name ?? null;
    out.push({ id: g.id, role: g.role, scopeType: g.scope_type, scopeId: g.scope_id, where });
  }
  return out;
}

export async function onTeam(db: Tx, userId: number, teamId: number) {
  return !!(await one(db, "SELECT 1 FROM roster_entries re JOIN players p ON p.id=re.player_id WHERE re.team_id=$1 AND p.user_id=$2", [teamId, userId]));
}
export async function slotOnTeam(db: Tx, teamId: number, playerId: number) {
  const s = await one<any>(db, "SELECT p.*, re.number, re.source FROM roster_entries re JOIN players p ON p.id=re.player_id WHERE re.team_id=$1 AND re.player_id=$2", [teamId, playerId]);
  if (!s) throw err(404, "That player isn't on this team's roster.");
  return s;
}
export async function userOrThrow(db: Tx, userId: number) {
  const u = await one<any>(db, "SELECT * FROM users WHERE id=$1", [userId]);
  if (!u || !u.name) throw err(404, "That player hasn't finished registering.");
  return u;
}
export function cleanNumber(n: unknown) {
  const s = String(n ?? "").replace(/[^0-9]/g, "").slice(0, 2);
  return s || null;
}
export const POSITIONS = new Set(["C", "W", "F", "D", "G"]);
export const STATUSES = new Set(["available", "ir", "away", "resting"]);

export async function publicUser(db: Tx, u: any) {
  if (!u) return null;
  const rink = u.home_rink_id ? await one<any>(db, "SELECT id,name FROM rinks WHERE id=$1", [u.home_rink_id]) : null;
  return {
    id: u.id, email: u.email, phone: u.phone, name: u.name, number: u.number, position: u.position, homeRink: rink,
    status: u.status, statusUntil: u.status_until, hidden: !!u.hidden, profileComplete: !!(u.name && u.position && u.home_rink_id),
  };
}

/** Merge slot `fromId` into `intoId`: stats, history, imports and roster spots move; the from slot is deleted. */
export async function mergePlayers(db: Tx, fromId: number, intoId: number) {
  if (fromId === intoId) throw err(400, "Pick two different players.");
  const a = await one<any>(db, "SELECT * FROM players WHERE id=$1", [fromId]);
  const b = await one<any>(db, "SELECT * FROM players WHERE id=$1", [intoId]);
  if (!a || !b) throw err(404, "Player not found");
  if (a.user_id && b.user_id && a.user_id !== b.user_id) throw err(409, "Both are linked to different registered players. Release one first.");
  for (const t of ["player_game_stats", "rating_history", "player_imports", "hide_requests"]) {
    await q(db, `UPDATE ${t} SET player_id=$1 WHERE player_id=$2`, [intoId, fromId]);
  }
  for (const re of await q<any>(db, "SELECT * FROM roster_entries WHERE player_id=$1", [fromId])) {
    const has = await one<any>(db, "SELECT * FROM roster_entries WHERE team_id=$1 AND player_id=$2", [re.team_id, intoId]);
    if (has) {
      if (!has.number && re.number) await q(db, "UPDATE roster_entries SET number=$1 WHERE id=$2", [re.number, has.id]);
      await q(db, "DELETE FROM roster_entries WHERE id=$1", [re.id]);
    } else await q(db, "UPDATE roster_entries SET player_id=$1 WHERE id=$2", [intoId, re.id]);
  }
  // Keep the rating with more evidence behind it; games add up. The nightly replay settles it exactly.
  const keep = (a.games_rated || 0) > (b.games_rated || 0) ? a : b;
  await q(db,
    "UPDATE players SET rating=$1, start_rating=$2, games_rated=$3, user_id=COALESCE(user_id,$4), claimed=GREATEST(claimed,$5), hidden=GREATEST(hidden,$6) WHERE id=$7",
    [keep.rating, keep.start_rating ?? keep.rating, (a.games_rated || 0) + (b.games_rated || 0), a.user_id, a.claimed || 0, a.hidden || 0, intoId]);
  await q(db, "UPDATE notifications SET player_id=$1 WHERE player_id=$2", [intoId, fromId]);
  await q(db, "DELETE FROM players WHERE id=$1", [fromId]);
  await refreshDisplay(db, intoId);
}

export async function linkSlot(db: Tx, playerId: number, userId: number) {
  await q(db, "UPDATE players SET user_id=$1, claimed=1 WHERE id=$2", [userId, playerId]);
  const u = await one<any>(db, "SELECT * FROM users WHERE id=$1", [userId]);
  if (u?.position && u.position !== "G") {
    await q(db, "UPDATE players SET position=$1 WHERE id=$2 AND position<>'G'", [u.position, playerId]);
  }
  await refreshDisplay(db, playerId);
}
export async function unlinkSlot(db: Tx, playerId: number) {
  await q(db, "UPDATE players SET user_id=NULL, claimed=0 WHERE id=$1", [playerId]);
  await refreshDisplay(db, playerId);
}

/** Unlinked slots at the user's home rink that look like them: name similarity, number as a tiebreaker. */
export async function suggestionsFor(db: Tx, u: any) {
  if (!u?.name || !u.home_rink_id) return [];
  const rows = await q<any>(db,
    `SELECT p.id, p.name, p.display_name, p.rating, re.number, t.id team_id, t.name team_name, t.color, t.logo, l.level
     FROM roster_entries re JOIN players p ON p.id=re.player_id JOIN teams t ON t.id=re.team_id JOIN leagues l ON l.id=t.league_id
     WHERE p.user_id IS NULL AND l.rink_id=$1 AND l.level<>'DEMO'`, [u.home_rink_id]);
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

/** New slot for a registered player being drafted, or their existing one. */
export async function slotForUser(db: Tx, target: any, level: string) {
  const existing = await one<{ id: number }>(db, "SELECT id FROM players WHERE user_id=$1 ORDER BY games_rated DESC, id LIMIT 1", [target.id]);
  if (existing) return existing.id;
  const start = LEVEL_START[level] ?? 3.8;
  return (await one<{ id: number }>(db,
    "INSERT INTO players (name,name_key,position,rating,start_rating,claimed,user_id) VALUES ($1,$2,$3,$4,$4,1,$5) RETURNING id",
    [target.name, target.name.toLowerCase().replace(/[^a-z]/g, ""), target.position || "F", start, target.id]))!.id;
}
