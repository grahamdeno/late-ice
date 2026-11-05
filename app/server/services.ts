import { sqlite, LEVEL_START } from "./db";
import type { OcrResult, OcrTeam } from "./ocr";

const q = <T = any>(sql: string, ...p: any[]) => sqlite.prepare(sql).all(...p) as T[];
const one = <T = any>(sql: string, ...p: any[]) => sqlite.prepare(sql).get(...p) as T | undefined;

/** The season a date falls in at a rink. Falls back to the season containing today, then the latest season. */
export function seasonFor(rinkId: number, date: string | null) {
  const d = date || new Date().toISOString().slice(0, 10);
  return (
    one<any>("SELECT * FROM seasons WHERE rink_id=? AND starts_on<=? AND ends_on>=? ORDER BY starts_on DESC LIMIT 1", rinkId, d, d) ||
    one<any>("SELECT * FROM seasons WHERE rink_id=? ORDER BY ends_on DESC LIMIT 1", rinkId)
  );
}
export function currentSeason(rinkId: number) { return seasonFor(rinkId, null); }
/** Seasons at a rink that have anything in them, newest first. */
export function seasonsWithData(leagueId: number) {
  return q<any>(
    `SELECT s.*, (SELECT COUNT(*) FROM games g WHERE g.season_id=s.id AND g.league_id=?) +
       (SELECT COUNT(*) FROM team_imports ti JOIN teams t ON t.id=ti.team_id WHERE ti.season_id=s.id AND t.league_id=?) n
     FROM seasons s WHERE s.rink_id=(SELECT rink_id FROM leagues WHERE id=?) ORDER BY s.starts_on DESC`, leagueId, leagueId, leagueId,
  ).filter((x: any) => x.n > 0);
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

export function suggest(r: OcrResult) {
  const level = detectLevel(r.league_text);
  const teams = q<{ id: number; name: string; league_id: number; level: string }>(
    "SELECT t.id,t.name,t.league_id,l.level FROM teams t JOIN leagues l ON l.id=t.league_id",
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
    (level && one<{ id: number }>("SELECT id FROM leagues WHERE level=?", level)?.id) || byTeam(home.teamId) || byTeam(away.teamId) || null;
  if (home.teamId && byTeam(home.teamId) === byTeam(away.teamId)) leagueId = byTeam(home.teamId);
  const dup = r.date && home.teamId && away.teamId
    ? one<{ id: number }>(
        "SELECT id FROM games WHERE played_on=? AND ((home_team_id=? AND away_team_id=?) OR (home_team_id=? AND away_team_id=?))",
        r.date, home.teamId, away.teamId, away.teamId, home.teamId,
      )
    : undefined;
  return { level, leagueId, home, away, duplicateGameId: dup?.id ?? null };
}

function goalieOf(t: OcrTeam) {
  return t.roster.find((p) => (p.position || "").toUpperCase().startsWith("G"))?.number ?? null;
}

function resolvePlayer(teamId: number, number: string | null, name: string | null, level: string, isGoalie: boolean) {
  const display = name || `#${number ?? "?"}`;
  const key = nameKey(display);
  // Same team, same number, similar name: same person.
  if (number) {
    const r = one<any>(
      "SELECT p.* FROM roster_entries re JOIN players p ON p.id=re.player_id WHERE re.team_id=? AND re.number=?",
      teamId, number,
    );
    if (r && (!name || similarity(r.name, name) > 0.55)) return r.id as number;
  }
  const existing = key.length > 3 ? one<any>("SELECT * FROM players WHERE name_key=?", key) : undefined;
  let id: number;
  if (existing) id = existing.id;
  else {
    id = Number(
      sqlite
        .prepare("INSERT INTO players (name,name_key,position,rating) VALUES (?,?,?,?)")
        .run(display, key, isGoalie ? "G" : "F", LEVEL_START[level] ?? 3.8).lastInsertRowid,
    );
  }
  sqlite.prepare("INSERT OR IGNORE INTO roster_entries (team_id,player_id,number) VALUES (?,?,?)").run(teamId, id, number);
  sqlite.prepare("UPDATE roster_entries SET number=? WHERE team_id=? AND player_id=?").run(number, teamId, id);
  return id;
}

const PALETTE = ["#38BDF8", "#F472B6", "#A3E635", "#FBBF24", "#C084FC", "#2DD4BF", "#FB7185"];

export interface ConfirmInput {
  leagueId: number;
  homeTeamId: number | null;
  awayTeamId: number | null;
  data: OcrResult;
}

export function confirmSheet(sheetId: number, input: ConfirmInput) {
  const sheet = one<any>("SELECT * FROM sheets WHERE id=?", sheetId);
  if (!sheet) throw Object.assign(new Error("Sheet not found"), { status: 404 });
  if (sheet.game_id) throw Object.assign(new Error("This sheet is already in the books."), { status: 409, gameId: sheet.game_id });
  const league = one<any>("SELECT * FROM leagues WHERE id=?", input.leagueId);
  if (!league) throw Object.assign(new Error("Pick a league"), { status: 400 });
  const d = input.data;

  const tx = sqlite.transaction(() => {
    const ensureTeam = (id: number | null, name: string | null) => {
      if (id) return id;
      if (!name) throw Object.assign(new Error("A team name could not be read. Retake the photo."), { status: 400 });
      const n = (one<{ c: number }>("SELECT COUNT(*) c FROM teams")?.c ?? 0) % PALETTE.length;
      return Number(
        sqlite.prepare("INSERT INTO teams (league_id,name,color,is_sample,created_from_sheet) VALUES (?,?,?,0,?)")
          .run(league.id, name, PALETTE[n], sheetId).lastInsertRowid,
      );
    };
    const homeId = ensureTeam(input.homeTeamId, d.home.name);
    const awayId = ensureTeam(input.awayTeamId, d.away.name);
    if (homeId === awayId) throw Object.assign(new Error("Home and visitor can't be the same team."), { status: 400 });

    if (d.date) {
      const dup = one<any>(
        "SELECT id FROM games WHERE played_on=? AND ((home_team_id=? AND away_team_id=?) OR (home_team_id=? AND away_team_id=?))",
        d.date, homeId, awayId, awayId, homeId,
      );
      if (dup) throw Object.assign(new Error("This game was already scanned by someone else."), { status: 409, gameId: dup.id });
    }

    const hs = d.home.total ?? d.home.goals.length;
    const as = d.away.total ?? d.away.goals.length;
    const season = seasonFor(league.rink_id, d.date);
    const gameId = Number(
      sqlite.prepare(
        `INSERT INTO games (league_id,season_id,home_team_id,away_team_id,played_on,start_time,home_score,away_score,periods_json,goals_json,penalties_json,shots_json,sheet_id)
         VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      ).run(
        league.id, season?.id ?? null, homeId, awayId, d.date, d.time, hs, as,
        JSON.stringify({ home: d.home.score_by_period, away: d.away.score_by_period }),
        JSON.stringify({ home: d.home.goals, away: d.away.goals }),
        JSON.stringify({ home: d.home.penalties, away: d.away.penalties }),
        JSON.stringify({ home: d.home.shots_by_period, away: d.away.shots_by_period }),
        sheetId,
      ).lastInsertRowid,
    );

    type Line = { playerId: number; teamId: number; number: string | null; g: number; a: number; pim: number; goalie: boolean; sa: number | null; ga: number | null };
    const lines: Line[] = [];
    const sides: [OcrTeam, OcrTeam, number, number, number][] = [
      [d.home, d.away, homeId, hs, as],
      [d.away, d.home, awayId, as, hs],
    ];
    for (const [t, opp, teamId, , against] of sides) {
      const gNum = goalieOf(t);
      const oppShots = opp.shots_by_period.reduce<number>((a, b) => a + (b ?? 0), 0);
      for (const p of t.roster) {
        const isG = !!p.number && p.number === gNum;
        const playerId = resolvePlayer(teamId, p.number, p.name, league.level, isG);
        const g = t.goals.filter((x) => x.scorer && x.scorer === p.number).length;
        const a = t.goals.filter((x) => p.number && (x.assist1 === p.number || x.assist2 === p.number)).length;
        const pim = t.penalties.filter((x) => x.number && x.number === p.number).reduce((s, x) => s + (x.minutes ?? 0), 0);
        lines.push({ playerId, teamId, number: p.number, g, a, pim, goalie: isG, sa: isG && oppShots ? oppShots : null, ga: isG ? against : null });
      }
    }
    const insStat = sqlite.prepare(
      "INSERT INTO player_game_stats (game_id,player_id,team_id,number,goals,assists,pim,is_goalie,shots_against,goals_against) VALUES (?,?,?,?,?,?,?,?,?,?)",
    );
    for (const l of lines) insStat.run(gameId, l.playerId, l.teamId, l.number, l.g, l.a, l.pim, l.goalie ? 1 : 0, l.sa, l.ga);

    rateGame(gameId, lines, homeId, awayId, hs, as);
    sqlite.prepare("UPDATE sheets SET status='confirmed', game_id=?, extracted_json=? WHERE id=?").run(gameId, JSON.stringify(d), sheetId);
    return gameId;
  });
  return tx();
}

/** Late Ice Rating. Team-result based, with small individual nudges. Every move is explained. */
function rateGame(gameId: number, lines: any[], homeId: number, awayId: number, hs: number, as: number) {
  const players = new Map<number, any>();
  for (const l of lines) players.set(l.playerId, one("SELECT * FROM players WHERE id=?", l.playerId));
  const teamAvg = (teamId: number) => {
    const rs = lines.filter((l) => l.teamId === teamId).map((l) => players.get(l.playerId).rating as number);
    return rs.length ? rs.reduce((a, b) => a + b, 0) / rs.length : 3.8;
  };
  const avg = { [homeId]: teamAvg(homeId), [awayId]: teamAvg(awayId) } as Record<number, number>;
  const upd = sqlite.prepare("UPDATE players SET rating=?, games_rated=games_rated+1, position=CASE WHEN ?=1 THEN 'G' ELSE position END WHERE id=?");
  const hist = sqlite.prepare("INSERT INTO rating_history (player_id,game_id,before,after,reasons_json) VALUES (?,?,?,?,?)");
  const seen = new Set<number>();
  for (const l of lines) {
    if (seen.has(l.playerId)) continue;
    seen.add(l.playerId);
    const p = players.get(l.playerId);
    const own = avg[l.teamId], opp = avg[l.teamId === homeId ? awayId : homeId];
    const gf = l.teamId === homeId ? hs : as, ga = l.teamId === homeId ? as : hs;
    const S = gf > ga ? 1 : gf === ga ? 0.5 : 0;
    const E = 1 / (1 + Math.pow(10, (opp - own) / 0.8));
    const K = p.games_rated < 5 ? 0.12 : 0.06;
    const margin = Math.abs(gf - ga) >= 2 ? 1 + 0.1 * Math.min(3, Math.abs(gf - ga) - 1) : 1;
    const reasons: { label: string; value: number }[] = [];
    const res = K * margin * (S - E);
    const outcome = S === 1 ? "Win" : S === 0.5 ? "Tie" : "Loss";
    reasons.push({ label: `${outcome} ${gf}-${ga} vs a ${opp >= own ? "stronger" : "weaker"} team (expected ${(E * 100).toFixed(0)}%)`, value: res });
    const pts = l.g + l.a;
    if (pts > 0) reasons.push({ label: `${l.g}G ${l.a}A on the sheet`, value: Math.min(0.012, 0.004 * pts) });
    if (l.goalie && l.sa) {
      const sv = (l.sa - l.ga) / l.sa;
      const b = Math.max(-0.01, Math.min(0.012, (sv - 0.88) * 0.1));
      reasons.push({ label: `Goalie: ${l.sa - l.ga} saves on ${l.sa} (${sv.toFixed(3).replace(/^0/, "")})`, value: b });
    }
    if (l.pim >= 6) reasons.push({ label: `${l.pim} penalty minutes`, value: -0.004 });
    if (p.games_rated < 5) reasons.push({ label: `Provisional: game ${p.games_rated + 1} of 5 moves faster`, value: 0 });
    const delta = reasons.reduce((s, r) => s + r.value, 0);
    const after = Math.max(1, Math.min(7, Math.round((p.rating + delta) * 1000) / 1000));
    upd.run(after, l.goalie ? 1 : 0, p.id);
    hist.run(p.id, gameId, p.rating, after, JSON.stringify(reasons));
  }
}

/* ---------- read models ---------- */

export function teamRecord(teamId: number, seasonId: number | null = null) {
  const sq = seasonId ? " AND season_id=?" : "";
  const sp = seasonId ? [seasonId] : [];
  const gs = q<any>(`SELECT * FROM games WHERE (home_team_id=? OR away_team_id=?)${sq}`, teamId, teamId, ...sp);
  const imp = one<any>(`SELECT SUM(gp) gp, SUM(w) w, SUM(l) l, SUM(t) t FROM team_imports WHERE team_id=?${sq}`, teamId, ...sp);
  let w = imp?.w ?? 0, l = imp?.l ?? 0, t = imp?.t ?? 0, gf = 0, ga = 0;
  for (const g of gs) {
    const mine = g.home_team_id === teamId ? g.home_score : g.away_score;
    const theirs = g.home_team_id === teamId ? g.away_score : g.home_score;
    gf += mine; ga += theirs;
    if (mine > theirs) w++; else if (mine < theirs) l++; else t++;
  }
  return { gp: gs.length + (imp?.gp ?? 0), scanned: gs.length, imported: imp?.gp ?? 0, w, l, t, pts: w * 2 + t, gf, ga, diff: gf - ga };
}

export function teamRating(teamId: number) {
  const r = one<{ r: number | null }>(
    "SELECT AVG(p.rating) r FROM roster_entries re JOIN players p ON p.id=re.player_id WHERE re.team_id=?", teamId,
  );
  return r?.r ?? null;
}

export function standings(leagueId: number, seasonId: number | null = null) {
  return q<any>("SELECT * FROM teams WHERE league_id=?", leagueId)
    .map((t) => ({ ...t, ...teamRecord(t.id, seasonId), rating: teamRating(t.id) }))
    .sort((a, b) => b.pts - a.pts || b.diff - a.diff || b.gf - a.gf || a.name.localeCompare(b.name));
}

export function leaders(leagueId: number | null, limit = 10, seasonId: number | null = null) {
  const scope = (leagueId ? "l.id=?" : "l.level<>'DEMO'") + (seasonId ? " AND season_id=?" : "");
  const one_ = [...(leagueId ? [leagueId] : []), ...(seasonId ? [seasonId] : [])];
  const params = [...one_, ...one_];
  return q<any>(
    `WITH lines AS (
       SELECT s.player_id, s.team_id, s.goals g, s.assists a, gm.season_id season_id FROM player_game_stats s JOIN games gm ON gm.id=s.game_id JOIN leagues l ON l.id=gm.league_id WHERE ${scope}
       UNION ALL
       SELECT pi.player_id, pi.team_id, pi.g, pi.a, pi.season_id FROM player_imports pi JOIN teams t ON t.id=pi.team_id JOIN leagues l ON l.id=t.league_id WHERE ${scope}
     )
     SELECT p.id, p.display_name name, p.rating, p.position, SUM(x.g) g, SUM(x.a) a, SUM(x.g+x.a) pts,
       (SELECT t.name FROM teams t WHERE t.id=x.team_id) team, x.team_id
     FROM lines x JOIN players p ON p.id=x.player_id
     GROUP BY p.id, x.team_id HAVING pts > 0 ORDER BY pts DESC, g DESC, p.display_name LIMIT ${limit}`,
    ...params,
  );
}

export function gameCard(g: any) {
  const h = one<any>("SELECT id,name,color,logo FROM teams WHERE id=?", g.home_team_id);
  const a = one<any>("SELECT id,name,color,logo FROM teams WHERE id=?", g.away_team_id);
  const l = one<any>("SELECT id,level,name FROM leagues WHERE id=?", g.league_id);
  const s = g.season_id ? one<any>("SELECT id,name FROM seasons WHERE id=?", g.season_id) : null;
  return { id: g.id, season: s, playedOn: g.played_on, startTime: g.start_time, home: h, away: a, homeScore: g.home_score, awayScore: g.away_score, league: l, sheetId: g.sheet_id };
}
