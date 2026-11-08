import "server-only";
// Roles and permissions. docs/ROLES.md section 3 is the source of truth; this file mirrors it.
// Every route asks require(user, action, scope). No route checks a role name directly.
import { one, q, type Tx } from "./db";
import { HttpError } from "./services";

export type Role = "assistant_captain" | "captain" | "scorekeeper" | "commissioner" | "rink_manager" | "support" | "admin";
export type ScopeType = "team" | "league" | "rink" | "system";
export const ROLE_SCOPE: Record<Role, ScopeType> = {
  assistant_captain: "team", captain: "team", scorekeeper: "rink", commissioner: "league",
  rink_manager: "rink", support: "system", admin: "system",
};
export const ROLE_LABEL: Record<Role, string> = {
  assistant_captain: "Assistant captain", captain: "Captain", scorekeeper: "Scorekeeper", commissioner: "League commissioner",
  rink_manager: "Rink manager", support: "Support", admin: "Admin",
};

/** Action -> roles allowed. Scope is checked separately: a team role only counts on its team, and so on. */
export const MATRIX = {
  "roster.manage": ["assistant_captain", "captain", "commissioner", "rink_manager", "admin"],
  // Same-person merge is narrower than roster.manage: no assistants. Package 6.8.
  "roster.merge": ["captain", "commissioner", "rink_manager", "admin"],
  "team.assistants": ["captain", "commissioner", "rink_manager", "admin"],
  "team.edit": ["captain", "commissioner", "rink_manager", "admin"],
  "captain.reassign": ["commissioner", "rink_manager", "admin"],
  "schedule.feed": ["assistant_captain", "captain", "admin"],
  "schedule.manual": ["assistant_captain", "captain", "commissioner", "rink_manager", "admin"],
  "game.resolve": ["commissioner", "rink_manager", "admin"],
  // Who played an imported (DaySmart) game. Team roles only on their own team.
  "lineup.record": ["assistant_captain", "captain", "commissioner", "rink_manager", "admin"],
  "sheet.confirm": ["assistant_captain", "captain", "scorekeeper", "commissioner", "rink_manager", "admin"],
  "signup.approve": ["rink_manager", "admin"],
  "team.private": ["assistant_captain", "captain", "rink_manager", "admin"],
  "name.unhide": ["assistant_captain", "captain", "support", "admin"],
  "pool.view": ["assistant_captain", "captain", "rink_manager", "admin"],
  "rink.manage": ["rink_manager", "admin"],
  "rink.create": ["admin"],
  "league.create": ["rink_manager", "admin"],
  "league.edit": ["commissioner", "rink_manager", "admin"],
  "season.manage": ["rink_manager", "admin"],
  "team.create": ["commissioner", "rink_manager", "admin"],
  "team.remove": ["commissioner", "rink_manager", "admin"],
  "rink.staff": ["rink_manager", "admin"],
  "audit.view": ["rink_manager", "support", "admin"],
  "support.view": ["support", "admin"],
  "support.fix": ["support", "admin"],
  "support.merge": ["support", "admin"],
  "system.grant": ["admin"],
  "ratings.recompute": ["admin"],
} as const satisfies Record<string, readonly Role[]>;
export type Action = keyof typeof MATRIX;

export interface Grant { id: number; user_id: number; role: Role; scope_type: ScopeType; scope_id: number | null; granted_at: string }
export interface Scope { teamId?: number; leagueId?: number; rinkId?: number }

const grantCache = new WeakMap<object, Grant[]>();
/** Active grants for a user, loaded once per request object. */
export async function grantsOf(db: Tx, user: any): Promise<Grant[]> {
  if (!user) return [];
  const hit = grantCache.get(user);
  if (hit) return hit;
  const g = await q<Grant>(db, "SELECT id,user_id,role,scope_type,scope_id,granted_at FROM role_grants WHERE user_id=$1 AND revoked_at IS NULL", [user.id]);
  grantCache.set(user, g);
  return g;
}
export function forget(user: any) { if (user) grantCache.delete(user); }

/** Fill in league and rink from the most specific id given. */
async function resolve(db: Tx, s: Scope): Promise<Required<Scope> | { teamId: number | undefined; leagueId: number | undefined; rinkId: number | undefined }> {
  const { teamId } = s;
  let { leagueId, rinkId } = s;
  if (teamId && !leagueId) leagueId = (await one<{ league_id: number }>(db, "SELECT league_id FROM teams WHERE id=$1", [teamId]))?.league_id;
  if (leagueId && !rinkId) rinkId = (await one<{ rink_id: number }>(db, "SELECT rink_id FROM leagues WHERE id=$1", [leagueId]))?.rink_id;
  return { teamId, leagueId, rinkId };
}

function covers(g: Grant, s: { teamId?: number; leagueId?: number; rinkId?: number }) {
  switch (g.scope_type) {
    case "system": return true;
    case "rink": return !!s.rinkId && g.scope_id === s.rinkId;
    case "league": return !!s.leagueId && g.scope_id === s.leagueId;
    case "team": return !!s.teamId && g.scope_id === s.teamId;
  }
}

