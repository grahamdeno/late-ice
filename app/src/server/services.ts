import "server-only";
import { one, q, type Tx } from "./db";
import type { OcrResult, OcrTeam } from "./ocr";
import { rateGame } from "./rating";

export const LEVEL_START: Record<string, number> = { A: 5.0, B: 4.4, C: 3.8, D: 3.2, "40+": 3.9 };

export class HttpError extends Error {
  constructor(public status: number, message: string, public extra: Record<string, unknown> = {}) { super(message); }
}

/** The season a date falls in at a rink. Falls back to the latest season. */
export async function seasonFor(db: Tx, rinkId: number, date: string | null) {
  const d = date || new Date().toISOString().slice(0, 10);
  return (
    (await one<any>(db, "SELECT * FROM seasons WHERE rink_id=$1 AND starts_on<=$2 AND ends_on>=$2 ORDER BY starts_on DESC LIMIT 1", [rinkId, d])) ||
    (await one<any>(db, "SELECT * FROM seasons WHERE rink_id=$1 ORDER BY ends_on DESC LIMIT 1", [rinkId]))
  );
}
export const currentSeason = (db: Tx, rinkId: number) => seasonFor(db, rinkId, null);

/** Seasons at a league's rink that have anything in them, newest first. */
export async function seasonsWithData(db: Tx, leagueId: number) {
  const rows = await q<any>(
    db,
    `SELECT s.*, (SELECT COUNT(*) FROM games g WHERE g.season_id=s.id AND g.league_id=$1) +
       (SELECT COUNT(*) FROM team_imports ti JOIN teams t ON t.id=ti.team_id WHERE ti.season_id=s.id AND t.league_id=$1) n
     FROM seasons s WHERE s.rink_id=(SELECT rink_id FROM leagues WHERE id=$1) ORDER BY s.starts_on DESC`,
    [leagueId],
  );
  return rows.filter((x) => x.n > 0);
}

export const nameKey = (s: string) => s.toLowerCase().replace(/[^a-z]/g, "");

function bigrams(s: string) {
  const t = ` ${s.toLowerCase().replace(/[^a-z0-9 ]/g, "")} `;
  const out: string[] = [];
  for (let i = 0; i < t.length - 1; i++) out.push(t.slice(i, i + 2));
  return out;
}
export function similarity(a: string, b: string) {
  const A = bigrams(a), B = bigrams(b);
  if (!A.length || !B.length) return 0;
  const m = new Map<string, number>();
  for (const x of A) m.set(x, (m.get(x) || 0) + 1);
  let hit = 0;
  for (const x of B) { const c = m.get(x) || 0; if (c > 0) { hit++; m.set(x, c - 1); } }
  return (2 * hit) / (A.length + B.length);
}

export function detectLevel(text: string | null): string | null {
  if (!text) return null;
  const t = text.toUpperCase();
  if (/DEMO|TEST|SAMPLE/.test(t)) return "DEMO";
  if (/40|OVER|OLD|MASTER/.test(t)) return "40+";
  const m = t.match(/\b([ABCD])\d?\b/) || t.match(/([ABCD])/);
  return m ? m[1] : null;
}

