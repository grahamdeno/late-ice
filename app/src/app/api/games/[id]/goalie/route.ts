import { handle, body, num } from "@/server/http";
import { sql } from "@/server/db";
import { requireUser } from "@/server/accounts";
import { submitReport } from "@/server/goalies";

export const dynamic = "force-dynamic";

/** A goalie enters shots against for a game they played. Goals against come from the score. */
export const POST = handle<{ id: string }>(async (req, { id }) => {
  const u = await requireUser(req);
  const b = await body(req);
  return sql.begin((tx) => submitReport(tx, u, num(id), Number(b?.shots)));
});
