import "server-only";
// Data for Rink Desk pages that read across a whole rink: the roster table, import history and
// the ratings overview. Each one only returns leagues the staff member can work on.
import { one, q, type Tx } from "./db";
import { HttpError } from "./services";
import * as P from "./permissions";
import { applyViewerNames } from "./accounts";

/** The season running today at a rink, else the latest one. */
export async function currentSeason(db: Tx, rinkId: number) {
  const today = new Date().toISOString().slice(0, 10);
  return (await one<{ id: number; name: string }>(db,
    "SELECT id, name FROM seasons WHERE rink_id=$1 AND starts_on <= $2 AND (ends_on IS NULL OR ends_on >= $2) ORDER BY starts_on DESC LIMIT 1", [rinkId, today]))
    ?? (await one<{ id: number; name: string }>(db, "SELECT id, name FROM seasons WHERE rink_id=$1 ORDER BY starts_on DESC LIMIT 1", [rinkId]))
    ?? null;
}

/** Leagues at a rink this person can act on for the given action. */
async function leaguesFor(db: Tx, user: any, rinkId: number, action: P.Action) {
  const rink = await one<{ id: number; name: string }>(db, "SELECT id, name FROM rinks WHERE id=$1", [rinkId]);
  if (!rink) throw new HttpError(404, "Rink not found.");
  const all = await q<{ id: number; name: string; level: string }>(db,
    "SELECT id, name, level FROM leagues WHERE rink_id=$1 AND archived_at IS NULL AND level NOT IN ('DEMO','TOURN') ORDER BY sort", [rinkId]);
  const out = [];
  for (const l of all) if (await P.can(db, user, action, { leagueId: l.id, rinkId })) out.push(l);
  if (!out.length) throw new HttpError(403, "Rink Desk is for this rink's staff.");
  return { rink, leagues: out };
}

/** Every roster spot at the rink, one row per player per team, with this season's numbers. */
export async function rosterTable(db: Tx, user: any, rinkId: number) {
  const { rink, leagues } = await leaguesFor(db, user, rinkId, "game.resolve");
  const season = await currentSeason(db, rinkId);
  const ids = leagues.map((l) => l.id);
  const rows = await q<any>(db,
    `SELECT re.player_id AS id, p.name, p.position, re.number, re.is_sub, re.source,
       t.id AS team_id, t.name AS team, t.color, l.id AS league_id, l.level, l.name AS league,
       p.user_id IS NOT NULL AS registered, COALESCE(u.status, 'active') AS status,
       ROUND(p.rating::numeric, 2) AS rating, p.games_rated,
       (SELECT g.role FROM role_grants g WHERE g.user_id=p.user_id AND g.scope_type='team' AND g.scope_id=t.id AND g.revoked_at IS NULL ORDER BY g.role='captain' DESC LIMIT 1) AS team_role,
       COALESCE(pi.gp, 0)::int + COALESCE(sh.gp, 0)::int AS gp,
       COALESCE(pi.g, 0)::int + COALESCE(sh.g, 0)::int AS g,
       COALESCE(pi.a, 0)::int + COALESCE(sh.a, 0)::int AS a
     FROM roster_entries re
     JOIN players p ON p.id=re.player_id
     JOIN teams t ON t.id=re.team_id
     JOIN leagues l ON l.id=t.league_id
     LEFT JOIN users u ON u.id=p.user_id
     LEFT JOIN LATERAL (
       SELECT SUM(i.gp) gp, SUM(i.g) g, SUM(i.a) a FROM player_imports i
       WHERE i.player_id=p.id AND i.team_id=t.id AND ($2::int IS NULL OR i.season_id=$2)
     ) pi ON true
     LEFT JOIN LATERAL (
       SELECT COUNT(*) gp, SUM(s.goals) g, SUM(s.assists) a FROM player_game_stats s JOIN games gm ON gm.id=s.game_id
       WHERE s.player_id=p.id AND s.team_id=t.id AND gm.source='sheet' AND ($2::int IS NULL OR gm.season_id=$2)
     ) sh ON true
     WHERE l.id = ANY($1::int[]) AND t.archived_at IS NULL AND COALESCE(t.is_sample,0)=0
     ORDER BY l.sort, t.name, p.display_name`, [ids, season?.id ?? null]);
  const named = await applyViewerNames(db, user, rows, "id");
  const teams = await q<any>(db,
    `SELECT t.id, t.name, t.color, t.league_id FROM teams t WHERE t.league_id = ANY($1::int[]) AND t.archived_at IS NULL AND COALESCE(t.is_sample,0)=0 ORDER BY t.name`, [ids]);
  const canRoster: number[] = [];
  for (const t of teams) if (await P.can(db, user, "roster.manage", { teamId: t.id, leagueId: t.league_id, rinkId })) canRoster.push(t.id);
  return {
    rink, season, leagues, teams: teams.map((t) => ({ ...t, canEdit: canRoster.includes(t.id) })),
    rows: named.map((r) => ({
      id: r.id, name: r.name, position: r.position, number: r.number, sub: r.is_sub, teamId: r.team_id, team: r.team, color: r.color,
      leagueId: r.league_id, level: r.level, league: r.league, registered: r.registered, status: r.status, teamRole: r.team_role,
      rating: r.rating == null ? null : Number(r.rating), gamesRated: r.games_rated, gp: r.gp, g: r.g, a: r.a, pts: r.g + r.a,
    })),
  };
}

