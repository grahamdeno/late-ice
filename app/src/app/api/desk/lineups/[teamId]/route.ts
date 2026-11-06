import { handle, num } from "@/server/http";
import { sql } from "@/server/db";
import { requireUser } from "@/server/accounts";
import { teamLineups } from "@/server/lineups";

export const dynamic = "force-dynamic";

/** A team's imported games, its roster, and who is marked as having played each one. */
export const GET = handle<{ teamId: string }>(async (req, { teamId }) => {
  const u = await requireUser(req);
  return teamLineups(sql, u, num(teamId));
});
