import { handle, body, num } from "@/server/http";
import { sql, q, one } from "@/server/db";
import { requireUser } from "@/server/accounts";
import { HttpError } from "@/server/services";
import { audit } from "@/server/permissions";

export const dynamic = "force-dynamic";
const STATUSES = ["new", "contacted", "onboarding", "won", "lost"];

/** Move a lead along: contacted, onboarding, won or lost. */
export const PATCH = handle<{ id: string }>(async (req, { id }) => {
  const u = await requireUser(req);
  const ok = await one(sql, "SELECT 1 FROM role_grants WHERE user_id=$1 AND role IN ('admin','support') AND revoked_at IS NULL LIMIT 1", [u.id]);
  if (!ok) throw new HttpError(403, "Admins and support only.");
  const b = await body(req);
  if (!STATUSES.includes(b?.status)) throw new HttpError(400, "Unknown status.");
  const l = await one<any>(sql, "SELECT * FROM rink_leads WHERE id=$1", [num(id)]);
  if (!l) throw new HttpError(404, "Not found.");
  await sql.begin(async (tx) => {
    await q(tx, "UPDATE rink_leads SET status=$1, updated_at=now() WHERE id=$2", [b.status, l.id]);
    await audit(tx, u.id, "lead.status", { type: "lead", id: l.id, rinkId: l.rink_id }, { status: l.status }, { status: b.status });
  });
  return { ok: true };
});