/** DaySmart imports at this rink, newest first, from the audit log. */
export async function importHistory(db: Tx, user: any, rinkId: number) {
  await P.require_(db, user, "rink.manage", { rinkId });
  return q<any>(db,
    `SELECT a.id, a.created_at, a.after_json, u.name AS who
     FROM audit_log a LEFT JOIN users u ON u.id=a.actor_user_id
     WHERE a.action='import.daysmart' AND a.rink_id=$1 ORDER BY a.created_at DESC LIMIT 25`, [rinkId])
    .then((rows) => rows.map((r) => ({ id: r.id, at: r.created_at, who: r.who, ...(r.after_json ? JSON.parse(r.after_json) : {}) })));
}

/** How ratings look per league: spread, how many are rated, who moved most in the last month. */
export async function ratingsOverview(db: Tx, user: any, rinkId: number) {
  const { rink, leagues } = await leaguesFor(db, user, rinkId, "game.resolve");
  const since = new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10);
  const out = [];
  for (const l of leagues) {
    const players = await q<any>(db,
      `SELECT DISTINCT p.id, p.name, p.position, p.rating, p.games_rated,
         (p.position IS DISTINCT FROM 'G' AND COALESCE((SELECT SUM(gp) FROM player_imports i WHERE i.player_id=p.id),0) > 0) AS season_rated
       FROM roster_entries re JOIN players p ON p.id=re.player_id JOIN teams t ON t.id=re.team_id
       WHERE t.league_id=$1 AND t.archived_at IS NULL AND COALESCE(t.is_sample,0)=0`, [l.id]);
    const rated = players.filter((p) => p.games_rated > 0 || p.season_rated);
    const vals = rated.map((p) => Number(p.rating)).filter(Number.isFinite);
    const buckets: { from: number; n: number }[] = [];
    for (let x = 1; x < 7; x += 0.25) buckets.push({ from: Math.round(x * 100) / 100, n: vals.filter((v) => v >= x && v < x + 0.25).length });
    const lo = buckets.findIndex((b) => b.n), hi = buckets.length - 1 - [...buckets].reverse().findIndex((b) => b.n);
    const movers = await q<any>(db,
      `SELECT rh.player_id AS id, p.name, ROUND(SUM(rh.after - rh.before)::numeric, 2) AS delta, COUNT(*)::int AS games
       FROM rating_history rh JOIN games g ON g.id=rh.game_id JOIN players p ON p.id=rh.player_id
       WHERE g.league_id=$1 AND g.played_on >= $2 GROUP BY rh.player_id, p.name
       ORDER BY ABS(SUM(rh.after - rh.before)) DESC LIMIT 6`, [l.id, since]);
    const games = await one<any>(db,
      `SELECT COUNT(*)::int AS total,
         COUNT(*) FILTER (WHERE source='sheet' OR EXISTS (SELECT 1 FROM imported_game_attendance a WHERE a.game_id=games.id))::int AS rated
       FROM games WHERE league_id=$1`, [l.id]);
    out.push({
      ...l,
      players: players.length, rated: rated.length,
      average: vals.length ? Math.round((vals.reduce((s, v) => s + v, 0) / vals.length) * 100) / 100 : null,
      spread: lo >= 0 ? buckets.slice(lo, hi + 1) : [],
      movers: await applyViewerNames(db, user, movers.map((m) => ({ ...m, delta: Number(m.delta) })), "id"),
      games: games?.total ?? 0, ratedGames: games?.rated ?? 0,
    });
  }
  const last = await one<any>(db, "SELECT kind, games, ms, created_at FROM rating_runs ORDER BY id DESC LIMIT 1");
  return { rink, leagues: out, lastRun: last ?? null, canRecompute: await P.can(db, user, "ratings.recompute") };
}