export async function suggest(db: Tx, r: OcrResult) {
  const level = detectLevel(r.league_text);
  const teams = await q<{ id: number; name: string; league_id: number; level: string }>(
    db, "SELECT t.id,t.name,t.league_id,l.level FROM teams t JOIN leagues l ON l.id=t.league_id",
  );
  const match = (name: string | null) => {
    if (!name) return { teamId: null as number | null, score: 0, candidates: [] as any[] };
    const scored = teams
      .map((t) => ({ ...t, score: similarity(name, t.name) + (level && t.level === level ? 0.05 : 0) }))
      .sort((a, b) => b.score - a.score);
    // Auto-pick only inside the league written on the sheet, and only on a strong match.
    const pool = level ? scored.filter((t) => t.level === level) : scored;
    const best = pool[0];
    return {
      teamId: best && best.score >= 0.72 ? best.id : null,
      score: best ? Math.min(1, best.score) : 0,
      candidates: scored.slice(0, 5).map((t) => ({ id: t.id, name: t.name, level: t.level, score: Math.min(1, t.score) })),
    };
  };
  const home = match(r.home.name);
  const away = match(r.away.name);
  const byTeam = (id: number | null) => teams.find((t) => t.id === id)?.league_id ?? null;
  let leagueId =
    (level && (await one<{ id: number }>(db, "SELECT id FROM leagues WHERE level=$1", [level]))?.id) || byTeam(home.teamId) || byTeam(away.teamId) || null;
  if (home.teamId && byTeam(home.teamId) === byTeam(away.teamId)) leagueId = byTeam(home.teamId);
  const dup = r.date && home.teamId && away.teamId
    ? await one<{ id: number }>(
        db,
        "SELECT id FROM games WHERE source='sheet' AND played_on=$1 AND ((home_team_id=$2 AND away_team_id=$3) OR (home_team_id=$3 AND away_team_id=$2))",
        [r.date, home.teamId, away.teamId],
      )
    : undefined;
  return { level, leagueId, home, away, duplicateGameId: dup?.id ?? null };
}

function goalieOf(t: OcrTeam) {
  return t.roster.find((p) => (p.position || "").toUpperCase().startsWith("G"))?.number ?? null;
}

async function resolvePlayer(db: Tx, teamId: number, number: string | null, name: string | null, level: string, isGoalie: boolean) {
  const display = name || `#${number ?? "?"}`;
  const key = nameKey(display);
  // Same team, same number, similar name: same person (spelling variants collapse here).
  if (number) {
    const r = await one<any>(db, "SELECT p.* FROM roster_entries re JOIN players p ON p.id=re.player_id WHERE re.team_id=$1 AND re.number=$2", [teamId, number]);
    if (r && (!name || similarity(r.name, name) > 0.55)) return r.id as number;
  }
  // An imported "Adam Y." spot on this team is the "Adam Young" on the sheet.
  if (name && /\s/.test(name.trim())) {
    const parts = name.trim().split(/\s+/);
    const short = `${parts[0]} ${parts[parts.length - 1][0]}.`.toLowerCase();
    const hits = await q<any>(db,
      "SELECT p.* FROM roster_entries re JOIN players p ON p.id=re.player_id WHERE re.team_id=$1 AND re.number IS NULL AND lower(p.name)=$2 LIMIT 2",
      [teamId, short]);
    const r = hits.length === 1 ? hits[0] : null; // two "Ben M." on one team: don't guess
    if (r) {
      // Keep the fuller name from the sheet; the public display stays first name and last initial.
      await q(db, "UPDATE players SET name=$1, name_key=$2 WHERE id=$3 AND user_id IS NULL", [name, nameKey(name), r.id]);
      await q(db, "UPDATE roster_entries SET number=$1 WHERE team_id=$2 AND player_id=$3", [number, teamId, r.id]);
      return r.id as number;
    }
  }
  // Same name elsewhere: reuse only an unclaimed record. A sheet never attaches stats to a
  // registered person by itself; that takes a claim or a captain's match.
  const existing = key.length > 3 ? await one<any>(db, "SELECT * FROM players WHERE name_key=$1 AND user_id IS NULL ORDER BY id LIMIT 1", [key]) : undefined;
  let id: number;
  if (existing) id = existing.id;
  else {
    const start = LEVEL_START[level] ?? 3.8;
    id = (await one<{ id: number }>(
      db,
      "INSERT INTO players (name,name_key,position,rating,start_rating) VALUES ($1,$2,$3,$4,$4) RETURNING id",
      [display, key, isGoalie ? "G" : "F", start],
    ))!.id;
  }
  await q(db, "INSERT INTO roster_entries (team_id,player_id,number,source) VALUES ($1,$2,$3,'sheet') ON CONFLICT (team_id,player_id) DO UPDATE SET number=EXCLUDED.number", [teamId, id, number]);
  return id;
}

