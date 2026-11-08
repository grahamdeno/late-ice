import { handle, body } from "@/server/http";
import { sql, q, one } from "@/server/db";
import { HttpError } from "@/server/services";
import * as A from "@/server/accounts";
import { requireUser, notify, captainOf, isApproved } from "@/server/accounts";
import { SUPPORT_EMAIL } from "@/lib/contact";

export const dynamic = "force-dynamic";

/** Signed in through a team's invite link: let in, and pointed at that team's roster. */
export const POST = handle(async (req) => {
  const u = await requireUser(req);
  const b = await body(req);
  return sql.begin(async (tx) => {
    const i = await one<any>(tx,
      `SELECT i.*, t.name team, l.rink_id FROM team_invites i JOIN teams t ON t.id=i.team_id JOIN leagues l ON l.id=t.league_id
       WHERE i.token=$1 AND i.revoked_at IS NULL AND i.uses < i.max_uses FOR UPDATE OF i`, [String(b?.token ?? "").slice(0, 64)]);
    if (!i) throw new HttpError(404, "That invite link has expired. Ask your captain for a new one.");
    if (u.access === "removed") throw new HttpError(403, `This account can't join. Email ${SUPPORT_EMAIL}.`);
    const already = await isApproved(tx, u);
    await q(tx, "UPDATE users SET access='approved', invited_team_id=$1, home_rink_id=COALESCE(home_rink_id,$2) WHERE id=$3", [i.team_id, i.rink_id, u.id]);
    if (!already) {
      await q(tx, "UPDATE team_invites SET uses=uses+1 WHERE token=$1", [i.token]);
      const cap = await captainOf(tx, i.team_id);
      if (cap && cap.id !== u.id) await notify(tx, cap.id, { kind: "invite", teamId: i.team_id, link: `/team/${i.team_id}`, title: `${u.name ?? u.email} joined from your invite`, body: "They go on your roster once their profile is done. Check their number." });
    }
    await A.seatInvited(tx, u.id);
    return { teamId: i.team_id, team: i.team, newlyApproved: !already };
  });
});
