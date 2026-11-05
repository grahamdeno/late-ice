import { handle, body, num } from "@/server/http";
import { sql, q, one } from "@/server/db";
import { currentSeason, gameCards, teamRating, teamRecord, HttpError } from "@/server/services";
import { captainOf, assistantsOf, requireUser, requireTeam, logAction, userFromRequest, userCan } from "@/server/accounts";
import { teamIsEmpty, removeTeam } from "@/server/manage";
import { teamArchetypes } from "@/server/archetypes";
import { audit } from "@/server/permissions";

export const dynamic = "force-dynamic";
export const GET = handle<{ id: string }>(async (req, { id }) => {
  const t = await one<any>(sql, "SELECT * FROM teams WHERE id=$1", [num(id)]);
  if (!t) throw new HttpError(404, "Team not found");
  const league = await one<any>(sql, "SELECT * FROM leagues WHERE id=$1", [t.league_id]);
  const roster = await q(sql,
    `SELECT p.id, p.display_name AS name, p.position, p.rating, p.games_rated, p.user_id IS NOT NULL AS registered, re.number,
      (SELECT CASE WHEN bool_or(r.role='captain') THEN 'C' WHEN bool_or(r.role='assistant_captain') THEN 'A' END FROM role_grants r
         WHERE r.user_id=p.user_id AND r.scope_type='team' AND r.scope_id=re.team_id AND r.revoked_at IS NULL) badge,
      (COALESCE((SELECT SUM(goals) FROM player_game_stats s WHERE s.player_id=p.id AND s.team_id=re.team_id),0) + COALESCE((SELECT SUM(g) FROM player_imports i WHERE i.player_id=p.id AND i.team_id=re.team_id),0))::int g,
      (COALESCE((SELECT SUM(assists) FROM player_game_stats s WHERE s.player_id=p.id AND s.team_id=re.team_id),0) + COALESCE((SELECT SUM(a) FROM player_imports i WHERE i.player_id=p.id AND i.team_id=re.team_id),0))::int a,
      (COALESCE((SELECT SUM(pim) FROM player_game_stats s WHERE s.player_id=p.id AND s.team_id=re.team_id),0) + COALESCE((SELECT SUM(pim) FROM player_imports i WHERE i.player_id=p.id AND i.team_id=re.team_id),0))::int pim,
      ((SELECT COUNT(*) FROM player_game_stats s WHERE s.player_id=p.id AND s.team_id=re.team_id) + COALESCE((SELECT SUM(gp) FROM player_imports i WHERE i.player_id=p.id AND i.team_id=re.team_id),0))::int gp
     FROM roster_entries re JOIN players p ON p.id=re.player_id WHERE re.team_id=$1 ORDER BY p.rating DESC`, [t.id]);
  roster.sort((a: any, b: any) => (b.g + b.a) - (a.g + a.a) || b.rating - a.rating);
  const games = await gameCards(sql, await q(sql, "SELECT * FROM games WHERE home_team_id=$1 OR away_team_id=$1 ORDER BY played_on DESC NULLS LAST, id DESC", [t.id]));
  const season = await currentSeason(sql, league.rink_id);
  const imported = await one<any>(sql, "SELECT MAX(as_of) as_of, MAX(source) source, SUM(gp) gp FROM team_imports WHERE team_id=$1", [t.id]);
  return {
    team: t, league, season, captain: await captainOf(sql, t.id), assistants: await assistantsOf(sql, t.id),
    record: await teamRecord(sql, t.id, season?.id ?? null), career: await teamRecord(sql, t.id), rating: await teamRating(sql, t.id),
    roster, games, imported: imported?.gp ? imported : null,
    archetypes: await (async () => {
      const u = await userFromRequest(req).catch(() => null);
      return teamArchetypes(sql, t.id, u?.id ?? null);
    })(),
    can: await (async () => {
      const u = await userFromRequest(req).catch(() => null);
      const removable = (await userCan(sql, u, "team.remove", { teamId: t.id, leagueId: t.league_id, rinkId: league.rink_id })) && (await teamIsEmpty(sql, t.id));
      return { remove: removable, rename: await userCan(sql, u, "team.edit", { teamId: t.id, leagueId: t.league_id, rinkId: league.rink_id }) };
    })(),
  };
});

export const PATCH = handle<{ id: string }>(async (req, { id }) => {
  const u = await requireUser(req);
  const teamId = num(id);
  const b = await body(req);
  await sql.begin(async (tx) => {
    const t = await requireTeam(tx, u, teamId, "team.edit");
    const name = b?.name !== undefined ? String(b.name).trim().slice(0, 50) : t.name;
    const color = b?.color !== undefined ? String(b.color) : t.color;
    if (!name) throw new HttpError(400, "Team name can't be empty.");
    if (!/^#[0-9a-fA-F]{6}$/.test(color)) throw new HttpError(400, "Pick a color.");
    await q(tx, "UPDATE teams SET name=$1, color=$2 WHERE id=$3", [name, color, teamId]);
    await logAction(tx, teamId, u.id, "edit_team", null, null, { from: { name: t.name, color: t.color }, to: { name, color } });
  });
  return { ok: true };
});

/** Remove a team that was added by mistake. Only while it has no games, players or imported records. */
export const DELETE = handle<{ id: string }>(async (req, { id }) => {
  const u = await requireUser(req);
  const teamId = num(id);
  return sql.begin(async (tx) => {
    const t = await requireTeam(tx, u, teamId, "team.remove");
    if (!(await teamIsEmpty(tx, teamId))) throw new HttpError(409, "This team has games or players. Rename it instead.");
    await removeTeam(tx, teamId);
    await audit(tx, u.id, "team.remove", { type: "team", id: teamId, rinkId: t.rink_id }, { name: t.name }, undefined);
    return { ok: true };
  });
});
