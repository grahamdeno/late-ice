import { randomBytes } from "node:crypto";
import { handle, num } from "@/server/http";
import { sql, q, one } from "@/server/db";
import { HttpError } from "@/server/services";
import { requireUser, requireTeam, logAction } from "@/server/accounts";

export const dynamic = "force-dynamic";
const PER_WEEK = 3;

async function current(teamId: number) {
  return one<any>(sql, "SELECT token, uses, max_uses, created_at FROM team_invites WHERE team_id=$1 AND revoked_at IS NULL AND uses < max_uses ORDER BY created_at DESC LIMIT 1", [teamId]);
}
const shape = (i: any) => i ? { token: i.token, path: `/join?invite=${i.token}`, uses: i.uses, maxUses: i.max_uses, createdAt: i.created_at } : null;

/** The team's invite link, for captains, assistants and staff. */
export const GET = handle<{ id: string }>(async (req, { id }) => {
  const u = await requireUser(req);
  await requireTeam(sql, u, num(id), "roster.manage");
  return { invite: shape(await current(num(id))) };
});

/** Make a link if there isn't one. A few new links a week per team, so one can't be sprayed everywhere. */
export const POST = handle<{ id: string }>(async (req, { id }) => {
  const u = await requireUser(req);
  const teamId = num(id);
  await requireTeam(sql, u, teamId, "roster.manage");
  const have = await current(teamId);
  if (have) return { invite: shape(have) };
  const made = (await one<any>(sql, "SELECT COUNT(*)::int n FROM team_invites WHERE team_id=$1 AND created_at > now() - interval '7 days'", [teamId]))!.n;
  if (made >= PER_WEEK) throw new HttpError(429, `That's ${PER_WEEK} new invite links this week. Try again in a few days, or ask staff.`);
  const token = randomBytes(12).toString("base64url");
  const i = await one<any>(sql, "INSERT INTO team_invites (token, team_id, created_by) VALUES ($1,$2,$3) RETURNING *", [token, teamId, u.id]);
  await logAction(sql, teamId, u.id, "invite_link", null, null, {});
  return { invite: shape(i) };
});

/** Turn the link off (if it got shared too widely). */
export const DELETE = handle<{ id: string }>(async (req, { id }) => {
  const u = await requireUser(req);
  const teamId = num(id);
  await requireTeam(sql, u, teamId, "roster.manage");
  await q(sql, "UPDATE team_invites SET revoked_at=now() WHERE team_id=$1 AND revoked_at IS NULL", [teamId]);
  await logAction(sql, teamId, u.id, "invite_revoked", null, null, {});
  return { ok: true };
});
