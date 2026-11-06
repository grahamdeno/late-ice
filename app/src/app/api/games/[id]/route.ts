import { handle, body, num } from "@/server/http";
import { sql, q, one } from "@/server/db";
import { gameCard, HttpError } from "@/server/services";
import { applyViewerNames, userFromRequest } from "@/server/accounts";

export const dynamic = "force-dynamic";
export const GET = handle<{ id: string }>(async (req, { id }) => {
  const g = await one<any>(sql, "SELECT * FROM games WHERE id=$1", [num(id)]);
  if (!g) throw new HttpError(404, "Game not found");
  const lines = await q(sql,
    `SELECT s.*, p.display_name AS name, (SELECT after-before FROM rating_history rh WHERE rh.player_id=s.player_id AND rh.game_id=s.game_id LIMIT 1) delta
     FROM player_game_stats s JOIN players p ON p.id=s.player_id WHERE s.game_id=$1 ORDER BY (s.goals+s.assists) DESC, p.display_name`, [g.id]);
  const parse = (s: string | null) => JSON.parse(s || "{}");
  const imported = await q(sql,
    `SELECT x.player_id, x.team_id, COALESCE(il.goals,0)::int goals, COALESCE(il.assists,0)::int assists, p.display_name AS name
     FROM (SELECT player_id, team_id FROM imported_game_lines WHERE game_id=$1 UNION SELECT player_id, team_id FROM imported_game_attendance WHERE game_id=$1) x
     JOIN players p ON p.id=x.player_id LEFT JOIN imported_game_lines il ON il.game_id=$1 AND il.player_id=x.player_id
     ORDER BY (COALESCE(il.goals,0)*2+COALESCE(il.assists,0)) DESC, p.display_name`, [g.id]);
  const lineupTeams = (await q<{ team_id: number }>(sql, "SELECT DISTINCT team_id FROM imported_game_attendance WHERE game_id=$1", [g.id])).map((r) => r.team_id);
  const viewer = await userFromRequest(req).catch(() => null);
  return {
    ...(await gameCard(sql, g)), periods: parse(g.periods_json), goals: parse(g.goals_json), penalties: parse(g.penalties_json), shots: parse(g.shots_json),
    lines: await applyViewerNames(sql, viewer, lines, "player_id"),
    imported: await applyViewerNames(sql, viewer, imported, "player_id"),
    unassigned: g.unassigned_json ? JSON.parse(g.unassigned_json) : null,
    lineupTeams,
  };
});
