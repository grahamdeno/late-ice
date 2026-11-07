import { handle, body, num } from "@/server/http";
import { sql } from "@/server/db";
import { requireUser } from "@/server/accounts";
import { closeReport } from "@/server/statreports";

export const dynamic = "force-dynamic";

/** Close a reported mistake: fixed, or checked and left as it is. The reporter gets a notice. */
export const POST = handle<{ id: string }>(async (req, { id }) => {
  const u = await requireUser(req);
  const b = await body<{ fixed?: boolean; note?: string }>(req);
  return sql.begin((tx) => closeReport(tx, u, num(id), b.fixed !== false, String(b.note ?? "")));
});
