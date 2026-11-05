import { handle, body, num } from "@/server/http";
import { sql, q, one } from "@/server/db";
import { HttpError } from "@/server/services";
import { requireApproved, requireTeam } from "@/server/accounts";

export const dynamic = "force-dynamic";
/** Enter your team in a tournament. */
export const POST = handle<{ id: string }>(async (req, { id }) => {
  const u = await requireApproved(req);
  const b = await body(req);
  const ev = await one<any>(sql, "SELECT * FROM events WHERE id=$1", [num(id)]);
  if (!ev) throw new HttpError(404, "Tournament not found.");
  await requireTeam(sql, u, num(b.teamId), "roster.manage");
  await q(sql, "INSERT INTO event_teams (event_id, team_id, added_by) VALUES ($1,$2,$3) ON CONFLICT DO NOTHING", [ev.id, num(b.teamId), u.id]);
  return { ok: true };
});
