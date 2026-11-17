import "server-only";
import { one, q, type Tx } from "./db";
import { HttpError, standings, teamRecord } from "./services";
import { applyViewerNames, notify, publicInitials, requireTeam, suggestionsFor, teamOrThrow } from "./accounts";
import { goalieCorner } from "./career";
import { gameStars } from "./stars";
import { milestonesFor } from "./milestones";
import { minVotes } from "./archetypes";
import { logEvent } from "./appevents";
import * as P from "./permissions";
import { SIGN_IN_TO_SEE, wrapShareKey, wrapShareKeyValid } from "./visibility";
import * as C from "./wrapped-core";
import type { RecapCard } from "./wrapped-core";

/*
 * Season Wrapped (Fall Wrap, Epic A). Numbers are never stored: every recap is read from games, stat lines and
 * ratings when it is asked for, so a sheet confirmed after Wrapped opened updates the recap (A1). The only stored
 * state is season_wraps: that a team's Wrapped is open, who opened it, and the awards the captain hid (A4).
 *
 * Who sees what:
 *  - The signed-in player sees their own recap.
 *  - A recap link carries a signed key for that one player, team and season. Signed out, it opens that recap only,
 *    every name an initial form, no other team's name (A3, product rule 3).
 *  - Names always go through applyViewerNames (signed in) or initials (signed out); a hidden name never appears
 *    on anyone else's card, picture or page (product rule 5).
 */

const IN = (p: string) => `IN (SELECT jsonb_array_elements_text(${p}::text::jsonb)::int)`;
const today = () => new Date().toISOString().slice(0, 10);
const dayOf = (v: unknown) => (v ? new Date(v as any).toISOString().slice(0, 10) : null);

export interface Season { id: number; name: string; starts_on: string; ends_on: string; rink_id: number }

/* ---------- which season, and is it time ---------- */

/** The newest season in which this team has a game. Wrap the season wraps this one. */
export async function seasonOfTeam(db: Tx, teamId: number): Promise<Season | null> {
  return (await one<Season>(db,
    `SELECT s.id, s.name, s.starts_on, s.ends_on, s.rink_id FROM games g JOIN seasons s ON s.id=g.season_id
     WHERE (g.home_team_id=$1 OR g.away_team_id=$1) AND g.event_id IS NULL
     ORDER BY s.starts_on DESC, g.played_on DESC NULLS LAST, g.id DESC LIMIT 1`, [teamId])) ?? null;
}

/** A1: has this team earned an automatic Wrapped yet? */
export async function autoDecision(db: Tx, teamId: number, season: Season, now = today()) {
  const games = (await one<{ n: number }>(db,
    "SELECT COUNT(*)::int n FROM games WHERE (home_team_id=$1 OR away_team_id=$1) AND season_id=$2 AND event_id IS NULL", [teamId, season.id]))!.n;
  const sched = (await one<{ n: number; last: string | null }>(db,
    "SELECT COUNT(*)::int n, MAX(local_date) last FROM scheduled_games WHERE team_id=$1 AND kind='league' AND status='scheduled' AND local_date BETWEEN $2 AND $3",
    [teamId, season.starts_on, season.ends_on]))!;
  const after = sched.n > 0 && sched.last
    ? !!(await one(db, "SELECT 1 FROM games WHERE (home_team_id=$1 OR away_team_id=$1) AND season_id=$2 AND event_id IS NULL AND played_on >= $3 LIMIT 1", [teamId, season.id, sched.last]))
    : false;
  return C.autoOpen({ teamGames: games, scheduledCount: sched.n, lastScheduledDate: sched.last, resultOnOrAfterLast: after, seasonEndsOn: season.ends_on, today: now });
}

/** Open a team's Wrapped once. The one who inserts the row tells the players; a second call changes nothing. */
export async function openWrap(db: Tx, teamId: number, seasonId: number, openedBy: number | null) {
  const row = await one(db, "INSERT INTO season_wraps (team_id, season_id, opened_by) VALUES ($1,$2,$3) ON CONFLICT DO NOTHING RETURNING opened_at", [teamId, seasonId, openedBy]);
  if (!row) return false;
  await notifyWrapped(db, teamId, seasonId);
  return true;
}

/** One notice per signed-up player on the roster. Unclaimed spots have nobody to tell. */
async function notifyWrapped(db: Tx, teamId: number, seasonId: number) {
  const info = await one<any>(db, "SELECT t.name team, s.name season FROM teams t, seasons s WHERE t.id=$1 AND s.id=$2", [teamId, seasonId]);
  if (!info) return;
  const link = `/wrapped/${teamId}/${seasonId}`;
  const users = await q<{ user_id: number }>(db,
    "SELECT DISTINCT p.user_id FROM roster_entries re JOIN players p ON p.id=re.player_id WHERE re.team_id=$1 AND p.user_id IS NOT NULL", [teamId]);
  for (const u of users) {
    if (await one(db, "SELECT 1 FROM notifications WHERE user_id=$1 AND kind='wrapped' AND team_id=$2 AND link=$3", [u.user_id, teamId, link])) continue;
    await notify(db, u.user_id, { kind: "wrapped", title: `Your ${info.season} is wrapped`, body: `Tap through your season with ${info.team}.`, link, teamId });
  }
}

