import { handle, body, num } from "@/server/http";
import { sql, q, one } from "@/server/db";

export const dynamic = "force-dynamic";
export const GET = handle(async (req) => {
  const s = new URL(req.url).searchParams.get("league");
  const lid = s ? num(s) : null;
  return q(sql,
    `SELECT p.id, p.display_name AS name, p.position, p.rating, p.games_rated, p.user_id IS NOT NULL AS registered,
      string_agg(DISTINCT t.name, ',') teams, string_agg(DISTINCT l.level, ',') levels,
      (COALESCE((SELECT SUM(goals+assists) FROM player_game_stats s WHERE s.player_id=p.id),0) + COALESCE((SELECT SUM(g+a) FROM player_imports i WHERE i.player_id=p.id),0))::int pts,
      (SELECT after-before FROM rating_history rh WHERE rh.player_id=p.id ORDER BY rh.id DESC LIMIT 1) last_delta
     FROM players p JOIN roster_entries re ON re.player_id=p.id JOIN teams t ON t.id=re.team_id JOIN leagues l ON l.id=t.league_id
     ${lid ? "WHERE l.id=$1" : "WHERE l.level<>'DEMO'"} GROUP BY p.id ORDER BY p.rating DESC, pts DESC`, lid ? [lid] : []);
});
