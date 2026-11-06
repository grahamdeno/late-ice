import { handle, body, num } from "@/server/http";
import { sql, q, one } from "@/server/db";
import { applyViewerNames, userFromRequest } from "@/server/accounts";

export const dynamic = "force-dynamic";
export const GET = handle(async (req) => {
  const sp = new URL(req.url).searchParams, s = sp.get("league");
  const lid = s ? num(s) : null;
  const rid = !lid && sp.get("rink") ? num(sp.get("rink")) : null;
  const viewer = await userFromRequest(req).catch(() => null);
  return applyViewerNames(sql, viewer, await q(sql,
    `SELECT p.id, p.display_name AS name, p.position, p.rating, p.games_rated, p.user_id IS NOT NULL AS registered,
      string_agg(DISTINCT t.name, ',') teams, string_agg(DISTINCT l.level, ',') levels,
      (COALESCE((SELECT SUM(goals+assists) FROM player_game_stats s WHERE s.player_id=p.id),0) + COALESCE((SELECT SUM(g+a) FROM player_imports i WHERE i.player_id=p.id),0))::int pts,
      (SELECT after-before FROM rating_history rh WHERE rh.player_id=p.id ORDER BY rh.id DESC LIMIT 1) last_delta
     FROM players p JOIN roster_entries re ON re.player_id=p.id JOIN teams t ON t.id=re.team_id JOIN leagues l ON l.id=t.league_id
     ${lid ? "WHERE l.id=$1" : rid ? "WHERE l.rink_id=$1 AND l.level NOT IN ('DEMO','TOURN')" : "WHERE l.level NOT IN ('DEMO','TOURN')"} GROUP BY p.id ORDER BY (p.games_rated > 0) DESC, p.rating DESC, pts DESC`, lid ? [lid] : rid ? [rid] : []));
});
