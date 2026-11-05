import { handle, body, num } from "@/server/http";
import { sql, q, one } from "@/server/db";
import { HttpError } from "@/server/services";
import * as A from "@/server/accounts";
import * as P from "@/server/permissions";

export const dynamic = "force-dynamic";

// League or rink staff set the captain directly, for example to settle a contest.
export const POST = handle<{ id: string }>(async (req, { id }) => {
  const u = await A.requireUser(req);
  const teamId = num(id);
  const b = await body(req);
  await sql.begin(async (tx) => {
    const t = await A.requireTeam(tx, u, teamId, "captain.reassign");
    const target = await A.userOrThrow(tx, Number(b?.userId) || 0);
    if (!(await A.onTeam(tx, target.id, teamId))) throw new HttpError(400, `${target.name} isn't on the ${t.name} roster.`);
    const cap = await A.captainOf(tx, teamId);
    if (cap?.id === target.id) return;
    if (cap) await P.revokeRole(tx, cap.id, "captain", teamId, u.id, "reassigned by staff");
    await P.revokeRole(tx, target.id, "assistant_captain", teamId, u.id, "became captain");
    await P.grant(tx, target.id, "captain", teamId, u.id, String(b?.note || "assigned by staff").slice(0, 100));
    await q(tx, "UPDATE role_requests SET status=CASE WHEN user_id=$2 THEN 'approved' ELSE 'declined' END, decided_by=$1, decided_at=now() WHERE kind='captain_contest' AND status='open' AND scope_id=$3", [u.id, target.id, teamId]);
    await A.logAction(tx, teamId, u.id, "captain_assigned", null, target.id, { from: cap?.id ?? null });
    await P.audit(tx, u.id, "captain.assign", { type: "team", id: teamId, rinkId: t.rink_id }, { captain: cap?.id ?? null }, { captain: target.id });
    for (const m of await A.teamUserIds(tx, teamId)) {
      await A.notify(tx, m, { kind: "captain", teamId, link: `/team/${teamId}`, title: `${target.name} is now captain of ${t.name}`, body: "Set by league or rink staff." });
    }
  });
  return { ok: true };
});
