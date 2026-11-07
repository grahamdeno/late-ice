import { handle, num } from "@/server/http";
import { sql } from "@/server/db";
import { userFromRequest } from "@/server/accounts";
import { career } from "@/server/career";
import { assertPlayerVisible } from "@/server/visibility";

export const dynamic = "force-dynamic";

/** Seasons, rating over time, milestones and goalie numbers. Public, with the same name privacy as the player page. */
export const GET = handle<{ id: string }>(async (req, { id }) => {
  const viewer = await userFromRequest(req).catch(() => null);
  await assertPlayerVisible(sql, viewer, num(id));
  return career(sql, viewer, num(id));
});