/** Open any of this person's teams whose season is over. Cheap when nothing is due; safe to call on every Home load. */
export async function ensureWraps(db: Tx, userId: number) {
  const teams = await q<{ team_id: number }>(db,
    `SELECT DISTINCT re.team_id FROM roster_entries re JOIN players p ON p.id=re.player_id JOIN teams t ON t.id=re.team_id
     WHERE p.user_id=$1 AND t.archived_at IS NULL`, [userId]);
  for (const t of teams) {
    const season = await seasonOfTeam(db, t.team_id);
    if (!season) continue;
    if (await one(db, "SELECT 1 FROM season_wraps WHERE team_id=$1 AND season_id=$2", [t.team_id, season.id])) continue;
    if ((await autoDecision(db, t.team_id, season)).open) await openWrap(db, t.team_id, season.id, null);
  }
}

/** The signed-in player's recaps, newest first. `home` is true for 14 days after it opened (A1). */
export async function myWraps(db: Tx, userId: number) {
  await ensureWraps(db, userId);
  const rows = await q<any>(db,
    `SELECT sw.team_id, sw.season_id, sw.opened_at, t.name team_name, t.color, s.name season_name, p.id player_id,
       (SELECT MAX(g.created_at) FROM games g WHERE (g.home_team_id=sw.team_id OR g.away_team_id=sw.team_id)
          AND g.season_id=sw.season_id AND g.event_id IS NULL AND g.created_at > sw.opened_at) updated_at
     FROM season_wraps sw JOIN teams t ON t.id=sw.team_id JOIN seasons s ON s.id=sw.season_id
     JOIN roster_entries re ON re.team_id=sw.team_id JOIN players p ON p.id=re.player_id AND p.user_id=$1
     ORDER BY sw.opened_at DESC, sw.team_id`, [userId]);
  return rows.map((r) => ({
    teamId: r.team_id as number, seasonId: r.season_id as number, playerId: r.player_id as number,
    teamName: r.team_name as string, color: r.color as string, seasonName: r.season_name as string,
    openedAt: new Date(r.opened_at).toISOString(), updatedOn: dayOf(r.updated_at),
    home: C.onHome(r.opened_at),
  }));
}

/* ---------- who may open a recap ---------- */

export interface Access { playerId: number; mode: "own" | "shared"; viewer: any | null }

export async function playerOnTeam(db: Tx, userId: number, teamId: number) {
  return (await one<{ id: number }>(db,
    "SELECT p.id FROM players p JOIN roster_entries re ON re.player_id=p.id WHERE p.user_id=$1 AND re.team_id=$2 ORDER BY re.id LIMIT 1", [userId, teamId]))?.id ?? null;
}

/**
 * A valid key for that player opens that recap, signed in or not. Otherwise you must be signed in and it must be yours.
 * The key belongs to one team, one season and one player: it opens nothing else.
 */
export async function recapAccess(db: Tx, viewer: any | null, teamId: number, seasonId: number, p: string | null, s: string | null): Promise<Access> {
  const asked = p == null || p === "" ? null : Number(p);
  const mine = viewer ? await playerOnTeam(db, viewer.id, teamId) : null;
  if (asked != null && Number.isInteger(asked) && asked > 0 && wrapShareKeyValid(teamId, seasonId, asked, s)) {
    return { playerId: asked, mode: mine === asked ? "own" : "shared", viewer };
  }
  if (!viewer) throw new HttpError(401, SIGN_IN_TO_SEE);
  if (!mine) throw new HttpError(403, "You aren't on this team's roster.");
  if (asked != null && asked !== mine) throw new HttpError(403, "That recap belongs to another player. Ask them to share it.");
  return { playerId: mine, mode: "own", viewer };
}

/* ---------- names ---------- */

/**
 * Names for a list of player ids. Signed in: applyViewerNames, the same rules as every other page. Signed out (a share
 * link): an initial form for everyone, and hidden players stay hidden. Never a name the viewer could not already see.
 */
export async function namesFor(db: Tx, viewer: any | null, playerIds: number[]): Promise<Map<number, string>> {
  const ids = [...new Set(playerIds.filter((n) => Number.isFinite(n) && n > 0))];
  const out = new Map<number, string>();
  if (!ids.length) return out;
  if (viewer) {
    for (const r of await applyViewerNames(db, viewer, ids.map((id) => ({ id, name: "" })), "id")) out.set(r.id, String(r.name));
    return out;
  }
  const meta = await q<any>(db,
    `SELECT p.id, p.name, (p.hidden=1 OR COALESCE(u.hidden,0)=1) hid,
       (SELECT re.number FROM roster_entries re WHERE re.player_id=p.id AND re.number IS NOT NULL AND re.number <> '' ORDER BY re.id LIMIT 1) number
     FROM players p LEFT JOIN users u ON u.id=p.user_id WHERE p.id ${IN("$1")}`, [JSON.stringify(ids)]);
  for (const m of meta) out.set(m.id, m.hid ? (m.number ? `Player #${m.number}` : "Hidden player") : publicInitials(m.name, m.number));
  return out;
}

/* ---------- shared queries ---------- */