/** Scoresheets for one rink: open scans to check, and the last month of confirmed or discarded ones.
 *  A scan belongs to a rink through the league a player sent it to, else the league its teams match.
 *  Scans no league could be matched to show at every rink the person staffs, marked unsorted. */
export async function sheetQueue(db: Tx, user: any, rinkId: number) {
  const { suggest } = await import("./services");
  const { rink, leagues } = await leaguesFor(db, user, rinkId, "sheet.confirm");
  const mine = new Map(leagues.map((l) => [l.id, l]));
  const rows = await q<any>(db,
    `SELECT s.id, s.status, s.source, s.extracted_json, s.warnings_json, s.proposed_json, s.game_id, s.created_at, s.submitted_at,
       u.name AS scanned_by, sb.name AS submitted_by, g.league_id AS game_league
     FROM sheets s
     LEFT JOIN users u ON u.id=s.scanned_by
     LEFT JOIN users sb ON sb.id=s.submitted_by
     LEFT JOIN games g ON g.id=s.game_id
     WHERE COALESCE(s.source,'upload') <> 'sample'
       AND (s.status IN ('processing','review','awaiting','failed') AND s.game_id IS NULL
            OR s.created_at > now() - interval '30 days')
     ORDER BY s.id DESC LIMIT 200`);
  const open: any[] = [];
  const done: any[] = [];
  for (const s of rows) {
    const data = s.extracted_json ? JSON.parse(s.extracted_json) : null;
    const proposal = s.proposed_json ? JSON.parse(s.proposed_json) : null;
    const isOpen = !s.game_id && ["processing", "review", "awaiting", "failed"].includes(s.status);
    let leagueId: number | null = s.game_league ?? proposal?.leagueId ?? null;
    let duplicate: number | null = null;
    if (isOpen && data?.is_scoresheet !== false && data && s.status !== "processing") {
      const sug = await suggest(db, proposal?.data ?? data);
      leagueId = leagueId ?? sug.leagueId;
      duplicate = sug.duplicateGameId;
    }
    if (leagueId != null && !mine.has(leagueId)) continue;
    if (leagueId == null && !isOpen) continue;
    const d = proposal?.data ?? data;
    const total = (t: any) => (t ? t.total ?? t.goals?.length ?? null : null);
    const row = {
      id: s.id, status: s.status === "discarded" ? "discarded" : s.game_id ? "confirmed" : data?.is_scoresheet === false ? "failed" : s.status,
      createdAt: s.created_at, scannedBy: s.scanned_by, submittedBy: s.submitted_by, gameId: s.game_id,
      level: leagueId != null ? mine.get(leagueId)!.level : null, leagueId,
      home: d?.home?.name ?? null, away: d?.away?.name ?? null,
      homeScore: total(d?.home), awayScore: total(d?.away), date: d?.date ?? null,
      confidence: d?.confidence ?? null,
      warnings: s.warnings_json ? JSON.parse(s.warnings_json).length : 0,
      duplicate,
    };
    (isOpen ? open : done).push(row);
  }
  return { rink, leagues, open: open.reverse(), done: done.slice(0, 60) };
}

