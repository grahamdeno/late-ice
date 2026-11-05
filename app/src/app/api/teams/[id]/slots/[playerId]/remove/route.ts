import { handle, body, num } from "@/server/http";
import { sql, q, one } from "@/server/db";
import { HttpError } from "@/server/services";
import * as A from "@/server/accounts";

export const dynamic = "force-dynamic";

// Remove a spot from the roster. Games already played keep their lines.
export const POST = handle<{ id: string; playerId: string }>(async (req, { id, playerId }) => {
  const u = await A.requireUser(req);
  const teamId = num(id);
  await sql.begin(async (tx) => {
    const t = await A.requireCaptain(tx, u, teamId);
    const slot = await A.slotOnTeam(tx, teamId, num(playerId));
    await q(tx, "DELETE FROM roster_entries WHERE team_id=$1 AND player_id=$2", [teamId, slot.id]);
    if (slot.user_id) await q(tx, "DELETE FROM team_roles WHERE team_id=$1 AND user_id=$2 AND user_id<>$3", [teamId, slot.user_id, u.id]);
    await A.logAction(tx, teamId, u.id, "remove", slot.id, slot.user_id ?? null, { number: slot.number });
    if (slot.user_id && slot.user_id !== u.id) await A.notify(tx, slot.user_id, { kind: "remove", teamId, link: `/team/${teamId}`, title: `You were taken off ${t.name}'s roster` });
  });
  return { ok: true };
});
