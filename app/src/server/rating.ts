import "server-only";
import { one, q, sql, type Tx } from "./db";

/**
 * Late Ice Rating (LIR), version lir-1.
 *
 * Team-result based with small individual nudges, and every move is explained.
 * Ratings are derived only from stored stat lines, so they can be replayed:
 * - rateGame() runs once when a sheet is confirmed.
 * - recomputeAll() replays every game in date order from each player's starting
 *   rating. The nightly job runs it so ratings never drift after merges, fixes or
 *   a change to this file. Bump ALGO_VERSION when the math changes.
 */
export const ALGO_VERSION = "lir-1";

interface Line { player_id: number; team_id: number; goals: number; assists: number; pim: number; is_goalie: number; shots_against: number | null; goals_against: number | null }

/** Per-player rating move for one game. Pure: no database. rateGame stores the result. */
export function ratePlayer(input: {
  rating: number;
  gamesRated: number;
  goals: number;
  assists: number;
  pim: number;
  isGoalie: number;
  shotsAgainst: number | null;
  goalsAgainst: number | null;
  own: number;
  opp: number;
  gf: number;
  ga: number;
  eventId: unknown;
}): { reasons: { label: string; value: number }[]; after: number } {
  const { rating, gamesRated, goals, assists, pim, isGoalie, shotsAgainst, goalsAgainst, own, opp, gf, ga, eventId } = input;
  const S = gf > ga ? 1 : gf === ga ? 0.5 : 0;
  const E = 1 / (1 + Math.pow(10, (opp - own) / 0.8));
  const K = gamesRated < 5 ? 0.12 : 0.06;
  const margin = Math.abs(gf - ga) >= 2 ? 1 + 0.1 * Math.min(3, Math.abs(gf - ga) - 1) : 1;
  const reasons: { label: string; value: number }[] = [];
  const res = K * margin * (S - E);
  const outcome = S === 1 ? "Win" : S === 0.5 ? "Tie" : "Loss";
  reasons.push({ label: `${outcome} ${gf}-${ga} vs a ${opp >= own ? "stronger" : "weaker"} team (expected ${(E * 100).toFixed(0)}%)`, value: res });
  const pts = goals + assists;
  if (pts > 0) reasons.push({ label: `${goals}G ${assists}A on the sheet`, value: Math.min(0.012, 0.004 * pts) });
  if (isGoalie && shotsAgainst) {
    const sa = shotsAgainst, gaa = goalsAgainst ?? 0;
    const sv = (sa - gaa) / sa;
    const b = Math.max(-0.01, Math.min(0.012, (sv - 0.88) * 0.1));
    reasons.push({ label: `Goalie: ${sa - gaa} saves on ${sa} (${sv.toFixed(3).replace(/^0/, "")})`, value: b });
  }
  if (pim >= 6) reasons.push({ label: `${pim} penalty minutes`, value: -0.004 });
  if (gamesRated < 5) reasons.push({ label: `Provisional: game ${gamesRated + 1} of 5 moves faster`, value: 0 });
  if (eventId) {
    for (const r of reasons) r.value = r.value / 2;
    reasons.push({ label: "Tournament game: counts half", value: 0 });
  }
  const delta = reasons.reduce((s, r) => s + r.value, 0);
  const after = Math.max(1, Math.min(7, Math.round((rating + delta) * 1000) / 1000));
  return { reasons, after };
}

export async function rateGame(db: Tx, gameId: number) {
  const g = await one<any>(db, "SELECT * FROM games WHERE id=$1", [gameId]);
  if (!g) return;
  // Sheets carry a stat line per player. An imported game has no lineup of its own, so it is rated
  // only for a team whose poll attendance was recorded: those players, with any goals and assists
  // the rink credited to them. The other team has no lineup and is treated as an average opponent.
  const lines = g.source === "sheet"
    ? await q<Line>(db, "SELECT * FROM player_game_stats WHERE game_id=$1 ORDER BY id", [gameId])
    : await q<Line>(db, `
        SELECT a.player_id, a.team_id, COALESCE(il.goals,0)::int goals, COALESCE(il.assists,0)::int assists,
               0 pim, 0 is_goalie, NULL::int shots_against, NULL::int goals_against
        FROM (
          SELECT player_id, team_id FROM imported_game_attendance WHERE game_id=$1
          UNION
          SELECT player_id, team_id FROM imported_game_lines
          WHERE game_id=$1 AND team_id IN (SELECT team_id FROM imported_game_attendance WHERE game_id=$1)
        ) a
        LEFT JOIN imported_game_lines il ON il.game_id=$1 AND il.player_id=a.player_id
        ORDER BY a.player_id`, [gameId]);
  const ids = Array.from(new Set(lines.map((l) => l.player_id)));
  const rows = ids.length ? await q<any>(db, "SELECT id, rating, games_rated FROM players WHERE id = ANY($1::int[])", [ids]) : [];
  const players = new Map<number, any>(rows.map((p) => [p.id, p]));

  const homeId = g.home_team_id, awayId = g.away_team_id, hs = g.home_score, as = g.away_score;
  const teamAvg = (teamId: number) => {
    const rs = lines.filter((l) => l.team_id === teamId && players.has(l.player_id)).map((l) => players.get(l.player_id).rating as number);
    return rs.length ? rs.reduce((a, b) => a + b, 0) / rs.length : 3.8;
  };
  const avg: Record<number, number> = { [homeId]: teamAvg(homeId), [awayId]: teamAvg(awayId) };

  const seen = new Set<number>();
  for (const l of lines) {
    if (seen.has(l.player_id)) continue;
    seen.add(l.player_id);
    const p = players.get(l.player_id);
    if (!p) continue;
    const own = avg[l.team_id], opp = avg[l.team_id === homeId ? awayId : homeId];
    const gf = l.team_id === homeId ? hs : as, ga = l.team_id === homeId ? as : hs;
    const { reasons, after } = ratePlayer({
      rating: p.rating,
      gamesRated: p.games_rated,
      goals: l.goals,
      assists: l.assists,
      pim: l.pim,
      isGoalie: l.is_goalie,
      shotsAgainst: l.shots_against,
      goalsAgainst: l.goals_against,
      own, opp, gf, ga,
      eventId: g.event_id,
    });
    await q(db, "UPDATE players SET rating=$1, games_rated=games_rated+1, position=CASE WHEN $2=1 THEN 'G' ELSE position END WHERE id=$3", [after, l.is_goalie ? 1 : 0, p.id]);
    await q(db, "INSERT INTO rating_history (player_id,game_id,before,after,reasons_json,algo_version) VALUES ($1,$2,$3,$4,$5,$6)", [p.id, gameId, p.rating, after, JSON.stringify(reasons), ALGO_VERSION]);
  }
  await q(db, "UPDATE games SET rated_at=now() WHERE id=$1", [gameId]);
}

