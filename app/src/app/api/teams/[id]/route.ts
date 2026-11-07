import { handle, body, num } from "@/server/http";
import { sql, q, one } from "@/server/db";
import { currentSeason, gameCards, teamRating, teamRecord, HttpError } from "@/server/services";
import { captainOf, assistantsOf, requireUser, requireTeam, logAction, userFromRequest, userCan, applyViewerNames } from "@/server/accounts";
import { teamIsEmpty, removeTeam } from "@/server/manage";
import { teamArchetypes, canSetCaptainArchetype } from "@/server/archetypes";
import { audit } from "@/server/permissions";

export const dynamic = "force-dynamic";
export const GET = handle<{ id: string }>(async (req, { id }) => {
  const t = await one<any>(sql, "SELECT * FROM teams WHERE id=$1", [num(id)]);
  if (!t) throw new HttpError(404, "Team not found");
  const viewer = await userFromRequest(req).catch(() => null);
  const league = await one<any>(sql, "SELECT * FROM leagues WHERE id=$1", [t.league_id]);
  const roster = await q(sql,
    `SELECT p.id, p.display_name AS name, p.position, p.rating, p.games_rated, p.user_id IS NOT NULL AS registered, re.number, re.is_sub,
      (SELECT u.avatar FROM users u WHERE u.id=p.user_id) avatar,
      (SELECT CASE WHEN bool_or(r.role='captain') THEN 'C' WHEN bool_or(r.role='assistant_captain') THEN 'A' END FROM role_grants r
         WHERE r.user_id=p.user_id AND r.scope_type='team' AND r.scope_id=re.team_id AND r.revoked_at IS NULL) badge,
      (COALESCE((SELECT SUM(goals) FROM player_game_stats s WHERE s.player_id=p.id AND s.team_id=re.team_id),0) + COALESCE((SELECT SUM(g) FROM player_imports i WHERE i.player_id=p.id AND i.team_id=re.team_id),0))::int g,
      (COALESCE((SELECT SUM(assists) FROM player_game_stats s WHERE s.player_id=p.id AND s.team_id=re.team_id),0) + COALESCE((SELECT SUM(a) FROM player_imports i WHERE i.player_id=p.id AND i.team_id=re.team_id),0))::int a,
      (COALESCE((SELECT SUM(pim) FROM player_game_stats s WHERE s.player_id=p.id AND s.team_id=re.team_id),0) + COALESCE((SELECT SUM(pim) FROM player_imports i WHERE i.player_id=p.id AND i.team_id=re.team_id),0))::int pim,
      ((SELECT COUNT(*) FROM player_game_stats s WHERE s.player_id=p.id AND s.team_id=re.team_id) + GREATEST(COALESCE((SELECT SUM(gp) FROM player_imports i WHERE i.player_id=p.id AND i.team_id=re.team_id),0),
        (SELECT COUNT(*) FROM (SELECT game_id FROM imported_game_attendance a WHERE a.player_id=p.id AND a.team_id=re.team_id UNION SELECT game_id FROM imported_game_lines il WHERE il.player_id=p.id AND il.team_id=re.team_id) x)))::int gp
     FROM roster_entries re JOIN players p ON p.id=re.player_id WHERE re.team_id=$1 ORDER BY p.rating DESC`, [t.id]);
  roster.sort((a: any, b: any) => (b.g + b.a) - (a.g + a.a) || b.rating - a.rating);
  const games = await gameCards(sql, await q(sql, "SELECT * FROM games WHERE home_team_id=$1 OR away_team_id=$1 ORDER BY played_on DESC NULLS LAST, id DESC", [t.id]));
  const season = await currentSeason(sql, league.rink_id);
  const imported = await one<any>(sql, "SELECT MAX(as_of) as_of, MAX(source) source, SUM(gp) gp FROM team_imports WHERE team_id=$1", [t.id]);
  return {
    team: t, league, season, captain: await captainOf(sql, t.id), assistants: await assistantsOf(sql, t.id),
    record: await teamRecord(sql, t.id, season?.id ?? null), career: await teamRecord(sql, t.id), rating: await teamRating(sql, t.id),
    roster: await applyViewerNames(sql, viewer, roster), games, imported: imported?.gp ? imported : null,
    archetypes: await (async () => {
      const u = await userFromRequest(req).catch(() => null);
      return teamArchetypes(sql, t.id, u?.id ?? null);
    })(),
    can: await (async () => {
      const u = await userFromRequest(req).catch(() => null);
      const removable = (await userCan(sql, u, "team.remove", { teamId: t.id, leagueId: t.league_id, rinkId: league.rink_id })) && (await teamIsEmpty(sql, t.id));
      return { remove: removable, rename: await userCan(sql, u, "team.edit", { teamId: t.id, leagueId: t.league_id, rinkId: league.rink_id }), manageRoster: await userCan(sql, u, "roster.manage", { teamId: t.id, leagueId: t.league_id, rinkId: league.rink_id }), overrideArchetype: await canSetCaptainArchetype(sql, u?.id, t.id) };
    })(),
  };
});

export const PATCH = handle<{ id: string }>(async (req, { id }) => {
  const u = await requireUser(req);
  const teamId = num(id);
  const b = await body(req);
  // Archive or restore, and moving to another league, are staff moves, not captain ones.
  if (b?.archived !== undefined || b?.leagueId !== undefined) {
    return sql.begin(async (tx) => {
      const t = await requireTeam(tx, u, teamId, "team.remove");
      if (b.archived !== undefined) {
        const on = !!b.archived;
        await q(tx, "UPDATE teams SET archived_at=CASE WHEN $1 THEN now() ELSE NULL END WHERE id=$2", [on, teamId]);
        await audit(tx, u.id, on ? "team.archive" : "team.restore", { type: "team", id: teamId, rinkId: t.rink_id }, undefined, { name: t.name });
      }
      if (b.leagueId !== undefined && num(b.leagueId) !== t.league_id) {
        const to = await one<any>(tx, "SELECT id, rink_id, name FROM leagues WHERE id=$1", [num(b.leagueId)]);
        if (!to || to.rink_id !== t.rink_id) throw new HttpError(400, "Pick a league at the same rink.");
        await requireTeam(tx, u, teamId, "team.create");
        if (await one(tx, "SELECT 1 FROM games WHERE home_team_id=$1 OR away_team_id=$1", [teamId]) || await one(tx, "SELECT 1 FROM team_imports WHERE team_id=$1", [teamId]))
          throw new HttpError(409, "This team has games in its league. Archive it and add it to the new league instead.");
        await q(tx, "UPDATE teams SET league_id=$1 WHERE id=$2", [to.id, teamId]);
        await audit(tx, u.id, "team.move", { type: "team", id: teamId, rinkId: t.rink_id }, { leagueId: t.league_id }, { leagueId: to.id });
      }
      return { ok: true };
    });
  }
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
    if (!(await teamIsEmpty(tx, teamId))) throw new HttpError(409, "This team has games or players. Archive it instead.");
    await removeTeam(tx, teamId);
    await audit(tx, u.id, "team.remove", { type: "team", id: teamId, rinkId: t.rink_id }, { name: t.name }, undefined);
    return { ok: true };
  });
});
