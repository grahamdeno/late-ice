import { handle, num } from "@/server/http";
import { sql } from "@/server/db";
import { requireTeam, requireUser } from "@/server/accounts";
import { HttpError } from "@/server/services";
import { logWrapEvent, teamSharePath, wrapExists } from "@/server/wrapped";
import { wrapShareKey } from "@/server/visibility";

export const dynamic = "force-dynamic";

/** The link and picture for the team wrap. Captain or assistant only: they decide which awards go out. */
export const POST = handle<{ teamId: string; seasonId: string }>(async (req, { teamId, seasonId }) => {
  const u = await requireUser(req);
  const t = num(teamId), s = num(seasonId);
  await requireTeam(sql, u, t, "roster.manage");
  if (!(await wrapExists(sql, t, s))) throw new HttpError(404, "This season isn't wrapped yet.");
  await logWrapEvent(sql, u.id, "wrapped_share", t);
  return { path: teamSharePath(t, s), imagePath: `/api/cards/wrapped/${t}/${s}?team=1&s=${wrapShareKey(t, s, 0)}&format=story` };
});
