import { handle, body, num } from "@/server/http";
import { sql, q } from "@/server/db";
import { requireUser, requireTeam, logAction } from "@/server/accounts";
import { checkFeedUrl, fetchFeed, refreshFeed, syncTeamFeed } from "@/server/schedule";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

/** Connect (or replace) the team's calendar link. The link is checked by reading it before anything is saved. */
export const PUT = handle<{ id: string }>(async (req, { id }) => {
  const u = await requireUser(req);
  const teamId = num(id);
  const b = await body(req);
  await requireTeam(sql, u, teamId, "schedule.feed");
  const url = checkFeedUrl(b.url);
  const text = await fetchFeed(url);
  return sql.begin(async (tx) => {
    await q(tx,
      `INSERT INTO team_feeds (team_id, url, added_by) VALUES ($1,$2,$3)
       ON CONFLICT (team_id) DO UPDATE SET url=EXCLUDED.url, added_by=EXCLUDED.added_by, added_at=now(), last_error=NULL`, [teamId, url, u.id]);
    const r = await syncTeamFeed(tx, teamId, text);
    await logAction(tx, teamId, u.id, "feed_connect", null, null, { host: new URL(url).hostname, events: r.events });
    return r;
  });
});

/** Read the feed again now. */
export const POST = handle<{ id: string }>(async (req, { id }) => {
  const u = await requireUser(req);
  const teamId = num(id);
  await requireTeam(sql, u, teamId, "schedule.feed");
  return refreshFeed(teamId);
});

/** Disconnect: the link is deleted and games it added that haven't happened yet come off the schedule. */
export const DELETE = handle<{ id: string }>(async (req, { id }) => {
  const u = await requireUser(req);
  const teamId = num(id);
  return sql.begin(async (tx) => {
    await requireTeam(tx, u, teamId, "schedule.feed");
    await q(tx, "DELETE FROM team_feeds WHERE team_id=$1", [teamId]);
    const gone = await q(tx, "DELETE FROM scheduled_games WHERE team_id=$1 AND source='feed' AND starts_at > now() RETURNING id", [teamId]);
    await logAction(tx, teamId, u.id, "feed_disconnect", null, null, { removed: gone.length });
    return { removed: gone.length };
  });
});
