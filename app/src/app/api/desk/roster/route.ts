import { handle, num } from "@/server/http";
import { sql } from "@/server/db";
import { requireUser } from "@/server/accounts";
import { rosterTable } from "@/server/desk";

export const dynamic = "force-dynamic";

export const GET = handle(async (req) => {
  const u = await requireUser(req);
  return rosterTable(sql, u, num(new URL(req.url).searchParams.get("rink")));
});
