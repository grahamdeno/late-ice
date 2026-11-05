import { handle, num } from "@/server/http";
import { sql, q, one } from "@/server/db";
import { HttpError } from "@/server/services";
import * as A from "@/server/accounts";
import * as P from "@/server/permissions";

export const dynamic = "force-dynamic";

/** An admin called the rink's public number and the person checks out. */
export const POST = handle<{ id: string }>(async (req, { id }) => {
  const u = await A.requireUser(req);
  await P.require_(sql, u, "system.grant");
  const r = await one<any>(sql, "SELECT * FROM role_requests WHERE id=$1 AND status='open' AND kind IN ('new_rink','rink_manager')", [num(id)]);
  if (!r) throw new HttpError(404, "That request is no longer open.");
  await q(sql, "UPDATE role_requests SET phone_confirmed_by=$1, phone_confirmed_at=now() WHERE id=$2", [u.id, r.id]);
  await P.audit(sql, u.id, "request.phone_confirmed", { type: "request", id: r.id, rinkId: r.scope_id }, undefined, undefined);
  return { ok: true };
});
