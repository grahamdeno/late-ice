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
}

const FORBIDDEN_NAME = /^(not shown|opponent)$/i;

/** Load a parsed report into one league at a rink. Call inside a transaction. */
export async function loadReport(tx: Tx, rinkId: number, p: Parsed): Promise<ImportSummary> {
  if (!p.level) throw new HttpError(400, "The report doesn't say which league (for example \"C League\").");
  const league = await one<any>(tx, "SELECT * FROM leagues WHERE rink_id=$1 AND level=$2", [rinkId, p.level]);
  if (!league) throw new HttpError(400, `No ${p.level} league at this rink.`);
  const teams = await q<any>(tx, "SELECT id, name FROM teams WHERE league_id=$1", [league.id]);
  const warnings: string[] = [];
  const matchCache = new Map<string, any>();
  const teamFor = (name: string) => {
    if (matchCache.has(name)) return matchCache.get(name);
    const best = teams.map((t) => ({ t, s: similarity(name, t.name) })).sort((a, b) => b.s - a.s)[0];
    const hit = best && best.s >= 0.7 ? best.t : null;
    matchCache.set(name, hit);
    return hit;
  };
  const sourceTeams = new Set<string>([...Object.keys(p.rosters), ...p.games.flatMap((g) => [g.home, g.away])]);
  const teamsOut = [...sourceTeams].map((s) => {
    const t = teamFor(s);
    if (!t) warnings.push(`"${s}" doesn't match a team in the ${league.name}; skipped.`);
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
    for (const n of names) if (n && !FORBIDDEN_NAME.test(n)) await slot(t.id, n, true);
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
  await refreshDisplays(tx);
  return { league: league.name, teams: teamsOut, rosterAdded, rosterExisting, gamesAdded, gamesUpdated, gamesSkipped, lines, unassigned, warnings };
}