const PALETTE = ["#38BDF8", "#F472B6", "#A3E635", "#FBBF24", "#C084FC", "#2DD4BF", "#FB7185"];

export interface ConfirmInput { leagueId: number; homeTeamId: number | null; awayTeamId: number | null; data: OcrResult; eventId?: number | null }

/** Turn a reviewed sheet into a game, its stat lines and rating moves. Run inside a transaction. */
export async function confirmSheet(db: Tx, sheetId: number, input: ConfirmInput) {
  const sheet = await one<any>(db, "SELECT * FROM sheets WHERE id=$1 FOR UPDATE", [sheetId]);
  if (!sheet) throw new HttpError(404, "Sheet not found");
  if (sheet.game_id) throw new HttpError(409, "This sheet is already in the books.", { gameId: sheet.game_id });
  const league = await one<any>(db, "SELECT * FROM leagues WHERE id=$1", [input.leagueId]);
  if (!league) throw new HttpError(400, "Pick a league");
  const d = input.data;
  // A tournament game: opponents from outside the app land in the rink's hidden "Tournament guests" league.
  const event = input.eventId ? await one<any>(db, "SELECT * FROM events WHERE id=$1", [input.eventId]) : null;
  if (input.eventId && !event) throw new HttpError(400, "That tournament isn't here.");
  const guestLeague = async () => (await one<any>(db, "SELECT * FROM leagues WHERE rink_id=$1 AND level='TOURN'", [league.rink_id]))
    ?? (await one<any>(db, "INSERT INTO leagues (rink_id, level, name, season, sort) VALUES ($1,'TOURN','Tournament guests','',99) RETURNING *", [league.rink_id]));

  const ensureTeam = async (id: number | null, name: string | null) => {
    if (id) return id;
    if (event && name) {
      const gl = await guestLeague();
      const found = await one<any>(db, "SELECT id FROM teams WHERE league_id=$1 AND lower(name)=lower($2)", [gl.id, name]);
      if (found) return found.id as number;
      return (await one<{ id: number }>(db, "INSERT INTO teams (league_id,name,color,is_sample,created_from_sheet) VALUES ($1,$2,$3,0,$4) RETURNING id", [gl.id, name, PALETTE[0], sheetId]))!.id;
    }
    if (!name) throw new HttpError(400, "A team name could not be read. Retake the photo.");
    const n = ((await one<{ c: number }>(db, "SELECT COUNT(*) c FROM teams"))?.c ?? 0) % PALETTE.length;
    return (await one<{ id: number }>(
      db, "INSERT INTO teams (league_id,name,color,is_sample,created_from_sheet) VALUES ($1,$2,$3,0,$4) RETURNING id",
      [league.id, name, PALETTE[n], sheetId],
    ))!.id;
  };
  const homeId = await ensureTeam(input.homeTeamId, d.home.name);
  const awayId = await ensureTeam(input.awayTeamId, d.away.name);
  if (homeId === awayId) throw new HttpError(400, "Home and visitor can't be the same team.");

  if (d.date) {
    const dup = await one<any>(
      db, "SELECT id, source FROM games WHERE played_on=$1 AND ((home_team_id=$2 AND away_team_id=$3) OR (home_team_id=$3 AND away_team_id=$2))",
      [d.date, homeId, awayId],
    );
    // A scanned sheet replaces an imported result for the same game.
    if (dup?.source && dup.source !== "sheet") await replaceImported(db, dup.id);
    else if (dup) throw new HttpError(409, "This game was already scanned by someone else.", { gameId: dup.id });
  }

  const hs = d.home.total ?? d.home.goals.length;
  const as = d.away.total ?? d.away.goals.length;
  const season = await seasonFor(db, league.rink_id, d.date);
  const gameId = (await one<{ id: number }>(
    db,
    `INSERT INTO games (league_id,season_id,home_team_id,away_team_id,played_on,start_time,home_score,away_score,periods_json,goals_json,penalties_json,shots_json,sheet_id,event_id)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14) RETURNING id`,
    [
      league.id, season?.id ?? null, homeId, awayId, d.date, d.time, hs, as,
      JSON.stringify({ home: d.home.score_by_period, away: d.away.score_by_period }),
      JSON.stringify({ home: d.home.goals, away: d.away.goals }),
      JSON.stringify({ home: d.home.penalties, away: d.away.penalties }),
      JSON.stringify({ home: d.home.shots_by_period, away: d.away.shots_by_period }),
      sheetId, event?.id ?? null,
    ],
  ))!.id;
  if (event) for (const t of [homeId, awayId]) await q(db, "INSERT INTO event_teams (event_id, team_id) VALUES ($1,$2) ON CONFLICT DO NOTHING", [event.id, t]);

  const sides: [OcrTeam, OcrTeam, number, number][] = [
    [d.home, d.away, homeId, as],
    [d.away, d.home, awayId, hs],
  ];
  for (const [t, opp, teamId, against] of sides) {
    const gNum = goalieOf(t);
    const oppShots = opp.shots_by_period.reduce<number>((a, b) => a + (b ?? 0), 0);
    for (const p of t.roster) {
      const isG = !!p.number && p.number === gNum;
      const playerId = await resolvePlayer(db, teamId, p.number, p.name, league.level, isG);
      const g = t.goals.filter((x) => x.scorer && x.scorer === p.number).length;
      const a = t.goals.filter((x) => p.number && (x.assist1 === p.number || x.assist2 === p.number)).length;
      const pim = t.penalties.filter((x) => x.number && x.number === p.number).reduce((s, x) => s + (x.minutes ?? 0), 0);
      await q(
        db,
        "INSERT INTO player_game_stats (game_id,player_id,team_id,number,goals,assists,pim,is_goalie,shots_against,goals_against) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)",
        [gameId, playerId, teamId, p.number, g, a, pim, isG ? 1 : 0, isG && oppShots ? oppShots : null, isG ? against : null],
      );
    }
  }

  await rateGame(db, gameId);
  await q(db, "UPDATE sheets SET status='confirmed', game_id=$1, extracted_json=$2 WHERE id=$3", [gameId, JSON.stringify(d), sheetId]);
  return gameId;
}

