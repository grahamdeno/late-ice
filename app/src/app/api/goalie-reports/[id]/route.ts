import { handle, body, num } from "@/server/http";
import { sql } from "@/server/db";
import { requireUser } from "@/server/accounts";
import { answerReport } from "@/server/goalies";

export const dynamic = "force-dynamic";

/** The other team's captain answers: agree, differ (with their number), or unsure. */
export const POST = handle<{ id: string }>(async (req, { id }) => {
  const u = await requireUser(req);
  const b = await body(req);
  return sql.begin((tx) => answerReport(tx, u, num(id), String(b?.answer ?? ""), b?.counter));
});
