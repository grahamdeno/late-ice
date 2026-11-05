import { handle, body, num } from "@/server/http";
import { sql, q, one } from "@/server/db";
import { HttpError } from "@/server/services";
import * as A from "@/server/accounts";

export const dynamic = "force-dynamic";

// Merge two spots that are the same person (spelling variants, a misread number).
export const POST = handle<{ id: string }>(async (req, { id }) => {
  const u = await A.requireUser(req);
  const teamId = num(id);
  const b = await body(req);
  const playerId = await sql.begin(async (tx) => {
    await A.requireCaptain(tx, u, teamId);
    const from = await A.slotOnTeam(tx, teamId, Number(b?.fromId) || 0);
    const into = await A.slotOnTeam(tx, teamId, Number(b?.intoId) || 0);
    // Keep the registered one if only one is registered.
    const [a, c] = from.user_id && !into.user_id ? [into, from] : [from, into];
    await A.mergePlayers(tx, a.id, c.id);
    await A.logAction(tx, teamId, u.id, "merge", c.id, c.user_id ?? null, { merged: a.id, numbers: [a.number, c.number] });
    return c.id;
  });
  return { ok: true, playerId };
});