/** A player's lines for one season, scanned and imported, one row per game. Same sources as the career page. */
const PLAYER_LINES = `
  SELECT x.player_id, x.game_id, x.team_id, x.goals, x.assists, x.is_goalie, x.goals_against, x.shots_against, x.has_stats,
    g.played_on, g.start_time, g.source, g.home_team_id, g.away_team_id, g.home_score, g.away_score,
    ht.name AS home_name, at.name AS away_name, COALESCE(re.is_sub, false) AS is_sub
  FROM (
    SELECT s.player_id, s.game_id, s.team_id, s.goals, s.assists, (s.is_goalie=1) AS is_goalie, s.goals_against, s.shots_against, true AS has_stats
      FROM player_game_stats s WHERE s.player_id ${IN("$1")}
    UNION ALL
    SELECT a.player_id, a.game_id, a.team_id, COALESCE(il.goals,0), COALESCE(il.assists,0), COALESCE(a.in_goal,false), NULL::int, NULL::int, (il.game_id IS NOT NULL)
      FROM imported_game_attendance a LEFT JOIN imported_game_lines il ON il.game_id=a.game_id AND il.player_id=a.player_id
      WHERE a.player_id ${IN("$1")}
    UNION ALL
    SELECT il.player_id, il.game_id, il.team_id, il.goals, il.assists, false, NULL::int, NULL::int, true
      FROM imported_game_lines il WHERE il.player_id ${IN("$1")}
        AND NOT EXISTS (SELECT 1 FROM imported_game_attendance a WHERE a.game_id=il.game_id AND a.player_id=il.player_id)
  ) x
  JOIN games g ON g.id=x.game_id AND g.season_id=$2 AND g.event_id IS NULL
  JOIN teams ht ON ht.id=g.home_team_id JOIN teams at ON at.id=g.away_team_id
  LEFT JOIN roster_entries re ON re.team_id=x.team_id AND re.player_id=x.player_id
  ORDER BY g.played_on NULLS FIRST, g.id`;

/** Goals and assists per player for one team in one season. */
async function teamTable(db: Tx, teamId: number, seasonId: number) {
  return q<{ id: number; g: number; a: number; pts: number }>(db,
    `SELECT z.player_id AS id, SUM(z.goals)::int g, SUM(z.assists)::int a, SUM(z.goals+z.assists)::int pts FROM (
       SELECT s.player_id, s.goals, s.assists FROM player_game_stats s JOIN games gm ON gm.id=s.game_id
         WHERE s.team_id=$1 AND gm.season_id=$2 AND gm.event_id IS NULL
       UNION ALL
       SELECT il.player_id, il.goals, il.assists FROM imported_game_lines il JOIN games gm ON gm.id=il.game_id
         WHERE il.team_id=$1 AND gm.season_id=$2 AND gm.event_id IS NULL
     ) z GROUP BY z.player_id`, [teamId, seasonId]);
}

/** How many times each player on this team was one of a game's three stars. */
async function starCounts(db: Tx, teamId: number, seasonId: number) {
  const roster = new Set((await q<{ player_id: number }>(db, "SELECT player_id FROM roster_entries WHERE team_id=$1", [teamId])).map((r) => r.player_id));
  const games = await q<{ id: number }>(db,
    "SELECT id FROM games WHERE (home_team_id=$1 OR away_team_id=$1) AND season_id=$2 AND event_id IS NULL ORDER BY id", [teamId, seasonId]);
  const counts = new Map<number, { first: number; second: number; third: number; total: number }>();
  for (let i = 0; i < games.length; i += 6) {
    const chunk = await Promise.all(games.slice(i, i + 6).map((g) => gameStars(db, g.id, null)));
    for (const s of chunk) s.stars.forEach((st: any, rank: number) => {
      if (!roster.has(st.player_id)) return;
      const c = counts.get(st.player_id) ?? { first: 0, second: 0, third: 0, total: 0 };
      if (rank === 0) c.first++; else if (rank === 1) c.second++; else c.third++;
      c.total++;
      counts.set(st.player_id, c);
    });
  }
  return counts;
}

/** The date of the newest game confirmed after the wrap opened, or null. A1: "Updated". */
async function updatedOn(db: Tx, teamId: number, seasonId: number, openedAt: Date | string) {
  const r = await one<any>(db,
    `SELECT MAX(created_at) AS latest FROM games WHERE (home_team_id=$1 OR away_team_id=$1) AND season_id=$2 AND event_id IS NULL AND created_at > $3`, [teamId, seasonId, openedAt]);
  return dayOf(r?.latest);
}

async function loadBase(db: Tx, teamId: number, seasonId: number) {
  const wrap = await one<any>(db, "SELECT * FROM season_wraps WHERE team_id=$1 AND season_id=$2", [teamId, seasonId]);
  if (!wrap) throw new HttpError(404, "This season isn't wrapped yet.");
  const team = await one<any>(db,
    `SELECT t.id, t.name, t.color, t.league_id, l.name league_name, l.rink_id, r.name rink_name
     FROM teams t JOIN leagues l ON l.id=t.league_id JOIN rinks r ON r.id=l.rink_id WHERE t.id=$1`, [teamId]);
  const season = await one<Season>(db, "SELECT id, name, starts_on, ends_on, rink_id FROM seasons WHERE id=$1", [seasonId]);
  if (!team || !season) throw new HttpError(404, "This season isn't wrapped yet.");
  return { wrap, team, season };
}