/**
 * Remove an imported result before its real sheet goes in. The season baselines (team_imports,
 * player_imports) already include that game, so take it back out of them; otherwise it counts twice.
 */
async function replaceImported(db: Tx, gameId: number) {
  const g = await one<any>(db, "SELECT * FROM games WHERE id=$1", [gameId]);
  if (!g) return;
  for (const [teamId, mine, theirs] of [[g.home_team_id, g.home_score, g.away_score], [g.away_team_id, g.away_score, g.home_score]]) {
    const col = mine > theirs ? "w" : mine < theirs ? "l" : "t";
    await q(db, `UPDATE team_imports SET gp=gp-1, ${col}=${col}-1 WHERE id=(SELECT id FROM team_imports WHERE team_id=$1 AND season_id IS NOT DISTINCT FROM $2 AND gp>0 AND ${col}>0 LIMIT 1)`, [teamId, g.season_id]);
  }
  for (const l of await q<any>(db, "SELECT * FROM imported_game_lines WHERE game_id=$1", [gameId])) {
    await q(db,
      `UPDATE player_imports SET g=GREATEST(0,g-$3), a=GREATEST(0,a-$4), gp=GREATEST(0,gp-1)
       WHERE id=(SELECT id FROM player_imports WHERE player_id=$1 AND team_id=$2 AND season_id IS NOT DISTINCT FROM $5 LIMIT 1)`,
      [l.player_id, l.team_id, l.goals, l.assists, g.season_id]);
  }
  await q(db, "DELETE FROM games WHERE id=$1", [gameId]);
}

/* ---------- read models ---------- */

