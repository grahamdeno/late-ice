import { handle, body, num } from "@/server/http";
import { sql, q, one } from "@/server/db";
import { applyViewerNames, userFromRequest } from "@/server/accounts";
import { rinkFor, rinkOfLeague, sampleRinkId } from "@/server/visibility";

export const dynamic = "force-dynamic";
export const GET = handle(async (req) => {
  const sp = new URL(req.url).searchParams, s = sp.get("league");
  const viewer = await userFromRequest(req).catch(() => null);
  let lid = s ? num(s) : null;
  // Signed out: only the sample rink.
  if (lid && !viewer && (await rinkOfLeague(sql, lid)) !== (await sampleRinkId(sql))) lid = null;
  const rid = lid ? null : await rinkFor(sql, viewer, sp.get("rink") ? num(sp.get("rink")) : null);
  return applyViewerNames(sql, viewer, await q(sql,
    `SELECT p.id, p.display_name AS name, p.position, p.rating, p.games_rated, p.user_id IS NOT NULL AS registered,
      (p.position IS DISTINCT FROM 'G' AND COALESCE((SELECT SUM(gp) FROM player_imports i WHERE i.player_id=p.id),0) > 0) AS season_rated,
      string_agg(DISTINCT t.name, ',') teams, string_agg(DISTINCT l.level, ',') levels,
      (COALESCE((SELECT SUM(goals+assists) FROM player_game_stats s WHERE s.player_id=p.id),0) + COALESCE((SELECT SUM(g+a) FROM player_imports i WHERE i.player_id=p.id),0))::int pts,
      (SELECT after-before FROM rating_history rh WHERE rh.player_id=p.id ORDER BY rh.id DESC LIMIT 1) last_delta,
      gk.ggp, gk.sv, gk.gaa
     FROM players p JOIN roster_entries re ON re.player_id=p.id JOIN teams t ON t.id=re.team_id JOIN leagues l ON l.id=t.league_id
     LEFT JOIN LATERAL (
       SELECT COUNT(*)::int ggp,
         CASE WHEN SUM(r.shots_against) > 0 THEN 1 - SUM(r.goals_against)::float / SUM(r.shots_against) END sv,
         CASE WHEN COUNT(*) > 0 THEN SUM(r.goals_against)::float / COUNT(*) END gaa
       FROM goalie_reports r WHERE r.player_id=p.id
         AND (r.status IN ('verified','unverified') OR (r.status='pending' AND r.created_at < now() - interval '48 hours'))
     ) gk ON true
     ${lid ? "WHERE l.id=$1" : rid ? "WHERE l.rink_id=$1 AND l.level NOT IN ('DEMO','TOURN')" : "WHERE l.level NOT IN ('DEMO','TOURN')"} GROUP BY p.id, gk.ggp, gk.sv, gk.gaa ORDER BY (p.games_rated > 0 OR (p.position IS DISTINCT FROM 'G' AND COALESCE((SELECT SUM(gp) FROM player_imports i WHERE i.player_id=p.id),0) > 0)) DESC, p.rating DESC, pts DESC`, lid ? [lid] : rid ? [rid] : []));
});
