import { handle, body, num } from "@/server/http";
import { sql, q, one } from "@/server/db";
import { HttpError } from "@/server/services";
import * as A from "@/server/accounts";
import * as P from "@/server/permissions";

export const dynamic = "force-dynamic";

// The person offered a captaincy accepts or declines it.
export const POST = handle<{ id: string }>(async (req, { id }) => {
  const u = await A.requireUser(req);
  const b = await body(req);
  const accept = b?.decision === "accept";
  await sql.begin(async (tx) => {
    const r = await one<any>(tx, "SELECT * FROM role_requests WHERE id=$1 FOR UPDATE", [num(id)]);
    if (!r || r.kind !== "captain_handoff" || r.status !== "open") throw new HttpError(404, "That request is no longer open.");
    if (r.target_user_id !== u.id) throw new HttpError(403, "That request isn't for you.");
    const teamId = r.scope_id as number;
    const t = await A.teamOrThrow(tx, teamId);
    await q(tx, "UPDATE role_requests SET status=$2, decided_by=$3, decided_at=now() WHERE id=$1", [r.id, accept ? "approved" : "declined", u.id]);
    if (!accept) {
      await A.notify(tx, r.user_id, { kind: "handoff", teamId, link: `/team/${teamId}`, title: `${u.name} declined the captaincy of ${t.name}` });
      return;
    }
    if (!(await A.onTeam(tx, u.id, teamId))) throw new HttpError(400, "You're no longer on this roster.");
    const cap = await A.captainOf(tx, teamId);
    if (cap?.id !== r.user_id) throw new HttpError(409, "The captain changed since this was sent.");
    await P.revokeRole(tx, cap.id, "captain", teamId, u.id, "handed off");
    await P.revokeRole(tx, u.id, "assistant_captain", teamId, u.id, "became captain");
    await P.grant(tx, u.id, "captain", teamId, cap.id, "handed off");
    await A.logAction(tx, teamId, u.id, "captain", null, u.id, { handoffFrom: cap.id });
    for (const m of await A.teamUserIds(tx, teamId)) {
      await A.notify(tx, m, { kind: "captain", teamId, link: `/team/${teamId}`, title: `${u.name} is now captain of ${t.name}` });
    }
  });
  return { ok: true };
});
