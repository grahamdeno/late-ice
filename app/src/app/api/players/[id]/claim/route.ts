import { handle, body, num } from "@/server/http";
import { sql, q, one } from "@/server/db";
import { HttpError } from "@/server/services";
import * as A from "@/server/accounts";

export const dynamic = "force-dynamic";

export const POST = handle<{ id: string }>(async (req, { id }) => {
  const u = await A.requireUser(req);
  if (!u.name) throw new HttpError(400, "Finish your profile first.");
  await sql.begin(async (tx) => {
    const p = await one<any>(tx, "SELECT * FROM players WHERE id=$1 FOR UPDATE", [num(id)]);
    if (!p) throw new HttpError(404, "Player not found");
    if (p.user_id === u.id) return;
    if (p.user_id) throw new HttpError(409, "Someone already claimed this player. Ask your captain to sort it out.");
    const teams = await q<any>(tx, "SELECT re.team_id, re.number, t.name FROM roster_entries re JOIN teams t ON t.id=re.team_id WHERE re.player_id=$1", [p.id]);
    await A.linkSlot(tx, p.id, u.id);
    for (const t of teams) {
      await A.logAction(tx, t.team_id, u.id, "claim", p.id, u.id);
      const cap = await A.captainOf(tx, t.team_id);
      if (cap && cap.id !== u.id) {
        await A.notify(tx, cap.id, {
          kind: "claim", teamId: t.team_id, playerId: p.id, link: `/team/${t.team_id}`,
          title: `${u.name} claimed ${t.number ? "#" + t.number : "a spot"} on ${t.name}`,
          body: "If that's not them, release the claim from the roster.",
        });
      }
    }
  });
  return { ok: true };
});
