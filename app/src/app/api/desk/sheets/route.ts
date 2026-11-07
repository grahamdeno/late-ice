import { handle, num } from "@/server/http";
import { sql } from "@/server/db";
import { requireUser } from "@/server/accounts";
import { sheetQueue } from "@/server/desk";

export const dynamic = "force-dynamic";

/** Scoresheets at one rink: open scans oldest first, then the last month's finished ones. */
export const GET = handle(async (req) => {
  const u = await requireUser(req);
  return sheetQueue(sql, u, num(new URL(req.url).searchParams.get("rink")));
});
