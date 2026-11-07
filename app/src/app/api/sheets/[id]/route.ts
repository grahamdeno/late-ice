import { handle, body, num } from "@/server/http";
import { sql, q, one } from "@/server/db";
import { confirmRights, sheetView } from "@/server/sheets";
import { HttpError } from "@/server/services";
import { isApproved, userFromRequest } from "@/server/accounts";

export const dynamic = "force-dynamic";
export const GET = handle<{ id: string }>(async (req, { id }) => {
  const s = await one<any>(sql, "SELECT * FROM sheets WHERE id=$1", [num(id)]);
  if (!s) throw new HttpError(404, "Sheet not found");
  const u = await userFromRequest(req).catch(() => null);
  const approved = await isApproved(sql, u);
  return { ...(await sheetView(s)), rights: { ...(await confirmRights(approved ? u : null)), approved, sample: s.source === "sample" } };
});
