import { handle, body, num } from "@/server/http";
import { sql, q, one } from "@/server/db";
import { HttpError } from "@/server/services";
import * as A from "@/server/accounts";
import * as P from "@/server/permissions";
import * as S from "@/server/staff";

export const dynamic = "force-dynamic";

// What this staff member can see and do, plus the rinks they run.
export const GET = handle(async (req) => {
  const u = await A.requireUser(req);
  const roles = await A.rolesSummary(sql, u);
  const isAdmin = roles.some((r) => r.role === "admin");
  const isSupport = roles.some((r) => r.role === "support");
  const rinkIds = isAdmin
    ? (await q<{ id: number }>(sql, "SELECT id FROM rinks ORDER BY id")).map((r) => r.id)
    : Array.from(new Set([
        ...roles.filter((r) => r.role === "rink_manager").map((r) => r.scopeId as number),
        ...(await q<{ rink_id: number }>(sql, "SELECT DISTINCT l.rink_id FROM role_grants g JOIN leagues l ON l.id=g.scope_id WHERE g.user_id=$1 AND g.role='commissioner' AND g.revoked_at IS NULL", [u.id])).map((r) => r.rink_id),
      ]));
  if (!isAdmin && !isSupport && !rinkIds.length) throw new HttpError(403, "The staff page is for rink staff, support and admins.");
  const rinks = [];
  for (const rinkId of rinkIds) {
    const rink = await one<any>(sql, "SELECT id, name, address, phone, website, sheets, city, state FROM rinks WHERE id=$1", [rinkId]);
    const can = { edit: await P.can(sql, u, "rink.manage", { rinkId }), addLeague: await P.can(sql, u, "league.create", { rinkId }), seasons: await P.can(sql, u, "season.manage", { rinkId }) };
    const seasons = await q(sql, "SELECT id, name, starts_on, ends_on FROM seasons WHERE rink_id=$1 ORDER BY starts_on DESC", [rinkId]);
    const manage = await P.can(sql, u, "rink.staff", { rinkId });
    const leagues = [];
    for (const l of await q<any>(sql, "SELECT id, level, name FROM leagues WHERE rink_id=$1 ORDER BY sort", [rinkId])) {
      if (!manage && !(await P.can(sql, u, "game.resolve", { leagueId: l.id, rinkId }))) continue;
      const teams = await q<any>(sql,
        `SELECT t.id, t.name, t.color, t.is_sample,
           (SELECT u.name FROM role_grants g JOIN users u ON u.id=g.user_id WHERE g.role='captain' AND g.scope_id=t.id AND g.revoked_at IS NULL LIMIT 1) captain,
           (SELECT COUNT(*) FROM roster_entries re JOIN players p ON p.id=re.player_id WHERE re.team_id=t.id AND p.user_id IS NOT NULL)::int registered,
           (SELECT COUNT(*) FROM roster_entries re WHERE re.team_id=t.id)::int roster,
           (SELECT COUNT(*) FROM games g WHERE g.home_team_id=t.id OR g.away_team_id=t.id)::int games,
           (SELECT COUNT(*) FROM team_imports ti WHERE ti.team_id=t.id)::int imports
         FROM teams t WHERE t.league_id=$1 ORDER BY t.name`, [l.id]);
      const addTeam = await P.can(sql, u, "team.create", { leagueId: l.id, rinkId });
      leagues.push({ ...l, teams: teams.map((t: any) => ({ ...t, removable: addTeam && !t.games && !t.roster && !t.imports })), addTeam });
    }
    const staff = manage ? await q<any>(sql,
      `SELECT g.id, g.role, g.scope_id, u.id user_id, u.name, u.email, l.name league FROM role_grants g JOIN users u ON u.id=g.user_id LEFT JOIN leagues l ON g.scope_type='league' AND l.id=g.scope_id
       WHERE g.revoked_at IS NULL AND ((g.scope_type='rink' AND g.scope_id=$1) OR (g.scope_type='league' AND l.rink_id=$1)) ORDER BY g.role, u.name`, [rinkId]) : [];
    rinks.push({ ...rink, manage, can, seasons, leagues, staff });
  }
  const systemStaff = isAdmin ? await q(sql,
    "SELECT g.id, g.role, u.id user_id, u.name, u.email FROM role_grants g JOIN users u ON u.id=g.user_id WHERE g.scope_type='system' AND g.revoked_at IS NULL ORDER BY g.role, u.name") : [];
  return { me: { id: u.id, name: u.name }, roles, isAdmin, isSupport, rinks, systemStaff, allRinks: await q(sql, "SELECT id, name FROM rinks ORDER BY name") };
});
