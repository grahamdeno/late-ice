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
  // Midnight Pond's made-up players keep their full (punny) names.
  if (String(p.name_key ?? "").startsWith("sample-")) return p.name;
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

/**
 * Signed-out (and signed-in at another rink) form of an unclaimed name.
 * "Mike Tolliver" and number 12 become "M. T. #12". The stored display_name stays
 * the same-rink form from displayFor ("Mike T.").
 */
export function publicInitials(name: string, number: string | null) {
  const t = String(name || "").trim().split(/\s+/).filter(Boolean);
  const jersey = number && String(number).trim() ? String(number).trim() : null;
  const withNumber = (label: string) => (jersey && !label.includes(`#${jersey}`) ? `${label} #${jersey}` : label);
  if (!t.length) return jersey ? `Player #${jersey}` : "Player";
  if (t.length === 1 && /^[#\d]/.test(t[0])) return withNumber(t[0]);
  const initial = (w: string) => {
    const letters = w.replace(/[^A-Za-z]/g, "");
    const ch = letters[0] || w[0] || "";
    return ch ? `${ch.toUpperCase()}.` : "";
  };
  if (t.length === 1) return withNumber(initial(t[0]) || "Player");
  return withNumber(`${initial(t[0])} ${initial(t[t.length - 1])}`.trim());
}

/** Home rink, a roster spot, or a team, league or rink role. Support and admin see the same-rink form everywhere. */
async function viewerScope(db: Tx, viewer: any): Promise<{ wide: boolean; rinks: number[] }> {
  if (!viewer?.id) return { wide: false, rinks: [] };
  const wide = !!(await one(db, "SELECT 1 FROM role_grants WHERE user_id=$1 AND role IN ('support','admin') AND revoked_at IS NULL LIMIT 1", [viewer.id]));
  const rows = await q<{ rink_id: number }>(db, `
    SELECT DISTINCT rink_id FROM (
      SELECT home_rink_id AS rink_id FROM users WHERE id=$1 AND home_rink_id IS NOT NULL
      UNION
      SELECT l.rink_id FROM roster_entries re JOIN players p ON p.id=re.player_id JOIN teams t ON t.id=re.team_id JOIN leagues l ON l.id=t.league_id WHERE p.user_id=$1
      UNION
      SELECT g.scope_id FROM role_grants g WHERE g.user_id=$1 AND g.revoked_at IS NULL AND g.scope_type='rink' AND g.scope_id IS NOT NULL
      UNION
      SELECT l.rink_id FROM role_grants g JOIN leagues l ON l.id=g.scope_id WHERE g.user_id=$1 AND g.revoked_at IS NULL AND g.scope_type='league'
      UNION
      SELECT l.rink_id FROM role_grants g JOIN teams t ON t.id=g.scope_id JOIN leagues l ON l.id=t.league_id WHERE g.user_id=$1 AND g.revoked_at IS NULL AND g.scope_type='team'
    ) s WHERE rink_id IS NOT NULL`, [viewer.id]);
  return { wide, rinks: rows.map((r) => r.rink_id) };
}

/**
 * Replace each row's name for this viewer. Claimed players keep the existing display.
 * Unclaimed players at the viewer's rink keep display_name (first name and last initial).
 * Everyone else gets initials and a number. idKey is the player id on the row.
 */
/** True when this viewer may see the short same-rink name for that player. One expression, no extra round trip. */
export function sameRinkSql(playerId: string, viewerId: string) {
  // Midnight Pond's made-up players (name_key sample-N) show their full names to everyone.
  return `(EXISTS (SELECT 1 FROM players fp WHERE fp.id = ${playerId} AND fp.name_key LIKE 'sample-%') OR ${viewerId}::int IS NOT NULL AND (
    EXISTS (SELECT 1 FROM role_grants g WHERE g.user_id = ${viewerId} AND g.role IN ('support','admin') AND g.revoked_at IS NULL)
    OR EXISTS (
      SELECT 1 FROM roster_entries re
      JOIN teams t ON t.id = re.team_id
      JOIN leagues l ON l.id = t.league_id
      WHERE re.player_id = ${playerId}
        AND l.rink_id IN (
          SELECT u.home_rink_id FROM users u WHERE u.id = ${viewerId} AND u.home_rink_id IS NOT NULL
          UNION
          SELECT l2.rink_id FROM roster_entries re2 JOIN players p2 ON p2.id = re2.player_id JOIN teams t2 ON t2.id = re2.team_id JOIN leagues l2 ON l2.id = t2.league_id WHERE p2.user_id = ${viewerId}
          UNION
          SELECT g.scope_id FROM role_grants g WHERE g.user_id = ${viewerId} AND g.revoked_at IS NULL AND g.scope_type = 'rink' AND g.scope_id IS NOT NULL
          UNION
          SELECT l3.rink_id FROM role_grants g JOIN leagues l3 ON l3.id = g.scope_id WHERE g.user_id = ${viewerId} AND g.revoked_at IS NULL AND g.scope_type = 'league'
          UNION
          SELECT l4.rink_id FROM role_grants g JOIN teams t4 ON t4.id = g.scope_id JOIN leagues l4 ON l4.id = t4.league_id WHERE g.user_id = ${viewerId} AND g.revoked_at IS NULL AND g.scope_type = 'team'
        )
    )
  ))`;
}

/** Names already loaded with real_name, user_id, hidden, number and same_rink. Drops those helper fields. */
export function applyLoadedNames<T extends Record<string, any>>(row: T, keepNumber = false): T {
  const jersey = row.number != null && String(row.number).trim() !== "" ? String(row.number).trim() : null;
  const hidden = !!row.hidden || !!row.user_hidden;
  let name = row.name as string;
  if (hidden) name = jersey ? `Player #${jersey}` : "Hidden player";
  else if (row.user_id) name = row.name || (row.real_name ? obfuscate(row.real_name) : name);
  else if (row.same_rink) name = row.name || (row.real_name ? obfuscate(row.real_name) : name);
  else if (row.real_name) name = publicInitials(row.real_name, jersey);
  const { real_name: _r, user_id: _u, hidden: _h, user_hidden: _uh, same_rink: _s, number, ...rest } = row;
  return { ...rest, ...(keepNumber ? { number } : {}), name } as unknown as T;
}

export async function applyViewerNames<T extends Record<string, any>>(db: Tx, viewer: any, rows: T[], idKey = "id"): Promise<T[]> {
  if (!rows?.length) return rows;
  const ids = [...new Set(rows.map((r) => Number(r?.[idKey])).filter((n) => Number.isFinite(n) && n > 0))];
  if (!ids.length) return rows;
  const idJson = JSON.stringify(ids);
  const meta = await q<any>(db, `
    SELECT p.id, p.name, p.display_name, p.user_id, p.hidden, u.hidden AS user_hidden, (p.name_key LIKE 'sample-%') AS fictional,
      (SELECT re.number FROM roster_entries re WHERE re.player_id=p.id AND re.number IS NOT NULL AND re.number <> '' ORDER BY re.id LIMIT 1) AS number
    FROM players p LEFT JOIN users u ON u.id=p.user_id
    WHERE p.id IN (SELECT jsonb_array_elements_text($1::text::jsonb)::int)`, [idJson]);
  const byId = new Map(meta.map((p) => [p.id as number, p]));
  const scope = await viewerScope(db, viewer);
  let same = new Set<number>();
  if (!scope.wide && scope.rinks.length) {
    const hit = await q<{ player_id: number }>(db, `
      SELECT DISTINCT re.player_id FROM roster_entries re
      JOIN teams t ON t.id=re.team_id JOIN leagues l ON l.id=t.league_id
      WHERE re.player_id IN (SELECT jsonb_array_elements_text($1::text::jsonb)::int)
        AND l.rink_id IN (SELECT jsonb_array_elements_text($2::text::jsonb)::int)`, [idJson, JSON.stringify(scope.rinks)]);
    same = new Set(hit.map((h) => h.player_id));
  }
  return rows.map((row) => {
    const p = byId.get(Number(row[idKey]));
    if (!p) return row;
    const jersey = row.number != null && String(row.number).trim() !== "" ? String(row.number).trim() : (p.number || null);
    const hidden = !!p.hidden || !!p.user_hidden;
    let name: string;
    if (hidden) name = jersey ? `Player #${jersey}` : "Hidden player";
    else if (p.fictional) name = p.name || p.display_name;
    else if (p.user_id) name = p.display_name || row.name || obfuscate(p.name);
    else if (scope.wide || same.has(p.id)) name = p.display_name || obfuscate(p.name);
    else name = publicInitials(p.name, jersey);
    return { ...row, name };
  });
}

/* ---------- sign-in ---------- */

const tokenCache = new Map<string, { authId: string; email: string | null; exp: number }>();

/** Drop a cached sign-in check, for example after the account is deleted. */
export function forgetToken(token: string) {
  if (token) tokenCache.delete(token.trim());
}

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
  // Tombstone and the user row are one lookup, so a deleted account cannot be recreated
  // and signed-in pages stay inside the query budget.
  const found = await one<any>(sql, `
    SELECT u.*, EXISTS(SELECT 1 FROM deleted_accounts d WHERE d.auth_id = $1) AS account_deleted
    FROM (SELECT $1::uuid AS auth_id) k
    LEFT JOIN users u ON u.auth_id = k.auth_id
  `, [a.authId]);
  if (found?.account_deleted) {
    const m = (req.headers.get("authorization") || "").match(/^Bearer\s+(.+)$/i);
    if (m) forgetToken(m[1]);
    throw err(401, "This account was deleted.");
  }
  let u = found?.id ? found : null;
  if (u) delete u.account_deleted;
  if (!u) {
    if (!a.email) return null;
    if (!(await one(sql, "SELECT 1 FROM users WHERE email=$1", [a.email])) && (await signupsPaused())) throw err(403, "New sign-ups are paused right now. Existing players can still sign in.");
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
    await q(tx, "UPDATE users SET access='approved' WHERE id=$1", [u.id]);
    await audit(tx, u.id, "grant.admin", { type: "user", id: u.id }, undefined, { role: "admin" }, "bootstrap");
  });
  adminExists = true;
}

