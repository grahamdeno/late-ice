import { handle } from "@/server/http";
import { sql } from "@/server/db";
import { requireUser } from "@/server/accounts";
import { usage } from "@/server/usage";

export const dynamic = "force-dynamic";

/** Usage across every rink, for admins. */
export const GET = handle(async (req) => {
  const u = await requireUser(req);
  return usage(sql, u);
});
