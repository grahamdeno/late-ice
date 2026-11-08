import { handle, body, num } from "@/server/http";
import { sql } from "@/server/db";
import { HttpError } from "@/server/services";
import { requireUser } from "@/server/accounts";
import { saveLineup } from "@/server/lineups";

export const dynamic = "force-dynamic";

/**
 * Save who played one imported game for one team. Ratings replay every game in order, so the
 * nightly recompute (or an admin's Recalculate) picks the lineup up; nothing is rated here.
 */
export const PUT = handle<{ teamId: string; gameId: string }>(async (req, { teamId, gameId }) => {
  const u = await requireUser(req);
  const b = await body<{ playerIds?: unknown; goalieId?: unknown }>(req);
  if (!Array.isArray(b.playerIds)) throw new HttpError(400, "Send the players who played.");
  if (b.playerIds.length > 60) throw new HttpError(400, "That's more players than a team dresses.");
  return sql.begin((tx) => saveLineup(tx, u, num(teamId), num(gameId), b.playerIds as number[], b.goalieId == null ? null : Number(b.goalieId)));
});
