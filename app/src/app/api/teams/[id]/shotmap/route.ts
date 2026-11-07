import { handle, num } from "@/server/http";
import { sql } from "@/server/db";
import { HttpError } from "@/server/services";
import * as A from "@/server/accounts";
import { teamShotMap } from "@/server/shotmap";

export const dynamic = "force-dynamic";
// Only players on this team see its shot map. Not rink staff, not support, not other teams.
export const GET = handle<{ id: string }>(async (req, { id }) => {
  const u = await A.requireUser(req);
  const teamId = num(id);
  if (!(await A.onTeam(sql, u.id, teamId))) throw new HttpError(403, "Shot maps are for players on this team.");
  return { sample: true, points: await teamShotMap(sql, teamId) };
});
