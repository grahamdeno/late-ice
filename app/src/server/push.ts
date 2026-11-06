import "server-only";
import { appendFileSync } from "node:fs";
import webpush from "web-push";
import { one, q, type Tx } from "./db";

// The only pushes this app sends. Anything else stays an in-app notice.
export const PUSH_KINDS = ["game_day", "result", "sub_request", "roster", "confirm"] as const;
export type PushKind = (typeof PUSH_KINDS)[number];

const PUSH_BY_NOTICE: Record<string, PushKind> = {
  game_day: "game_day",
  result: "result",
  sub: "sub_request",
  draft: "roster",
  match: "roster",
  remove: "roster",
  sheet: "confirm",
  goalie: "confirm",
};

const FALLBACK_TZ = "America/New_York";

// Bracket access so Next does not bake the value in at build time. Keys are runtime settings.
function readEnv(name: string) {
  return process.env[name]?.trim() || "";
}

type Notice = { kind: string; title: string; body?: string; link?: string; push?: boolean };

function vapid() {
  const pub = readEnv("VAPID_PUBLIC_KEY");
  const priv = readEnv("VAPID_PRIVATE_KEY");
  const subject = readEnv("VAPID_SUBJECT");
  if (!pub || !priv || !subject) return null;
  return { pub, priv, subject };
}

export function vapidPublicKey() {
  return readEnv("VAPID_PUBLIC_KEY") || null;
}

function stubbing() {
  return readEnv("LATEICE_STUB_PUSH") === "1";
}

/** Test clock. Ignored unless sending is stubbed, so production cannot turn quiet hours off with an env var. */
export function pushNow() {
  if (stubbing() && readEnv("LATEICE_PUSH_NOW")) {
    const d = new Date(readEnv("LATEICE_PUSH_NOW"));
    if (!Number.isNaN(d.getTime())) return d;
  }
  return new Date();
}

export function validZone(tz: string) {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

/** Hour and calendar date in a zone. Hour 24 from some engines is midnight. */
export function zonedWhen(date: Date, timeZone: string) {
  const fmt = new Intl.DateTimeFormat("en-US", {
    timeZone, hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit",
  });
  const bag: Record<string, string> = {};
  for (const p of fmt.formatToParts(date)) bag[p.type] = p.value;
  let hour = Number(bag.hour);
  if (hour === 24) hour = 0;
  return { hour, date: `${bag.year}-${bag.month}-${bag.day}` };
}

/** Quiet from 10:00 pm through 7:59 am. 8:00 am is outside quiet hours. */
export function isQuietHour(hour: number) {
  return hour >= 22 || hour < 8;
}

/**
 * Home rink zone when G1's rinks.timezone column is present and holds a real zone name.
 * The column is not selected unless information_schema says it exists, so this branch
 * keeps working before that migration is merged.
 */
export async function timeZoneFor(db: Tx, userId: number) {
  const has = await one<{ present: boolean }>(db,
    "SELECT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='rinks' AND column_name='timezone') AS present");
  if (!has?.present) return FALLBACK_TZ;
  const row = await one<{ timezone: string | null }>(db,
    "SELECT r.timezone FROM users u LEFT JOIN rinks r ON r.id=u.home_rink_id WHERE u.id=$1", [userId]);
  const tz = row?.timezone?.trim();
  if (!tz || !validZone(tz)) return FALLBACK_TZ;
  return tz;
}

async function prefOn(db: Tx, userId: number, kind: PushKind) {
  const row = await one<Record<PushKind, boolean | null>>(db,
    "SELECT game_day, result, sub_request, roster, confirm FROM notification_prefs WHERE user_id=$1", [userId]);
  if (!row) return true;
  return row[kind] !== false;
}

function record(row: Record<string, unknown>) {
  if (!stubbing()) return;
  const file = readEnv("LATEICE_PUSH_LOG");
  if (!file) return;
  // Title and kind only. Never the endpoint, the device keys, or the VAPID private key.
  appendFileSync(file, JSON.stringify({ ...row, at: pushNow().toISOString() }) + "\n");
}

let vapidReady = false;
function ensureVapid(cfg: { pub: string; priv: string; subject: string }) {
  if (vapidReady) return true;
  try {
    webpush.setVapidDetails(cfg.subject, cfg.pub, cfg.priv);
    vapidReady = true;
    return true;
  } catch {
    return false;
  }
}

/** Map an in-app notice onto one of the five pushes, or do nothing. */
export async function deliverNotice(db: Tx, userId: number, n: Notice) {
  if (n.push === false) return;
  const kind = PUSH_BY_NOTICE[n.kind];
  if (!kind) return;
  const cfg = vapid();
  if (!cfg) {
    record({ userId, kind, skipped: "no-vapid" });
    return;
  }
  if (!(await prefOn(db, userId, kind))) {
    record({ userId, kind, skipped: "pref" });
    return;
  }
  if (kind !== "result") {
    const tz = await timeZoneFor(db, userId);
    if (isQuietHour(zonedWhen(pushNow(), tz).hour)) {
      record({ userId, kind, skipped: "quiet" });
      return;
    }
  }
  const subs = await q<{ id: number; endpoint: string; p256dh: string; auth: string }>(db,
    "SELECT id, endpoint, p256dh, auth FROM push_subscriptions WHERE user_id=$1", [userId]);
  if (stubbing()) {
    record({ userId, kind, sent: true, title: n.title, devices: subs.length });
    return;
  }
  if (!ensureVapid(cfg) || !subs.length) return;
  const payload = JSON.stringify({ title: n.title, body: n.body ?? "", url: n.link && n.link.startsWith("/") ? n.link : "/" });
  for (const sub of subs) {
    try {
      await webpush.sendNotification({ endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } }, payload);
    } catch (e: any) {
      const status = e?.statusCode;
      // 404/410: the device unsubscribed. 401/403: it was made with an older key (after a key
      // rotation) and can never be reached again. Either way, drop it; the person turns it back on.
      if (status === 404 || status === 410 || status === 401 || status === 403) await q(db, "DELETE FROM push_subscriptions WHERE id=$1 AND user_id=$2", [sub.id, userId]);
    }
  }
}