export async function teamRecord(db: Tx, teamId: number, seasonId: number | null = null) {
  const sq = seasonId ? " AND season_id=$2" : "";
  const sp = seasonId ? [seasonId] : [];
  const gs = await q<any>(db, `SELECT * FROM games WHERE (home_team_id=$1 OR away_team_id=$1) AND source='sheet' AND event_id IS NULL${sq}`, [teamId, ...sp]);
  const imp = await one<any>(db, `SELECT SUM(gp)::int gp, SUM(w)::int w, SUM(l)::int l, SUM(t)::int t, SUM(gf)::int gf, SUM(ga)::int ga, COUNT(*)::int n, COUNT(gf)::int ngf FROM team_imports WHERE team_id=$1${sq}`, [teamId, ...sp]);
  // Goals are known only if every imported baseline carried them.
  const goalsKnown = !imp?.n || imp.ngf === imp.n;
  let w = imp?.w ?? 0, l = imp?.l ?? 0, t = imp?.t ?? 0, gf = imp?.gf ?? 0, ga = imp?.ga ?? 0;
  for (const g of gs) {
    const mine = g.home_team_id === teamId ? g.home_score : g.away_score;
    const theirs = g.home_team_id === teamId ? g.away_score : g.home_score;
    gf += mine; ga += theirs;
    if (mine > theirs) w++; else if (mine < theirs) l++; else t++;
  }
  return { gp: gs.length + (imp?.gp ?? 0), scanned: gs.length, imported: imp?.gp ?? 0, w, l, t, pts: w * 2 + t, goalsKnown, gf: goalsKnown ? gf : null, ga: goalsKnown ? ga : null, diff: goalsKnown ? gf - ga : null };
}

/**
 * Team strength: the roster's average rating (the league level's baseline until players have
 * rated games) plus a nudge from goal difference per game, capped at half a point either way.
 * Imported games carry no lineup, so this is how they count toward a rating at all.
 */
export function teamStrength(base: number | null, gp: number, diff: number | null) {
  if (base == null) return null;
  if (!gp || gp < 3 || diff == null) return Math.round(base * 100) / 100;
  const spread = Math.max(-0.5, Math.min(0.5, (diff / gp) * 0.12));
  return Math.round((base + spread) * 100) / 100;
}

export async function teamRating(db: Tx, teamId: number) {
  const r = await one<{ r: number | null }>(db, "SELECT AVG(p.rating) r FROM roster_entries re JOIN players p ON p.id=re.player_id WHERE re.team_id=$1", [teamId]);
  const rec = await teamRecord(db, teamId);
  return teamStrength(r?.r ?? null, rec.gp, rec.diff);
}

function sortStandings(rows: any[]) {
  return rows.sort((a, b) => b.pts - a.pts || (b.diff ?? 0) - (a.diff ?? 0) || (b.gf ?? 0) - (a.gf ?? 0) || String(a.name).localeCompare(String(b.name)));
}

/**
 * Every team in the scope, with the same record teamRecord() builds, in one query.
 * scope "league" takes a league id; "rink" takes a rink id and skips demo and tournament leagues.
 */
