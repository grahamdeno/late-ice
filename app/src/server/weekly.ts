import "server-only";
// The Monday email to rink managers: what Late Ice did at their rink last week, and what's waiting.
import { one, q, type Tx } from "./db";
import { joinProgress, sheetQueue } from "./desk";
import { gapsForRink } from "./lineups";
import { sendEmail } from "./staff";

export type Week = {
  rink: string; games: number; scans: number; newPlayers: number;
  joined: number; roster: number; noCaptain: number; noLink: number;
  scansWaiting: number; lineupsMissing: number;
};

const since = () => new Date(Date.now() - 7 * 864e5);

/** The numbers for one rink, as this staff member is allowed to see them. */
export async function rinkWeek(db: Tx, user: any, rinkId: number): Promise<Week> {
  const rink = await one<{ name: string }>(db, "SELECT name FROM rinks WHERE id=$1", [rinkId]);
  const from = since();
  const day = from.toISOString().slice(0, 10);
  const real = `l.rink_id=$1 AND l.level NOT IN ('DEMO','TOURN')`;
  const games = (await one<{ n: number }>(db,
    `SELECT COUNT(*)::int n FROM games g JOIN leagues l ON l.id=g.league_id
     WHERE ${real} AND g.played_on >= $2 AND g.played_on <= $3`, [rinkId, day, new Date().toISOString().slice(0, 10)]))!.n;
  const scans = (await one<{ n: number }>(db,
    `SELECT COUNT(*)::int n FROM sheets s JOIN games g ON g.id=s.game_id JOIN leagues l ON l.id=g.league_id
     WHERE ${real} AND COALESCE(s.confirmed_at, s.created_at) >= $2`, [rinkId, from]))!.n;
  const newPlayers = (await one<{ n: number }>(db,
    `SELECT COUNT(DISTINCT u.id)::int n FROM users u JOIN players p ON p.user_id=u.id
     JOIN roster_entries re ON re.player_id=p.id JOIN teams t ON t.id=re.team_id JOIN leagues l ON l.id=t.league_id
     WHERE ${real} AND u.created_at >= $2`, [rinkId, from]))!.n;
  const join = await joinProgress(db, user, rinkId).catch(() => null);
  const queue = await sheetQueue(db, user, rinkId).catch(() => null);
  const gaps = await gapsForRink(db, user, rinkId).catch(() => [] as any[]);
  return {
    rink: rink?.name ?? "Your rink", games, scans, newPlayers,
    joined: join?.totals.joined ?? 0, roster: join?.totals.roster ?? 0,
    noCaptain: join?.totals.noCaptain ?? 0, noLink: join?.totals.noLink ?? 0,
    scansWaiting: queue?.open.filter((r: any) => r.status !== "processing").length ?? 0,
    lineupsMissing: gaps.reduce((n: number, g: any) => n + (g.games - g.with_lineup), 0),
  };
}

export function deskUrl() {
  const app = process.env.CANONICAL_APP_HOST?.trim();
  if (app) return `https://${app.replace(/^app\./, "desk.")}/desk`;
  return `${(process.env.NEXT_PUBLIC_SITE_URL || "https://lateice.com").replace(/\/$/, "")}/desk`;
}

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

/** Plain text, short enough to read on a phone. */
export function weeklyEmail(w: Week, url = deskUrl()) {
  const pct = w.roster ? Math.round((w.joined / w.roster) * 100) : 0;
  const waiting = [
    w.scansWaiting ? `${plural(w.scansWaiting, "scoresheet")} to check` : null,
    w.lineupsMissing ? `${plural(w.lineupsMissing, "imported game")} with no lineup` : null,
    w.noCaptain ? `${plural(w.noCaptain, "team")} with no captain` : null,
    w.noLink ? `${plural(w.noLink, "captain")} who haven't sent the invite link` : null,
  ].filter(Boolean) as string[];
  const subject = `${w.rink}: your week on Late Ice`;
  const text = [
    `Last 7 days at ${w.rink}`,
    "",
    `${plural(w.games, "game")} played`,
    `${plural(w.scans, "scoresheet")} put in the books`,
    `${plural(w.newPlayers, "new player")} signed up`,
    `${pct}% of rostered players are on Late Ice (${w.joined} of ${w.roster})`,
    "",
    waiting.length ? "Waiting on you" : "Nothing waiting on you.",
    ...waiting.map((x) => `- ${x}`),
    "",
    `Rink Desk: ${url}`,
    "",
    "You get this because you manage this rink on Late Ice. Turn it off on Rink Desk Home.",
  ].join("\n");
  return { subject, text };
}

/** Monday run: every rink manager with an email who hasn't turned it off, once per rink. */
export async function sendWeekly(db: Tx) {
  const people = await q<any>(db,
    `SELECT u.id, u.email, u.name, g.scope_id AS rink_id
     FROM role_grants g JOIN users u ON u.id=g.user_id
     LEFT JOIN notification_prefs np ON np.user_id=u.id
     JOIN rinks r ON r.id=g.scope_id
     WHERE g.role='rink_manager' AND g.scope_type='rink' AND g.revoked_at IS NULL
       AND u.email IS NOT NULL AND COALESCE(u.status,'active')='active' AND COALESCE(np.weekly_email, true)
       AND r.archived_at IS NULL`);
  let sent = 0;
  for (const p of people) {
    const w = await rinkWeek(db, p, p.rink_id);
    const { subject, text } = weeklyEmail(w);
    if (await sendEmail(p.email, subject, text)) sent++;
  }
  return { people: people.length, sent };
}

export async function weeklyOn(db: Tx, userId: number) {
  const row = await one<{ weekly_email: boolean }>(db, "SELECT weekly_email FROM notification_prefs WHERE user_id=$1", [userId]);
  return row ? row.weekly_email !== false : true;
}

export async function setWeekly(db: Tx, userId: number, on: boolean) {
  await q(db,
    `INSERT INTO notification_prefs (user_id, weekly_email) VALUES ($1,$2)
     ON CONFLICT (user_id) DO UPDATE SET weekly_email=EXCLUDED.weekly_email`, [userId, on]);
}