/** Teams at a rink this person can manage the roster of: all of them for staff, their own for captains. */
async function teamsFor(db: Tx, user: any, rinkId: number) {
  const rink = await one<{ id: number; name: string }>(db, "SELECT id, name FROM rinks WHERE id=$1", [rinkId]);
  if (!rink) throw new HttpError(404, "Rink not found.");
  const all = await q<any>(db,
    `SELECT t.id, t.name, t.color, l.id AS league_id, l.level, l.name AS league
     FROM teams t JOIN leagues l ON l.id=t.league_id
     WHERE l.rink_id=$1 AND l.archived_at IS NULL AND l.level NOT IN ('DEMO','TOURN')
       AND t.archived_at IS NULL AND COALESCE(t.is_sample,0)=0
     ORDER BY l.sort, t.name`, [rinkId]);
  const out = [];
  for (const t of all) if (await P.can(db, user, "roster.manage", { teamId: t.id, leagueId: t.league_id, rinkId })) out.push(t);
  if (!out.length) throw new HttpError(403, "This page is for the rink's staff and team captains.");
  return { rink, teams: out };
}

/** How far each team has got signing up: roster joined, the captain, and the team's invite link. */
export async function joinProgress(db: Tx, user: any, rinkId: number) {
  const { rink, teams } = await teamsFor(db, user, rinkId);
  const ids = teams.map((t) => t.id);
  const counts = await q<any>(db,
    `SELECT re.team_id, COUNT(*)::int AS roster, COUNT(p.user_id)::int AS joined,
       MAX(u.created_at) AS last_joined
     FROM roster_entries re JOIN players p ON p.id=re.player_id LEFT JOIN users u ON u.id=p.user_id
     WHERE re.team_id = ANY($1::int[]) AND NOT COALESCE(re.is_sub, false)
     GROUP BY re.team_id`, [ids]);
  const captains = await q<any>(db,
    `SELECT g.scope_id AS team_id, g.role, u.id AS user_id, u.name
     FROM role_grants g JOIN users u ON u.id=g.user_id
     WHERE g.scope_type='team' AND g.scope_id = ANY($1::int[]) AND g.role IN ('captain','assistant_captain') AND g.revoked_at IS NULL
     ORDER BY g.role='captain' DESC, u.name`, [ids]);
  const invites = await q<any>(db,
    `SELECT DISTINCT ON (team_id) team_id, uses, max_uses, created_at
     FROM team_invites WHERE team_id = ANY($1::int[]) AND revoked_at IS NULL AND uses < max_uses
     ORDER BY team_id, created_at DESC`, [ids]);
  const rows = teams.map((t) => {
    const c = counts.find((x) => x.team_id === t.id);
    const caps = captains.filter((x) => x.team_id === t.id);
    const inv = invites.find((x) => x.team_id === t.id);
    const roster = c?.roster ?? 0, joined = c?.joined ?? 0;
    const step = !caps.some((x) => x.role === "captain") ? "captain" : !inv ? "link" : joined < roster ? "joining" : "done";
    return {
      id: t.id, name: t.name, color: t.color, leagueId: t.league_id, level: t.level, league: t.league,
      roster, joined, lastJoined: c?.last_joined ?? null,
      captain: caps.find((x) => x.role === "captain")?.name ?? null,
      assistants: caps.filter((x) => x.role === "assistant_captain").map((x) => x.name),
      invite: inv ? { uses: inv.uses, maxUses: inv.max_uses, createdAt: inv.created_at } : null,
      step,
    };
  });
  const roster = rows.reduce((n, r) => n + r.roster, 0), joined = rows.reduce((n, r) => n + r.joined, 0);
  return { rink, teams: rows, totals: { teams: rows.length, roster, joined, noCaptain: rows.filter((r) => r.step === "captain").length, noLink: rows.filter((r) => r.step === "link").length } };
}
