import { handle, body, num } from "@/server/http";
import { sql } from "@/server/db";
import { requireApproved } from "@/server/accounts";
import { fileReport } from "@/server/statreports";

export const dynamic = "force-dynamic";

/** Report a wrong score, goal, assist or lineup on this game. Rink staff see it on Rink Desk. */
export const POST = handle<{ id: string }>(async (req, { id }) => {
  const u = await requireApproved(req);
  const b = await body<{ kind?: string; body?: string }>(req);
  return sql.begin((tx) => fileReport(tx, u, num(id), String(b.kind ?? ""), String(b.body ?? "")));
});
