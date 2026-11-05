import { handle, body, num } from "@/server/http";
import { sql, q, one } from "@/server/db";
import { currentSeason } from "@/server/services";
import { userFromRequest } from "@/server/accounts";
import { can } from "@/server/permissions";

export const dynamic = "force-dynamic";
export const GET = handle(async (req) => {
  // The Demo league is the sandbox for sample sheets: only admins see it.
  const u = await userFromRequest(req).catch(() => null);
  const admin = await can(sql, u, "ratings.recompute");
  // Which rink: the one asked for, else the signed-in player's home rink, else the first one Late Ice knew.
  const want = Number(new URL(req.url).searchParams.get("rink")) || (u as any)?.home_rink_id || 0;
  const rink = (want ? await one<any>(sql, "SELECT * FROM rinks WHERE id=$1", [want]) : null) ?? (await one<any>(sql, "SELECT * FROM rinks ORDER BY id LIMIT 1"));
  const region = await one(sql, "SELECT * FROM regions WHERE id=$1", [rink.region_id]);
  const leagues = [];
  for (const l of await q<any>(sql, admin ? "SELECT * FROM leagues WHERE rink_id=$1 AND level<>'TOURN' ORDER BY sort" : "SELECT * FROM leagues WHERE rink_id=$1 AND level NOT IN ('DEMO','TOURN') ORDER BY sort", [rink.id])) {
    leagues.push({ ...l, teams: await q(sql, "SELECT id,name,color,logo,is_sample FROM teams WHERE league_id=$1 ORDER BY name", [l.id]) });
  }
  const season = await currentSeason(sql, rink.id);
  const seasons = await q(sql, "SELECT * FROM seasons WHERE rink_id=$1 ORDER BY starts_on", [rink.id]);
  const counts = {
    games: (await one<any>(sql, "SELECT COUNT(*) c FROM games g JOIN leagues l ON l.id=g.league_id WHERE l.rink_id=$1 AND l.level NOT IN ('DEMO','TOURN')", [rink.id]))!.c,
    players: (await one<any>(sql, "SELECT COUNT(DISTINCT p.id) c FROM players p JOIN roster_entries re ON re.player_id=p.id JOIN teams t ON t.id=re.team_id JOIN leagues l ON l.id=t.league_id WHERE l.rink_id=$1 AND l.level NOT IN ('DEMO','TOURN')", [rink.id]))!.c,
    sheets: (await one<any>(sql, "SELECT COUNT(*) c FROM sheets s JOIN games g ON g.id=s.game_id JOIN leagues l ON l.id=g.league_id WHERE l.rink_id=$1 AND s.status='confirmed'", [rink.id]))!.c,
  };
  const rinkCount = (await one<any>(sql, "SELECT COUNT(*) c FROM rinks"))!.c;
  return { region, rink, leagues, counts, season, seasons, rinkCount };
});
