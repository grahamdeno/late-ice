import { handle, body, num } from "@/server/http";
import { sql, q, one } from "@/server/db";
import { currentSeason } from "@/server/services";
import { userFromRequest } from "@/server/accounts";
import { can } from "@/server/permissions";

export const dynamic = "force-dynamic";
export const GET = handle(async (req) => {
  // The Demo league is the sandbox for sample sheets: only admins see it.
  const admin = await can(sql, await userFromRequest(req).catch(() => null), "ratings.recompute");
  const region = await one(sql, "SELECT * FROM regions ORDER BY id LIMIT 1");
  const rink = await one<any>(sql, "SELECT * FROM rinks ORDER BY id LIMIT 1");
  const leagues = [];
  for (const l of await q<any>(sql, admin ? "SELECT * FROM leagues ORDER BY sort" : "SELECT * FROM leagues WHERE level<>'DEMO' ORDER BY sort")) {
    leagues.push({ ...l, teams: await q(sql, "SELECT id,name,color,logo,is_sample FROM teams WHERE league_id=$1 ORDER BY name", [l.id]) });
  }
  const season = await currentSeason(sql, rink.id);
  const seasons = await q(sql, "SELECT * FROM seasons WHERE rink_id=$1 ORDER BY starts_on", [rink.id]);
  const counts = {
    games: (await one<any>(sql, "SELECT COUNT(*) c FROM games g JOIN leagues l ON l.id=g.league_id WHERE l.level<>'DEMO'"))!.c,
    players: (await one<any>(sql, "SELECT COUNT(DISTINCT p.id) c FROM players p JOIN roster_entries re ON re.player_id=p.id JOIN teams t ON t.id=re.team_id JOIN leagues l ON l.id=t.league_id WHERE l.level<>'DEMO'"))!.c,
    sheets: (await one<any>(sql, "SELECT COUNT(*) c FROM sheets WHERE status='confirmed'"))!.c,
  };
  return { region, rink, leagues, counts, season, seasons };
});
