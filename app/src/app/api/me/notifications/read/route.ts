import { handle, body, num } from "@/server/http";
import { sql, q, one } from "@/server/db";
import { HttpError } from "@/server/services";
import * as A from "@/server/accounts";

export const dynamic = "force-dynamic";

export const POST = handle(async (req) => {
  const u = await A.requireUser(req);
  await q(sql, "UPDATE notifications SET read_at=now() WHERE user_id=$1 AND read_at IS NULL", [u.id]);
  return { ok: true };
});
