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
  const lines = await q<Line>(db, "SELECT * FROM player_game_stats WHERE game_id=$1 ORDER BY id", [gameId]);
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

/** Replay every game from starting ratings. Deterministic: same games in, same ratings out. */
export async function recomputeAll() {
  const t0 = Date.now();
  let n = 0;
  await sql.begin(async (tx) => {
    await q(tx, "LOCK TABLE rating_history IN EXCLUSIVE MODE");
    await q(tx, "DELETE FROM rating_history");
    await q(tx, "UPDATE players SET rating=COALESCE(start_rating, rating), games_rated=0");
    // Imported results have no lineup, so they're never rated.
    const games = await q<{ id: number }>(tx, "SELECT id FROM games WHERE source='sheet' ORDER BY played_on NULLS LAST, id");
    for (const g of games) { await rateGame(tx, g.id); n++; }
    await q(tx, "INSERT INTO rating_runs (kind,algo_version,games,ms) VALUES ('recompute',$1,$2,$3)", [ALGO_VERSION, n, Date.now() - t0]);
  });
  return { games: n, ms: Date.now() - t0, algo: ALGO_VERSION };
}
