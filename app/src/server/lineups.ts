import "server-only";
// Lineups for imported (DaySmart) games. DaySmart sends the score and who got points, not who
// dressed, so a game is only rated for a team once someone records that team's lineup here.
// Rows live in imported_game_attendance (one per player per game). Totals and games played
// never change: those still come from the rink's posted numbers.
import { one, q, type Tx } from "./db";
import { HttpError } from "./services";
import * as P from "./permissions";
import { applyViewerNames } from "./accounts";

/** Imported games per team at a rink, and how many already have this team's lineup. */
export async function gapsForRink(db: Tx, user: any, rinkId: number) {
  const rows = await q<any>(db,
    `SELECT t.id AS team_id, t.name, t.color, t.league_id, l.name AS league, l.level,
       COUNT(g.id)::int AS games,
       COUNT(g.id) FILTER (WHERE EXISTS (SELECT 1 FROM imported_game_attendance a WHERE a.game_id=g.id AND a.team_id=t.id))::int AS with_lineup
     FROM teams t
     JOIN leagues l ON l.id=t.league_id
     JOIN games g ON g.source<>'sheet' AND (g.home_team_id=t.id OR g.away_team_id=t.id)
     WHERE l.rink_id=$1 AND t.archived_at IS NULL AND l.archived_at IS NULL AND COALESCE(t.is_sample,0)=0
     GROUP BY t.id, l.id
     ORDER BY l.sort, t.name`, [rinkId]);
  const out = [];
  for (const r of rows) if (await P.can(db, user, "lineup.record", { teamId: r.team_id, leagueId: r.league_id, rinkId })) out.push(r);
  return out;
}

/** One team's imported games, its roster, and who is marked as having played each game. */
export async function teamLineups(db: Tx, user: any, teamId: number) {
  const team = await one<any>(db,
    `SELECT t.id, t.name, t.color, t.league_id, l.name AS league, l.level, l.rink_id, r.name AS rink
     FROM teams t JOIN leagues l ON l.id=t.league_id JOIN rinks r ON r.id=l.rink_id WHERE t.id=$1`, [teamId]);
  if (!team) throw new HttpError(404, "Team not found.");
  await P.require_(db, user, "lineup.record", { teamId, leagueId: team.league_id, rinkId: team.rink_id });

  const games = await q<any>(db,
    `SELECT g.id, g.played_on, g.start_time, g.home_team_id, g.away_team_id, g.home_score, g.away_score,
       o.name AS opponent, (g.home_team_id=$1) AS home
     FROM games g JOIN teams o ON o.id = CASE WHEN g.home_team_id=$1 THEN g.away_team_id ELSE g.home_team_id END
     WHERE g.source<>'sheet' AND (g.home_team_id=$1 OR g.away_team_id=$1)
     ORDER BY g.played_on DESC NULLS LAST, g.id DESC`, [teamId]);
  const ids = games.map((g) => g.id);
  const attendance = ids.length ? await q<{ game_id: number; player_id: number }>(db,
    "SELECT game_id, player_id FROM imported_game_attendance WHERE team_id=$1 AND game_id = ANY($2::int[])", [teamId, ids]) : [];
  const credited = ids.length ? await q<{ game_id: number; player_id: number; goals: number; assists: number }>(db,
    "SELECT game_id, player_id, goals, assists FROM imported_game_lines WHERE team_id=$1 AND game_id = ANY($2::int[])", [teamId, ids]) : [];

  // Everyone who could have played: the roster, plus anyone DaySmart credited for this team.
  const roster = await q<any>(db,
    `SELECT p.id, p.name, p.position, re.number
     FROM roster_entries re JOIN players p ON p.id=re.player_id WHERE re.team_id=$1
     UNION
     SELECT p.id, p.name, p.position, NULL FROM imported_game_lines il JOIN players p ON p.id=il.player_id
     WHERE il.team_id=$1 AND il.player_id NOT IN (SELECT player_id FROM roster_entries WHERE team_id=$1)`, [teamId]);
  const named = await applyViewerNames(db, user, roster.map((r) => ({ ...r })), "id");
  const players = named
    .map((p) => ({ id: p.id, name: p.name, position: p.position, number: p.number }))
    .sort((a, b) => Number(a.position === "G") - Number(b.position === "G") || String(a.name).localeCompare(String(b.name)));

  return {
    team,
    players,
    games: games.map((g) => {
      const us = g.home ? g.home_score : g.away_score;
      const them = g.home ? g.away_score : g.home_score;
      return {
        id: g.id, playedOn: g.played_on, startTime: g.start_time, opponent: g.opponent, home: g.home,
        us, them, result: us == null || them == null ? null : us > them ? "W" : us < them ? "L" : "T",
        lineup: attendance.filter((a) => a.game_id === g.id).map((a) => a.player_id),
        credited: credited.filter((c) => c.game_id === g.id).map((c) => ({ playerId: c.player_id, goals: c.goals, assists: c.assists })),
      };
    }),
  };
}

/**
 * Replace one team's lineup for one imported game. Players DaySmart credited with a point are
 * always kept: they played. An empty list clears the lineup, and the game goes back to unrated.
 */
