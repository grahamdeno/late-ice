import { handle, body, num } from "@/server/http";
import { sql, q, one } from "@/server/db";
import { confirmSheet } from "@/server/services";
import { refreshDisplays } from "@/server/accounts";

export const dynamic = "force-dynamic";
export const POST = handle<{ id: string }>(async (req, { id }) => {
  const input = await body(req);
  const gameId = await sql.begin(async (tx) => {
    const g = await confirmSheet(tx, num(id), input);
    await refreshDisplays(tx);
    return g;
  });
  return { gameId };
});
