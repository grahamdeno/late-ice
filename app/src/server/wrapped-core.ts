// Season Wrapped rules that need no database. Kept free of server-only imports so unit tests load it directly.
// docs/FALL-WRAP.md, Epic A, is the source of truth; every rule here names its story.

export const HOME_DAYS = 14; // A1: Wrapped stays on Home for 14 days, then lives on the Career page.
export const SHORT_SEASON_GAMES = 3; // A2: fewer than 3 games gets the short version.
export const SHORT_SEASON_LINE = "A short season on paper. The full story starts in Winter.";

export type CardKind = "cover" | "showed_up" | "scoring" | "best_night" | "rating" | "room" | "milestones" | "team" | "rollcall";

export interface RecapCard {
  kind: CardKind;
  title: string;
  /** The one big thing on the card. */
  headline: string;
  lines: string[];
  /** Extra structured data the screen can use (for example the bobblehead). Never drawn on the share image. */
  data?: Record<string, unknown>;
}

/* ---------- A1: when Wrapped opens ---------- */

export interface OpenInput {
  /** Games with a confirmed result for this team in this season (scanned or imported). */
  teamGames: number;
  /** Scheduled regular-season games in this season's dates, not canceled. */
  scheduledCount: number;
  /** Date (YYYY-MM-DD) of the last of them. */
  lastScheduledDate: string | null;
  /** True when a confirmed result exists on or after that date. */
  resultOnOrAfterLast: boolean;
  seasonEndsOn: string;
  /** Today, YYYY-MM-DD. */
  today: string;
}

/**
 * With a schedule: open when the last scheduled regular-season game has a confirmed result.
 * Without one: open when the season's end date has passed. Either way a team with no games has nothing to wrap.
 */
export function autoOpen(i: OpenInput): { open: boolean; reason: "last_game" | "season_end" | null } {
  if (i.teamGames < 1) return { open: false, reason: null };
  if (i.scheduledCount > 0 && i.lastScheduledDate) return i.resultOnOrAfterLast ? { open: true, reason: "last_game" } : { open: false, reason: null };
  if (i.seasonEndsOn < i.today) return { open: true, reason: "season_end" };
  return { open: false, reason: null };
}

/** A1: how long the card stays on Home. */
export function onHome(openedAt: Date | string, now: Date = new Date()) {
  const age = now.getTime() - new Date(openedAt).getTime();
  return age >= 0 && age <= HOME_DAYS * 86_400_000;
}

/* ---------- A2: which cards appear, only with real data ---------- */

export interface PlanInput {
  /** The player's own games across the whole season. */
  games: number;
  /** Games on this team with a stat line. */
  statGames: number;
  /** Rated games across the season. */
  ratedGames: number;
  hasBestNight: boolean;
  hasRoom: boolean;
  milestones: number;
}

export const isShortSeason = (games: number) => games < SHORT_SEASON_GAMES;

/** Card order for one player's recap. Card 9 (roll call) is added by Handoff B, not here. */
export function cardPlan(i: PlanInput): CardKind[] {
  const out: CardKind[] = ["cover"];
  if (i.games >= 1) out.push("showed_up");
  if (isShortSeason(i.games)) return [...out, "team"];
  if (i.statGames >= 1) out.push("scoring");
  if (i.hasBestNight) out.push("best_night");
  if (i.ratedGames >= SHORT_SEASON_GAMES) out.push("rating");
  if (i.hasRoom) out.push("room");
  if (i.milestones >= 1) out.push("milestones");
  out.push("team");
  return out;
}

/* ---------- card 2: showed up ---------- */

/** "9:15 PM", "9:15pm", "21:15" or "9 PM" to minutes after midnight. Anything else is unknown (null). */
export function startMinutes(t: string | null | undefined): number | null {
  const m = /^\s*(\d{1,2})(?::(\d{2}))?\s*([AaPp])?\.?[Mm]?\.?\s*$/.exec(String(t ?? ""));
  if (!m) return null;
  let h = Number(m[1]);
  const min = m[2] ? Number(m[2]) : 0;
  if (min > 59) return null;
  if (m[3]) {
    if (h < 1 || h > 12) return null;
    const pm = m[3].toLowerCase() === "p";
    h = (h % 12) + (pm ? 12 : 0);
  } else if (h > 23) return null;
  return h * 60 + min;
}

/** A game that starts after midnight and before 5 am still belongs to the night before: it is the later puck drop. */
export const lateKey = (m: number) => (m < 300 ? m + 1440 : m);
/** "After 10 pm" means strictly later than 10:00 pm. */
export const startsAfterTen = (m: number) => lateKey(m) > 22 * 60;

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
/** "11:15 pm on Oct 9". */
export function puckDrop(minutes: number, date: string | null | undefined) {
  const h24 = Math.floor(minutes / 60) % 24, mm = String(minutes % 60).padStart(2, "0");
  const h = h24 % 12 === 0 ? 12 : h24 % 12;
  const when = `${h}:${mm} ${h24 >= 12 ? "pm" : "am"}`;
  const d = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(date ?? ""));
  return d ? `${when} on ${MONTHS[Number(d[2]) - 1]} ${Number(d[3])}` : when;
}

