import { handle, body, num } from "@/server/http";
import { sql, q, one } from "@/server/db";
import { HttpError } from "@/server/services";
import * as A from "@/server/accounts";
import * as P from "@/server/permissions";

export const dynamic = "force-dynamic";

/** Let someone in off the waitlist, or remove them. */
export const POST = handle<{ id: string }>(async (req, { id }) => {
  const u = await A.requireUser(req);
  const b = await body(req);
  const target = await one<any>(sql, "SELECT * FROM users WHERE id=$1", [num(id)]);
  if (!target) throw new HttpError(404, "Account not found.");
  await P.require_(sql, u, "signup.approve", { rinkId: target.home_rink_id ?? undefined });
  const decision = b.decision === "approve" ? "approved" : b.decision === "remove" ? "removed" : null;
  if (!decision) throw new HttpError(400, "Let in or remove.");
  await sql.begin(async (tx) => {
    await q(tx, "UPDATE users SET access=$1, access_decided_by=$2 WHERE id=$3", [decision, u.id, target.id]);
    await P.audit(tx, u.id, `signup.${decision}`, { type: "user", id: target.id, rinkId: target.home_rink_id }, { access: target.access }, { access: decision });
    if (decision === "approved") await A.notify(tx, target.id, { kind: "request", link: "/me", title: "You're in", body: "Claim your roster spot from your profile." });
  });
  return { ok: true, access: decision };
});