export async function requireUser(req: Request) {
  const u = await userFromRequest(req);
  if (!u) throw err(401, "Sign in first.");
  return u;
}

export const WAITLIST = "You're on the waitlist. A captain's invite link gets you in right away, or staff will let you in soon.";
/** Let in: approved, or holding any staff or team role. */
export async function isApproved(db: Tx, u: any) {
  if (!u) return false;
  if (u.access === "approved") return true;
  if (u.access === "removed") return false;
  return !!(await one(db, "SELECT 1 FROM role_grants WHERE user_id=$1 AND revoked_at IS NULL", [u.id]));
}
/** Signed in and let in through the gate. Needed for claiming, scanning, voting and requests. */
export async function requireApproved(req: Request) {
  const u = await requireUser(req);
  if (!(await isApproved(sql, u))) throw err(403, WAITLIST);
  return u;
}
export async function signupsPaused() {
  const r = await one<any>(sql, "SELECT value FROM app_settings WHERE key='signups_paused'");
  return r?.value === true;
}

/* ---------- helpers ---------- */

export async function notify(db: Tx, userId: number, n: { kind: string; title: string; body?: string; link?: string; teamId?: number; playerId?: number; push?: boolean }) {
  await q(db, "INSERT INTO notifications (user_id,kind,title,body,link,team_id,player_id) VALUES ($1,$2,$3,$4,$5,$6,$7)",
    [userId, n.kind, n.title, n.body ?? null, n.link ?? null, n.teamId ?? null, n.playerId ?? null]);
  if (n.push === false) return;
  const { deliverNotice } = await import("./push");
  await deliverNotice(db, userId, n).catch((e: any) => {
    const code = e?.statusCode ?? e?.code;
    console.error(code ? `push failed (${code})` : "push failed");
  });
}

