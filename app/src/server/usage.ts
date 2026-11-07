import "server-only";
// Usage across every rink, for admins: weekly active players, sign-ups, scans, confirms and RSVPs,
// plus a snapshot per rink. Built from app_events, users and sheets; nothing new is collected.
import { q, type Tx } from "./db";
import * as P from "./permissions";

export async function usage(db: Tx, user: any, weeks = 8) {
  await P.require_(db, user, "system.grant");
  const rows = await q<any>(db,
    `WITH w AS (
       SELECT generate_series(date_trunc('week', now()) - ($1::int - 1) * interval '1 week', date_trunc('week', now()), interval '1 week') AS start
     )
     SELECT to_char(w.start, 'YYYY-MM-DD') AS week,
       (SELECT COUNT(DISTINCT e.user_id) FROM app_events e WHERE e.kind='app_open' AND e.created_at >= w.start AND e.created_at < w.start + interval '1 week')::int AS active,
       (SELECT COUNT(*) FROM users u WHERE u.created_at >= w.start AND u.created_at < w.start + interval '1 week')::int AS signups,
       (SELECT COUNT(*) FROM sheets s WHERE COALESCE(s.source,'upload') <> 'sample' AND s.created_at >= w.start AND s.created_at < w.start + interval '1 week')::int AS scans,
       (SELECT COUNT(*) FROM app_events e WHERE e.kind='confirm' AND e.created_at >= w.start AND e.created_at < w.start + interval '1 week')::int AS confirms,
       (SELECT COUNT(*) FROM app_events e WHERE e.kind='rsvp' AND e.created_at >= w.start AND e.created_at < w.start + interval '1 week')::int AS rsvps
     FROM w ORDER BY w.start`, [weeks]);
  const rinks = await q<any>(db,
    `SELECT r.id, r.name,
       COUNT(DISTINCT t.id)::int AS teams,
       COUNT(re.id)::int AS roster,
       COUNT(p.user_id)::int AS joined,
       (SELECT COUNT(*) FROM games g JOIN leagues l2 ON l2.id=g.league_id WHERE l2.rink_id=r.id AND g.played_on >= to_char(now() - interval '28 days', 'YYYY-MM-DD'))::int AS games28,
       (SELECT COUNT(DISTINCT e.user_id) FROM app_events e JOIN players p2 ON p2.user_id=e.user_id JOIN roster_entries re2 ON re2.player_id=p2.id
          JOIN teams t2 ON t2.id=re2.team_id JOIN leagues l3 ON l3.id=t2.league_id
          WHERE l3.rink_id=r.id AND e.kind='app_open' AND e.created_at > now() - interval '7 days')::int AS active7
     FROM rinks r
     LEFT JOIN leagues l ON l.rink_id=r.id AND l.archived_at IS NULL AND l.level NOT IN ('DEMO','TOURN')
     LEFT JOIN teams t ON t.league_id=l.id AND t.archived_at IS NULL AND COALESCE(t.is_sample,0)=0
     LEFT JOIN roster_entries re ON re.team_id=t.id AND NOT re.is_sub
     LEFT JOIN players p ON p.id=re.player_id
     WHERE r.archived_at IS NULL
     GROUP BY r.id, r.name ORDER BY r.name`);
  const totals = (await q<any>(db,
    `SELECT (SELECT COUNT(*) FROM users)::int AS users,
       (SELECT COUNT(DISTINCT user_id) FROM app_events WHERE kind='app_open' AND created_at > now() - interval '7 days')::int AS active7,
       (SELECT COUNT(DISTINCT user_id) FROM app_events WHERE kind='app_open' AND created_at > now() - interval '28 days')::int AS active28,
       (SELECT COUNT(*) FROM sheets WHERE COALESCE(source,'upload') <> 'sample' AND created_at > now() - interval '28 days')::int AS scans28`))[0];
  return { weeks: rows, rinks, totals };
}
