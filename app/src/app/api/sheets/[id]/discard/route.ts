import { handle, body, num } from "@/server/http";
import { sql, q, one } from "@/server/db";

export const dynamic = "force-dynamic";
export const POST = handle<{ id: string }>(async (_req, { id }) => {
  await q(sql, "UPDATE sheets SET status='discarded' WHERE id=$1 AND game_id IS NULL", [num(id)]);
  return { ok: true };
});