async function groupedStandings(db: Tx, scope: "league" | "rink", id: number, seasonId: number | null) {
  const where = scope === "league" ? "id = $1" : "rink_id = $1 AND level NOT IN ('DEMO','TOURN')";
  const rows = await q<any>(db, `
    WITH leagues_in AS (
      SELECT * FROM leagues WHERE ${where}
    ),
    team_in AS (
      SELECT t.id, t.league_id FROM teams t WHERE t.league_id IN (SELECT id FROM leagues_in)
    ),
    game_side AS (
      SELECT g.home_team_id AS team_id, g.home_score AS gf, g.away_score AS ga
      FROM games g
      WHERE g.source = 'sheet' AND g.event_id IS NULL
        AND ($2::int IS NULL OR g.season_id = $2)
        AND g.home_team_id IN (SELECT id FROM team_in)
      UNION ALL
      SELECT g.away_team_id, g.away_score, g.home_score
      FROM games g
      WHERE g.source = 'sheet' AND g.event_id IS NULL
        AND ($2::int IS NULL OR g.season_id = $2)
        AND g.away_team_id IN (SELECT id FROM team_in)
    ),
    game_agg AS (
      SELECT team_id,
        COUNT(*)::int AS scanned,
        COUNT(*) FILTER (WHERE gf > ga)::int AS w,
        COUNT(*) FILTER (WHERE gf < ga)::int AS l,
        COUNT(*) FILTER (WHERE gf = ga)::int AS t,
        COALESCE(SUM(gf), 0)::int AS gf,
        COALESCE(SUM(ga), 0)::int AS ga
      FROM game_side GROUP BY team_id
    ),
    imp_agg AS (
      SELECT team_id,
        COALESCE(SUM(gp), 0)::int AS gp,
        COALESCE(SUM(w), 0)::int AS w,
        COALESCE(SUM(l), 0)::int AS l,
        COALESCE(SUM(t), 0)::int AS t,
        COALESCE(SUM(gf), 0)::int AS gf,
        COALESCE(SUM(ga), 0)::int AS ga,
        COUNT(*)::int AS n,
        COUNT(gf)::int AS ngf
      FROM team_imports
      WHERE team_id IN (SELECT id FROM team_in)
        AND ($2::int IS NULL OR season_id = $2)
      GROUP BY team_id
    ),
    rate AS (
      SELECT re.team_id, AVG(p.rating) AS rating
      FROM roster_entries re
      JOIN players p ON p.id = re.player_id
      WHERE re.team_id IN (SELECT id FROM team_in)
      GROUP BY re.team_id
    )
    SELECT
      li.id AS l_id, li.rink_id AS l_rink_id, li.level AS l_level, li.name AS l_name, li.blurb AS l_blurb,
      li.season AS l_season, li.sort AS l_sort, li.created_at AS l_created_at, li.tag AS l_tag,
      li.roster_max AS l_roster_max, li.goalie_max AS l_goalie_max,
      t.id, t.league_id, t.name, t.color, t.is_sample, t.created_from_sheet, t.logo, t.created_at,
      (COALESCE(g.scanned, 0) + COALESCE(i.gp, 0))::int AS gp,
      COALESCE(g.scanned, 0)::int AS scanned,
      COALESCE(i.gp, 0)::int AS imported,
      (COALESCE(i.w, 0) + COALESCE(g.w, 0))::int AS w,
      (COALESCE(i.l, 0) + COALESCE(g.l, 0))::int AS l,
      (COALESCE(i.t, 0) + COALESCE(g.t, 0))::int AS t,
      ((COALESCE(i.w, 0) + COALESCE(g.w, 0)) * 2 + (COALESCE(i.t, 0) + COALESCE(g.t, 0)))::int AS pts,
      (COALESCE(i.n, 0) = 0 OR COALESCE(i.ngf, 0) = COALESCE(i.n, 0)) AS "goalsKnown",
      CASE WHEN COALESCE(i.n, 0) = 0 OR COALESCE(i.ngf, 0) = COALESCE(i.n, 0)
        THEN (COALESCE(i.gf, 0) + COALESCE(g.gf, 0))::int ELSE NULL END AS gf,
      CASE WHEN COALESCE(i.n, 0) = 0 OR COALESCE(i.ngf, 0) = COALESCE(i.n, 0)
        THEN (COALESCE(i.ga, 0) + COALESCE(g.ga, 0))::int ELSE NULL END AS ga,
      CASE WHEN COALESCE(i.n, 0) = 0 OR COALESCE(i.ngf, 0) = COALESCE(i.n, 0)
        THEN (COALESCE(i.gf, 0) + COALESCE(g.gf, 0) - COALESCE(i.ga, 0) - COALESCE(g.ga, 0))::int ELSE NULL END AS diff,
      r.rating AS rating
    FROM leagues_in li
    LEFT JOIN teams t ON t.league_id = li.id
    LEFT JOIN game_agg g ON g.team_id = t.id
    LEFT JOIN imp_agg i ON i.team_id = t.id
    LEFT JOIN rate r ON r.team_id = t.id
    ORDER BY li.sort, li.id, t.name
  `, [id, seasonId]);
  const out: { league: any; standings: any[] }[] = [];
  const by = new Map<number, { league: any; standings: any[] }>();
  for (const row of rows) {
    let g = by.get(row.l_id);
    if (!g) {
      g = {
        league: {
          id: row.l_id, rink_id: row.l_rink_id, level: row.l_level, name: row.l_name, blurb: row.l_blurb,
          season: row.l_season, sort: row.l_sort, created_at: row.l_created_at, tag: row.l_tag,
          roster_max: row.l_roster_max, goalie_max: row.l_goalie_max,
        },
        standings: [],
      };
      by.set(row.l_id, g);
      out.push(g);
    }
    if (row.id != null) {
      g.standings.push({
        id: row.id, league_id: row.league_id, name: row.name, color: row.color, is_sample: row.is_sample,
        created_from_sheet: row.created_from_sheet, logo: row.logo, created_at: row.created_at,
        gp: row.gp, scanned: row.scanned, imported: row.imported, w: row.w, l: row.l, t: row.t, pts: row.pts,
        goalsKnown: row.goalsKnown, gf: row.gf, ga: row.ga, diff: row.diff, rating: teamStrength(row.rating, row.gp, row.diff),
      });
    }
  }
  for (const g of out) g.standings = sortStandings(g.standings);
  return out;
}

