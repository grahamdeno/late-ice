import { handle } from "@/server/http";
import { sql, q, one } from "@/server/db";
import { currentSeason, leagueBoard } from "@/server/services";
import * as A from "@/server/accounts";
import { applyLoadedNames, sameRinkSql } from "@/server/accounts";
import * as P from "@/server/permissions";

export const dynamic = "force-dynamic";
export const GET = handle(async (req) => {
  const want = Number(new URL(req.url).searchParams.get("id")) || 0;
  const rink = (want ? await one<any>(sql, "SELECT * FROM rinks WHERE id=$1", [want]) : null) ?? await one<any>(sql, "SELECT * FROM rinks ORDER BY id LIMIT 1");
  const [region, season, seasons, u] = await Promise.all([
    one(sql, "SELECT * FROM regions WHERE id=$1", [rink.region_id]),
    currentSeason(sql, rink.id),
    q(sql, "SELECT * FROM seasons WHERE rink_id=$1 ORDER BY starts_on", [rink.id]),
    A.userFromRequest(req).catch(() => null),
  ]);
  // Leagues (counts and leader) in one query, top players in one query.
  const [leagues, top] = await Promise.all([
    leagueBoard(sql, rink.id, season?.id ?? null),
    q(sql, `SELECT p.id, p.display_name AS name, p.name AS real_name, p.user_id, p.hidden,
      (SELECT u2.hidden FROM users u2 WHERE u2.id = p.user_id) AS user_hidden,
      (SELECT re.number FROM roster_entries re WHERE re.player_id = p.id AND re.number IS NOT NULL AND re.number <> '' ORDER BY re.id LIMIT 1) AS number,
      ${sameRinkSql("p.id", "$2")} AS same_rink, p.rating, p.position
      FROM players p WHERE p.games_rated>0 AND EXISTS (SELECT 1 FROM roster_entries re JOIN teams t ON t.id=re.team_id JOIN leagues l ON l.id=t.league_id WHERE re.player_id=p.id AND l.rink_id=$1 AND l.level NOT IN ('DEMO','TOURN')) ORDER BY p.rating DESC LIMIT 5`, [rink.id, u?.id ?? null]),
  ]);
  const scope = { rinkId: rink.id };
  const can = { edit: await P.can(sql, u, "rink.manage", scope), addLeague: await P.can(sql, u, "league.create", scope), seasons: await P.can(sql, u, "season.manage", scope), addRink: await P.can(sql, u, "rink.create") };
  return { rink, region, season, seasons, leagues, top: top.map((row) => applyLoadedNames(row)), can, signedIn: !!u };
});
