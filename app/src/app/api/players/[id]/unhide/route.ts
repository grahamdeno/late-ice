import { handle, body, num } from "@/server/http";
import { sql, q, one } from "@/server/db";
import { HttpError } from "@/server/services";
import * as A from "@/server/accounts";

export const dynamic = "force-dynamic";

export const POST = handle<{ id: string }>(async (req, { id }) => {
  const u = await A.requireUser(req);
  await sql.begin(async (tx) => {
    const p = await one<any>(tx, "SELECT * FROM players WHERE id=$1", [num(id)]);
    if (!p) throw new HttpError(404, "Player not found");
    const teamIds = (await q<{ team_id: number }>(tx, "SELECT team_id FROM roster_entries WHERE player_id=$1", [p.id])).map((r) => r.team_id);
    let ok = p.user_id === u.id;
    for (const t of teamIds) if (!ok && (await A.isCaptain(tx, u.id, t))) ok = true;
    if (!ok) throw new HttpError(403, "Only the player or their captain can show this name again.");
    await q(tx, "UPDATE players SET hidden=0 WHERE id=$1", [p.id]);
    await A.refreshDisplay(tx, p.id);
  });
  return { ok: true };
});