/**
 * Season rating: the starting point before any rated game. League baseline, nudged by points per
 * game against the league's skaters, with the nudge growing as games played grow. Goalies and
 * players with no season totals start at the baseline. Pure, so it can be tested.
 */
export const SEASON = { weight: 0.25, cap: 0.35, minSd: 0.2, settle: 4 };
export function seasonStart(base: number, ppg: number, avg: number, sd: number, gp: number) {
  if (!gp) return base;
  const z = (ppg - avg) / Math.max(sd, SEASON.minSd);
  const nudge = Math.max(-SEASON.cap, Math.min(SEASON.cap, SEASON.weight * z)) * (gp / (gp + SEASON.settle));
  return Math.max(1, Math.min(7, Math.round((base + nudge) * 1000) / 1000));
}

/** Set every player's start_rating from the baseline and the rink's season totals. */
export async function applySeasonStarts(tx: Tx) {
  await q(tx, "UPDATE players SET base_rating=start_rating WHERE base_rating IS NULL");
  await q(tx, "UPDATE players SET start_rating=base_rating WHERE start_rating IS DISTINCT FROM base_rating");
  // One row per skater: the league where they have the most imported games.
  const rows = await q<{ player_id: number; league_id: number; gp: number; pts: number; base: number }>(tx, `
    SELECT DISTINCT ON (x.player_id) x.player_id, x.league_id, x.gp, x.pts, p.base_rating AS base
    FROM (SELECT i.player_id, t.league_id, SUM(i.gp)::float gp, SUM(COALESCE(i.g,0)+COALESCE(i.a,0))::float pts
          FROM player_imports i JOIN teams t ON t.id=i.team_id GROUP BY i.player_id, t.league_id HAVING SUM(i.gp) > 0) x
    JOIN players p ON p.id=x.player_id
    WHERE p.position IS DISTINCT FROM 'G'
    ORDER BY x.player_id, x.gp DESC`);
  const byLeague = new Map<number, number[]>();
  for (const r of rows) byLeague.set(r.league_id, [...(byLeague.get(r.league_id) ?? []), r.pts / r.gp]);
  const stats = new Map<number, { avg: number; sd: number }>();
  for (const [l, xs] of byLeague) {
    const avg = xs.reduce((a, b) => a + b, 0) / xs.length;
    const sd = Math.sqrt(xs.reduce((a, b) => a + (b - avg) ** 2, 0) / xs.length);
    stats.set(l, { avg, sd });
  }
  const ids: number[] = [], starts: number[] = [];
  for (const r of rows) {
    const st = stats.get(r.league_id)!;
    ids.push(r.player_id);
    starts.push(seasonStart(Number(r.base), r.pts / r.gp, st.avg, st.sd, Number(r.gp)));
  }
  if (ids.length) await q(tx, "UPDATE players p SET start_rating=x.s FROM unnest($1::int[], $2::float8[]) AS x(id, s) WHERE p.id=x.id", [ids, starts]);
  return ids.length;
}

/** Replay every game from starting ratings. Deterministic: same games in, same ratings out. */
export async function recomputeAll() {
  const t0 = Date.now();
  let n = 0;
  await sql.begin(async (tx) => {
    await q(tx, "LOCK TABLE rating_history IN EXCLUSIVE MODE");
    await q(tx, "DELETE FROM rating_history");
    await applySeasonStarts(tx);
    await q(tx, "UPDATE players SET rating=COALESCE(start_rating, rating), games_rated=0");
    // Sheets always; imported games only once a lineup (poll attendance) has been recorded.
    const games = await q<{ id: number }>(tx, "SELECT id FROM games WHERE source='sheet' OR EXISTS (SELECT 1 FROM imported_game_attendance a WHERE a.game_id=games.id) ORDER BY played_on NULLS LAST, id");
    for (const g of games) { await rateGame(tx, g.id); n++; }
    await q(tx, "INSERT INTO rating_runs (kind,algo_version,games,ms) VALUES ('recompute',$1,$2,$3)", [ALGO_VERSION, n, Date.now() - t0]);
  });
  return { games: n, ms: Date.now() - t0, algo: ALGO_VERSION };
}
