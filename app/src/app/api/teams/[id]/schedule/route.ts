import { handle, body, num } from "@/server/http";
import { sql, q, one } from "@/server/db";
import { HttpError } from "@/server/services";
import { requireUser, requireTeam, userFromRequest, logAction, userCan } from "@/server/accounts";
import { KINDS, attendance, rinkInstant, upcoming } from "@/server/schedule";
import { goalieCheck } from "@/server/gamenight";
import { assertRinkVisible } from "@/server/visibility";

export const dynamic = "force-dynamic";

/** Upcoming games for a team. Anyone can see the schedule; the feed's status only shows to people who manage it. */
export const GET = handle<{ id: string }>(async (req, { id }) => {
  const teamId = num(id);
  const t = await one<any>(sql, "SELECT t.*, l.rink_id FROM teams t JOIN leagues l ON l.id=t.league_id WHERE t.id=$1", [teamId]);
  if (!t) throw new HttpError(404, "Team not found");
  const u = await userFromRequest(req).catch(() => null);
  await assertRinkVisible(sql, u, t.rink_id);
  const scope = { teamId, leagueId: t.league_id, rinkId: t.rink_id };
  const can = { feed: await userCan(sql, u, "schedule.feed", scope), manual: await userCan(sql, u, "schedule.manual", scope) };
  let feed = null;
  if (can.feed) {
    const f = await one<any>(sql, "SELECT url, last_synced_at, last_error, last_count, added_at FROM team_feeds WHERE team_id=$1", [teamId]);
    feed = f ? { connected: true, host: new URL(f.url).hostname, lastSyncedAt: f.last_synced_at, lastError: f.last_error, lastCount: f.last_count } : { connected: false };
  }
  const opponents = can.manual ? await q(sql, "SELECT id, name FROM teams WHERE league_id=$1 AND id<>$2 AND archived_at IS NULL ORDER BY name", [t.league_id, teamId]) : [];
  const games = await goalieCheck(sql, teamId, await attendance(sql, teamId, await upcoming(sql, teamId), u?.id ?? null, can.manual));
  const roster = can.manual ? await q(sql,
    `SELECT DISTINCT ON (u.id) u.id, u.name FROM players p JOIN roster_entries re ON re.player_id=p.id JOIN users u ON u.id=p.user_id
     WHERE re.team_id=$1 AND NOT re.is_sub AND u.merged_into IS NULL ORDER BY u.id`, [teamId]) : [];
  return { games, can, feed, opponents, roster };
});

/** Add a game by hand: tournaments, exhibitions, playoffs, or anything the league calendar is missing. */
export const POST = handle<{ id: string }>(async (req, { id }) => {
  const u = await requireUser(req);
  const teamId = num(id);
  const b = await body(req);
  return sql.begin(async (tx) => {
    const t = await requireTeam(tx, u, teamId, "schedule.manual");
    const kind = KINDS.has(b.kind) ? b.kind : "league";
    const when = rinkInstant(b.date, b.time || null);
    let oppId: number | null = null, oppName: string | null = null;
    if (b.opponentTeamId) {
      const o = await one<any>(tx, "SELECT id FROM teams WHERE id=$1 AND league_id=$2 AND id<>$3", [num(b.opponentTeamId), t.league_id, teamId]);
      if (!o) throw new HttpError(400, "Pick an opponent from this league, or type their name.");
      oppId = o.id;
    } else {
      oppName = String(b.opponentName ?? "").trim().slice(0, 60) || null;
      if (!oppName) throw new HttpError(400, "Who are you playing?");
    }
    const location = String(b.location ?? "").trim().slice(0, 80) || null;
    const isHome = b.isHome === true ? true : b.isHome === false ? false : null;
    const row = await one<any>(tx,
      `INSERT INTO scheduled_games (team_id, opponent_team_id, opponent_name, is_home, starts_at, local_date, local_time, location, kind, source, created_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,'manual',$10) RETURNING id`,
      [teamId, oppId, oppName, isHome, when.at.toISOString(), when.localDate, when.localTime, location, kind, u.id]);
    await logAction(tx, teamId, u.id, "schedule_add", null, null, { id: row.id, date: when.localDate, time: when.localTime, kind });
    return { id: row.id };
  });
});
