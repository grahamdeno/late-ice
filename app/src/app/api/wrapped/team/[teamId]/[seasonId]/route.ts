import { handle, body, num } from "@/server/http";
import { sql } from "@/server/db";
import { requireUser, userFromRequest } from "@/server/accounts";
import { buildTeamWrap, setHiddenAwards, teamWrapAccess } from "@/server/wrapped";

export const dynamic = "force-dynamic";

/** A4: the team wrap. Players on the team see the awards the captain left visible; the captain sees all of them. */
export const GET = handle<{ teamId: string; seasonId: string }>(async (req, { teamId, seasonId }) => {
  const viewer = await userFromRequest(req).catch(() => null);
  const t = num(teamId), s = num(seasonId);
  const a = await teamWrapAccess(sql, viewer, t, s, new URL(req.url).searchParams.get("s"));
  return buildTeamWrap(sql, a, t, s);
});

/** The captain (or an assistant) hides awards before sharing. Body: { hiddenAwards: ["iron_man"] }. */
export const PUT = handle<{ teamId: string; seasonId: string }>(async (req, { teamId, seasonId }) => {
  const u = await requireUser(req);
  const b = await body(req);
  return { hiddenAwards: await setHiddenAwards(sql, u, num(teamId), num(seasonId), b.hiddenAwards) };
});