export async function standings(db: Tx, leagueId: number, seasonId: number | null = null) {
  const groups = await groupedStandings(db, "league", leagueId, seasonId);
  return groups[0]?.standings ?? [];
}

/** Every non-demo, non-tournament league at a rink, each with its standings rows. One query. */
export async function standingsForRink(db: Tx, rinkId: number, seasonId: number | null) {
  const groups = await groupedStandings(db, "rink", rinkId, seasonId);
  return groups.map((g) => ({ ...g.league, standings: g.standings }));
}

/** Rink page leagues list: team count, game count and the first-place team. One query. */
export async function leagueBoard(db: Tx, rinkId: number, seasonId: number | null) {
  const groups = await groupedStandings(db, "rink", rinkId, seasonId);
  return groups.map((g) => ({
    ...g.league,
    teams: g.standings.length,
    games: g.standings.reduce((a, t) => a + t.gp, 0) / 2,
    leader: g.standings[0] ?? null,
  }));
}

export async function leaders(db: Tx, leagueId: number | null, limit = 10, seasonId: number | null = null, rinkId: number | null = null, viewerId: number | null = null) {
  const { applyLoadedNames, sameRinkSql } = await import("./accounts");
  const params: any[] = [];
  const p = (v: any) => { params.push(v); return `$${params.length}`; };
  const scope = () => (leagueId ? `l.id=${p(leagueId)}` : "l.level NOT IN ('DEMO','TOURN')" + (rinkId ? ` AND l.rink_id=${p(rinkId)}` : "")) + (seasonId ? ` AND season_id=${p(seasonId)}` : "");
  const s1 = scope(), s2 = scope();
  const viewer = viewerId ? p(viewerId) : "NULL";
  const rows = await q<any>(
    db,
    `WITH lines AS (
       SELECT s.player_id, s.team_id, s.goals g, s.assists a, gm.season_id season_id FROM player_game_stats s JOIN games gm ON gm.id=s.game_id JOIN leagues l ON l.id=gm.league_id WHERE gm.event_id IS NULL AND ${s1}
       UNION ALL
       SELECT pi.player_id, pi.team_id, pi.g, pi.a, pi.season_id FROM player_imports pi JOIN teams t ON t.id=pi.team_id JOIN leagues l ON l.id=t.league_id WHERE ${s2}
     )
     SELECT p.id, p.display_name AS name, p.name AS real_name, p.user_id, p.hidden,
       (SELECT u.hidden FROM users u WHERE u.id = p.user_id) AS user_hidden,
       (SELECT re.number FROM roster_entries re WHERE re.player_id = p.id AND re.number IS NOT NULL AND re.number <> '' ORDER BY re.id LIMIT 1) AS number,
       ${sameRinkSql("p.id", viewer)} AS same_rink,
       p.rating, p.position, SUM(x.g)::int g, SUM(x.a)::int a, SUM(x.g+x.a)::int pts,
       (SELECT t.name FROM teams t WHERE t.id=x.team_id) team, x.team_id
     FROM lines x JOIN players p ON p.id=x.player_id
     GROUP BY p.id, p.display_name, p.name, p.user_id, p.hidden, x.team_id HAVING SUM(x.g+x.a) > 0 ORDER BY pts DESC, g DESC, p.display_name LIMIT ${Number(limit)}`,
    params,
  );
  return rows.map((row) => applyLoadedNames(row));
}

