import { handle, body, num } from "@/server/http";
import { sql, one } from "@/server/db";
import { HttpError } from "@/server/services";
import { requireUser, requireTeam, logAction } from "@/server/accounts";
import { assignCooler } from "@/server/gamenight";

export const dynamic = "force-dynamic";

/** Captains and assistants hand out the cooler. { auto: true } picks the next person in turn; { userId } picks by name; { userId: null } clears it. */
export const PUT = handle<{ gid: string }>(async (req, { gid }) => {
  const u = await requireUser(req);
  const b = await body(req);
  return sql.begin(async (tx) => {
    const g = await one<any>(tx, "SELECT id, team_id FROM scheduled_games WHERE id=$1", [num(gid)]);
    if (!g) throw new HttpError(404, "Game not found.");
    await requireTeam(tx, u, g.team_id, "schedule.manual");
    const pick = await assignCooler(tx, g.team_id, g.id, b.auto ? null : b.userId == null ? null : num(b.userId), !!b.auto);
    await logAction(tx, g.team_id, u.id, "cooler_assign", null, null, { game: g.id, userId: pick });
    return { ok: true, userId: pick };
  });
});
