import { handle } from "@/server/http";
import { sql } from "@/server/db";
import * as A from "@/server/accounts";

export const dynamic = "force-dynamic";
/** Search unclaimed roster spots to claim one by hand. Names only, as the roster already shows them. */
export const GET = handle(async (req) => {
  const u = await A.requireApproved(req);
  return { spots: await A.findSpots(sql, u, new URL(req.url).searchParams.get("q") ?? "") };
});
