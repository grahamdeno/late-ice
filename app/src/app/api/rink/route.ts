import { handle, body, num } from "@/server/http";
import { sql, q, one } from "@/server/db";
import { currentSeason, standings } from "@/server/services";

export const dynamic = "force-dynamic";
export const GET = handle(async () => {
  const rink = await one<any>(sql, "SELECT * FROM rinks ORDER BY id LIMIT 1");
  const region = await one(sql, "SELECT * FROM regions WHERE id=$1", [rink.region_id]);
  const season = await currentSeason(sql, rink.id);
  const leagues = [];
  for (const l of await q<any>(sql, "SELECT * FROM leagues WHERE rink_id=$1 AND level<>'DEMO' ORDER BY sort", [rink.id])) {
    const st = await standings(sql, l.id, season?.id ?? null);
    leagues.push({ ...l, teams: (await one<any>(sql, "SELECT COUNT(*) c FROM teams WHERE league_id=$1", [l.id]))!.c, games: st.reduce((a: number, t: any) => a + t.gp, 0) / 2, leader: st[0] ?? null });
  }
  const top = await q(sql, "SELECT p.id,p.display_name AS name,p.rating,p.position FROM players p WHERE p.games_rated>0 AND EXISTS (SELECT 1 FROM roster_entries re JOIN teams t ON t.id=re.team_id JOIN leagues l ON l.id=t.league_id WHERE re.player_id=p.id AND l.level<>'DEMO') ORDER BY p.rating DESC LIMIT 5");
  const seasons = await q(sql, "SELECT * FROM seasons WHERE rink_id=$1 ORDER BY starts_on", [rink.id]);
  return { rink, region, season, seasons, leagues, top };
});
