import { handle, body, num } from "@/server/http";
import { sql, q, one } from "@/server/db";
import { HttpError } from "@/server/services";
import { requireApproved, userFromRequest, requireTeam } from "@/server/accounts";
import { clean } from "@/server/manage";

export const dynamic = "force-dynamic";

/** Tournaments: recent and upcoming, or one team's. */
export const GET = handle(async (req) => {
  const team = new URL(req.url).searchParams.get("team");
  if (team) return q(sql, "SELECT e.*, et.place FROM events e JOIN event_teams et ON et.event_id=e.id WHERE et.team_id=$1 ORDER BY e.starts_on DESC", [num(team)]);
  return q(sql, "SELECT e.*, r.name host_rink FROM events e LEFT JOIN rinks r ON r.id=e.host_rink_id WHERE e.ends_on >= to_char(now() - interval '60 days', 'YYYY-MM-DD') ORDER BY e.starts_on DESC LIMIT 50");
});

/** A captain (entering their team) or rink staff sets up a tournament. */
export const POST = handle(async (req) => {
  const u = await requireApproved(req);
  const b = await body(req);
  const name = clean(b.name, 80), starts = String(b.startsOn || ""), ends = String(b.endsOn || b.startsOn || "");
  if (!name || !/^\d{4}-\d{2}-\d{2}$/.test(starts) || !/^\d{4}-\d{2}-\d{2}$/.test(ends) || ends < starts) throw new HttpError(400, "A name and the tournament's dates, please.");
  return sql.begin(async (tx) => {
    let teamId: number | null = null;
    if (b.teamId) { await requireTeam(tx, u, num(b.teamId), "roster.manage"); teamId = num(b.teamId); }
    else if (!(await one(tx, "SELECT 1 FROM role_grants WHERE user_id=$1 AND revoked_at IS NULL", [u.id]))) throw new HttpError(403, "Captains and rink staff set up tournaments.");
    const hostRink = b.hostRinkId ? num(b.hostRinkId) : null;
    const ev = await one<any>(tx, "INSERT INTO events (name, host_rink_id, location, starts_on, ends_on, created_by) VALUES ($1,$2,$3,$4,$5,$6) RETURNING id",
      [name, hostRink, clean(b.location, 100) || null, starts, ends, u.id]);
    if (teamId) await q(tx, "INSERT INTO event_teams (event_id, team_id, added_by) VALUES ($1,$2,$3)", [ev.id, teamId, u.id]);
    return { id: ev.id };
  });
});