/* ---------- card 9 is Handoff B's ---------- */

/**
 * Card 9, "Back for Winter?". Handoff B (Roll call) fills this in. Until it lands this returns nothing, so no card 9
 * appears anywhere: not in the recap, the picture, or the screen.
 */
export async function rollCallCard(_db: Tx, _ctx: { teamId: number; seasonId: number; playerId: number; mode: "own" | "shared" }): Promise<RecapCard | null> {
  return null;
}

/* ---------- A2: one player's recap ---------- */

export async function buildRecap(db: Tx, a: Access, teamId: number, seasonId: number) {
  const { wrap, team, season } = await loadBase(db, teamId, seasonId);
  const me = await one<any>(db,
    `SELECT p.id, p.user_id, p.position, u.avatar, COALESCE(u.archetype_opt_out, false) AS opted_out
     FROM players p LEFT JOIN users u ON u.id=p.user_id WHERE p.id=$1`, [a.playerId]);
  const slot = me?.user_id ? await one<any>(db, "SELECT number FROM roster_entries WHERE team_id=$1 AND player_id=$2", [teamId, a.playerId]) : null;
  // Only a signed-up player has a recap; an unclaimed spot has nobody to show it to.
  if (!me?.user_id || !slot) throw new HttpError(404, "No recap for this player.");

  const mine = (await q<{ id: number }>(db, "SELECT id FROM players WHERE user_id=$1", [me.user_id])).map((r) => r.id);
  const mineJson = JSON.stringify(mine);

  const byGame = new Map<number, any>();
  for (const r of await q<any>(db, PLAYER_LINES, [mineJson, seasonId])) {
    const prev = byGame.get(r.game_id);
    if (!prev || (!prev.has_stats && r.has_stats)) byGame.set(r.game_id, r);
  }
  const rows = [...byGame.values()];
  const teamRows = rows.filter((r) => r.team_id === teamId);
  const statRows = teamRows.filter((r) => r.has_stats);

  const history = await q<any>(db,
    `SELECT rh.game_id, rh.before, rh.after FROM rating_history rh JOIN games g ON g.id=rh.game_id
     WHERE rh.player_id ${IN("$1")} AND g.season_id=$2 AND g.event_id IS NULL ORDER BY g.played_on NULLS FIRST, rh.id`, [mineJson, seasonId]);
  const delta = new Map<number, number>(history.map((h) => [h.game_id, h.after - h.before]));
  const arc = C.ratingArc(history);

  const best = rows.length >= C.SHORT_SEASON_GAMES
    ? C.bestNight(rows.filter((r) => r.has_stats).map((r) => ({ gameId: r.game_id, on: r.played_on, goals: r.goals, assists: r.assists, delta: delta.get(r.game_id) ?? null })))
    : null;

  // The room: an archetype the team voted for, and the three stars this player was named.
  const votes = await q<any>(db,
    `SELECT archetype, COUNT(*)::int n, MAX(updated_at) last FROM archetype_votes WHERE team_id=$1 AND season_id=$2 AND player_id=$3 GROUP BY archetype`,
    [teamId, seasonId, a.playerId]);
  const rosterSize = (await one<any>(db, "SELECT COUNT(*)::int n FROM roster_entries WHERE team_id=$1 AND NOT is_sub", [teamId]))?.n ?? 0;
  const won = me.opted_out ? null
    : votes.filter((v) => v.n >= minVotes(rosterSize)).sort((x, y) => y.n - x.n || +new Date(y.last) - +new Date(x.last))[0] ?? null;
  const stars = (await starCounts(db, teamId, seasonId)).get(a.playerId) ?? null;

  const gameIds = new Set(rows.map((r) => r.game_id));
  const seen = new Set<string>();
  const earned: any[] = [];
  for (const pid of mine) for (const m of await milestonesFor(db, pid)) {
    const inSeason = (m.gameId && gameIds.has(m.gameId)) || (m.earnedOn && m.earnedOn >= season.starts_on && m.earnedOn <= season.ends_on);
    if (inSeason && !seen.has(m.kind)) { seen.add(m.kind); earned.push(m); }
  }

  const plan = C.cardPlan({
    games: rows.length, statGames: statRows.length, ratedGames: history.length,
    hasBestNight: !!best, hasRoom: !!won || !!stars, milestones: earned.length,
  });
  const short = C.isShortSeason(rows.length);

  // Team numbers: leaders in each column, the record and the league finish.
  const table = await teamTable(db, teamId, seasonId);
  const pointsRank = C.rankByPoints(table.map((t) => ({ id: t.id, pts: t.pts })), a.playerId);
  const rec = await teamRecord(db, teamId, seasonId);
  const st = await standings(db, team.league_id, seasonId);
  const place = st.findIndex((x: any) => x.id === teamId);
  const top = (key: "g" | "a" | "pts") => C.leaders(table.map((t) => ({ id: t.id, value: t[key] })));
  const topG = top("g"), topA = top("a"), topP = top("pts");
  const names = await namesFor(db, a.viewer, [a.playerId, ...topG.map((t) => t.id), ...topA.map((t) => t.id), ...topP.map((t) => t.id)]);
  const who = (rows: { id: number }[]) => rows.map((r) => names.get(r.id) ?? "Player").join(", ");

  // Teams I played for: the games they had, so "N of M" is a share of the games I could have played.
  const myTeams = (await q<{ team_id: number }>(db,
    `SELECT DISTINCT re.team_id FROM roster_entries re JOIN teams t ON t.id=re.team_id JOIN leagues l ON l.id=t.league_id
     WHERE re.player_id ${IN("$1")} AND l.rink_id=$2`, [mineJson, season.rink_id])).map((r) => r.team_id);
  const teamGames = myTeams.length
    ? (await one<any>(db,
      `SELECT COUNT(*)::int n FROM games g WHERE g.season_id=$2 AND g.event_id IS NULL
         AND (g.home_team_id ${IN("$1")} OR g.away_team_id ${IN("$1")})`, [JSON.stringify(myTeams), seasonId]))!.n
    : rows.length;

  const own = a.mode === "own";
  const owner = names.get(a.playerId) ?? "Player";
  const card: Record<string, RecapCard> = {};

  card.cover = {
    kind: "cover", title: "Season Wrapped",
    headline: own ? `Your ${season.name}` : `${owner}'s ${season.name}`,
    lines: [team.name, team.rink_name, ...(short ? [C.SHORT_SEASON_LINE] : [])],
    data: { avatar: me.avatar ?? null, color: team.color, number: slot.number ?? null, position: me.position },
  };

  if (rows.length >= 1) {
    const nights = C.lateNights(rows.map((r) => ({ on: r.played_on, start: r.start_time })));
    const subbed = rows.filter((r) => r.is_sub).length;
    card.showed_up = {
      kind: "showed_up", title: "Showed up", headline: `${rows.length} of ${Math.max(teamGames, rows.length)} games`,
      lines: [
        ...(nights.text ? [`Latest puck drop: ${nights.text}`] : []),
        ...(nights.afterTen > 0 ? [`${C.plural(nights.afterTen, "game")} started after 10 pm`] : []),
        ...(subbed > 0 ? [`Subbed ${subbed} ${subbed === 1 ? "time" : "times"}`] : []),
      ],
    };
  }

  if (statRows.length >= 1) {
    const goalieRows = statRows.filter((r) => r.is_goalie);
    const imported = statRows.some((r) => r.source !== "sheet");
    const importedLine = imported ? [`Includes games from ${team.rink_name}'s posted results.`] : [];
    if ((me.position === "G" || goalieRows.length > 0) && goalieRows.length > 0) {
      const gc = goalieCorner(goalieRows.map((r) => ({ teamId: r.team_id, homeTeamId: r.home_team_id, homeScore: r.home_score, awayScore: r.away_score, goalsAgainst: r.goals_against, shotsAgainst: r.shots_against })));
      card.scoring = {
        kind: "scoring", title: "In goal", headline: `${gc.w}-${gc.l}-${gc.t}`,
        lines: [
          ...(gc.gaa != null ? [`${gc.gaa.toFixed(2)} goals against per game`] : []),
          ...(gc.shutouts > 0 ? [C.plural(gc.shutouts, "shutout")] : []),
          ...(gc.savePct != null ? [`${gc.savePct.toFixed(3).replace(/^0/, "")} save percentage`] : []),
          ...importedLine,
        ],
      };
    } else {
      const g = statRows.reduce((n, r) => n + r.goals, 0), as = statRows.reduce((n, r) => n + r.assists, 0);
      card.scoring = {
        kind: "scoring", title: "Scoring", headline: C.plural(g + as, "point"),
        lines: [
          `${C.plural(g, "goal")}, ${C.plural(as, "assist")}`,
          ...(pointsRank && pointsRank.of >= 2 ? [`${C.ordinal(pointsRank.rank)} of ${pointsRank.of} on the team`] : []),
          ...importedLine,
        ],
      };
    }
  }

  if (best && rows.length >= C.SHORT_SEASON_GAMES) {
    const r = byGame.get(best.gameId);
    const opp = r.team_id === r.home_team_id ? r.away_name : r.home_name;
    card.best_night = {
      kind: "best_night", title: "Best night",
      headline: best.by === "points" ? C.plural(best.goals + best.assists, "point") : `+${best.delta!.toFixed(2)} rating`,
      lines: [
        ...(best.by === "points" ? [`${C.plural(best.goals, "goal")}, ${C.plural(best.assists, "assist")}`] : []),
        // Another team's name is not part of this recap for a signed-out viewer (product rule 3).
        ...(a.viewer ? [`Against ${opp}`] : []),
        ...(C.shortDate(best.on) ? [C.shortDate(best.on)] : []),
      ],
    };
  }

  if (arc) {
    card.rating = {
      kind: "rating", title: "Your rating", headline: `${arc.start.toFixed(2)} to ${arc.finish.toFixed(2)}`,
      lines: [`Peak ${arc.peak.toFixed(2)}`, `${arc.games} rated games`],
      data: { series: history.map((h) => Math.round(h.after * 100) / 100) },
    };
  }

  if (won || stars) {
    card.room = {
      kind: "room", title: "The room",
      headline: won ? C.archetypeLabel(won.archetype) : C.plural(stars!.total, "three-star pick"),
      lines: [
        ...(won ? [`Voted by your teammates (${C.plural(won.n, "vote")})`] : []),
        ...(stars ? [`Named a three star ${C.plural(stars.total, "time")}`] : []),
        ...(stars && stars.first > 0 ? [`First star ${C.plural(stars.first, "time")}`] : []),
      ],
    };
  }

  if (earned.length) {
    card.milestones = {
      kind: "milestones", title: "Milestones", headline: C.plural(earned.length, "milestone"),
      lines: earned.slice(0, 6).map((m) => m.label),
    };
  }

  card.team = {
    kind: "team", title: "The team", headline: `${rec.w}-${rec.l}-${rec.t}`,
    lines: [
      ...(place >= 0 && st.length >= 2 ? [`${C.ordinal(place + 1)} of ${st.length} in ${team.league_name}`] : []),
      ...(topP.length ? [`Points: ${who(topP)} (${topP[0].value})`] : []),
      ...(topG.length ? [`Goals: ${who(topG)} (${topG[0].value})`] : []),
      ...(topA.length ? [`Assists: ${who(topA)} (${topA[0].value})`] : []),
    ],
  };

  const cards: RecapCard[] = plan.map((k) => card[k]).filter(Boolean);
  const nine = await rollCallCard(db, { teamId, seasonId, playerId: a.playerId, mode: a.mode });
  if (nine) cards.push(nine);

  return {
    mode: a.mode,
    team: { id: team.id, name: team.name, color: team.color, rink: team.rink_name },
    season: { id: season.id, name: season.name },
    playerId: a.playerId,
    openedAt: new Date(wrap.opened_at).toISOString(),
    updatedOn: await updatedOn(db, teamId, seasonId, wrap.opened_at),
    short, shortLine: short ? C.SHORT_SEASON_LINE : null,
    cards,
    alts: cards.map((c) => C.cardAlt(c)),
    cta: own ? null : await ctaFor(db, a.viewer, teamId),
    sharePath: own ? sharePath(teamId, seasonId, a.playerId) : null,
  };
}

