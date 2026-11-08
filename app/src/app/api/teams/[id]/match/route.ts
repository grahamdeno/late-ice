import { handle, body, num } from "@/server/http";
import { sql, q, one } from "@/server/db";
import { HttpError } from "@/server/services";
import * as A from "@/server/accounts";

export const dynamic = "force-dynamic";

// Match: link a registered player to a sheet slot; stats and rating stay with the slot.
export const POST = handle<{ id: string }>(async (req, { id }) => {
  const u = await A.requireUser(req);
  const teamId = num(id);
  const b = await body(req);
  await sql.begin(async (tx) => {
    const t = await A.requireCaptain(tx, u, teamId);
    const slot = await A.slotOnTeam(tx, teamId, Number(b?.playerId) || 0);
    const target = await A.userOrThrow(tx, Number(b?.userId) || 0);
    if (slot.user_id === target.id) return;
    if (slot.user_id) throw new HttpError(409, "That spot is already linked to a registered player. Release it first.");
    if (target.home_rink_id !== t.rink_id) throw new HttpError(400, "That player's home rink is somewhere else.");
    // If the player was drafted onto this team already, fold that empty draft spot into the sheet slot.
    const drafted = await one<any>(tx, "SELECT p.* FROM roster_entries re JOIN players p ON p.id=re.player_id WHERE re.team_id=$1 AND p.user_id=$2", [teamId, target.id]);
    if (drafted && drafted.id !== slot.id) {
      const otherTeams = (await one<any>(tx, "SELECT COUNT(*) c FROM roster_entries WHERE player_id=$1 AND team_id<>$2", [drafted.id, teamId]))!.c;
      const hasGames = (await one<any>(tx, "SELECT COUNT(*) c FROM player_game_stats WHERE player_id=$1", [drafted.id]))!.c;
      if (!otherTeams && !hasGames) await A.mergePlayers(tx, drafted.id, slot.id);
      else await q(tx, "DELETE FROM roster_entries WHERE team_id=$1 AND player_id=$2", [teamId, drafted.id]);
    }
    await A.linkSlot(tx, slot.id, target.id);
    await A.logAction(tx, teamId, u.id, "match", slot.id, target.id, { number: slot.number });
    if (target.id !== u.id) {
      await A.notify(tx, target.id, {
        kind: "match", teamId, playerId: slot.id, link: `/player/${slot.id}`,
        title: `${u.name} matched you to ${slot.number ? "#" + slot.number : "a spot"} on ${t.name}`,
        body: "Your stats and rating from the scanned sheets are now on your profile.",
      });
    }
  });
  return { ok: true };
});
