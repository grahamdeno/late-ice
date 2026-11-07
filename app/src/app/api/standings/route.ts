import { handle, num } from "@/server/http";
import { sql } from "@/server/db";
import { userFromRequest } from "@/server/accounts";
import { currentSeason, standingsForRink } from "@/server/services";
import { rinkFor } from "@/server/visibility";

export const dynamic = "force-dynamic";

/** Every non-demo, non-tournament league at the rink, with standings rows. At most two queries. */
export const GET = handle(async (req) => {
  const u = new URL(req.url);
  const viewer = await userFromRequest(req).catch(() => null);
  const rinkId = (await rinkFor(sql, viewer, num(u.searchParams.get("rink")))) ?? 0;
  const seasonQs = u.searchParams.get("season");
  const seasonId = seasonQs ? num(seasonQs) : ((await currentSeason(sql, rinkId))?.id ?? null);
  const leagues = await standingsForRink(sql, rinkId, seasonId);
  return { rinkId, seasonId, leagues };
});
