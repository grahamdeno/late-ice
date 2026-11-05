import { handle, body, num } from "@/server/http";
import { sql, q, one } from "@/server/db";
import { HttpError } from "@/server/services";
import * as A from "@/server/accounts";

export const dynamic = "force-dynamic";

export const POST = handle<{ id: string }>(async (req, { id }) => {
  const u = await A.requireUser(req);
  const teamId = num(id);
  await sql.begin(async (tx) => {
    await A.requireCaptain(tx, u, teamId);
    await q(tx, "DELETE FROM team_roles WHERE team_id=$1 AND user_id=$2 AND role='captain'", [teamId, u.id]);
    await A.logAction(tx, teamId, u.id, "step_down", null, u.id);
  });
  return { ok: true };
});
