import { handle, body, num } from "@/server/http";
import { sql, q, one } from "@/server/db";
import { sheetView } from "@/server/sheets";
import { HttpError } from "@/server/services";

export const dynamic = "force-dynamic";
export const GET = handle<{ id: string }>(async (_req, { id }) => {
  const s = await one(sql, "SELECT * FROM sheets WHERE id=$1", [num(id)]);
  if (!s) throw new HttpError(404, "Sheet not found");
  return sheetView(s);
});
