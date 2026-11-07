import { handle, num } from "@/server/http";
import { sql } from "@/server/db";
import { requireUser } from "@/server/accounts";
import { gapsForRink } from "@/server/lineups";

export const dynamic = "force-dynamic";

/** Imported games per team at one rink, and how many have a lineup recorded. */
export const GET = handle(async (req) => {
  const u = await requireUser(req);
  const rink = num(new URL(req.url).searchParams.get("rink"));
  return gapsForRink(sql, u, rink);
});
