import { handle, body, num } from "@/server/http";
import { sql, q, one } from "@/server/db";
import { HttpError } from "@/server/services";
import * as A from "@/server/accounts";
import * as P from "@/server/permissions";
import * as S from "@/server/staff";

export const dynamic = "force-dynamic";

// Support: one account, read only.
export const GET = handle<{ id: string }>(async (req, { id }) => {
  const u = await A.requireUser(req);
  await P.require_(sql, u, "support.view");
  const target = await one<any>(sql, "SELECT * FROM users WHERE id=$1", [num(id)]);
  if (!target) throw new HttpError(404, "Account not found.");
  const slots = await q(sql,
    `SELECT p.id, p.display_name name, p.name sheet_name, p.hidden, p.rating, re.number, re.source, t.id team_id, t.name team_name, l.level
     FROM players p JOIN roster_entries re ON re.player_id=p.id JOIN teams t ON t.id=re.team_id JOIN leagues l ON l.id=t.league_id WHERE p.user_id=$1`, [target.id]);
  const roles = await A.rolesSummary(sql, target);
  const activity = await q(sql, "SELECT kind, title, created_at FROM notifications WHERE user_id=$1 ORDER BY id DESC LIMIT 15", [target.id]);
  const merges = await q(sql, "SELECT * FROM account_merges WHERE (from_user_id=$1 OR to_user_id=$1) ORDER BY id DESC", [target.id]);
  return { user: { ...(await A.publicUser(sql, target)), createdAt: target.created_at, mergedInto: target.merged_into }, slots, roles, activity, merges };
});
