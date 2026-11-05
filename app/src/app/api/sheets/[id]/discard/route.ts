import { handle, num } from "@/server/http";
import { sql, q, one } from "@/server/db";
import { HttpError } from "@/server/services";
import { requireApproved } from "@/server/accounts";
import { can } from "@/server/permissions";

export const dynamic = "force-dynamic";
/** The person who scanned it, a captain or assistant, or staff can throw a scan away. */
export const POST = handle<{ id: string }>(async (req, { id }) => {
  const u = await requireApproved(req);
  const s = await one<any>(sql, "SELECT * FROM sheets WHERE id=$1", [num(id)]);
  if (!s) throw new HttpError(404, "Sheet not found");
  const mine = s.scanned_by === u.id || s.source === "sample";
  const captain = !!(await one(sql, "SELECT 1 FROM role_grants WHERE user_id=$1 AND scope_type='team' AND role IN ('captain','assistant_captain') AND revoked_at IS NULL", [u.id]));
  if (!mine && !captain && !(await can(sql, u, "game.resolve"))) throw new HttpError(403, "Only the person who scanned it, a captain or staff can discard it.");
  await q(sql, "UPDATE sheets SET status='discarded' WHERE id=$1 AND game_id IS NULL", [s.id]);
  return { ok: true };
});
