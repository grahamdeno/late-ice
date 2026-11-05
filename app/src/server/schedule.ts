import "server-only";
import { one, q, sql, type Tx } from "./db";
import { HttpError, similarity } from "./services";
import { feedUrl, fromZone, localParts, parseIcs, parseSummary } from "./ical";

export const RINK_TZ = "America/New_York";
export const KINDS = new Set(["league", "playoff", "tournament", "exhibition"]);
const allowLocal = () => process.env.ALLOW_LOCAL_FEEDS === "1";

/** Fetch a calendar link with a size and time limit. */
export async function fetchFeed(url: string) {
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), 10000);
  try {
    const r = await fetch(url, { signal: ctl.signal, redirect: "follow", headers: { accept: "text/calendar, text/plain, */*", "user-agent": "LateIce/1.0 (+https://late-ice.tangomike.app)" } });
    if (!r.ok) throw new HttpError(400, `The calendar link answered ${r.status}. Copy it again from the app and paste the whole link.`);
    const text = await r.text();
    if (text.length > 3_000_000) throw new HttpError(400, "That calendar is too large to read.");
    if (!text.includes("BEGIN:VCALENDAR")) throw new HttpError(400, "That link isn't a calendar feed. Use the link from \"Subscribe\" or \"Sync calendar\".");
    return text;
  } catch (e: any) {
    if (e instanceof HttpError) throw e;
    throw new HttpError(400, e?.name === "AbortError" ? "The calendar link took too long to answer." : "Couldn't reach that calendar link.");
  } finally { clearTimeout(timer); }
}

export function checkFeedUrl(input: string) {
  const u = feedUrl(String(input || ""), allowLocal());
  if (!u) throw new HttpError(400, "Paste the full calendar link. It starts with webcal:// or https://.");
  return u;
}

/** Bring a team's feed games up to date. Feed games that vanish from the feed and haven't happened are removed. */
export async function syncTeamFeed(db: Tx, teamId: number, text: string) {
  const team = await one<any>(db, "SELECT * FROM teams WHERE id=$1", [teamId]);
  {
    const events = parseIcs(text, RINK_TZ);
    if (!events.length && !text.includes("BEGIN:VCALENDAR")) throw new HttpError(400, "That link isn't a calendar feed.");
    const others = await q<any>(db, "SELECT id, name FROM teams WHERE league_id=$1 AND id<>$2", [team.league_id, teamId]);
    const seen: string[] = [];
    let added = 0, updated = 0;
    for (const ev of events) {
      const s = parseSummary(ev.summary, team.name, similarity);
      const best = s.opponent ? others.map((t) => ({ t, v: similarity(s.opponent!, t.name) })).sort((a, b) => b.v - a.v)[0] : null;
      const opp = best && best.v >= 0.6 ? best.t : null;
      const kind = /playoff|semi|final/i.test(ev.summary) ? "playoff" : /tournament/i.test(ev.summary) ? "tournament" : "league";
      const row = await one<any>(db,
        `INSERT INTO scheduled_games (team_id, opponent_team_id, opponent_name, is_home, starts_at, local_date, local_time, location, kind, source, external_uid, summary, status)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,'feed',$10,$11,$12)
         ON CONFLICT (team_id, external_uid) WHERE external_uid IS NOT NULL DO UPDATE SET
           opponent_team_id=EXCLUDED.opponent_team_id, opponent_name=EXCLUDED.opponent_name, is_home=EXCLUDED.is_home, starts_at=EXCLUDED.starts_at,
           local_date=EXCLUDED.local_date, local_time=EXCLUDED.local_time, location=EXCLUDED.location, summary=EXCLUDED.summary,
           status=EXCLUDED.status, updated_at=now()
         RETURNING (xmax = 0) AS inserted`,
        [teamId, opp?.id ?? null, opp ? null : s.opponent, s.isHome, ev.start.toISOString(), ev.localDate, ev.localTime, ev.location, kind, ev.uid, ev.summary, ev.canceled ? "canceled" : "scheduled"]);
      if (row?.inserted) added++; else updated++;
      seen.push(ev.uid);
    }
    const removed = await q(db,
      `DELETE FROM scheduled_games WHERE team_id=$1 AND source='feed' AND starts_at > now()
         AND external_uid NOT IN (SELECT jsonb_array_elements_text($2::jsonb)) RETURNING id`, [teamId, JSON.stringify(seen)]);
    await q(db, "UPDATE team_feeds SET last_synced_at=now(), last_error=NULL, last_count=$2 WHERE team_id=$1", [teamId, events.length]);
    return { events: events.length, added, updated, removed: removed.length };
  }
}

