import { handle, body, num } from "@/server/http";
import { sql, q, one } from "@/server/db";
import { HttpError } from "@/server/services";
import { requireUser, requireTeam, logAction } from "@/server/accounts";

export const dynamic = "force-dynamic";

/** Mark a roster spot as a sub: their games and stats count, but they aren't on the team. */
export const PATCH = handle<{ id: string; playerId: string }>(async (req, { id, playerId }) => {
  const u = await requireUser(req);
  const teamId = num(id), pid = num(playerId);
  const b = await body(req);
  return sql.begin(async (tx) => {
    await requireTeam(tx, u, teamId, "roster.manage");
    const re = await one<any>(tx, "SELECT * FROM roster_entries WHERE team_id=$1 AND player_id=$2", [teamId, pid]);
    if (!re) throw new HttpError(404, "That player isn't on this roster.");
    await q(tx, "UPDATE roster_entries SET is_sub=$1 WHERE id=$2", [!!b.sub, re.id]);
    await logAction(tx, teamId, u.id, b.sub ? "mark_sub" : "unmark_sub", pid, null);
    return { ok: true };
  });
});
