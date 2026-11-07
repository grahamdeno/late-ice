import { handle } from "@/server/http";
import { sql, one } from "@/server/db";
import { userFromRequest } from "@/server/accounts";

export const dynamic = "force-dynamic";
/** What an invite link is for, shown on the join screen. */
export const GET = handle<{ token: string }>(async (req, { token }) => {
  const i = await one<any>(sql,
    `SELECT t.id team_id, t.name team, l.name league, r.name rink FROM team_invites i JOIN teams t ON t.id=i.team_id JOIN leagues l ON l.id=t.league_id JOIN rinks r ON r.id=l.rink_id
     WHERE i.token=$1 AND i.revoked_at IS NULL AND i.uses < i.max_uses`, [String(token).slice(0, 64)]);
  if (!i) return { valid: false };
  // The team, league and rink show once the person has signed in.
  const viewer = await userFromRequest(req).catch(() => null);
  return viewer ? { valid: true, ...i } : { valid: true };
});
