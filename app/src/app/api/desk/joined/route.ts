import { handle, num } from "@/server/http";
import { sql } from "@/server/db";
import { requireUser } from "@/server/accounts";
import { joinProgress } from "@/server/desk";

export const dynamic = "force-dynamic";

/** Sign-up progress per team at one rink: all teams for staff, their own for captains. */
export const GET = handle(async (req) => {
  const u = await requireUser(req);
  return joinProgress(sql, u, num(new URL(req.url).searchParams.get("rink")));
});
