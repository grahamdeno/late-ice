import { handle } from "@/server/http";
import { sql, q } from "@/server/db";
import * as A from "@/server/accounts";
import * as P from "@/server/permissions";

export const dynamic = "force-dynamic";

/** New accounts on the waitlist that this person can let in: admins see all, rink managers their rink's. */
export const GET = handle(async (req) => {
  const u = await A.requireUser(req);
  const rows = await q<any>(sql,
    `SELECT u.id, u.name, u.email, u.number, u.position, u.home_rink_id, r.name rink, u.created_at,
       (SELECT string_agg(DISTINCT t.name, ', ') FROM players p JOIN roster_entries re ON re.player_id=p.id JOIN teams t ON t.id=re.team_id WHERE p.user_id=u.id) teams
     FROM users u LEFT JOIN rinks r ON r.id=u.home_rink_id
     WHERE u.access='waiting' AND u.merged_into IS NULL
       AND NOT EXISTS (SELECT 1 FROM role_grants g WHERE g.user_id=u.id AND g.revoked_at IS NULL)
     ORDER BY u.created_at LIMIT 200`);
  const out = [];
  for (const r of rows) if (await P.can(sql, u, "signup.approve", { rinkId: r.home_rink_id ?? undefined })) out.push(r);
  return out;
});
