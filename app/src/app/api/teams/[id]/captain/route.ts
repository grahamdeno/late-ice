import { handle, body, num } from "@/server/http";
import { sql, q, one } from "@/server/db";
import { HttpError } from "@/server/services";
import * as A from "@/server/accounts";
import * as P from "@/server/permissions";

export const dynamic = "force-dynamic";

// Take an open captaincy, or file a contest that goes to league or rink staff.
export const POST = handle<{ id: string }>(async (req, { id }) => {
  const u = await A.requireApproved(req);
  const teamId = num(id);
  const b = await body(req);
  return sql.begin(async (tx) => {
    const t = await A.teamOrThrow(tx, teamId);
    if (t.is_sample) throw new HttpError(400, "Placeholder teams can't have captains. Scan a real sheet first.");
    const cap = await A.captainOf(tx, teamId);
    if (cap) {
      if (cap.id === u.id) return { ok: true };
      if (!(await A.onTeam(tx, u.id, teamId))) throw new HttpError(403, "Only players on this roster can contest the captain.");
      if (await one(tx, "SELECT 1 FROM role_requests WHERE kind='captain_contest' AND status='open' AND user_id=$1 AND scope_id=$2", [u.id, teamId])) {
        return Response.json({ ok: true, contested: true }, { status: 202 });
      }
      await q(tx, "INSERT INTO role_requests (kind,user_id,scope_type,scope_id,target_user_id,message) VALUES ('captain_contest',$1,'team',$2,$3,$4)",
        [u.id, teamId, cap.id, String(b?.message || "").slice(0, 500) || null]);
      await A.logAction(tx, teamId, u.id, "contest", null, cap.id);
      for (const s of await P.staffFor(tx, teamId)) {
        await A.notify(tx, s, { kind: "contest", teamId, link: "/staff", title: `${u.name} says they're the captain of ${t.name}`, body: `Current captain: ${cap.name}. Decide it from the staff page.` });
      }
      await A.notify(tx, cap.id, { kind: "contest", teamId, link: `/team/${teamId}`, title: `${u.name} contested your captaincy of ${t.name}`, body: "League or rink staff will decide." });
      return Response.json({ ok: true, contested: true }, { status: 202 });
    }
    if (!(await A.onTeam(tx, u.id, teamId))) throw new HttpError(403, "Claim your spot on this roster first, then you can take the captain role.");
    // If they were an assistant, the captaincy replaces it.
    await P.revokeRole(tx, u.id, "assistant_captain", teamId, u.id, "became captain");
    await P.grant(tx, u.id, "captain", teamId, u.id, "first captain");
    await A.logAction(tx, teamId, u.id, "captain", null, u.id);
    return { ok: true };
  });
});
