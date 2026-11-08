import { createHmac, timingSafeEqual } from "node:crypto";
import { one, type Tx } from "@/server/db";
import { HttpError } from "@/server/services";

/**
 * Real rinks, teams and players are for people with an account. Signed out, every read is limited to the
 * sample rink: a made-up rink that shows what Late Ice does without putting real people or real rinks in
 * front of strangers or search engines. The server enforces this; the app only follows it.
 */
export const SIGN_IN_TO_SEE = "Sign in to see this.";

let cached: { id: number | null; at: number } | null = null;

/** The sample rink's id, cached for a minute. Null if none exists yet. */
export async function sampleRinkId(db: Tx): Promise<number | null> {
  if (cached && Date.now() - cached.at < 60_000) return cached.id;
  // A new sample rink or a changed flag shows within a minute.
  const r = await one<{ id: number }>(db, "SELECT id FROM rinks WHERE is_sample ORDER BY id LIMIT 1");
  cached = { id: r?.id ?? null, at: Date.now() };
  return cached.id;
}

/** Test hook. */
export function resetSampleCache() { cached = null; }

/** Signed in: the rink asked for. Signed out: always the sample rink. */
export async function rinkFor(db: Tx, viewer: unknown, requested: number | null): Promise<number | null> {
  if (viewer) return requested;
  return sampleRinkId(db);
}

/** Signed out, anything outside the sample rink is refused. */
export async function assertRinkVisible(db: Tx, viewer: unknown, rinkId: number | null | undefined) {
  if (viewer) return;
  const sample = await sampleRinkId(db);
  if (rinkId == null || sample == null || Number(rinkId) !== sample) throw new HttpError(401, SIGN_IN_TO_SEE);
}

export async function rinkOfLeague(db: Tx, leagueId: number) {
  return (await one<{ rink_id: number }>(db, "SELECT rink_id FROM leagues WHERE id=$1", [leagueId]))?.rink_id ?? null;
}
export async function rinkOfTeam(db: Tx, teamId: number) {
  return (await one<{ rink_id: number }>(db, "SELECT l.rink_id FROM teams t JOIN leagues l ON l.id=t.league_id WHERE t.id=$1", [teamId]))?.rink_id ?? null;
}
export async function rinkOfGame(db: Tx, gameId: number) {
  return (await one<{ rink_id: number }>(db, "SELECT l.rink_id FROM games g JOIN leagues l ON l.id=g.league_id WHERE g.id=$1", [gameId]))?.rink_id ?? null;
}
export async function rinkOfEvent(db: Tx, eventId: number) {
  return (await one<{ host_rink_id: number | null }>(db, "SELECT host_rink_id FROM events WHERE id=$1", [eventId]))?.host_rink_id ?? null;
}

/** A player is visible signed out only if they play at the sample rink. */
export async function assertPlayerVisible(db: Tx, viewer: unknown, playerId: number) {
  if (viewer) return;
  const sample = await sampleRinkId(db);
  const hit = sample == null ? null : await one(db,
    `SELECT 1 FROM roster_entries re JOIN teams t ON t.id=re.team_id JOIN leagues l ON l.id=t.league_id
     WHERE re.player_id=$1 AND l.rink_id=$2 LIMIT 1`, [playerId, sample]);
  if (!hit) throw new HttpError(401, SIGN_IN_TO_SEE);
}

export const assertTeamVisible = async (db: Tx, viewer: unknown, teamId: number) => assertRinkVisible(db, viewer, await rinkOfTeam(db, teamId));
export const assertLeagueVisible = async (db: Tx, viewer: unknown, leagueId: number) => assertRinkVisible(db, viewer, await rinkOfLeague(db, leagueId));
export const assertGameVisible = async (db: Tx, viewer: unknown, gameId: number) => assertRinkVisible(db, viewer, await rinkOfGame(db, gameId));


const KEY_HOURS = 12;
const secret = () => process.env.IMAGE_KEY_SECRET || process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.CRON_SECRET || "dev-only";

/** A key that lets image tags load scoresheet photos for a signed-in person. It grants nothing else and expires. */
export function imageKey(userId: number, now = Date.now()) {
  // Rounded to a 6-hour window so /api/me stays byte-identical between refreshes (the offline cache compares bodies).
  const win = 6 * 3600;
  const exp = (Math.floor(now / 1000 / win) + 1) * win + KEY_HOURS * 3600;
  const body = `${userId}.${exp}`;
  return `${body}.${createHmac("sha256", secret()).update(body).digest("base64url")}`;
}

export function imageKeyValid(key: string | null | undefined, now = Date.now()) {
  const [uid, exp, sig] = String(key ?? "").split(".");
  if (!uid || !exp || !sig || Number(exp) * 1000 < now) return false;
  const want = createHmac("sha256", secret()).update(`${uid}.${exp}`).digest("base64url");
  const a = Buffer.from(sig), b = Buffer.from(want);
  return a.length === b.length && timingSafeEqual(a, b);
}

/** A shared result link: opens that one game, signed out, with names as initials. It never expires and opens nothing else. */
export function shareKey(gameId: number) {
  return createHmac("sha256", secret()).update(`game-share.${gameId}`).digest("base64url").slice(0, 22);
}
export function shareKeyValid(gameId: number, key: string | null | undefined) {
  if (!key) return false;
  const want = Buffer.from(shareKey(gameId)), got = Buffer.from(String(key));
  return want.length === got.length && timingSafeEqual(want, got);
}
