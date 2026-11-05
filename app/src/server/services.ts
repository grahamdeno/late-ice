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
        "SELECT id FROM games WHERE played_on=$1 AND ((home_team_id=$2 AND away_team_id=$3) OR (home_team_id=$3 AND away_team_id=$2))",
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

export interface ConfirmInput { leagueId: number; homeTeamId: number | null; awayTeamId: number | null; data: OcrResult }

/** Turn a reviewed sheet into a game, its stat lines and rating moves. Run inside a transaction. */
export async function confirmSheet(db: Tx, sheetId: number, input: ConfirmInput) {
  const sheet = await one<any>(db, "SELECT * FROM sheets WHERE id=$1 FOR UPDATE", [sheetId]);
  if (!sheet) throw new HttpError(404, "Sheet not found");
  if (sheet.game_id) throw new HttpError(409, "This sheet is already in the books.", { gameId: sheet.game_id });
  const league = await one<any>(db, "SELECT * FROM leagues WHERE id=$1", [input.leagueId]);
  if (!league) throw new HttpError(400, "Pick a league");
  const d = input.data;

  const ensureTeam = async (id: number | null, name: string | null) => {
    if (id) return id;
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
      db, "SELECT id FROM games WHERE played_on=$1 AND ((home_team_id=$2 AND away_team_id=$3) OR (home_team_id=$3 AND away_team_id=$2))",
      [d.date, homeId, awayId],
    );
    if (dup) throw new HttpError(409, "This game was already scanned by someone else.", { gameId: dup.id });
  }

  const hs = d.home.total ?? d.home.goals.length;
  const as = d.away.total ?? d.away.goals.length;
  const season = await seasonFor(db, league.rink_id, d.date);
  const gameId = (await one<{ id: number }>(
    db,
    `INSERT INTO games (league_id,season_id,home_team_id,away_team_id,played_on,start_time,home_score,away_score,periods_json,goals_json,penalties_json,shots_json,sheet_id)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13) RETURNING id`,
    [
      league.id, season?.id ?? null, homeId, awayId, d.date, d.time, hs, as,
      JSON.stringify({ home: d.home.score_by_period, away: d.away.score_by_period }),
      JSON.stringify({ home: d.home.goals, away: d.away.goals }),
      JSON.stringify({ home: d.home.penalties, away: d.away.penalties }),
      JSON.stringify({ home: d.home.shots_by_period, away: d.away.shots_by_period }),
      sheetId,
    ],
  ))!.id;

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

/* ---------- read models ---------- */

export async function teamRecord(db: Tx, teamId: number, seasonId: number | null = null) {
  const sq = seasonId ? " AND season_id=$2" : "";
  const sp = seasonId ? [seasonId] : [];
  const gs = await q<any>(db, `SELECT * FROM games WHERE (home_team_id=$1 OR away_team_id=$1)${sq}`, [teamId, ...sp]);
  const imp = await one<any>(db, `SELECT SUM(gp) gp, SUM(w) w, SUM(l) l, SUM(t) t FROM team_imports WHERE team_id=$1${sq}`, [teamId, ...sp]);
  let w = imp?.w ?? 0, l = imp?.l ?? 0, t = imp?.t ?? 0, gf = 0, ga = 0;
  for (const g of gs) {
    const mine = g.home_team_id === teamId ? g.home_score : g.away_score;
    const theirs = g.home_team_id === teamId ? g.away_score : g.home_score;
    gf += mine; ga += theirs;
    if (mine > theirs) w++; else if (mine < theirs) l++; else t++;
  }
  return { gp: gs.length + (imp?.gp ?? 0), scanned: gs.length, imported: imp?.gp ?? 0, w, l, t, pts: w * 2 + t, gf, ga, diff: gf - ga };
}

export async function teamRating(db: Tx, teamId: number) {
  const r = await one<{ r: number | null }>(db, "SELECT AVG(p.rating) r FROM roster_entries re JOIN players p ON p.id=re.player_id WHERE re.team_id=$1", [teamId]);
  return r?.r ?? null;
}

export async function standings(db: Tx, leagueId: number, seasonId: number | null = null) {
  const teams = await q<any>(db, "SELECT * FROM teams WHERE league_id=$1", [leagueId]);
  const rows = [];
  for (const t of teams) rows.push({ ...t, ...(await teamRecord(db, t.id, seasonId)), rating: await teamRating(db, t.id) });
  return rows.sort((a, b) => b.pts - a.pts || b.diff - a.diff || b.gf - a.gf || a.name.localeCompare(b.name));
}

export async function leaders(db: Tx, leagueId: number | null, limit = 10, seasonId: number | null = null) {
  const params: any[] = [];
  const p = (v: any) => { params.push(v); return `$${params.length}`; };
  const scope = () => (leagueId ? `l.id=${p(leagueId)}` : "l.level<>'DEMO'") + (seasonId ? ` AND season_id=${p(seasonId)}` : "");
  const s1 = scope(), s2 = scope();
  return q<any>(
    db,
    `WITH lines AS (
       SELECT s.player_id, s.team_id, s.goals g, s.assists a, gm.season_id season_id FROM player_game_stats s JOIN games gm ON gm.id=s.game_id JOIN leagues l ON l.id=gm.league_id WHERE ${s1}
       UNION ALL
       SELECT pi.player_id, pi.team_id, pi.g, pi.a, pi.season_id FROM player_imports pi JOIN teams t ON t.id=pi.team_id JOIN leagues l ON l.id=t.league_id WHERE ${s2}
     )
     SELECT p.id, p.display_name AS name, p.rating, p.position, SUM(x.g)::int g, SUM(x.a)::int a, SUM(x.g+x.a)::int pts,
       (SELECT t.name FROM teams t WHERE t.id=x.team_id) team, x.team_id
     FROM lines x JOIN players p ON p.id=x.player_id
     GROUP BY p.id, x.team_id HAVING SUM(x.g+x.a) > 0 ORDER BY pts DESC, g DESC, p.display_name LIMIT ${Number(limit)}`,
    params,
  );
}

export async function gameCard(db: Tx, g: any) {
  const h = await one<any>(db, "SELECT id,name,color,logo FROM teams WHERE id=$1", [g.home_team_id]);
  const a = await one<any>(db, "SELECT id,name,color,logo FROM teams WHERE id=$1", [g.away_team_id]);
  const l = await one<any>(db, "SELECT id,level,name FROM leagues WHERE id=$1", [g.league_id]);
  const s = g.season_id ? await one<any>(db, "SELECT id,name FROM seasons WHERE id=$1", [g.season_id]) : null;
  return { id: g.id, season: s, playedOn: g.played_on, startTime: g.start_time, home: h, away: a, homeScore: g.home_score, awayScore: g.away_score, league: l, sheetId: g.sheet_id };
}
export async function gameCards(db: Tx, games: any[]) {
  const out = [];
  for (const g of games) out.push(await gameCard(db, g));
  return out;
}
