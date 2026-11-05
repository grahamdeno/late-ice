import { handle, body, num } from "@/server/http";
import { sql, q, one } from "@/server/db";
import { HttpError } from "@/server/services";
import { requireApproved, notify } from "@/server/accounts";
import { canManageEvent } from "@/server/events";
import { audit } from "@/server/permissions";

export const dynamic = "force-dynamic";
/** Set a team's finish: 1 champion, 2 finalist, 3 third. Null clears it. Goes in the team's trophy case. */
export const PATCH = handle<{ id: string; teamId: string }>(async (req, { id, teamId }) => {
  const u = await requireApproved(req);
  const b = await body(req);
  const ev = await one<any>(sql, "SELECT * FROM events WHERE id=$1", [num(id)]);
  if (!ev) throw new HttpError(404, "Tournament not found.");
  if (!(await canManageEvent(sql, u, ev))) throw new HttpError(403, "Only whoever set up the tournament, or rink staff, records the finish.");
  const place = b.place == null ? null : [1, 2, 3].includes(Number(b.place)) ? Number(b.place) : null;
  return sql.begin(async (tx) => {
    const r = await q(tx, "UPDATE event_teams SET place=$1 WHERE event_id=$2 AND team_id=$3 RETURNING team_id", [place, ev.id, num(teamId)]);
    if (!r.length) throw new HttpError(404, "That team isn't in this tournament.");
    await audit(tx, u.id, "event.place", { type: "event", id: ev.id, rinkId: ev.host_rink_id }, undefined, { teamId: num(teamId), place });
    if (place === 1) {
      for (const c of await q<any>(tx, "SELECT user_id FROM role_grants WHERE scope_type='team' AND scope_id=$1 AND role IN ('captain','assistant_captain') AND revoked_at IS NULL", [num(teamId)]))
        await notify(tx, c.user_id, { kind: "trophy", teamId: num(teamId), link: `/event/${ev.id}`, title: `Champions: ${ev.name}`, body: "It's in your team's trophy case." });
    }
    return { ok: true };
  });
});
