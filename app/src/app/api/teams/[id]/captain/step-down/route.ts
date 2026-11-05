import { handle, body, num } from "@/server/http";
import { sql, q, one } from "@/server/db";
import { HttpError } from "@/server/services";
import * as A from "@/server/accounts";
import * as P from "@/server/permissions";

export const dynamic = "force-dynamic";

export const POST = handle<{ id: string }>(async (req, { id }) => {
  const u = await A.requireUser(req);
  const teamId = num(id);
  await sql.begin(async (tx) => {
    if (!(await A.isCaptain(tx, u.id, teamId))) throw new HttpError(403, "You're not the captain of this team.");
    await A.logAction(tx, teamId, u.id, "step_down", null, u.id);
    await A.vacateCaptain(tx, teamId, u.id, "stepped down");
  });
  return { ok: true };
});
