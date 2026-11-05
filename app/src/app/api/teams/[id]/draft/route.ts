import { handle, body, num } from "@/server/http";
import { sql, q, one } from "@/server/db";
import { HttpError } from "@/server/services";
import * as A from "@/server/accounts";

export const dynamic = "force-dynamic";

// Draft: pull a registered player onto the team.
export const POST = handle<{ id: string }>(async (req, { id }) => {
  const u = await A.requireUser(req);
  const teamId = num(id);
  const b = await body(req);
  const playerId = await sql.begin(async (tx) => {
    const t = await A.requireCaptain(tx, u, teamId);
    const target = await A.userOrThrow(tx, Number(b?.userId) || 0);
    if (target.home_rink_id !== t.rink_id) throw new HttpError(400, "That player's home rink is somewhere else.");
    if (await A.onTeam(tx, target.id, teamId)) throw new HttpError(409, `${target.name} is already on ${t.name}.`);
    const number = A.cleanNumber(b?.number ?? target.number);
    if (number) {
      const clash = await one<any>(tx, "SELECT p.id, p.display_name, p.user_id FROM roster_entries re JOIN players p ON p.id=re.player_id WHERE re.team_id=$1 AND re.number=$2", [teamId, number]);
      if (clash) {
        throw new HttpError(409, clash.user_id
          ? `#${number} is taken by ${clash.display_name}. Pick another number.`
          : `There's already a #${number} on the roster (${clash.display_name}) from a scanned sheet. If that's ${target.name}, use Match instead so the stats move over.`,
          { clashPlayerId: clash.id });
      }
    }
    const pid = await A.slotForUser(tx, target, t.level);
    await q(tx, "INSERT INTO roster_entries (team_id,player_id,number,source,added_at) VALUES ($1,$2,$3,'draft',now())", [teamId, pid, number]);
    await A.refreshDisplay(tx, pid);
    await A.logAction(tx, teamId, u.id, "draft", pid, target.id, { number });
    if (target.id !== u.id) {
      await A.notify(tx, target.id, {
        kind: "draft", teamId, playerId: pid, link: "/me",
        title: `${u.name} added you to ${t.name}${number ? ` as #${number}` : ""}`,
        body: "Not your team? Decline it from your profile.",
      });
    }
    return pid;
  });
  return { ok: true, playerId };
});