export const sharePath = (teamId: number, seasonId: number, playerId: number) =>
  `/wrapped/${teamId}/${seasonId}?p=${playerId}&s=${wrapShareKey(teamId, seasonId, playerId)}`;
export const teamSharePath = (teamId: number, seasonId: number) =>
  `/wrapped/team/${teamId}/${seasonId}?s=${wrapShareKey(teamId, seasonId, 0)}`;

/** A3: "Claim your spot" when the viewer's invite or name matches this team, "Get Late Ice" otherwise. */
async function ctaFor(db: Tx, viewer: any | null, teamId: number): Promise<"claim" | "get"> {
  if (!viewer) return "get";
  if (viewer.invited_team_id === teamId) return "claim";
  const sug = await suggestionsFor(db, viewer);
  return sug.some((s: any) => s.team_id === teamId) ? "claim" : "get";
}

/** Count a view or a share once per person, team and day so a refresh doesn't pad the log. */
export async function logWrapEvent(db: Tx, userId: number, kind: "wrapped_open" | "wrapped_share", teamId: number) {
  if (kind === "wrapped_open" && await one(db, "SELECT 1 FROM app_events WHERE user_id=$1 AND kind=$2 AND team_id=$3 AND created_at > now() - interval '1 day' LIMIT 1", [userId, kind, teamId])) return;
  await logEvent(db, { userId, kind, teamId });
}