/** Fetch outside the transaction, then apply. A failure is recorded on the feed so the captain sees why. */
export async function refreshFeed(teamId: number) {
  const feed = await one<any>(sql, "SELECT * FROM team_feeds WHERE team_id=$1", [teamId]);
  if (!feed) throw new HttpError(400, "No calendar connected.");
  try {
    const text = await fetchFeed(feed.url);
    return await sql.begin((tx) => syncTeamFeed(tx, teamId, text));
  } catch (e: any) {
    await q(sql, "UPDATE team_feeds SET last_synced_at=now(), last_error=$2 WHERE team_id=$1", [teamId, e instanceof HttpError ? e.message : "Couldn't read the calendar."]);
    throw e;
  }
}

/** Nightly: every connected feed. One bad link doesn't stop the rest. */
export async function syncAllFeeds() {
  const feeds = await q<{ team_id: number }>(sql, "SELECT team_id FROM team_feeds ORDER BY last_synced_at NULLS FIRST LIMIT 200");
  let ok = 0, failed = 0;
  for (const f of feeds) {
    try { await refreshFeed(f.team_id); ok++; } catch { failed++; }
  }
  return { ok, failed };
}

/** "2026-11-08" + "9:15 PM" at the rink, as an instant. */
export function rinkInstant(date: string, time: string | null) {
  const d = String(date || "").match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!d) throw new HttpError(400, "Pick a date.");
  let h = 12, mi = 0;
  if (time) {
    const t = String(time).trim().match(/^(\d{1,2}):(\d{2})\s*(AM|PM)?$/i);
    if (!t) throw new HttpError(400, "Pick a start time.");
    h = +t[1]; mi = +t[2];
    if (t[3]) { const pm = t[3].toUpperCase() === "PM"; if (h === 12) h = pm ? 12 : 0; else if (pm) h += 12; }
    if (h > 23 || mi > 59) throw new HttpError(400, "Pick a start time.");
  }
  const at = fromZone(+d[1], +d[2], +d[3], h, mi, RINK_TZ);
  return { at, localDate: `${d[1]}-${d[2]}-${d[3]}`, localTime: time ? localParts(at, RINK_TZ).time : null };
}

export async function upcoming(db: Tx, teamId: number, limit = 20) {
  return q<any>(db,
    `SELECT sg.id, sg.local_date, sg.local_time, sg.starts_at, sg.location, sg.kind, sg.source, sg.status, sg.is_home, sg.summary,
       sg.opponent_team_id, COALESCE(t.name, sg.opponent_name) opponent, t.color opponent_color, t.logo opponent_logo
     FROM scheduled_games sg LEFT JOIN teams t ON t.id=sg.opponent_team_id
     WHERE sg.team_id=$1 AND sg.starts_at > now() - interval '3 hours'
     ORDER BY sg.starts_at LIMIT $2`, [teamId, limit]);
}

export async function nextGame(db: Tx, teamId: number) {
  return (await upcoming(db, teamId, 4)).find((g) => g.status === "scheduled") ?? null;
}

/** Who's in, out or late for each game. Injured reserve and Away count as out until their return date. */
export async function attendance(db: Tx, teamId: number, games: any[], viewerId: number | null, showNames: boolean) {
  const members = await q<any>(db,
    `SELECT DISTINCT ON (u.id) u.id, p.display_name AS name, u.status, u.status_until
     FROM players p JOIN roster_entries re ON re.player_id=p.id JOIN users u ON u.id=p.user_id
     WHERE re.team_id=$1 AND u.merged_into IS NULL ORDER BY u.id, p.id`, [teamId]);
  const ids = games.map((g) => g.id);
  const answers = ids.length ? await q<any>(db,
    "SELECT scheduled_game_id gid, user_id, answer FROM rsvps WHERE scheduled_game_id IN (SELECT jsonb_array_elements_text($1::jsonb)::int)", [JSON.stringify(ids)]) : [];
  const isMember = viewerId != null && members.some((m) => m.id === viewerId);
  for (const g of games) {
    const out = { in: [] as string[], out: [] as string[], late: [] as string[], none: [] as string[] };
    let mine: string | null = null, mineAuto = false;
    for (const m of members) {
      const explicit = answers.find((a) => a.gid === g.id && a.user_id === m.id)?.answer ?? null;
      const away = (m.status === "ir" || m.status === "away") && (!m.status_until || m.status_until >= g.local_date);
      const ans = explicit ?? (away ? "out" : null);
      (out as any)[ans ?? "none"].push(m.name);
      if (m.id === viewerId) { mine = ans; mineAuto = !explicit && !!ans; }
    }
    g.rsvp = {
      counts: { in: out.in.length, out: out.out.length, late: out.late.length, none: out.none.length },
      names: showNames || isMember ? out : null,
      mine, mineAuto, member: isMember,
    };
  }
  return games;
}
