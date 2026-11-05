import { handle, body, num } from "@/server/http";
import { sql, q, one } from "@/server/db";
import { HttpError } from "@/server/services";
import * as A from "@/server/accounts";
import * as P from "@/server/permissions";
import * as S from "@/server/staff";

export const dynamic = "force-dynamic";

// Approve or decline a rink manager request or a captain contest.
export const POST = handle<{ id: string }>(async (req, { id }) => {
  const u = await A.requireUser(req);
  const b = await body(req);
  const approve = b?.decision === "approve";
  await sql.begin(async (tx) => {
    const r = await one<any>(tx, "SELECT * FROM role_requests WHERE id=$1 AND status='open' FOR UPDATE", [num(id)]);
    if (!r) throw new HttpError(404, "That request is no longer open.");
    if (r.kind === "rink_manager") {
      await P.require_(tx, u, "system.grant");
      if (approve) {
        await P.grant(tx, r.user_id, "rink_manager", r.scope_id, u.id, "request approved");
        await P.audit(tx, u.id, "grant.rink_manager", { type: "user", id: r.user_id, rinkId: r.scope_id }, undefined, { role: "rink_manager" });
      }
      await A.notify(tx, r.user_id, { kind: "request", link: approve ? "/staff" : "/rink", title: approve ? "You're now a rink manager" : "Your rink manager request wasn't approved", body: approve ? "Open the staff page from your profile." : "Reply to support@tangomike.app if this is a mistake." });
    } else if (r.kind === "captain_contest") {
      const t = await A.requireTeam(tx, u, r.scope_id, "captain.reassign");
      if (approve) {
        const cap = await A.captainOf(tx, r.scope_id);
        if (cap) await P.revokeRole(tx, cap.id, "captain", r.scope_id, u.id, "contest resolved");
        await P.revokeRole(tx, r.user_id, "assistant_captain", r.scope_id, u.id, "became captain");
        await P.grant(tx, r.user_id, "captain", r.scope_id, u.id, "contest resolved");
        await A.logAction(tx, r.scope_id, u.id, "captain_assigned", null, r.user_id, { from: cap?.id ?? null, contest: r.id });
      }
      await P.audit(tx, u.id, approve ? "contest.approve" : "contest.decline", { type: "team", id: r.scope_id, rinkId: t.rink_id }, undefined, { requester: r.user_id });
      await A.notify(tx, r.user_id, { kind: "contest", teamId: r.scope_id, link: `/team/${r.scope_id}`, title: approve ? `You're now captain of ${t.name}` : `Your captain contest for ${t.name} was declined` });
    } else throw new HttpError(400, "That request is decided elsewhere.");
    await q(tx, "UPDATE role_requests SET status=$2, decided_by=$3, decided_at=now() WHERE id=$1", [r.id, approve ? "approved" : "declined", u.id]);
  });
  return { ok: true };
});