/* ---------- A4: the team wrap ---------- */

export interface TeamAccess { viewer: any | null; mode: "own" | "shared"; canManage: boolean }

export async function teamWrapAccess(db: Tx, viewer: any | null, teamId: number, seasonId: number, key: string | null): Promise<TeamAccess> {
  const canManage = viewer ? await P.can(db, viewer, "roster.manage", { teamId }) : false;
  if (wrapShareKeyValid(teamId, seasonId, 0, key)) return { viewer, mode: canManage ? "own" : "shared", canManage };
  if (!viewer) throw new HttpError(401, SIGN_IN_TO_SEE);
  if (!canManage && !(await playerOnTeam(db, viewer.id, teamId))) throw new HttpError(403, "You aren't on this team's roster.");
  return { viewer, mode: "own", canManage };
}

export async function buildTeamWrap(db: Tx, a: TeamAccess, teamId: number, seasonId: number) {
  const { wrap, team, season } = await loadBase(db, teamId, seasonId);
  const table = await teamTable(db, teamId, seasonId);
  const rec = await teamRecord(db, teamId, seasonId);
  const st = await standings(db, team.league_id, seasonId);
  const place = st.findIndex((x: any) => x.id === teamId);

  const played = await q<{ player_id: number; n: number }>(db,
    `SELECT x.player_id, COUNT(DISTINCT x.game_id)::int n FROM (
       SELECT s.player_id, s.game_id FROM player_game_stats s WHERE s.team_id=$1
       UNION ALL SELECT a.player_id, a.game_id FROM imported_game_attendance a WHERE a.team_id=$1
       UNION ALL SELECT il.player_id, il.game_id FROM imported_game_lines il WHERE il.team_id=$1
     ) x JOIN games g ON g.id=x.game_id WHERE g.season_id=$2 AND g.event_id IS NULL GROUP BY x.player_id`, [teamId, seasonId]);
  const stars = await starCounts(db, teamId, seasonId);
  const coolerRows = await q<{ player_id: number; n: number }>(db,
    `SELECT p.id AS player_id, COUNT(*)::int n FROM scheduled_games sg
       JOIN players p ON p.user_id=sg.cooler_user_id JOIN roster_entries re ON re.player_id=p.id AND re.team_id=sg.team_id
     WHERE sg.team_id=$1 AND sg.cooler_user_id IS NOT NULL AND sg.status='scheduled'
       AND sg.local_date BETWEEN $2 AND $3 AND sg.starts_at < now() GROUP BY p.id`, [teamId, season.starts_on, season.ends_on]);
  const goalieLines = await q<any>(db,
    `SELECT s.player_id, s.team_id, g.home_team_id, g.home_score, g.away_score, s.goals_against, s.shots_against
       FROM player_game_stats s JOIN games g ON g.id=s.game_id
       WHERE s.team_id=$1 AND g.season_id=$2 AND g.event_id IS NULL AND s.is_goalie=1
     UNION ALL
     SELECT a.player_id, a.team_id, g.home_team_id, g.home_score, g.away_score, NULL::int, NULL::int
       FROM imported_game_attendance a JOIN games g ON g.id=a.game_id
       WHERE a.team_id=$1 AND g.season_id=$2 AND g.event_id IS NULL AND a.in_goal`, [teamId, seasonId]);

  const topP = C.leaders(table.map((t) => ({ id: t.id, value: t.pts })));
  const topG = C.leaders(table.map((t) => ({ id: t.id, value: t.g })));
  const topStars = C.leaders([...stars].map(([id, c]) => ({ id, value: c.total })));
  const topIron = C.leaders(played.map((p) => ({ id: p.player_id, value: p.n })));
  const topCooler = C.leaders(coolerRows.map((p) => ({ id: p.player_id, value: p.n })));
  const goalies = new Map<number, any[]>();
  for (const r of goalieLines) goalies.set(r.player_id, [...(goalies.get(r.player_id) ?? []), r]);

  const names = await namesFor(db, a.viewer, [...topP, ...topG, ...topStars, ...topIron, ...topCooler].map((x) => x.id).concat([...goalies.keys()]));
  const who = (rows: { id: number }[]) => rows.map((r) => names.get(r.id) ?? "Player").join(", ");

  const awards: (RecapCard & { key: C.AwardKey })[] = [];
  const add = (key: C.AwardKey, title: string, headline: string, lines: string[] = []) => awards.push({ key, kind: "team", title, headline, lines });
  add("record", "Record", `${rec.w}-${rec.l}-${rec.t}`);
  if (place >= 0 && st.length >= 2) add("finish", "League finish", `${C.ordinal(place + 1)} of ${st.length}`, [team.league_name]);
  if (topP.length) add("points_leader", "Points leader", who(topP), [C.plural(topP[0].value, "point")]);
  if (topG.length) add("goals_leader", "Goals leader", who(topG), [C.plural(topG[0].value, "goal")]);
  if (topStars.length) add("three_stars", "Most three stars", who(topStars), [C.plural(topStars[0].value, "selection")]);
  if (topIron.length) add("iron_man", "Iron man", who(topIron), [`${C.plural(topIron[0].value, "game")} played`]);
  if (topCooler.length) add("cooler_mvp", "Cooler MVP", who(topCooler), [`${C.plural(topCooler[0].value, "game")} carrying the cooler`]);
  if (goalies.size) {
    add("goalies", "In goal", `${goalies.size} ${goalies.size === 1 ? "goalie" : "goalies"}`, [...goalies].map(([pid, rs]) => {
      const gc = goalieCorner(rs.map((r) => ({ teamId: r.team_id, homeTeamId: r.home_team_id, homeScore: r.home_score, awayScore: r.away_score, goalsAgainst: r.goals_against, shotsAgainst: r.shots_against })));
      return `${names.get(pid) ?? "Goalie"}: ${gc.w}-${gc.l}-${gc.t}${gc.gaa != null ? `, ${gc.gaa.toFixed(2)} GAA` : ""}${gc.shutouts ? `, ${C.plural(gc.shutouts, "shutout")}` : ""}`;
    }));
  }

  const hidden = C.cleanHidden(wrap.hidden_awards);
  const shown = a.canManage ? awards.map((x) => ({ ...x, hidden: hidden.includes(x.key) })) : C.visibleAwards(awards, hidden);
  return {
    mode: a.mode, canManage: a.canManage,
    team: { id: team.id, name: team.name, color: team.color, rink: team.rink_name },
    season: { id: season.id, name: season.name },
    openedAt: new Date(wrap.opened_at).toISOString(),
    updatedOn: await updatedOn(db, teamId, seasonId, wrap.opened_at),
    awards: shown,
    hiddenAwards: a.canManage ? hidden : undefined,
    sharePath: a.canManage ? teamSharePath(teamId, seasonId) : null,
  };
}

