import { handle, num } from "@/server/http";
import { sql } from "@/server/db";
import { requireUser } from "@/server/accounts";
import { HttpError } from "@/server/services";
import { logWrapEvent, recapAccess, sharePath, wrapExists } from "@/server/wrapped";
import { wrapShareKey } from "@/server/visibility";

export const dynamic = "force-dynamic";

/**
 * A3: the link and picture addresses for my own recap. The link opens this recap signed out and nothing else. Each
 * card has its own 1080 x 1920 picture; the picture's alt text is in the recap's `alts`.
 */
export const POST = handle<{ teamId: string; seasonId: string }>(async (req, { teamId, seasonId }) => {
  const u = await requireUser(req);
  const t = num(teamId), s = num(seasonId);
  const a = await recapAccess(sql, u, t, s, null, null);
  if (!(await wrapExists(sql, t, s))) throw new HttpError(404, "This season isn't wrapped yet.");
  await logWrapEvent(sql, u.id, "wrapped_share", t);
  const key = wrapShareKey(t, s, a.playerId);
  return { path: sharePath(t, s, a.playerId), imagePath: `/api/cards/wrapped/${t}/${s}?p=${a.playerId}&s=${key}&format=story` };
});
