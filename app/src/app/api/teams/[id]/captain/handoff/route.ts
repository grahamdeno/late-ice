import { handle, body, num } from "@/server/http";
import { sql, q, one } from "@/server/db";
import { HttpError } from "@/server/services";
import * as A from "@/server/accounts";
import * as P from "@/server/permissions";

export const dynamic = "force-dynamic";

// The captain offers the role to a roster member, who accepts from their profile.
export const POST = handle<{ id: string }>(async (req, { id }) => {
  const u = await A.requireUser(req);
  const teamId = num(id);
  const b = await body(req);
  await sql.begin(async (tx) => {
    const t = await A.teamOrThrow(tx, teamId);
    if (!(await A.isCaptain(tx, u.id, teamId))) throw new HttpError(403, "Only the captain can hand off the captaincy.");
    const target = await A.userOrThrow(tx, Number(b?.userId) || 0);
    if (target.id === u.id) throw new HttpError(400, "Pick someone else on the roster.");
    if (!(await A.onTeam(tx, target.id, teamId))) throw new HttpError(400, `${target.name} isn't on the ${t.name} roster.`);
    await q(tx, "UPDATE role_requests SET status='cancelled', decided_at=now(), decided_by=$1 WHERE kind='captain_handoff' AND status='open' AND scope_id=$2", [u.id, teamId]);
    await q(tx, "INSERT INTO role_requests (kind,user_id,scope_type,scope_id,target_user_id) VALUES ('captain_handoff',$1,'team',$2,$3)", [u.id, teamId, target.id]);
    await A.notify(tx, target.id, { kind: "handoff", teamId, link: "/me", title: `${u.name} wants you to be captain of ${t.name}`, body: "Accept or decline from your profile." });
  });
  return { ok: true };
});
