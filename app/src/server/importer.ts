import "server-only";
// Imports a league-system report (DaySmart via Grok, see the prompt in docs) without the data
// ever touching the repo. Rosters become unclaimed spots; games become imported results that
// show everywhere but don't count twice and aren't rated.
import { one, q, type Tx } from "./db";
import { HttpError, LEVEL_START, nameKey, seasonFor, similarity } from "./services";
import { obfuscate, refreshDisplays } from "./accounts";

import { parseReport, type Parsed, type PRow } from "./report-parse";
export { parseReport };

export interface ImportSummary {
  league: string; teams: { source: string; team: string; score: number }[];
  rosterAdded: number; rosterExisting: number;
  gamesAdded: number; gamesUpdated: number; gamesSkipped: { date: string; why: string }[];
  lines: number; unassigned: { date: string; team: string; goals: number }[]; warnings: string[];
  leagueCreated: boolean; teamsCreated: string[]; standingsRows: number; playerTotals: number;
}

const PALETTE = ["#EF4444", "#3B82F6", "#22C55E", "#F5B301", "#EC4899", "#14B8A6", "#A855F7", "#F97316", "#06B6D4", "#84CC16", "#F43F5E", "#6366F1"];
const LEVEL_SORT: Record<string, number> = { A: 0, B: 1, C: 2, D: 3, "40+": 4 };

const FORBIDDEN_NAME = /^(not shown|opponent)$/i;

