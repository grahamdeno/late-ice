import { handle, body, num } from "@/server/http";
import { sql } from "@/server/db";
import { requireApproved } from "@/server/accounts";
import { castVote } from "@/server/archetypes";

export const dynamic = "force-dynamic";

/** Vote a teammate's archetype for this season. Null takes your vote back. */
export const PUT = handle<{ id: string }>(async (req, { id }) => {
  const u = await requireApproved(req);
  const b = await body(req);
  await castVote(sql, num(id), u.id, num(b.playerId), b.archetype ?? null);
  return { ok: true };
});
