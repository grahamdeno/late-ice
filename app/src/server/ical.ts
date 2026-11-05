// Minimal iCalendar (RFC 5545) reader for team schedule feeds. Pure: no database, no network.

export interface FeedEvent {
  uid: string;
  summary: string;
  location: string | null;
  start: Date;          // the instant
  localDate: string;    // YYYY-MM-DD in the rink's zone
  localTime: string | null; // "9:15 PM", null for all-day
  canceled: boolean;
}

const unescape = (s: string) => s.replace(/\\n/gi, " ").replace(/\\([,;\\])/g, "$1").trim();

/** Offset (ms) of a zone at a given instant: local wall clock minus UTC. */
function zoneOffset(at: Date, tz: string) {
  const f = new Intl.DateTimeFormat("en-US", { timeZone: tz, hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit" });
  const p = Object.fromEntries(f.formatToParts(at).map((x) => [x.type, x.value]));
  const wall = Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour % 24, +p.minute, +p.second);
  return wall - at.getTime();
}

/** A wall-clock time in a zone, as an instant. */
export function fromZone(y: number, mo: number, d: number, h: number, mi: number, tz: string) {
  const guess = Date.UTC(y, mo - 1, d, h, mi);
  let t = guess - zoneOffset(new Date(guess), tz);
  t = guess - zoneOffset(new Date(t), tz); // second pass settles daylight-saving edges
  return new Date(t);
}

export function localParts(at: Date, tz: string) {
  const f = new Intl.DateTimeFormat("en-US", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit" });
  const p = Object.fromEntries(f.formatToParts(at).map((x) => [x.type, x.value]));
  const time = at.toLocaleTimeString("en-US", { timeZone: tz, hour: "numeric", minute: "2-digit" });
  return { date: `${p.year}-${p.month}-${p.day}`, time };
}

function validZone(tz: string | undefined) {
  if (!tz) return null;
  try { new Intl.DateTimeFormat("en-US", { timeZone: tz }); return tz; } catch { return null; }
}

export function parseIcs(text: string, rinkTz = "America/New_York"): FeedEvent[] {
  // Unfold continuation lines, then walk VEVENT blocks.
  const lines = text.replace(/\r\n?/g, "\n").replace(/\n[ \t]/g, "").split("\n");
  const out: FeedEvent[] = [];
  let cur: Record<string, { params: Record<string, string>; value: string }> | null = null;
  for (const raw of lines) {
    const line = raw.trimEnd();
    if (line === "BEGIN:VEVENT") { cur = {}; continue; }
    if (line === "END:VEVENT") {
      if (cur) { const ev = toEvent(cur, rinkTz); if (ev) out.push(ev); }
      cur = null; continue;
    }
    if (!cur) continue;
    const m = line.match(/^([A-Za-z-]+)((?:;[^:]*)?):(.*)$/);
    if (!m) continue;
    const params: Record<string, string> = {};
    for (const p of m[2].split(";").filter(Boolean)) { const [k, v] = p.split("="); if (k && v) params[k.toUpperCase()] = v.replace(/^"|"$/g, ""); }
    const key = m[1].toUpperCase();
    if (!cur[key]) cur[key] = { params, value: m[3] };
  }
  return out.sort((a, b) => a.start.getTime() - b.start.getTime());
}

function toEvent(e: Record<string, { params: Record<string, string>; value: string }>, rinkTz: string): FeedEvent | null {
  const ds = e.DTSTART;
  if (!ds) return null;
  const v = ds.value.trim();
  let start: Date, allDay = false;
  const dt = v.match(/^(\d{4})(\d{2})(\d{2})(?:T(\d{2})(\d{2})(\d{2})?(Z)?)?$/);
  if (!dt) return null;
  const [, y, mo, d, h, mi, , z] = dt;
  if (!h) { allDay = true; start = fromZone(+y, +mo, +d, 12, 0, rinkTz); }
  else if (z) start = new Date(Date.UTC(+y, +mo - 1, +d, +h, +mi));
  else start = fromZone(+y, +mo, +d, +h, +mi, validZone(ds.params.TZID) ?? rinkTz);
  const lp = localParts(start, rinkTz);
  const summary = unescape(e.SUMMARY?.value ?? "");
  const uid = (e.UID?.value ?? "").trim() || `${v}|${summary}`;
  const status = (e.STATUS?.value ?? "").toUpperCase();
  return {
    uid, summary, location: e.LOCATION ? unescape(e.LOCATION.value) || null : null, start,
    localDate: allDay ? `${y}-${mo}-${d}` : lp.date, localTime: allDay ? null : lp.time,
    canceled: status === "CANCELLED" || /\bcancel+ed\b/i.test(summary),
  };
}

/**
 * Read a game title like "Hammered Heads W 6-0 vs Blue Liners", "Hammered Heads @ Wild Puckers"
 * or "Blue Liners vs Hammered Heads". Returns the opponent and, when shown, home/away and the result.
 */
export function parseSummary(summary: string, ownName: string, similarity: (a: string, b: string) => number) {
  const s = summary.replace(/\s+/g, " ").trim();
  const m = s.match(/^(.*?)\s+(?:(W|L|T|OTL|SOL|OTW|SOW)\s+(\d+)\s*-\s*(\d+)\s+)?(vs\.?|v\.?|@|at)\s+(.+)$/i);
  if (!m) return { opponent: null as string | null, isHome: null as boolean | null, result: null as string | null };
  let [, left, wl, a, b, sep, right] = m;
  right = right.replace(/\s*[-–(].*$/, "").trim();
  const away = /^(@|at)$/i.test(sep);
  // Whichever side looks less like us is the opponent.
  const leftIsUs = similarity(left, ownName) >= similarity(right, ownName);
  const opponent = leftIsUs ? right : left.trim();
  const isHome = away ? !leftIsUs : null;
  const result = wl ? `${wl.toUpperCase()} ${a}-${b}` : null;
  return { opponent: opponent || null, isHome, result };
}

/** webcal:// links are plain https underneath. */
export function feedUrl(input: string, allowLocal = false) {
  let u: URL;
  try { u = new URL(input.trim().replace(/^webcals?:\/\//i, "https://")); } catch { return null; }
  if (u.protocol !== "https:" && !(allowLocal && u.protocol === "http:")) return null;
  const host = u.hostname.toLowerCase();
  if (!allowLocal && (host === "localhost" || /^[\d.]+$/.test(host) || host.includes(":") || host.endsWith(".internal") || host.endsWith(".local"))) return null;
  return u.toString();
}
