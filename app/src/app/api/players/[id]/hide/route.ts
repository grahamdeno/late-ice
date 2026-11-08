import { handle, body, num } from "@/server/http";
import { sql, q, one } from "@/server/db";
import { HttpError } from "@/server/services";
import * as A from "@/server/accounts";

export const dynamic = "force-dynamic";

// Anyone can hide a name, no account needed. Games still count for the team.
export const POST = handle<{ id: string }>(async (req, { id }) => {
  const b = await body(req);
  const name = await sql.begin(async (tx) => {
    const p = await one<any>(tx, "SELECT * FROM players WHERE id=$1", [num(id)]);
    if (!p) throw new HttpError(404, "Player not found");
    await q(tx, "INSERT INTO hide_requests (player_id,contact,note) VALUES ($1,$2,$3)", [p.id, String(b?.contact || "").slice(0, 120) || null, String(b?.note || "").slice(0, 500) || null]);
    await q(tx, "UPDATE players SET hidden=1 WHERE id=$1", [p.id]);
    await A.refreshDisplay(tx, p.id);
    return (await one<any>(tx, "SELECT display_name FROM players WHERE id=$1", [p.id]))!.display_name;
  });
  return { ok: true, name };
});