export async function saveLineup(tx: Tx, user: any, teamId: number, gameId: number, playerIds: number[]) {
  const g = await one<any>(tx, "SELECT id, source, league_id, home_team_id, away_team_id FROM games WHERE id=$1", [gameId]);
  if (!g || (g.home_team_id !== teamId && g.away_team_id !== teamId)) throw new HttpError(404, "That game isn't one of this team's.");
  if (g.source === "sheet") throw new HttpError(400, "This game came from a scoresheet, which already lists who played.");
  const rinkId = (await one<{ rink_id: number }>(tx, "SELECT rink_id FROM leagues WHERE id=$1", [g.league_id]))?.rink_id;
  await P.require_(tx, user, "lineup.record", { teamId, leagueId: g.league_id, rinkId });

  const allowed = new Set((await q<{ id: number }>(tx,
    `SELECT player_id AS id FROM roster_entries WHERE team_id=$1
     UNION SELECT player_id FROM imported_game_lines WHERE team_id=$1`, [teamId])).map((r) => r.id));
  const credited = (await q<{ player_id: number }>(tx,
    "SELECT player_id FROM imported_game_lines WHERE game_id=$1 AND team_id=$2", [gameId, teamId])).map((r) => r.player_id);
  const wanted = [...new Set(playerIds.map(Number).filter((n) => Number.isInteger(n) && n > 0))];
  const stray = wanted.filter((id) => !allowed.has(id));
  if (stray.length) throw new HttpError(400, "Some of those players aren't on this team's roster.");
  const ids = wanted.length ? [...new Set([...wanted, ...credited])] : [];

  const before = (await q<{ player_id: number }>(tx,
    "SELECT player_id FROM imported_game_attendance WHERE game_id=$1 AND team_id=$2 ORDER BY player_id", [gameId, teamId])).map((r) => r.player_id);
  await q(tx, "DELETE FROM imported_game_attendance WHERE game_id=$1 AND team_id=$2", [gameId, teamId]);
  if (ids.length) {
    await q(tx,
      `INSERT INTO imported_game_attendance (game_id, player_id, team_id)
       SELECT $1, x, $2 FROM unnest($3::int[]) AS x ON CONFLICT (game_id, player_id) DO NOTHING`, [gameId, teamId, ids]);
  }
  const after = [...ids].sort((a, b) => a - b);
  const changed = before.join(",") !== after.join(",");
  if (changed) await P.audit(tx, user.id, "lineup.record", { type: "game", id: gameId, rinkId }, { teamId, players: before }, { teamId, players: after });
  return { saved: ids.length, changed };
}

/** Normalize a typed or pasted name: lowercase letters, digits and single spaces. */
export function norm(s: string) {
  return s.toLowerCase().normalize("NFKD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9# ]+/g, " ").replace(/\s+/g, " ").trim();
}

/**
 * Match pasted names (one per line, or comma separated) to a roster. Tries, in order: jersey
 * number ("#12" or "12"), full name, shown name ("S. L."), first name plus last initial, then
 * a first or last name that only one player has. Each player matches once.
 */
export function matchNames(text: string, roster: { id: number; name: string; display?: string | null; number?: string | null }[]) {
  const lines = text.split(/[\n,;]+/).map((l) => l.replace(/^\s*[-*\d.)]+\s+(?=\D)/, "").trim()).filter(Boolean);
  const people = roster.map((r) => {
    const full = norm(r.name || "");
    const parts = full.split(" ").filter((x) => x && x !== "#");
    const first = parts[0] ?? "";
    const last = parts.length > 1 ? parts[parts.length - 1] : "";
    return { id: r.id, full, first, last, display: norm(r.display || ""), short: last ? `${first} ${last[0]}` : first, initials: last ? `${first[0]} ${last[0]}` : "", number: (r.number ?? "").trim() };
  });
  const used = new Set<number>();
  const matched: { line: string; playerId: number }[] = [];
  const unmatched: string[] = [];
  const pick = (cands: typeof people) => {
    const free = cands.filter((c) => !used.has(c.id));
    return free.length === 1 ? free[0] : null;
  };
  for (const line of lines) {
    const n = norm(line);
    const num = n.match(/^#?\s*(\d{1,3})$/)?.[1];
    const hit =
      (num ? pick(people.filter((p) => p.number === num)) : null) ??
      pick(people.filter((p) => p.full === n)) ??
      pick(people.filter((p) => p.display && p.display === n)) ??
      pick(people.filter((p) => p.short === n)) ??
      pick(people.filter((p) => p.initials && p.initials === n)) ??
      pick(people.filter((p) => p.first === n)) ??
      pick(people.filter((p) => p.last && p.last === n));
    if (hit) { used.add(hit.id); matched.push({ line, playerId: hit.id }); } else unmatched.push(line);
  }
  return { matched, unmatched };
}

/** Pasted names for one team, matched against its roster (full names are used, never shown). */
export async function matchForTeam(db: Tx, user: any, teamId: number, text: string) {
  const team = await one<any>(db, "SELECT t.league_id, l.rink_id FROM teams t JOIN leagues l ON l.id=t.league_id WHERE t.id=$1", [teamId]);
  if (!team) throw new HttpError(404, "Team not found.");
  await P.require_(db, user, "lineup.record", { teamId, leagueId: team.league_id, rinkId: team.rink_id });
  const roster = await q<any>(db,
    `SELECT p.id, p.name, p.display_name AS display, re.number FROM roster_entries re JOIN players p ON p.id=re.player_id WHERE re.team_id=$1
     UNION SELECT p.id, p.name, p.display_name, NULL FROM imported_game_lines il JOIN players p ON p.id=il.player_id
     WHERE il.team_id=$1 AND il.player_id NOT IN (SELECT player_id FROM roster_entries WHERE team_id=$1)`, [teamId]);
  return matchNames(String(text ?? "").slice(0, 5000), roster);
}
