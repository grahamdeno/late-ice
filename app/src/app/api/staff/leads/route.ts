import { handle } from "@/server/http";
import { sql, q } from "@/server/db";
import { requireUser } from "@/server/accounts";
import { HttpError } from "@/server/services";

export const dynamic = "force-dynamic";

async function requireLeadsAccess(userId: number) {
  const r = await q(sql, "SELECT 1 FROM role_grants WHERE user_id=$1 AND role IN ('admin','support') AND revoked_at IS NULL LIMIT 1", [userId]);
  if (!r.length) throw new HttpError(403, "Admins and support only.");
}

/** Rink leads from the website, newest first, open ones on top. */
export const GET = handle(async (req) => {
  const u = await requireUser(req);
  await requireLeadsAccess(u.id);
  return q(sql, `SELECT l.*, r.name AS listed_rink FROM rink_leads l LEFT JOIN rinks r ON r.id=l.rink_id
    ORDER BY (l.status IN ('won','lost')), l.created_at DESC LIMIT 200`);
});