export interface NightRow { on: string | null; start: string | null }
/** The latest puck drop the player played, and how many games started after 10 pm. Unknown start times are skipped, never guessed. */
export function lateNights(rows: NightRow[]) {
  let latest: { minutes: number; on: string | null } | null = null;
  let afterTen = 0;
  for (const r of rows) {
    const m = startMinutes(r.start);
    if (m == null) continue;
    if (startsAfterTen(m)) afterTen++;
    if (!latest || lateKey(m) > lateKey(latest.minutes)) latest = { minutes: m, on: r.on };
  }
  return { latest, afterTen, text: latest ? puckDrop(latest.minutes, latest.on) : null };
}

/* ---------- card 3: scoring ---------- */

/** Rank by points; players with equal points share a rank (1, 1, 3). */
export function rankByPoints(rows: { id: number; pts: number }[], id: number) {
  const mine = rows.find((r) => r.id === id);
  if (!mine) return null;
  return { rank: 1 + rows.filter((r) => r.pts > mine.pts).length, of: rows.length };
}

export const ordinal = (n: number) => {
  const s = ["th", "st", "nd", "rd"], v = n % 100;
  return `${n}${s[(v - 20) % 10] || s[v] || s[0]}`;
};

/* ---------- card 4: best night ---------- */

export interface BestRow { gameId: number; on: string | null; goals: number; assists: number; delta: number | null }
/**
 * Biggest game by points (goals break a tie, then the bigger rating move, then the later game). A player with
 * no points in any game gets the biggest rating jump instead. No jump either: no card.
 */
export function bestNight(rows: BestRow[]): (BestRow & { by: "points" | "rating" }) | null {
  const later = (a: BestRow, b: BestRow) => String(b.on ?? "").localeCompare(String(a.on ?? "")) || b.gameId - a.gameId;
  const byPoints = [...rows].sort((a, b) => (b.goals + b.assists) - (a.goals + a.assists) || b.goals - a.goals || (b.delta ?? -99) - (a.delta ?? -99) || later(a, b));
  if (byPoints[0] && byPoints[0].goals + byPoints[0].assists > 0) return { ...byPoints[0], by: "points" };
  const byJump = rows.filter((r) => r.delta != null && r.delta > 0).sort((a, b) => b.delta! - a.delta! || later(a, b));
  return byJump[0] ? { ...byJump[0], by: "rating" } : null;
}

/* ---------- card 5: your rating ---------- */

/** Start, finish and peak need 3+ rated games. The app has no rating tiers, so there is no tier line to build. */
export function ratingArc(history: { before: number; after: number }[]) {
  if (history.length < SHORT_SEASON_GAMES) return null;
  return {
    start: history[0].before,
    finish: history[history.length - 1].after,
    peak: Math.max(...history.map((h) => h.after)),
    games: history.length,
  };
}

/* ---------- A4: team awards ---------- */

export const AWARD_KEYS = ["record", "finish", "points_leader", "goals_leader", "three_stars", "iron_man", "cooler_mvp", "goalies"] as const;
export type AwardKey = (typeof AWARD_KEYS)[number];

/** Only known award keys, each once. Anything else is dropped. */
export function cleanHidden(input: unknown): AwardKey[] {
  if (!Array.isArray(input)) return [];
  const known = new Set<string>(AWARD_KEYS);
  return [...new Set(input.map(String))].filter((k): k is AwardKey => known.has(k));
}

/** What a teammate or a signed-out viewer sees: the captain's hidden awards are gone. */
export function visibleAwards<T extends { key: string }>(awards: T[], hidden: string[]): T[] {
  const h = new Set(hidden);
  return awards.filter((a) => !h.has(a.key));
}

/** Everyone tied for the top value, up to three, or nobody when the top is zero. */
export function leaders<T extends { value: number }>(rows: T[], max = 3): T[] {
  const top = rows.reduce((m, r) => Math.max(m, r.value), 0);
  return top > 0 ? rows.filter((r) => r.value === top).slice(0, max) : [];
}

/* ---------- A3: the picture's alt text ---------- */

/** One sentence per card for screen readers: title, the big thing, then the lines. Same text the image draws. */
export function cardAlt(c: Pick<RecapCard, "title" | "headline" | "lines">) {
  const clean = (s: string) => s.replace(/\s+/g, " ").trim().replace(/[.!?]+$/, "");
  return [c.title, c.headline, ...c.lines].map(clean).filter(Boolean).join(". ") + ".";
}

/* ---------- small formatting helpers ---------- */

const MONTHS_SHORT = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
/** "Oct 9" from "2026-10-09". Unknown stays empty, never guessed. */
export function shortDate(date: string | null | undefined) {
  const d = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(date ?? ""));
  return d ? `${MONTHS_SHORT[Number(d[2]) - 1]} ${Number(d[3])}` : "";
}

export const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

/** "cherry_picker" to "Cherry picker". */
export const archetypeLabel = (a: string) => {
  const s = a.replace(/_/g, " ");
  return s.charAt(0).toUpperCase() + s.slice(1);
};
