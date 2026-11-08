import { handle, body, num } from "@/server/http";
import { sql } from "@/server/db";
import { requireUser } from "@/server/accounts";
import { settleReport } from "@/server/goalies";

export const dynamic = "force-dynamic";

/** Staff settle a disputed shot count by picking the goalie's number or the captain's. */
export const POST = handle<{ id: string }>(async (req, { id }) => {
  const u = await requireUser(req);
  const b = await body(req);
  return sql.begin((tx) => settleReport(tx, u, num(id), String(b?.use ?? "")));
});
