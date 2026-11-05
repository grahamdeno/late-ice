import { handle, body, num } from "@/server/http";
import { sql, q, one } from "@/server/db";
import { HttpError } from "@/server/services";
import * as A from "@/server/accounts";
import * as P from "@/server/permissions";
import * as S from "@/server/staff";

export const dynamic = "force-dynamic";

// Open requests this staff member can decide.
export const GET = handle(async (req) => {
  const u = await A.requireUser(req);
  const rows = await q<any>(sql,
    `SELECT rq.*, ru.name requester, ru.email requester_email, tu.name target, t.name team_name, rk.name rink_name
     FROM role_requests rq JOIN users ru ON ru.id=rq.user_id LEFT JOIN users tu ON tu.id=rq.target_user_id
     LEFT JOIN teams t ON rq.scope_type='team' AND t.id=rq.scope_id LEFT JOIN rinks rk ON rq.scope_type='rink' AND rk.id=rq.scope_id
     WHERE rq.status='open' AND rq.kind IN ('rink_manager','captain_contest') ORDER BY rq.id`);
  const out = [];
  for (const r of rows) {
    const ok = r.kind === "rink_manager" ? await P.can(sql, u, "system.grant") : await P.can(sql, u, "captain.reassign", { teamId: r.scope_id });
    if (ok) out.push(r);
  }
  return out;
});
