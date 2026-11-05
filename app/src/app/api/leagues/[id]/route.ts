import { handle, body, num } from "@/server/http";
import { sql, q, one } from "@/server/db";
import { currentSeason, gameCards, leaders, seasonsWithData, standings, HttpError } from "@/server/services";

export const dynamic = "force-dynamic";
export const GET = handle<{ id: string }>(async (req, { id }) => {
  const l = await one<any>(sql, "SELECT * FROM leagues WHERE id=$1", [num(id)]);
  if (!l) throw new HttpError(404, "League not found");
  const seasons = await seasonsWithData(sql, l.id);
  const cur = await currentSeason(sql, l.rink_id);
  const qs = new URL(req.url).searchParams.get("season");
  const sid: number | null = qs ? num(qs) : (seasons[0]?.id ?? cur?.id ?? null);
  const season = (sid ? await one(sql, "SELECT * FROM seasons WHERE id=$1", [sid]) : null) ?? cur;
  const games = await gameCards(sql, await q(sql, "SELECT * FROM games WHERE league_id=$1 AND ($2::int IS NULL OR season_id=$2) ORDER BY played_on DESC NULLS LAST, id DESC", [l.id, sid]));
  const imports = await one<any>(sql, "SELECT MAX(as_of) as_of, MAX(source) source, SUM(gp) gp FROM team_imports ti JOIN teams t ON t.id=ti.team_id WHERE t.league_id=$1 AND ti.season_id=$2", [l.id, sid]);
  return { league: l, season, seasons, standings: await standings(sql, l.id, sid), leaders: await leaders(sql, l.id, 10, sid), games, imported: imports?.gp ? imports : null };
});
