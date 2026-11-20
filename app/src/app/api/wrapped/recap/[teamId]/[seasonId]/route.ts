import { handle, num } from "@/server/http";
import { sql } from "@/server/db";
import { userFromRequest } from "@/server/accounts";
import { buildRecap, logWrapEvent, recapAccess } from "@/server/wrapped";

export const dynamic = "force-dynamic";

/**
 * One player's recap. Signed in, it is yours. With ?p= and ?s= (a shared link) it is that player's recap and nothing
 * else, signed in or not. Signed out without a valid key it is refused like any other real team page.
 */
export const GET = handle<{ teamId: string; seasonId: string }>(async (req, { teamId, seasonId }) => {
  const url = new URL(req.url);
  const viewer = await userFromRequest(req).catch(() => null);
  const t = num(teamId), s = num(seasonId);
  const a = await recapAccess(sql, viewer, t, s, url.searchParams.get("p"), url.searchParams.get("s"));
  const out = await buildRecap(sql, a, t, s);
  if (a.mode === "own" && viewer) await logWrapEvent(sql, viewer.id, "wrapped_open", t);
  return out;
});
