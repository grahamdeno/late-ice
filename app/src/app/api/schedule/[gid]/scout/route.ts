import { handle, num } from "@/server/http";
import { sql } from "@/server/db";
import { requireApproved } from "@/server/accounts";
import { scout } from "@/server/gamenight";

export const dynamic = "force-dynamic";

/** The next opponent at a glance. People on the team and its captains only. */
export const GET = handle<{ gid: string }>(async (req, { gid }) => {
  const u = await requireApproved(req);
  return scout(sql, u, num(gid));
});
