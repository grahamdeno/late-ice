import { handle, body, num } from "@/server/http";
import { sql, q, one } from "@/server/db";
import { HttpError } from "@/server/services";
import { requireUser, requireTeam, logAction } from "@/server/accounts";
import { KINDS, rinkInstant } from "@/server/schedule";

export const dynamic = "force-dynamic";

async function load(tx: any, teamId: number, gid: number) {
  const g = await one<any>(tx, "SELECT * FROM scheduled_games WHERE id=$1 AND team_id=$2", [gid, teamId]);
  if (!g) throw new HttpError(404, "That game isn't on this team's schedule.");
  return g;
}

/** Edit a hand-added game, or mark any game canceled (a feed game comes back if the feed still lists it). */
export const PATCH = handle<{ id: string; gid: string }>(async (req, { id, gid }) => {
  const u = await requireUser(req);
  const teamId = num(id), b = await body(req);
  return sql.begin(async (tx) => {
    await requireTeam(tx, u, teamId, "schedule.manual");
    const g = await load(tx, teamId, num(gid));
    if (b.status === "canceled" || b.status === "scheduled") {
      await q(tx, "UPDATE scheduled_games SET status=$1, updated_at=now() WHERE id=$2", [b.status, g.id]);
    }
    if (g.source === "manual") {
      const kind = b.kind !== undefined ? (KINDS.has(b.kind) ? b.kind : g.kind) : g.kind;
      const when = b.date !== undefined || b.time !== undefined ? rinkInstant(b.date ?? g.local_date, b.time ?? g.local_time) : null;
      const location = b.location !== undefined ? String(b.location).trim().slice(0, 80) || null : g.location;
      await q(tx, "UPDATE scheduled_games SET kind=$1, location=$2, starts_at=COALESCE($3, starts_at), local_date=COALESCE($4, local_date), local_time=COALESCE($5, local_time), updated_at=now() WHERE id=$6",
        [kind, location, when?.at.toISOString() ?? null, when?.localDate ?? null, when?.localTime ?? null, g.id]);
    }
    await logAction(tx, teamId, u.id, "schedule_edit", null, null, { id: g.id, ...b });
    return { ok: true };
  });
});

export const DELETE = handle<{ id: string; gid: string }>(async (req, { id, gid }) => {
  const u = await requireUser(req);
  const teamId = num(id);
  return sql.begin(async (tx) => {
    await requireTeam(tx, u, teamId, "schedule.manual");
    const g = await load(tx, teamId, num(gid));
    if (g.source !== "manual") throw new HttpError(400, "This game comes from your calendar feed. Mark it canceled instead, or fix it in the league calendar.");
    await q(tx, "DELETE FROM scheduled_games WHERE id=$1", [g.id]);
    await logAction(tx, teamId, u.id, "schedule_remove", null, null, { id: g.id, date: g.local_date });
    return { ok: true };
  });
});
