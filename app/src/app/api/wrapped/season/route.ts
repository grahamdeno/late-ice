import { handle, body, num } from "@/server/http";
import { sql } from "@/server/db";
import { requireUser, userFromRequest } from "@/server/accounts";
import { HttpError } from "@/server/services";
import { wrapSeason, wrapState } from "@/server/wrapped";

export const dynamic = "force-dynamic";

/** What the "Wrap the season" button needs: can this person wrap the team, and is it already wrapped. */
export const GET = handle(async (req) => {
  const u = await userFromRequest(req).catch(() => null);
  if (!u) throw new HttpError(401, "Sign in first.");
  const teamId = new URL(req.url).searchParams.get("teamId");
  if (!teamId) throw new HttpError(400, "Pick a team.");
  return wrapState(sql, u, num(teamId));
});

/** A5: { teamId } for a captain's own team, or { leagueId } for rink staff to wrap every team in a league. */
export const POST = handle(async (req) => {
  const u = await requireUser(req);
  const b = await body(req);
  return sql.begin((tx) => wrapSeason(tx, u, { teamId: b.teamId, leagueId: b.leagueId }));
});
