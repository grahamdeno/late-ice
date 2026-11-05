import { handle, body, num } from "@/server/http";
import { sql, q, one } from "@/server/db";
import { HttpError } from "@/server/services";
import * as A from "@/server/accounts";

export const dynamic = "force-dynamic";

export const POST = handle<{ id: string }>(async (req, { id }) => {
  const u = await A.requireUser(req);
  const teamId = num(id);
  return sql.begin(async (tx) => {
    const t = await A.teamOrThrow(tx, teamId);
    if (t.is_sample) throw new HttpError(400, "Placeholder teams can't have captains. Scan a real sheet first.");
    const cap = await A.captainOf(tx, teamId);
    if (cap) {
      if (cap.id === u.id) return { ok: true };
      if (!(await A.onTeam(tx, u.id, teamId))) throw new HttpError(403, "Only players on this roster can contest the captain.");
      await A.logAction(tx, teamId, u.id, "contest", null, cap.id);
      await A.notify(tx, cap.id, { kind: "contest", teamId, link: `/team/${teamId}`, title: `${u.name} says they're the captain of ${t.name}`, body: "Talk it out. A rink admin can reassign the captain." });
      return Response.json({ ok: true, contested: true }, { status: 202 });
    }
    if (!(await A.onTeam(tx, u.id, teamId))) throw new HttpError(403, "Claim your spot on this roster first, then you can take the captain role.");
    await q(tx, "INSERT INTO team_roles (team_id,user_id,role) VALUES ($1,$2,'captain') ON CONFLICT DO NOTHING", [teamId, u.id]);
    await A.logAction(tx, teamId, u.id, "captain", null, u.id);
    return { ok: true };
  });
});