/** In-app notice plus push for each registered player in a confirmed game. */
export async function notifyConfirmedResult(db: Tx, gameId: number) {
  const g = await one<any>(db,
    `SELECT g.home_score, g.away_score, ht.name AS home, at.name AS away, COALESCE(l.star_voting, false) AS star_voting,
       (SELECT COUNT(DISTINCT s.player_id) FROM player_game_stats s WHERE s.game_id=g.id)::int AS players
     FROM games g JOIN teams ht ON ht.id=g.home_team_id JOIN teams at ON at.id=g.away_team_id LEFT JOIN leagues l ON l.id=g.league_id WHERE g.id=$1`, [gameId]);
  if (!g) return;
  // Voting opens with the result when the league has it on and there are enough players to pick from.
  const voting = g.star_voting && g.players >= 4;
  const users = await q<{ user_id: number }>(db,
    "SELECT DISTINCT p.user_id FROM player_game_stats s JOIN players p ON p.id=s.player_id WHERE s.game_id=$1 AND p.user_id IS NOT NULL", [gameId]);
  for (const row of users) {
    await notify(db, row.user_id, {
      kind: "result",
      link: `/game/${gameId}`,
      title: `Final: ${g.home} ${g.home_score}-${g.away_score} ${g.away}`,
      body: voting ? "Your rating moved. Three stars voting is open for 48 hours." : "Your rating moved.",
    });
  }
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
export const STATUSES = new Set(["active", "ir", "away"]);
/** Injured reserve and Away end on their own once the return date passes. */
export function effectiveStatus(u: { status: string; status_until: string | null }) {
  if ((u.status === "ir" || u.status === "away") && u.status_until && u.status_until < new Date().toISOString().slice(0, 10)) return "active";
  return u.status === "ir" || u.status === "away" ? u.status : "active";
}

export async function publicUser(db: Tx, u: any) {
  if (!u) return null;
  const rink = u.home_rink_id ? await one<any>(db, "SELECT id,name FROM rinks WHERE id=$1", [u.home_rink_id]) : null;
  return {
    id: u.id, email: u.email, phone: u.phone, name: u.name, number: u.number, position: u.position, homeRink: rink,
    access: (await isApproved(db, u)) ? "approved" : u.access, status: effectiveStatus(u), statusUntil: effectiveStatus(u) === "active" ? null : u.status_until, lookingForTeam: !!u.looking_for_team, willSub: !!u.will_sub, avatar: u.avatar ?? null, archetypeSelf: u.archetype_opt_out ? null : (u.archetype_self ?? null), archetypeOptOut: !!u.archetype_opt_out, hidden: !!u.hidden, ageConfirmed: !!u.age_confirmed_at, profileComplete: !!(u.name && u.position && u.home_rink_id),
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

/**
 * Games and points the current merge moves off this player. Scanned lines plus imported
 * season totals. imported_game_lines are not in that list today, and this does not add them.
 */
export async function moveCounts(db: Tx, playerId: number) {
  const s = await one<any>(db, "SELECT COUNT(*)::int games, COALESCE(SUM(goals + assists),0)::int points FROM player_game_stats WHERE player_id=$1", [playerId]);
  const i = await one<any>(db, "SELECT COALESCE(SUM(gp),0)::int games, COALESCE(SUM(g + a),0)::int points FROM player_imports WHERE player_id=$1", [playerId]);
  const scannedGames = s?.games ?? 0;
  const importedGames = i?.games ?? 0;
  const scannedPoints = s?.points ?? 0;
  const importedPoints = i?.points ?? 0;
  return { games: scannedGames + importedGames, points: scannedPoints + importedPoints, scannedGames, importedGames, scannedPoints, importedPoints };
}

/** Keep the registered slot when only one of the two is registered. Same rule the merge route already used. */
export function mergeDirection(from: { id: number; user_id: number | null }, into: { id: number; user_id: number | null }) {
  if (from.user_id && into.user_id && from.user_id !== into.user_id) {
    throw err(409, "Both are linked to different registered players. Release one first.");
  }
  if (from.user_id && !into.user_id) return { movingId: into.id, keptId: from.id };
  return { movingId: from.id, keptId: into.id };
}

export async function linkSlot(db: Tx, playerId: number, userId: number) {
  // One person, one rating: a second spot (another team, another rink, a sub game) folds into the first.
  const mine = await one<any>(db, "SELECT id FROM players WHERE user_id=$1 AND id<>$2 ORDER BY games_rated DESC, id LIMIT 1", [userId, playerId]);
  if (mine) {
    await mergePlayers(db, playerId, mine.id);
    await refreshDisplay(db, mine.id);
    return;
  }
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
  // Once you hold a spot, only a near-certain match on another team shows (next season's import, say). Everything else is a manual find.
  const myTeams = (await q<any>(db, "SELECT re.team_id FROM roster_entries re JOIN players p ON p.id=re.player_id WHERE p.user_id=$1", [u.id])).map((r) => r.team_id as number);
  const strictOnly = myTeams.length > 0;
  const rows = await q<any>(db,
    `SELECT p.id, p.name, p.display_name, p.rating, re.number, t.id team_id, t.name team_name, t.color, t.logo, l.level
     FROM roster_entries re JOIN players p ON p.id=re.player_id JOIN teams t ON t.id=re.team_id JOIN leagues l ON l.id=t.league_id
     WHERE p.user_id IS NULL AND l.rink_id=$1 AND l.level NOT IN ('DEMO','TOURN')`, [u.home_rink_id]);
  return rows
    .filter((r) => isFullNameMatch(u.name, r.name))
    .map((r) => ({ ...r, score: 1 + (u.number && r.number && u.number === r.number ? 0.2 : 0) }))
    .filter((r) => (strictOnly ? !myTeams.includes(r.team_id) && !!u.number && r.number === u.number : true))
    .sort((a, b) => b.score - a.score)
    .slice(0, strictOnly ? 2 : 5)
    .map(({ name: _real, display_name, ...r }) => ({ ...r, name: display_name }));
}

/** Same first name and the same full last name. A posted "Graham D." never matches: a shared last initial isn't a match. */
export function isFullNameMatch(mine: string, posted: string) {
  const parts = (s: string) => s.trim().split(/\s+/).map((x) => x.replace(/[^a-z]/gi, "").toLowerCase()).filter(Boolean);
  const a = parts(mine), b = parts(posted);
  if (a.length < 2 || b.length < 2) return false;
  const lastA = a[a.length - 1], lastB = b[b.length - 1];
  if (lastB.length < 2 || lastA.length < 2) return false;
  return a[0] === b[0] && (lastA === lastB || similarity(lastA, lastB) >= 0.85);
}

function sameFirstAndInitial(mine: string, posted: string) {
  const parts = (s: string) => s.trim().split(/\s+/).map((x) => x.replace(/[^a-z]/gi, "").toLowerCase()).filter(Boolean);
  const a = parts(mine), b = parts(posted);
  return a.length > 1 && b.length > 1 && a[0] === b[0] && a[a.length - 1][0] === b[b.length - 1][0];
}

/** Someone who joined through a team's invite link goes straight onto that roster, unless a spot with their full name is
 *  already waiting there (then "Is this you?" offers it, so nobody ends up on the roster twice). Runs once per person and team. */
export async function seatInvited(db: Tx, userId: number) {
  const u = await one<any>(db, "SELECT * FROM users WHERE id=$1", [userId]);
  if (!u?.invited_team_id || !u.name || !u.position || u.access === "removed") return null;
  const teamId = u.invited_team_id as number;
  if (await onTeam(db, u.id, teamId)) return null;
  if (await one(db, "SELECT 1 FROM roster_actions WHERE team_id=$1 AND target_user_id=$2 AND action='invite_join'", [teamId, u.id])) return null;
  const t = await one<any>(db, "SELECT t.*, l.level, l.rink_id FROM teams t JOIN leagues l ON l.id=t.league_id WHERE t.id=$1", [teamId]);
  if (!t) return null;
  const open = await q<any>(db, "SELECT p.name FROM roster_entries re JOIN players p ON p.id=re.player_id WHERE re.team_id=$1 AND p.user_id IS NULL", [teamId]);
  // A full-name spot, or a first-name-and-last-initial spot ("Graham D."), on this team is probably theirs: leave it for them
  // to claim (or the captain to match) instead of adding a second, empty spot.
  if (open.some((r) => isFullNameMatch(u.name, r.name) || sameFirstAndInitial(u.name, r.name))) return null;
  let number = cleanNumber(u.number);
  if (number && (await one(db, "SELECT 1 FROM roster_entries WHERE team_id=$1 AND number=$2", [teamId, number]))) number = null;
  const pid = await slotForUser(db, u, t.level);
  await q(db, "INSERT INTO roster_entries (team_id,player_id,number,source,added_at) VALUES ($1,$2,$3,'draft',now())", [teamId, pid, number]);
  await refreshDisplay(db, pid);
  await logAction(db, teamId, null, "invite_join", pid, u.id, { number });
  const cap = await captainOf(db, teamId);
  if (cap && cap.id !== u.id) await notify(db, cap.id, { kind: "invite", teamId, playerId: pid, link: `/team/${teamId}`, title: `${u.name} is on ${t.name}`, body: number ? `They joined from your invite as #${number}.` : "They joined from your invite. Set their number if it's taken." });
  return pid;
}

/** Manual find: unclaimed spots anywhere by name, for a second team or a sub spot. */
export async function findSpots(db: Tx, u: any, text: string) {
  const t = text.trim().toLowerCase().slice(0, 40);
  if (t.length < 2) return [];
  return applyViewerNames(db, u, await q<any>(db,
    `SELECT p.id, p.display_name AS name, re.number, t.id team_id, t.name team_name, t.color, t.logo, l.level, r.name rink
     FROM roster_entries re JOIN players p ON p.id=re.player_id JOIN teams t ON t.id=re.team_id JOIN leagues l ON l.id=t.league_id JOIN rinks r ON r.id=l.rink_id
     WHERE p.user_id IS NULL AND l.level NOT IN ('DEMO','TOURN') AND (lower(p.display_name) LIKE $1 OR lower(p.name) LIKE $1 OR lower(t.name) LIKE $1)
     ORDER BY (l.rink_id = $2) DESC, t.name, re.number NULLS LAST LIMIT 20`, [`%${t}%`, u.home_rink_id ?? 0]));
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

/** Earlier claims could leave one person with a player record per team. Fold them into one (nightly, before the replay). */
export async function consolidatePeople(db: Tx) {
  let merged = 0;
  for (const u of await q<any>(db, "SELECT user_id FROM players WHERE user_id IS NOT NULL GROUP BY user_id HAVING COUNT(*) > 1")) {
    const ps = await q<any>(db, "SELECT id FROM players WHERE user_id=$1 ORDER BY games_rated DESC, id", [u.user_id]);
    for (const p of ps.slice(1)) { await mergePlayers(db, p.id, ps[0].id); merged++; }
  }
  return merged;
}