export async function gameCard(db: Tx, g: any) {
  const h = await one<any>(db, "SELECT id,name,color,logo FROM teams WHERE id=$1", [g.home_team_id]);
  const a = await one<any>(db, "SELECT id,name,color,logo FROM teams WHERE id=$1", [g.away_team_id]);
  const l = await one<any>(db, "SELECT id,level,name FROM leagues WHERE id=$1", [g.league_id]);
  const s = g.season_id ? await one<any>(db, "SELECT id,name FROM seasons WHERE id=$1", [g.season_id]) : null;
  const ev = g.event_id ? await one<any>(db, "SELECT id, name FROM events WHERE id=$1", [g.event_id]) : null;
  return { event: ev, id: g.id, season: s, playedOn: g.played_on, startTime: g.start_time, home: h, away: a, homeScore: g.home_score, awayScore: g.away_score, league: l, sheetId: g.sheet_id, source: g.source ?? "sheet" };
}
export async function gameCards(db: Tx, games: any[]) {
  if (!games.length) return [];
  const uniq = (xs: any[]) => [...new Set(xs.filter((x) => x != null))];
  const teamIds = uniq(games.flatMap((g) => [g.home_team_id, g.away_team_id]));
  const leagueIds = uniq(games.map((g) => g.league_id));
  const seasonIds = uniq(games.map((g) => g.season_id));
  const eventIds = uniq(games.map((g) => g.event_id));
  // One round trip for every team, league, season and event these games point at.
  const row = await one<any>(db, `
    SELECT
      COALESCE((SELECT json_agg(json_build_object('id', id, 'name', name, 'color', color, 'logo', logo)) FROM teams WHERE id = ANY($1::int[])), '[]'::json) AS teams,
      COALESCE((SELECT json_agg(json_build_object('id', id, 'level', level, 'name', name)) FROM leagues WHERE id = ANY($2::int[])), '[]'::json) AS leagues,
      COALESCE((SELECT json_agg(json_build_object('id', id, 'name', name)) FROM seasons WHERE id = ANY($3::int[])), '[]'::json) AS seasons,
      COALESCE((SELECT json_agg(json_build_object('id', id, 'name', name)) FROM events WHERE id = ANY($4::int[])), '[]'::json) AS events
  `, [teamIds, leagueIds, seasonIds, eventIds]);
  const by = (list: any[]) => new Map((list ?? []).map((x) => [x.id, x]));
  const teams = by(row?.teams);
  const leagues = by(row?.leagues);
  const seasons = by(row?.seasons);
  const events = by(row?.events);
  return games.map((g) => ({
    event: g.event_id ? events.get(g.event_id) : null,
    id: g.id,
    season: g.season_id ? seasons.get(g.season_id) : null,
    playedOn: g.played_on,
    startTime: g.start_time,
    home: teams.get(g.home_team_id),
    away: teams.get(g.away_team_id),
    homeScore: g.home_score,
    awayScore: g.away_score,
    league: leagues.get(g.league_id),
    sheetId: g.sheet_id,
    source: g.source ?? "sheet",
  }));
}
