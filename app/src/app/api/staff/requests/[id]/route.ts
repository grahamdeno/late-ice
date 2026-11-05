import { handle, body, num } from "@/server/http";
import { sql, q, one } from "@/server/db";
import { HttpError } from "@/server/services";
import * as A from "@/server/accounts";
import * as P from "@/server/permissions";
import * as S from "@/server/staff";
import { createRink, createTeam, emailOnRinkDomain } from "@/server/manage";

export const dynamic = "force-dynamic";

// Approve or decline a rink manager request or a captain contest.
export const POST = handle<{ id: string }>(async (req, { id }) => {
  const u = await A.requireUser(req);
  const b = await body(req);
  const approve = b?.decision === "approve" || b?.decision === "approve_rink";
  const out: any = { ok: true };
  await sql.begin(async (tx) => {
    const r = await one<any>(tx, "SELECT * FROM role_requests WHERE id=$1 AND status='open' FOR UPDATE", [num(id)]);
    if (!r) throw new HttpError(404, "That request is no longer open.");
    if (r.kind === "rink_manager") {
      await P.require_(tx, u, "system.grant");
      if (approve) {
        const who = await one<any>(tx, "SELECT email FROM users WHERE id=$1", [r.user_id]);
        const rk = await one<any>(tx, "SELECT website FROM rinks WHERE id=$1", [r.scope_id]);
        if (!r.phone_confirmed_at && !emailOnRinkDomain(who?.email, rk?.website)) throw new HttpError(400, "Confirm by phone first: their email isn't on the rink's domain.");
        await P.grant(tx, r.user_id, "rink_manager", r.scope_id, u.id, "request approved");
        await P.audit(tx, u.id, "grant.rink_manager", { type: "user", id: r.user_id, rinkId: r.scope_id }, undefined, { role: "rink_manager" });
      }
      await A.notify(tx, r.user_id, { kind: "request", link: approve ? "/staff" : "/rink", title: approve ? "You're now a rink manager" : "Your rink manager request wasn't approved", body: approve ? "Open the staff page from your profile." : "Reply to support@tangomike.app if this is a mistake." });
    } else if (r.kind === "new_rink") {
      await P.require_(tx, u, "system.grant");
      const d = r.details ?? {};
      if (approve) {
        const rink = await createRink(tx, d, u.id);
        out.rinkId = rink.id;
        await P.audit(tx, u.id, "rink.create", { type: "rink", id: rink.id, rinkId: rink.id }, undefined, { name: rink.name, request: r.id });
        const asManager = b.decision === "approve" && d.manage;
        if (asManager && !r.phone_confirmed_at && !d.emailOnDomain) throw new HttpError(400, "Confirm by phone first, or approve the rink only.");
        if (asManager) {
          await P.grant(tx, r.user_id, "rink_manager", rink.id, u.id, "new rink request approved");
          await P.audit(tx, u.id, "grant.rink_manager", { type: "user", id: r.user_id, rinkId: rink.id }, undefined, { role: "rink_manager" });
        }
        await A.notify(tx, r.user_id, { kind: "request", link: asManager ? "/staff" : "/rink", title: `${rink.name} is on Late Ice`, body: asManager ? "You're its rink manager. Open Manage from your profile to add leagues and teams." : d.manage ? "The rink is listed. We couldn't confirm the manager part yet; reply to support@tangomike.app." : undefined });
      } else {
        await A.notify(tx, r.user_id, { kind: "request", link: "/rink", title: `${d.name ?? "Your rink"} wasn't added`, body: "Reply to support@tangomike.app if this is a mistake." });
      }
    } else if (r.kind === "new_team") {
      const l = await one<any>(tx, "SELECT * FROM leagues WHERE id=$1", [r.scope_id]);
      if (!l) throw new HttpError(404, "That league is gone.");
      await P.require_(tx, u, "team.create", { leagueId: l.id, rinkId: l.rink_id });
      const d = r.details ?? {};
      if (approve) {
        const t = await createTeam(tx, l.id, { name: d.name, color: d.color });
        out.teamId = t.id;
        if (d.captain && !(await A.captainOf(tx, t.id))) await P.grant(tx, r.user_id, "captain", t.id, u.id, "started the team");
        await P.audit(tx, u.id, "team.create", { type: "team", id: t.id, rinkId: l.rink_id }, undefined, { name: t.name, request: r.id });
        await A.notify(tx, r.user_id, { kind: "request", teamId: t.id, link: `/team/${t.id}`, title: `${t.name} is in the ${l.name}`, body: d.captain ? "You're the captain. Add your players from the team page." : undefined });
      } else {
        await A.notify(tx, r.user_id, { kind: "request", title: `${d.name ?? "Your team"} wasn't added to the ${l.name}` });
      }
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
  return out;
});
