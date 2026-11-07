import "server-only";
import { one, q, type Tx } from "./db";
import { HttpError } from "./services";
import { applyViewerNames } from "./accounts";
import { milestonesFor } from "./milestones";

export interface GoalieGame { teamId: number; homeTeamId: number; homeScore: number; awayScore: number; goalsAgainst: number | null; shotsAgainst: number | null }

/**
 * Goalie corner: record, goals against and shutouts come from the score, so every game counts.
 * Save percentage needs shots, so it covers only the games where shots against were entered.
 */
export function goalieCorner(games: GoalieGame[]) {
  let w = 0, l = 0, t = 0, ga = 0, so = 0, shots = 0, shotGa = 0, withShots = 0;
  for (const g of games) {
    const mine = g.teamId === g.homeTeamId ? g.homeScore : g.awayScore;
    const theirs = g.teamId === g.homeTeamId ? g.awayScore : g.homeScore;
    if (mine > theirs) w++; else if (mine < theirs) l++; else t++;
    const against = g.goalsAgainst ?? theirs;
    ga += against;
    if (theirs === 0) so++;
    if (g.shotsAgainst != null && g.shotsAgainst > 0) { shots += g.shotsAgainst; shotGa += Math.min(against, g.shotsAgainst); withShots++; }
  }
  const gp = games.length;
  return {
    gp, w, l, t, shutouts: so, goalsAgainst: ga,
    gaa: gp ? Math.round((ga / gp) * 100) / 100 : null,
    shots: withShots ? shots : null,
    savePct: withShots ? Math.round((1 - shotGa / shots) * 1000) / 1000 : null,
    gamesWithShots: withShots,
  };
}

/** Seasons, teams, rating over time, milestones and goalie numbers for one player. Public, like the player page. */
export async function career(db: Tx, viewer: any, playerId: number) {
  const raw = await one<any>(db, "SELECT * FROM players WHERE id=$1", [playerId]);
  if (!raw) throw new HttpError(404, "Player not found");
  const [named] = await applyViewerNames(db, viewer, [{ id: raw.id, name: raw.display_name }]);

  const rows = await q<any>(db,
    `SELECT x.team_id, t.name AS team, t.color, g.season_id, COALESCE(se.name, 'Earlier') AS season, COALESCE(se.starts_on, '') AS starts_on,
       COUNT(*)::int gp, COALESCE(SUM(x.goals),0)::int g, COALESCE(SUM(x.assists),0)::int a, COALESCE(SUM(x.pim),0)::int pim
     FROM (
       SELECT s.game_id, s.team_id, s.goals, s.assists, s.pim FROM player_game_stats s WHERE s.player_id=$1
       UNION ALL
       SELECT a.game_id, a.team_id, COALESCE(il.goals,0), COALESCE(il.assists,0), 0
         FROM imported_game_attendance a LEFT JOIN imported_game_lines il ON il.game_id=a.game_id AND il.player_id=a.player_id WHERE a.player_id=$1
       UNION ALL
       SELECT il.game_id, il.team_id, il.goals, il.assists, 0 FROM imported_game_lines il
         WHERE il.player_id=$1 AND NOT EXISTS (SELECT 1 FROM imported_game_attendance a WHERE a.game_id=il.game_id AND a.player_id=il.player_id)
     ) x JOIN games g ON g.id=x.game_id JOIN teams t ON t.id=x.team_id LEFT JOIN seasons se ON se.id=g.season_id
     GROUP BY x.team_id, t.name, t.color, g.season_id, se.name, se.starts_on ORDER BY COALESCE(se.starts_on, '') DESC, t.name`, [playerId]);
  const seasons = rows.map((r) => ({ ...r, pts: r.g + r.a }));
  const totals = seasons.reduce((acc, r) => ({ gp: acc.gp + r.gp, g: acc.g + r.g, a: acc.a + r.a, pim: acc.pim + r.pim }), { gp: 0, g: 0, a: 0, pim: 0 });

  const history = await q<any>(db,
    "SELECT rh.before, rh.after, g.played_on FROM rating_history rh JOIN games g ON g.id=rh.game_id WHERE rh.player_id=$1 ORDER BY rh.id", [playerId]);
  const ratings = history.map((h) => ({ on: h.played_on, rating: Math.round(h.after * 100) / 100 }));
  const peak = history.length ? Math.max(...history.map((h) => h.after)) : null;

  const goalieRows = await q<any>(db,
    `SELECT s.team_id, g.home_team_id, g.home_score, g.away_score, s.goals_against, s.shots_against
       FROM player_game_stats s JOIN games g ON g.id=s.game_id WHERE s.player_id=$1 AND s.is_goalie=1
     UNION ALL
     SELECT a.team_id, g.home_team_id, g.home_score, g.away_score, NULL, NULL
       FROM imported_game_attendance a JOIN games g ON g.id=a.game_id WHERE a.player_id=$1 AND a.in_goal`, [playerId]);
  const goalie = goalieRows.length
    ? goalieCorner(goalieRows.map((r) => ({ teamId: r.team_id, homeTeamId: r.home_team_id, homeScore: r.home_score, awayScore: r.away_score, goalsAgainst: r.goals_against, shotsAgainst: r.shots_against })))
    : null;

  return {
    player: { id: raw.id, name: named.name, position: raw.position, rating: Math.round(raw.rating * 100) / 100, gamesRated: raw.games_rated, claimed: !!raw.user_id },
    seasons, totals,
    rating: { series: ratings, peak: peak == null ? null : Math.round(peak * 100) / 100, peakAfterTen: history.length >= 10 },
    milestones: await milestonesFor(db, playerId),
    goalie,
  };
}