/** The one picture for a team wrap: every award the captain left visible. */
export function teamWrapCard(w: { team: { name: string }; season: { name: string }; awards: (RecapCard & { key?: string; hidden?: boolean })[] }): RecapCard {
  const lines = w.awards.filter((x) => !x.hidden).flatMap((x) => (x.lines.length && x.key !== "goalies" ? [`${x.title}: ${x.headline} (${x.lines[0]})`] : x.key === "goalies" ? x.lines : [`${x.title}: ${x.headline}`]));
  return { kind: "team", title: `${w.team.name} · ${w.season.name}`, headline: "Team wrap", lines: lines.slice(0, 10) };
}

/** The captain hides or shows awards before sharing (A4). Assistants can too: it is their team's page. */
export async function setHiddenAwards(db: Tx, user: any, teamId: number, seasonId: number, input: unknown) {
  await requireTeam(db, user, teamId, "roster.manage");
  const list = C.cleanHidden(input);
  const done = await one(db, "UPDATE season_wraps SET hidden_awards=$3::text::jsonb WHERE team_id=$1 AND season_id=$2 RETURNING team_id", [teamId, seasonId, JSON.stringify(list)]);
  if (!done) throw new HttpError(404, "This season isn't wrapped yet.");
  return list;
}

/* ---------- A5: wrap the season ---------- */