/** Load a parsed report into one league at a rink. Call inside a transaction. */
export async function loadReport(tx: Tx, rinkId: number, p: Parsed): Promise<ImportSummary> {
  if (!p.level && !p.leagueName) throw new HttpError(400, "The report doesn't say which league (for example \"LEAGUE C League | LEVEL C\").");
  const warnings: string[] = [];
  // Find the league by level (or exact name); a league the rink runs that isn't here yet is created.
  let league = p.level
    ? await one<any>(tx, "SELECT * FROM leagues WHERE rink_id=$1 AND level=$2", [rinkId, p.level])
    : await one<any>(tx, "SELECT * FROM leagues WHERE rink_id=$1 AND lower(name)=lower($2)", [rinkId, p.leagueName]);
  let leagueCreated = false;
  if (!league) {
    const season = await seasonFor(tx, rinkId, null);
    const level = p.level ?? (p.leagueName!.replace(/\s*league$/i, "").slice(0, 12) || "C");
    league = await one<any>(tx, "INSERT INTO leagues (rink_id, level, name, season, sort) VALUES ($1,$2,$3,$4,$5) RETURNING *",
      [rinkId, level, p.leagueName ?? `${level} League`, season?.name ?? "", LEVEL_SORT[level] ?? 5]);
    leagueCreated = true;
  }
  const teams = await q<any>(tx, "SELECT id, name FROM teams WHERE league_id=$1", [league.id]);
  const teamsCreated: string[] = [];
  const matchCache = new Map<string, any>();
  const teamFor = (name: string) => {
    if (matchCache.has(name)) return matchCache.get(name);
    const best = teams.map((t) => ({ t, s: similarity(name, t.name) })).sort((a, b) => b.s - a.s)[0];
    const hit = best && best.s >= 0.7 ? best.t : null;
    matchCache.set(name, hit);
    return hit;
  };
  // Teams in the report that the league doesn't have yet are created (the preview shows them first).
  const sourceTeams = new Set<string>([...p.teamRows.map((r) => r.team), ...Object.keys(p.rosters), ...p.games.flatMap((g) => [g.home, g.away]), ...p.totals.map((r) => r.team)]);
  sourceTeams.delete("Opponent");
  for (const s of sourceTeams) {
    if (teamFor(s) || !s.trim() || FORBIDDEN_NAME.test(s)) continue;
    const name = s.trim().slice(0, 50);
    const t = await one<any>(tx, "INSERT INTO teams (league_id, name, color, is_sample) VALUES ($1,$2,$3,0) RETURNING id, name", [league.id, name, PALETTE[(teams.length) % PALETTE.length]]);
    teams.push(t);
    matchCache.set(s, t);
    teamsCreated.push(name);
  }
  const teamsOut = [...sourceTeams].map((s) => {
    const t = teamFor(s);
    return { source: s, team: t?.name ?? "not matched", score: t ? Math.round(similarity(s, t.name) * 100) / 100 : 0 };
  });

  // Roster spots, by team. Names already arrive as first name and last initial.
  const slotCache = new Map<string, number>();
  let rosterAdded = 0, rosterExisting = 0;
  const slot = async (teamId: number, name: string, create: boolean) => {
    const key = `${teamId}|${name.toLowerCase()}`;
    if (slotCache.has(key)) return slotCache.get(key)!;
    const found = await one<{ id: number }>(tx,
      `SELECT p.id FROM roster_entries re JOIN players p ON p.id=re.player_id
       WHERE re.team_id=$1 AND (lower(p.name)=lower($2) OR lower(p.display_name)=lower($2) OR lower(rtrim(p.name,'.'))=lower(rtrim($2,'.'))) LIMIT 1`, [teamId, name]);
    if (found) { slotCache.set(key, found.id); if (create) rosterExisting++; return found.id; }
    if (!create) return null;
    const start = LEVEL_START[league.level] ?? 3.8;
    const id = (await one<{ id: number }>(tx,
      "INSERT INTO players (name,name_key,position,rating,start_rating,display_name) VALUES ($1,$2,'F',$3,$3,$4) RETURNING id",
      [name, nameKey(name), start, obfuscate(name)]))!.id;
    await q(tx, "INSERT INTO roster_entries (team_id,player_id,number,source,added_at) VALUES ($1,$2,NULL,'import',now())", [teamId, id]);
    slotCache.set(key, id);
    rosterAdded++;
    return id;
  };
  for (const [src, names] of Object.entries(p.rosters)) {
    const t = teamFor(src);
    if (!t) continue;
    for (const n of names) {
      if (!n || FORBIDDEN_NAME.test(n)) continue;
      const pid = await slot(t.id, n, true);
      if (pid && p.goalies.includes(`${src}|${n}`)) await q(tx, "UPDATE players SET position='G' WHERE id=$1 AND user_id IS NULL", [pid]);
    }
  }

  // Games.
  let gamesAdded = 0, gamesUpdated = 0, lines = 0;
  const gamesSkipped: ImportSummary["gamesSkipped"] = [];
  const unassigned: ImportSummary["unassigned"] = [];
  for (const g of p.games) {
    const home = teamFor(g.home), away = teamFor(g.away);
    if (!home || !away) { gamesSkipped.push({ date: g.date, why: "a team didn't match" }); continue; }
    if (home.id === away.id) { gamesSkipped.push({ date: g.date, why: "both sides matched the same team" }); continue; }
    const existing = await one<any>(tx,
      "SELECT id, source FROM games WHERE played_on=$1 AND ((home_team_id=$2 AND away_team_id=$3) OR (home_team_id=$3 AND away_team_id=$2))",
      [g.date, home.id, away.id]);
    if (existing?.source === "sheet") { gamesSkipped.push({ date: g.date, why: "a scanned sheet already has this game" }); continue; }
    const season = await seasonFor(tx, rinkId, g.date);
    // Rows say which team, or "Opponent" for the team the report isn't about.
    const mine = teamFor(p.teamName ?? "");
    const rowTeam = (r: PRow) => (r.team.toLowerCase() === "opponent" ? (mine?.id === home.id ? away : home) : teamFor(r.team));
    const credited = { home: 0, away: 0 };
    for (const r of g.rows) {
      const t = rowTeam(r);
      if (t) credited[t.id === home.id ? "home" : "away"] += r.g;
    }
    const un = { home: Math.max(0, g.homeScore - credited.home), away: Math.max(0, g.awayScore - credited.away) };
    let gameId: number;
    const vals = [league.id, season?.id ?? null, home.id, away.id, g.date, g.time, g.homeScore, g.awayScore, JSON.stringify(un)];
    if (existing) {
      gameId = existing.id;
      await q(tx, `UPDATE games SET league_id=$1, season_id=$2, home_team_id=$3, away_team_id=$4, played_on=$5, start_time=$6, home_score=$7, away_score=$8, unassigned_json=$9 WHERE id=$10`, [...vals, gameId]);
      await q(tx, "DELETE FROM imported_game_lines WHERE game_id=$1", [gameId]);
      gamesUpdated++;
    } else {
      gameId = (await one<{ id: number }>(tx,
        `INSERT INTO games (league_id,season_id,home_team_id,away_team_id,played_on,start_time,home_score,away_score,unassigned_json,source,periods_json,goals_json,penalties_json,shots_json)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,'daysmart','{}','{}','{}','{}') RETURNING id`, vals))!.id;
      gamesAdded++;
    }
    for (const r of g.rows) {
      if (!r.g && !r.a) continue;
      const team = rowTeam(r);
      if (!team) continue;
      const pid = await slot(team.id, r.name, true);
      if (!pid) continue;
      await q(tx,
        `INSERT INTO imported_game_lines (game_id,player_id,team_id,goals,assists) VALUES ($1,$2,$3,$4,$5)
         ON CONFLICT (game_id,player_id) DO UPDATE SET goals=imported_game_lines.goals+EXCLUDED.goals, assists=imported_game_lines.assists+EXCLUDED.assists`,
        [gameId, pid, team.id, r.g, r.a]);
      lines++;
    }
    if (un.home) unassigned.push({ date: g.date, team: home.name, goals: un.home });
    if (un.away) unassigned.push({ date: g.date, team: away.name, goals: un.away });
  }

  // Standings and player season totals from the league pages replace this season's earlier baselines.
  const nowSeason = await seasonFor(tx, rinkId, p.games.map((g) => g.date).sort().at(-1) ?? null);
  const asOf = new Date().toISOString().slice(0, 10);
  let standingsRows = 0, playerTotals = 0;
  for (const r of p.teamRows) {
    const t = teamFor(r.team);
    if (!t) continue;
    await q(tx, "DELETE FROM team_imports WHERE team_id=$1 AND season_id IS NOT DISTINCT FROM $2", [t.id, nowSeason?.id ?? null]);
    // A team's season record minus games already scanned, so scanned games aren't counted twice.
    const sc = await one<any>(tx, `SELECT COUNT(*)::int n,
        COALESCE(SUM(CASE WHEN (home_team_id=$1 AND home_score>away_score) OR (away_team_id=$1 AND away_score>home_score) THEN 1 ELSE 0 END),0)::int w,
        COALESCE(SUM(CASE WHEN (home_team_id=$1 AND home_score<away_score) OR (away_team_id=$1 AND away_score<home_score) THEN 1 ELSE 0 END),0)::int l,
        COALESCE(SUM(CASE WHEN home_team_id=$1 THEN home_score ELSE away_score END),0)::int gf,
        COALESCE(SUM(CASE WHEN home_team_id=$1 THEN away_score ELSE home_score END),0)::int ga
      FROM games WHERE source='sheet' AND (home_team_id=$1 OR away_team_id=$1) AND season_id IS NOT DISTINCT FROM $2`, [t.id, nowSeason?.id ?? null]);
    const ties = sc.n - sc.w - sc.l;
    await q(tx, "INSERT INTO team_imports (team_id,season_id,gp,w,l,t,otl,gf,ga,as_of,source) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,'DaySmart league standings')",
      [t.id, nowSeason?.id ?? null, Math.max(0, r.gp - sc.n), Math.max(0, r.w - sc.w), Math.max(0, r.l - sc.l), Math.max(0, r.t - ties), r.otl,
        r.gf == null ? null : Math.max(0, r.gf - sc.gf), r.ga == null ? null : Math.max(0, r.ga - sc.ga), asOf]);
    standingsRows++;
  }
  for (const r of p.totals) {
    const t = teamFor(r.team);
    if (!t || FORBIDDEN_NAME.test(r.name)) continue;
    const pid = await slot(t.id, r.name, true);
    if (!pid) continue;
    const sc = await one<any>(tx, `SELECT COUNT(*)::int gp, COALESCE(SUM(s.goals),0)::int g, COALESCE(SUM(s.assists),0)::int a, COALESCE(SUM(s.pim),0)::int pim
      FROM player_game_stats s JOIN games g ON g.id=s.game_id WHERE s.player_id=$1 AND s.team_id=$2 AND g.season_id IS NOT DISTINCT FROM $3`, [pid, t.id, nowSeason?.id ?? null]);
    await q(tx, "DELETE FROM player_imports WHERE player_id=$1 AND team_id=$2 AND season_id IS NOT DISTINCT FROM $3", [pid, t.id, nowSeason?.id ?? null]);
    await q(tx, "INSERT INTO player_imports (player_id,team_id,season_id,gp,g,a,pim,as_of,source) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,'DaySmart league stats')",
      [pid, t.id, nowSeason?.id ?? null, Math.max(0, r.gp - sc.gp), Math.max(0, r.g - sc.g), Math.max(0, r.a - sc.a), Math.max(0, r.pim - sc.pim), asOf]);
    playerTotals++;
  }
  await refreshDisplays(tx);
  return { league: league.name, teams: teamsOut, rosterAdded, rosterExisting, gamesAdded, gamesUpdated, gamesSkipped, lines, unassigned, warnings, leagueCreated, teamsCreated, standingsRows, playerTotals };
}