export async function can(db: Tx, user: any, action: Action, scope: Scope = {}) {
  if (!user) return false;
  const allowed = MATRIX[action] as readonly Role[];
  const grants = (await grantsOf(db, user)).filter((g) => allowed.includes(g.role));
  if (!grants.length) return false;
  if (grants.some((g) => g.scope_type === "system")) return true;
  // Team roles reach the rink-wide draft pool: a captain at any team at this rink can see it.
  if (action === "pool.view" && scope.rinkId && !scope.teamId) {
    for (const g of grants) {
      if (g.scope_type === "rink" && g.scope_id === scope.rinkId) return true;
      if (g.scope_type === "team" && (await resolve(db, { teamId: g.scope_id! })).rinkId === scope.rinkId) return true;
    }
    return false;
  }
  const s = await resolve(db, scope);
  return grants.some((g) => covers(g, s));
}

const DENY: Partial<Record<Action, string>> = {
  "roster.manage": "Only the captain or an assistant captain can do that.",
  "roster.merge": "Only the captain or rink staff can merge two players.",
  "team.assistants": "Only the captain can name assistant captains.",
  "team.edit": "Only the captain can rename the team.",
  "captain.reassign": "Only league or rink staff can reassign a captain.",
  "lineup.record": "Only this team's captains or rink staff can record who played.",
  "pool.view": "The draft pool is for captains at this rink.",
  "system.grant": "Only an admin can do that.",
};
export async function require_(db: Tx, user: any, action: Action, scope: Scope = {}) {
  if (!user) throw new HttpError(401, "Sign in first.");
  if (!(await can(db, user, action, scope))) throw new HttpError(403, DENY[action] ?? "You don't have access to do that.");
}

/* ---------- grants ---------- */

export async function grant(db: Tx, userId: number, role: Role, scopeId: number | null, grantedBy: number | null, note?: string) {
  const scopeType = ROLE_SCOPE[role];
  const id = (await one<{ id: number }>(db,
    `INSERT INTO role_grants (user_id,role,scope_type,scope_id,granted_by,note) VALUES ($1,$2,$3,$4,$5,$6)
     ON CONFLICT DO NOTHING RETURNING id`, [userId, role, scopeType, scopeType === "system" ? null : scopeId, grantedBy, note ?? null]))?.id;
  return id ?? null;
}
export async function revoke(db: Tx, grantId: number, revokedBy: number | null, note?: string) {
  await q(db, "UPDATE role_grants SET revoked_at=now(), revoked_by=$2, note=COALESCE($3, note) WHERE id=$1 AND revoked_at IS NULL", [grantId, revokedBy, note ?? null]);
}
export async function revokeRole(db: Tx, userId: number, role: Role, scopeId: number | null, revokedBy: number | null, note?: string) {
  await q(db,
    "UPDATE role_grants SET revoked_at=now(), revoked_by=$4, note=COALESCE($5, note) WHERE user_id=$1 AND role=$2 AND COALESCE(scope_id,0)=COALESCE($3::int,0) AND revoked_at IS NULL",
    [userId, role, scopeId, revokedBy, note ?? null]);
}

/** Roles a user holds on one team: "captain", "assistant_captain" or null. */
export async function teamRoleOf(db: Tx, userId: number, teamId: number): Promise<"captain" | "assistant_captain" | null> {
  const r = await one<{ role: string }>(db,
    "SELECT role FROM role_grants WHERE user_id=$1 AND scope_type='team' AND scope_id=$2 AND revoked_at IS NULL ORDER BY role='captain' DESC LIMIT 1", [userId, teamId]);
  return (r?.role as any) ?? null;
}

/** Staff who should hear about a team's dispute: commissioners of its league, then rink managers, then admins. */
export async function staffFor(db: Tx, teamId: number): Promise<number[]> {
  const s = await resolve(db, { teamId });
  for (const [role, id] of [["commissioner", s.leagueId], ["rink_manager", s.rinkId]] as const) {
    const rows = await q<{ user_id: number }>(db, "SELECT DISTINCT user_id FROM role_grants WHERE role=$1 AND scope_id=$2 AND revoked_at IS NULL", [role, id]);
    if (rows.length) return rows.map((r) => r.user_id);
  }
  return (await q<{ user_id: number }>(db, "SELECT DISTINCT user_id FROM role_grants WHERE role='admin' AND revoked_at IS NULL")).map((r) => r.user_id);
}

export async function audit(db: Tx, actor: number | null, action: string, target: { type: string; id?: number | null; rinkId?: number | null }, before?: unknown, after?: unknown, note?: string) {
  await q(db,
    "INSERT INTO audit_log (actor_user_id,action,target_type,target_id,rink_id,before_json,after_json,note) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)",
    [actor, action, target.type, target.id ?? null, target.rinkId ?? null, before === undefined ? null : JSON.stringify(before), after === undefined ? null : JSON.stringify(after), note ?? null]);
}
