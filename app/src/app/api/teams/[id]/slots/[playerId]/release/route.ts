import { handle, body, num } from "@/server/http";
import { sql, q, one } from "@/server/db";
import { HttpError } from "@/server/services";
import * as A from "@/server/accounts";

export const dynamic = "force-dynamic";

// Release: undo a claim or a match.
export const POST = handle<{ id: string; playerId: string }>(async (req, { id, playerId }) => {
  const u = await A.requireUser(req);
  const teamId = num(id);
  await sql.begin(async (tx) => {
    const t = await A.requireCaptain(tx, u, teamId);
    const slot = await A.slotOnTeam(tx, teamId, num(playerId));
    if (!slot.user_id) return;
    const was = slot.user_id;
    // A drafted spot has no sheet history; releasing it removes it.
    if (slot.source === "draft") await q(tx, "DELETE FROM roster_entries WHERE team_id=$1 AND player_id=$2", [teamId, slot.id]);
    else await A.unlinkSlot(tx, slot.id);
    await A.logAction(tx, teamId, u.id, "release", slot.id, was);
    if (was !== u.id) await A.notify(tx, was, { kind: "release", teamId, link: `/team/${teamId}`, title: `${t.name}'s captain released your claim on ${slot.number ? "#" + slot.number : "a spot"}`, body: "If that was you, talk to your captain." });
  });
  return { ok: true };
});
