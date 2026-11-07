import { handle, body, num } from "@/server/http";
import { sql, q, one } from "@/server/db";
import { HttpError } from "@/server/services";
import * as A from "@/server/accounts";
import { teamRoleOf } from "@/server/permissions";

export const dynamic = "force-dynamic";

// Remove a spot from the roster. Games already played keep their lines.
export const POST = handle<{ id: string; playerId: string }>(async (req, { id, playerId }) => {
  const u = await A.requireUser(req);
  const teamId = num(id);
  await sql.begin(async (tx) => {
    const t = await A.requireCaptain(tx, u, teamId);
    const slot = await A.slotOnTeam(tx, teamId, num(playerId));
    // Assistants run the roster but can't remove the captain or another assistant.
    if (slot.user_id && slot.user_id !== u.id && (await teamRoleOf(tx, slot.user_id, teamId))) {
      const mine = await teamRoleOf(tx, u.id, teamId);
      if (mine === "assistant_captain") throw new HttpError(403, "Only the captain can remove the captain or an assistant.");
    }
    await q(tx, "DELETE FROM roster_entries WHERE team_id=$1 AND player_id=$2", [teamId, slot.id]);
    if (slot.user_id) await A.leaveTeamRoles(tx, slot.user_id, teamId, u.id);
    await A.logAction(tx, teamId, u.id, "remove", slot.id, slot.user_id ?? null, { number: slot.number });
    if (slot.user_id && slot.user_id !== u.id) await A.notify(tx, slot.user_id, { kind: "remove", teamId, link: `/team/${teamId}`, title: `You were taken off ${t.name}'s roster` });
  });
  return { ok: true };
});
