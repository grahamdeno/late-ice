import { handle, body, num } from "@/server/http";
import { sql } from "@/server/db";
import { requireUser } from "@/server/accounts";
import { setCaptainArchetype } from "@/server/archetypes";

export const dynamic = "force-dynamic";

/** The team's captain, or an admin, sets the archetype shown for one player. Null clears it. */
export const PUT = handle<{ id: string }>(async (req, { id }) => {
  const u = await requireUser(req);
  const b = await body(req);
  await setCaptainArchetype(sql, u.id, num(id), num(b.playerId), b.archetype ?? null);
  return { ok: true };
});
