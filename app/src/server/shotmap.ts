import "server-only";
import { q, type Tx } from "./db";

/**
 * Shot map points on a half rink: x 0..100 (blue line to end boards), y 0..100 (boards to boards),
 * net at x=89, y=50. Real plots don't exist yet; until they do, every credited goal gets a SAMPLE
 * spot generated from its ids, so the same goal always lands in the same place. Samples are never
 * stored and never counted as stats.
 */
export interface MapGoal { gameId: number; date: string | null; opponent: string; playerId: number; player: string; kind: "goal" | "assist"; x: number; y: number; sample: true }

function rng(seed: number) {
  let t = seed >>> 0;
  return () => { t += 0x6d2b79f5; let r = Math.imul(t ^ (t >>> 15), 1 | t); r ^= r + Math.imul(r ^ (r >>> 7), 61 | r); return ((r ^ (r >>> 14)) >>> 0) / 4294967296; };
}
// Beer league goals mostly come from the slot and the crease, some from the point and the circles.
const ZONES = [
  { w: 0.38, x: [70, 82], y: [38, 62] }, // slot
  { w: 0.22, x: [81, 87], y: [40, 60] }, // crease, rebounds
  { w: 0.18, x: [62, 76], y: [18, 36] }, // left circle
  { w: 0.14, x: [62, 76], y: [64, 82] }, // right circle
  { w: 0.08, x: [5, 18], y: [25, 75] },  // point
];
const ASSIST = [
  { w: 0.35, x: [86, 97], y: [10, 30] }, // behind the net / corners
  { w: 0.25, x: [86, 97], y: [70, 90] },
  { w: 0.25, x: [5, 20], y: [20, 80] },  // point pass
  { w: 0.15, x: [55, 70], y: [15, 85] }, // half wall
];
function place(zones: typeof ZONES, r: () => number) {
  let u = r(), z = zones[0];
  for (const c of zones) { if (u < c.w) { z = c; break; } u -= c.w; }
  return { x: Math.round(z.x[0] + r() * (z.x[1] - z.x[0])), y: Math.round(z.y[0] + r() * (z.y[1] - z.y[0])) };
}

export async function teamShotMap(db: Tx, teamId: number): Promise<MapGoal[]> {
  const rows = await q<any>(db,
    `SELECT il.game_id, il.player_id, il.goals, il.assists, p.display_name name, g.played_on,
       (SELECT t.name FROM teams t WHERE t.id = CASE WHEN g.home_team_id=$1 THEN g.away_team_id ELSE g.home_team_id END) opponent
     FROM imported_game_lines il JOIN games g ON g.id=il.game_id JOIN players p ON p.id=il.player_id
     WHERE il.team_id=$1 ORDER BY g.played_on, il.id`, [teamId]);
  const out: MapGoal[] = [];
  for (const r of rows) {
    for (const [kind, n, zones] of [["goal", r.goals, ZONES], ["assist", r.assists, ASSIST]] as const) {
      for (let i = 0; i < n; i++) {
        const rand = rng(r.game_id * 100003 + r.player_id * 101 + i * 7 + (kind === "goal" ? 0 : 50021));
        out.push({ gameId: r.game_id, date: r.played_on, opponent: r.opponent, playerId: r.player_id, player: r.name, kind, ...place(zones, rand), sample: true });
      }
    }
  }
  return out;
}
