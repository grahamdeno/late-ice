import "server-only";
import { one, q, type Tx } from "./db";
import { notify } from "./accounts";

export const MILESTONES: Record<string, { label: string; blurb: string }> = {
  first_goal: { label: "First goal", blurb: "Scored your first goal on Late Ice." },
  first_assist: { label: "First assist", blurb: "Set up your first goal on Late Ice." },
  first_hat_trick: { label: "First hat trick", blurb: "Three goals in one game." },
  first_shutout: { label: "First shutout", blurb: "Held the other team scoreless." },
  games_10: { label: "10 games", blurb: "Ten games played." },
  games_25: { label: "25 games", blurb: "Twenty-five games played." },
  games_50: { label: "50 games", blurb: "Fifty games played." },
  games_100: { label: "100 games", blurb: "One hundred games played." },
  points_10: { label: "10 points", blurb: "Ten career points." },
  points_25: { label: "25 points", blurb: "Twenty-five career points." },
  points_50: { label: "50 points", blurb: "Fifty career points." },
  points_100: { label: "100 points", blurb: "One hundred career points." },
};

export interface GameRow { gameId: number; on: string | null; goals: number; assists: number; goalie: boolean; shutout: boolean; imported: boolean }
export interface Earned { kind: string; gameId: number | null; on: string | null }

const GAME_STEPS = [10, 25, 50, 100];
const POINT_STEPS = [10, 25, 50, 100];

/**
 * What one player has earned, from their games in order.
 * Rink-imported games count toward games played and points, but never toward a first: the rink's
 * export does not say who scored when, so a first goal or hat trick there could be wrong.
 * Pure so the rules can be tested.
 */
export function earnedMilestones(rows: GameRow[]): Earned[] {
  const games = [...rows].sort((a, b) => String(a.on ?? "").localeCompare(String(b.on ?? "")) || a.gameId - b.gameId);
  const out: Earned[] = [];
  const have = new Set<string>();
  const add = (kind: string, g: GameRow) => { if (!have.has(kind)) { have.add(kind); out.push({ kind, gameId: g.gameId, on: g.on }); } };
  let played = 0, points = 0;
  for (const g of games) {
    played += 1;
    points += g.goals + g.assists;
    for (const n of GAME_STEPS) if (played >= n) add(`games_${n}`, g);
    for (const n of POINT_STEPS) if (points >= n) add(`points_${n}`, g);
    if (!g.imported) {
      if (g.goals >= 1) add("first_goal", g);
      if (g.assists >= 1) add("first_assist", g);
      if (g.goals >= 3) add("first_hat_trick", g);
      if (g.goalie && g.shutout) add("first_shutout", g);
    }
  }
  return out;
}

/**
 * Work out every player's milestones and record the new ones. The very first run (nothing recorded yet)
 * is quiet: it files everyone's past milestones without a single notice. After that, a newly earned
 * milestone sends one notice to a player with an account.
 */
export async function computeMilestones(db: Tx) {
  const quiet = !(await one(db, "SELECT 1 FROM milestones LIMIT 1"));
  const rows = await q<any>(db,
    `SELECT x.player_id, x.game_id, g.played_on AS on_date, x.goals::int goals, x.assists::int assists, x.goalie::int goalie, x.shutout::int shutout, x.imported::int imported
     FROM (
       SELECT s.player_id, s.game_id, s.goals, s.assists, s.is_goalie AS goalie,
         (CASE WHEN s.is_goalie = 1 AND (CASE WHEN s.team_id = g2.home_team_id THEN g2.away_score ELSE g2.home_score END) = 0 THEN 1 ELSE 0 END) AS shutout, 0 AS imported
         FROM player_game_stats s JOIN games g2 ON g2.id = s.game_id
       UNION ALL
       SELECT a.player_id, a.game_id, COALESCE(il.goals,0), COALESCE(il.assists,0), 0, 0, 1
         FROM imported_game_attendance a LEFT JOIN imported_game_lines il ON il.game_id = a.game_id AND il.player_id = a.player_id
       UNION ALL
       SELECT il.player_id, il.game_id, il.goals, il.assists, 0, 0, 1
         FROM imported_game_lines il WHERE NOT EXISTS (SELECT 1 FROM imported_game_attendance a WHERE a.game_id = il.game_id AND a.player_id = il.player_id)
     ) x JOIN games g ON g.id = x.game_id`);
  const byPlayer = new Map<number, GameRow[]>();
  for (const r of rows) {
    const list = byPlayer.get(r.player_id) ?? [];
    list.push({ gameId: r.game_id, on: r.on_date, goals: r.goals, assists: r.assists, goalie: !!r.goalie, shutout: !!r.shutout, imported: !!r.imported });
    byPlayer.set(r.player_id, list);
  }
  const have = new Set((await q<any>(db, "SELECT player_id, kind FROM milestones")).map((r) => `${r.player_id}:${r.kind}`));
  let added = 0, notified = 0;
  for (const [playerId, list] of byPlayer) {
    for (const m of earnedMilestones(list)) {
      if (have.has(`${playerId}:${m.kind}`)) continue;
      const inserted = await one<any>(db,
        `INSERT INTO milestones (player_id, kind, game_id, earned_on, notified_at) VALUES ($1,$2,$3,$4, ${quiet ? "now()" : "NULL"})
         ON CONFLICT (player_id, kind) DO NOTHING RETURNING id`, [playerId, m.kind, m.gameId, m.on]);
      if (!inserted) continue;
      added += 1;
      if (quiet) continue;
      const owner = await one<any>(db, "SELECT user_id FROM players WHERE id=$1", [playerId]);
      if (owner?.user_id) {
        const meta = MILESTONES[m.kind];
        await notify(db, owner.user_id, { kind: "milestone", title: meta.label, body: meta.blurb, link: `/player/${playerId}/career`, playerId, push: false });
        await q(db, "UPDATE milestones SET notified_at=now() WHERE id=$1", [inserted.id]);
        notified += 1;
      }
    }
  }
  return { quiet, added, notified };
}

export async function milestonesFor(db: Tx, playerId: number) {
  return (await q<any>(db, "SELECT kind, game_id, earned_on FROM milestones WHERE player_id=$1 ORDER BY earned_on NULLS LAST, id", [playerId]))
    .filter((m) => MILESTONES[m.kind])
    .map((m) => ({ kind: m.kind, label: MILESTONES[m.kind].label, blurb: MILESTONES[m.kind].blurb, gameId: m.game_id, earnedOn: m.earned_on }));
}

/** Milestones earned in one game, for the game page. */
export async function milestonesInGame(db: Tx, gameId: number) {
  return (await q<any>(db,
    "SELECT m.kind, m.player_id, p.display_name AS name FROM milestones m JOIN players p ON p.id=m.player_id WHERE m.game_id=$1 ORDER BY m.id", [gameId]))
    .filter((m) => MILESTONES[m.kind])
    .map((m) => ({ ...m, label: MILESTONES[m.kind].label }));
}
