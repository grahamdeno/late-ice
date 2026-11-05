import { handle, body, num } from "@/server/http";
import { sql, q, one } from "@/server/db";
import { HttpError } from "@/server/services";
import * as A from "@/server/accounts";

export const dynamic = "force-dynamic";

export const GET = handle<{ id: string }>(async (req, { id }) => {
  const u = await A.requireUser(req);
  const teamId = num(id);
  const t = await A.requireCaptain(sql, u, teamId);
  const slots = (await q<any>(sql,
    `SELECT p.id, p.display_name AS name, p.rating, p.position, p.hidden, p.user_id, re.number, re.source,
       (SELECT CASE WHEN bool_or(r.role='captain') THEN 'C' WHEN bool_or(r.role='assistant_captain') THEN 'A' END FROM role_grants r
          WHERE r.user_id=p.user_id AND r.scope_type='team' AND r.scope_id=re.team_id AND r.revoked_at IS NULL) badge,
       u.name user_name, u.status, u.status_until,
       (SELECT COUNT(*) FROM player_game_stats s WHERE s.player_id=p.id AND s.team_id=re.team_id) gp
     FROM roster_entries re JOIN players p ON p.id=re.player_id LEFT JOIN users u ON u.id=p.user_id
     WHERE re.team_id=$1 ORDER BY NULLIF(regexp_replace(COALESCE(re.number,''),'\\D','','g'),'')::int NULLS LAST, p.display_name`, [teamId]))
    .map((s) => ({ ...s, registered: !!s.user_id, user_name: s.user_id ? s.user_name : null }));
  const actions = await q(sql,
    `SELECT a.*, au.name actor, tu.name target, p.display_name player FROM roster_actions a
     LEFT JOIN users au ON au.id=a.actor_user_id LEFT JOIN users tu ON tu.id=a.target_user_id LEFT JOIN players p ON p.id=a.player_id
     WHERE a.team_id=$1 ORDER BY a.id DESC LIMIT 25`, [teamId]);
  return { team: { id: t.id, name: t.name, color: t.color, logo: t.logo, level: t.level, rinkId: t.rink_id }, slots, actions };
});
