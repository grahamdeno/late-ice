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
    "SELECT il.*, p.display_name AS name FROM imported_game_lines il JOIN players p ON p.id=il.player_id WHERE il.game_id=$1 ORDER BY (il.goals*2+il.assists) DESC, p.display_name", [g.id]);
  const viewer = await userFromRequest(req).catch(() => null);
  return {
    ...(await gameCard(sql, g)), periods: parse(g.periods_json), goals: parse(g.goals_json), penalties: parse(g.penalties_json), shots: parse(g.shots_json),
    lines: await applyViewerNames(sql, viewer, lines, "player_id"),
    imported: await applyViewerNames(sql, viewer, imported, "player_id"),
    unassigned: g.unassigned_json ? JSON.parse(g.unassigned_json) : null,
  };
});