const WRAP_DENIED = "Only the captain or rink staff can wrap the season.";
async function requireWrap(db: Tx, user: any, action: "team.edit" | "season.manage", scope: P.Scope) {
  try { await P.require_(db, user, action, scope); }
  catch (e) { if (e instanceof HttpError && e.status === 403) throw new HttpError(403, WRAP_DENIED); throw e; }
}

/** What Manage team and the staff page need to draw the button. */
export async function wrapState(db: Tx, user: any, teamId: number) {
  const t = await teamOrThrow(db, teamId);
  const season = await seasonOfTeam(db, teamId);
  const wrap = season ? await one<any>(db, "SELECT opened_at FROM season_wraps WHERE team_id=$1 AND season_id=$2", [teamId, season.id]) : null;
  const canWrap = !!user && (await P.can(db, user, "team.edit", { teamId, leagueId: t.league_id, rinkId: t.rink_id }));
  return {
    canWrap, hasGames: !!season, seasonId: season?.id ?? null, seasonName: season?.name ?? null,
    wrapped: !!wrap, openedAt: wrap ? new Date(wrap.opened_at).toISOString() : null,
  };
}

/** A captain wraps their own team; rink staff wrap every team in a league. Logged in the audit log. */
export async function wrapSeason(db: Tx, user: any, input: { teamId?: unknown; leagueId?: unknown }) {
  if (!user) throw new HttpError(401, "Sign in first.");
  const teamId = Number(input.teamId) || 0, leagueId = Number(input.leagueId) || 0;
  if (teamId) {
    const t = await teamOrThrow(db, teamId);
    await requireWrap(db, user, "team.edit", { teamId, leagueId: t.league_id, rinkId: t.rink_id });
    const season = await seasonOfTeam(db, teamId);
    if (!season) throw new HttpError(409, "This team has no games on record yet, so there is nothing to wrap.");
    const opened = await openWrap(db, teamId, season.id, user.id);
    if (opened) await P.audit(db, user.id, "season.wrap", { type: "team", id: teamId, rinkId: t.rink_id }, undefined, { seasonId: season.id, season: season.name }, "Wrap the season");
    return { opened: opened ? 1 : 0, alreadyOpen: opened ? 0 : 1, skipped: 0, seasonId: season.id };
  }
  if (leagueId) {
    const l = await one<any>(db, "SELECT id, rink_id, name FROM leagues WHERE id=$1", [leagueId]);
    if (!l) throw new HttpError(404, "League not found.");
    await requireWrap(db, user, "season.manage", { leagueId, rinkId: l.rink_id });
    const teams = await q<{ id: number }>(db, "SELECT id FROM teams WHERE league_id=$1 AND archived_at IS NULL ORDER BY id", [leagueId]);
    let opened = 0, already = 0, skipped = 0;
    const done: number[] = [];
    for (const t of teams) {
      const season = await seasonOfTeam(db, t.id);
      if (!season) { skipped++; continue; }
      if (await openWrap(db, t.id, season.id, user.id)) { opened++; done.push(t.id); } else already++;
    }
    if (!opened && !already) throw new HttpError(409, "No team in this league has games on record yet, so there is nothing to wrap.");
    if (opened) await P.audit(db, user.id, "season.wrap", { type: "league", id: leagueId, rinkId: l.rink_id }, undefined, { teams: done }, `Wrap the season for ${l.name}`);
    return { opened, alreadyOpen: already, skipped, seasonId: null };
  }
  throw new HttpError(400, "Pick a team or a league.");
}

/** True once this team's Wrapped for this season has opened. */
export async function wrapExists(db: Tx, teamId: number, seasonId: number) {
  return !!(await one(db, "SELECT 1 FROM season_wraps WHERE team_id=$1 AND season_id=$2", [teamId, seasonId]));
}
