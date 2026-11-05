import { handle, body, num } from "@/server/http";
import { sql, q, one } from "@/server/db";
import { HttpError } from "@/server/services";
import * as A from "@/server/accounts";

export const dynamic = "force-dynamic";

/** Edit a spot's number, and the position of a player who hasn't signed up (registered players set their own). */
export const PATCH = handle<{ id: string; playerId: string }>(async (req, { id, playerId }) => {
  const u = await A.requireUser(req);
  const teamId = num(id);
  const b = await body(req);
  await sql.begin(async (tx) => {
    const t = await A.requireCaptain(tx, u, teamId);
    const slot = await A.slotOnTeam(tx, teamId, num(playerId));
    if (b?.number !== undefined) {
      const number = A.cleanNumber(b.number);
      if (number) {
        const clash = await one<any>(tx, "SELECT p.display_name FROM roster_entries re JOIN players p ON p.id=re.player_id WHERE re.team_id=$1 AND re.number=$2 AND p.id<>$3", [teamId, number, slot.id]);
        if (clash) throw new HttpError(409, `#${number} is taken by ${clash.display_name}.`);
      }
      await q(tx, "UPDATE roster_entries SET number=$1 WHERE team_id=$2 AND player_id=$3", [number, teamId, slot.id]);
      if (slot.user_id && slot.user_id !== u.id) await A.notify(tx, slot.user_id, { kind: "edit", teamId, link: `/team/${teamId}`, title: `${t.name}: your number is now ${number ? "#" + number : "blank"}` });
    }
    if (b?.position !== undefined) {
      if (!A.POSITIONS.has(b.position)) throw new HttpError(400, "Pick center, wing, defense or goalie.");
      if (slot.user_id) throw new HttpError(409, "Registered players set their own position from their profile.");
      await q(tx, "UPDATE players SET position=$1 WHERE id=$2", [String(b.position), slot.id]);
    }
    await A.refreshDisplay(tx, slot.id);
    await A.logAction(tx, teamId, u.id, "edit_spot", slot.id, slot.user_id ?? null, { number: b?.number, position: b?.position });
  });
  return { ok: true };
});
