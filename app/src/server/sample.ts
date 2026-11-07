import { one, q, type Tx } from "@/server/db";

const FRESH_DAYS = 3;

/**
 * Keep the sample rink looking alive: move every sample game (and milestone dates) forward by the same
 * number of days so the newest one is FRESH_DAYS old. Order between games never changes, so ratings and
 * standings come out the same. Real rinks are never touched. Returns how many days it moved.
 */
export async function rollSampleDates(db: Tx, today = new Date()) {
  const r = await one<{ newest: string | null }>(db,
    `SELECT MAX(g.played_on) newest FROM games g JOIN leagues l ON l.id=g.league_id JOIN rinks r ON r.id=l.rink_id WHERE r.is_sample`);
  if (!r?.newest) return 0;
  const days = rollDays(r.newest, today);
  if (!days) return 0;
  await q(db,
    `UPDATE games g SET played_on = to_char(g.played_on::date + $1::int, 'YYYY-MM-DD')
     FROM leagues l JOIN rinks r ON r.id=l.rink_id WHERE l.id=g.league_id AND r.is_sample AND g.played_on IS NOT NULL`, [days]);
  await q(db,
    `UPDATE milestones m SET earned_on = to_char(m.earned_on::date + $1::int, 'YYYY-MM-DD')
     WHERE m.earned_on IS NOT NULL AND EXISTS (SELECT 1 FROM roster_entries re JOIN teams t ON t.id=re.team_id JOIN leagues l ON l.id=t.league_id JOIN rinks r ON r.id=l.rink_id
       WHERE re.player_id=m.player_id AND r.is_sample)`, [days]);
  return days;
}

/** Pure: how many days to move, for tests. */
export function rollDays(newest: string, today: Date) {
  const target = new Date(today.getTime() - FRESH_DAYS * 86400000).toISOString().slice(0, 10);
  return Math.max(0, Math.round((Date.parse(target) - Date.parse(newest)) / 86400000));
}
