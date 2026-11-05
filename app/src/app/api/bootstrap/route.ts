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
  const leagueRows = await q<any>(sql, admin ? "SELECT * FROM leagues WHERE rink_id=$1 AND level<>'TOURN' ORDER BY sort" : "SELECT * FROM leagues WHERE rink_id=$1 AND level NOT IN ('DEMO','TOURN') ORDER BY sort", [rink.id]);
  const teamRows = leagueRows.length
    ? await q<any>(sql, "SELECT id,name,color,logo,is_sample,league_id FROM teams WHERE league_id = ANY($1::int[]) ORDER BY name", [leagueRows.map((l) => l.id)])
    : [];
  const teamsByLeague = new Map<number, any[]>();
  for (const t of teamRows) {
    const list = teamsByLeague.get(t.league_id) ?? [];
    list.push({ id: t.id, name: t.name, color: t.color, logo: t.logo, is_sample: t.is_sample });
    teamsByLeague.set(t.league_id, list);
  }
  const leagues = leagueRows.map((l) => ({ ...l, teams: teamsByLeague.get(l.id) ?? [] }));
  const season = await currentSeason(sql, rink.id);
  const seasons = await q(sql, "SELECT * FROM seasons WHERE rink_id=$1 ORDER BY starts_on", [rink.id]);
  const tallies = await one<any>(sql, `
    SELECT
      (SELECT COUNT(*) FROM games g JOIN leagues l ON l.id=g.league_id WHERE l.rink_id=$1 AND l.level NOT IN ('DEMO','TOURN')) AS games,
      (SELECT COUNT(DISTINCT p.id) FROM players p JOIN roster_entries re ON re.player_id=p.id JOIN teams t ON t.id=re.team_id JOIN leagues l ON l.id=t.league_id WHERE l.rink_id=$1 AND l.level NOT IN ('DEMO','TOURN')) AS players,
      (SELECT COUNT(*) FROM sheets s JOIN games g ON g.id=s.game_id JOIN leagues l ON l.id=g.league_id WHERE l.rink_id=$1 AND s.status='confirmed') AS sheets,
      (SELECT COUNT(*) FROM rinks) AS rinks
  `, [rink.id]);
  const counts = { games: tallies.games, players: tallies.players, sheets: tallies.sheets };
  const rinkCount = tallies.rinks;
  return { region, rink, leagues, counts, season, seasons, rinkCount };
});
