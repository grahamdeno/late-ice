import { handle, body, num } from "@/server/http";
import { sql, q, one } from "@/server/db";
import { HttpError } from "@/server/services";
import * as A from "@/server/accounts";
import * as P from "@/server/permissions";

export const dynamic = "force-dynamic";

// Name an assistant captain (up to two) or remove one.
export const POST = handle<{ id: string }>(async (req, { id }) => {
  const u = await A.requireUser(req);
  const teamId = num(id);
  const b = await body(req);
  const targetId = Number(b?.userId) || 0;
  await sql.begin(async (tx) => {
    const t = await A.requireTeam(tx, u, teamId, "team.assistants");
    const target = await A.userOrThrow(tx, targetId);
    if (!(await A.onTeam(tx, target.id, teamId))) throw new HttpError(400, `${target.name} isn't on the ${t.name} roster.`);
    const role = await P.teamRoleOf(tx, target.id, teamId);
    if (role === "captain") throw new HttpError(400, "The captain can't also be an assistant.");
    if (role === "assistant_captain") return;
    await tx.unsafe("SELECT 1 FROM teams WHERE id=$1 FOR UPDATE", [teamId]);
    if ((await A.assistantsOf(tx, teamId)).length >= 2) throw new HttpError(409, "A team can have two assistant captains. Remove one first.");
    await P.grant(tx, target.id, "assistant_captain", teamId, u.id);
    await A.logAction(tx, teamId, u.id, "assistant", null, target.id);
    if (target.id !== u.id) await A.notify(tx, target.id, { kind: "assistant", teamId, link: `/team/${teamId}`, title: `You're an assistant captain of ${t.name}`, body: "You can now run the roster and schedule with the captain." });
  });
  return { ok: true };
});

export const DELETE = handle<{ id: string }>(async (req, { id }) => {
  const u = await A.requireUser(req);
  const teamId = num(id);
  const targetId = Number(new URL(req.url).searchParams.get("userId")) || 0;
  await sql.begin(async (tx) => {
    const t = await A.requireTeam(tx, u, teamId, "team.assistants");
    if ((await P.teamRoleOf(tx, targetId, teamId)) !== "assistant_captain") return;
    await P.revokeRole(tx, targetId, "assistant_captain", teamId, u.id, "removed by captain");
    await A.logAction(tx, teamId, u.id, "assistant_removed", null, targetId);
    if (targetId !== u.id) await A.notify(tx, targetId, { kind: "assistant", teamId, link: `/team/${teamId}`, title: `You're no longer an assistant captain of ${t.name}` });
  });
  return { ok: true };
});