type GameRow = { user_id: number; local_date: string; local_time: string | null; team_name: string; opponent: string };

/** One morning note per user who has a game on today's date in their home-rink zone. */
export async function sendGameDayNotices(db: Tx) {
  const { notify } = await import("./accounts");
  const now = pushNow();
  const from = new Date(now.getTime() - 2 * 86400000).toISOString().slice(0, 10);
  const to = new Date(now.getTime() + 2 * 86400000).toISOString().slice(0, 10);
  const rows = await q<GameRow>(db, `
    SELECT u.id AS user_id, sg.local_date, sg.local_time, t.name AS team_name,
           COALESCE(opp.name, sg.opponent_name, 'opponent') AS opponent
    FROM scheduled_games sg
    JOIN teams t ON t.id=sg.team_id
    LEFT JOIN teams opp ON opp.id=sg.opponent_team_id
    JOIN roster_entries re ON re.team_id=sg.team_id
    JOIN players p ON p.id=re.player_id
    JOIN users u ON u.id=p.user_id
    WHERE sg.status='scheduled' AND u.merged_into IS NULL AND sg.local_date >= $1 AND sg.local_date <= $2
    UNION
    SELECT u.id, sg.local_date, sg.local_time, t.name, COALESCE(opp.name, sg.opponent_name, 'opponent')
    FROM sub_requests sr
    JOIN scheduled_games sg ON sg.id=sr.scheduled_game_id
    JOIN users u ON u.id=sr.user_id
    JOIN teams t ON t.id=sg.team_id
    LEFT JOIN teams opp ON opp.id=sg.opponent_team_id
    WHERE sr.status='accepted' AND sg.status='scheduled' AND u.merged_into IS NULL
      AND sg.local_date >= $1 AND sg.local_date <= $2
  `, [from, to]);

  const byUser = new Map<number, { team: string; opponent: string; time: string | null; date: string }[]>();
  for (const r of rows) {
    const tz = await timeZoneFor(db, r.user_id);
    const today = zonedWhen(now, tz).date;
    if (r.local_date !== today) continue;
    const list = byUser.get(r.user_id) ?? [];
    const key = `${r.local_date}|${r.local_time}|${r.team_name}|${r.opponent}`;
    if (!list.some((g) => `${g.date}|${g.time}|${g.team}|${g.opponent}` === key)) {
      list.push({ team: r.team_name, opponent: r.opponent, time: r.local_time, date: r.local_date });
    }
    byUser.set(r.user_id, list);
  }

  let sent = 0;
  for (const [userId, games] of byUser) {
    const tz = await timeZoneFor(db, userId);
    const today = zonedWhen(now, tz).date;
    const link = `/me?gameDay=${today}`;
    const already = await one(db, "SELECT 1 FROM notifications WHERE user_id=$1 AND kind='game_day' AND link=$2", [userId, link]);
    if (already) continue;
    const oneGame = games.length === 1;
    const title = oneGame ? `Game day: ${games[0].team} vs ${games[0].opponent}` : `You have ${games.length} games today`;
    const body = oneGame ? (games[0].time || "See the time on your profile.") : games.slice(0, 3).map((g) => `${g.team} vs ${g.opponent}`).join(", ");
    await notify(db, userId, { kind: "game_day", title, body, link });
    sent++;
  }
  return sent;
}
