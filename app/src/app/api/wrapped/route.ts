import { handle } from "@/server/http";
import { sql } from "@/server/db";
import { requireUser } from "@/server/accounts";
import { myWraps } from "@/server/wrapped";

export const dynamic = "force-dynamic";

/** The signed-in player's recaps, newest first. Opens any that are due (A1), so Home never needs a schedule job. */
export const GET = handle(async (req) => {
  const u = await requireUser(req);
  return { wraps: await myWraps(sql, u.id) };
});
