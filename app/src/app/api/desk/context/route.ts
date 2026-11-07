import { handle } from "@/server/http";
import { sql, q } from "@/server/db";
import { requireUser } from "@/server/accounts";

export const dynamic = "force-dynamic";

/** For captains and assistants who aren't rink staff: the rinks their teams play at. */
export const GET = handle(async (req) => {
  const u = await requireUser(req);
  const rinks = await q<any>(sql,
    `SELECT DISTINCT r.id, r.name, r.archived_at FROM role_grants g
     JOIN teams t ON t.id=g.scope_id JOIN leagues l ON l.id=t.league_id JOIN rinks r ON r.id=l.rink_id
     WHERE g.user_id=$1 AND g.scope_type='team' AND g.role IN ('captain','assistant_captain') AND g.revoked_at IS NULL
       AND t.archived_at IS NULL AND COALESCE(t.is_sample,0)=0
     ORDER BY r.name`, [u.id]);
  return { rinks, captainOnly: true, roles: [] };
});
