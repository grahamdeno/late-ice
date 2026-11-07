import { handle, body, num } from "@/server/http";
import { sql } from "@/server/db";
import { requireUser } from "@/server/accounts";
import { castVotes, gameStars } from "@/server/stars";

export const dynamic = "force-dynamic";

/** Save your three picks, best first. Only people who played, only while voting is open, never yourself. */
export const PUT = handle<{ id: string }>(async (req, { id }) => {
  const u = await requireUser(req);
  const b = await body(req);
  return sql.begin(async (tx) => {
    await castVotes(tx, u.id, num(id), b.picks);
    return { ok: true, ...(await gameStars(tx, num(id), u.id)) };
  });
});
