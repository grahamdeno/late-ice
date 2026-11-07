import { handle, body, num } from "@/server/http";
import { sql } from "@/server/db";
import { requireUser } from "@/server/accounts";
import { applyRollover, rolloverPlan } from "@/server/rollover";

export const dynamic = "force-dynamic";

/** The current and next season at a rink, and every team, for the rollover page. */
export const GET = handle(async (req) => {
  const u = await requireUser(req);
  return rolloverPlan(sql, u, num(new URL(req.url).searchParams.get("rink")));
});

/** Close the season, add the next one, and (after it ends) wrap up teams and rosters. */
export const POST = handle(async (req) => {
  const u = await requireUser(req);
  const rinkId = num(new URL(req.url).searchParams.get("rink"));
  const b = await body(req);
  return sql.begin((tx) => applyRollover(tx, u, rinkId, b));
});
