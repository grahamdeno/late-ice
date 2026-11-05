import { handle, body, num } from "@/server/http";
import { sql, q, one } from "@/server/db";
import { confirmSheet, HttpError } from "@/server/services";
import { refreshDisplays, requireApproved } from "@/server/accounts";
import { requireConfirm } from "@/server/sheetconfirm";

export const dynamic = "force-dynamic";
export const POST = handle<{ id: string }>(async (req, { id }) => {
  const u = await requireApproved(req);
  const input = await body(req);
  const gameId = await sql.begin(async (tx) => {
    const s = await one<any>(tx, "SELECT * FROM sheets WHERE id=$1", [num(id)]);
    if (!s) throw new HttpError(404, "Sheet not found");
    await requireConfirm(tx, u, s, input);
    const g = await confirmSheet(tx, num(id), input);
    await refreshDisplays(tx);
    return g;
  });
  return { gameId };
});
