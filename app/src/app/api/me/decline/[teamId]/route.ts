import { handle, body, num } from "@/server/http";
import { sql, q, one } from "@/server/db";
import { HttpError } from "@/server/services";
import * as A from "@/server/accounts";

export const dynamic = "force-dynamic";

export const POST = handle<{ teamId: string }>(async (req, { teamId: tid }) => {
  const u = await A.requireUser(req);
  const teamId = num(tid);
  await sql.begin(async (tx) => {
    const t = await A.teamOrThrow(tx, teamId);
    const re = await one<any>(tx, "SELECT re.* FROM roster_entries re JOIN players p ON p.id=re.player_id WHERE re.team_id=$1 AND p.user_id=$2", [teamId, u.id]);
    if (!re) throw new HttpError(404, "You're not on that roster.");
    if (re.source !== "draft") throw new HttpError(400, "You're on this roster from a scanned sheet. Ask your captain to remove you.");
    await q(tx, "DELETE FROM roster_entries WHERE id=$1", [re.id]);
    await A.logAction(tx, teamId, u.id, "decline", re.player_id, u.id);
    const cap = await A.captainOf(tx, teamId);
    if (cap && cap.id !== u.id) await A.notify(tx, cap.id, { kind: "decline", teamId, link: `/team/${teamId}`, title: `${u.name} declined ${t.name}` });
    await A.leaveTeamRoles(tx, u.id, teamId, u.id);
  });
  return { ok: true };
});
