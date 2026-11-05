import { handle, body, num } from "@/server/http";
import { sql, q, one } from "@/server/db";
import { HttpError } from "@/server/services";
import * as A from "@/server/accounts";
import * as P from "@/server/permissions";
import * as S from "@/server/staff";

export const dynamic = "force-dynamic";

// Support: find an account by email or name.
export const GET = handle(async (req) => {
  const u = await A.requireUser(req);
  await P.require_(sql, u, "support.view");
  const term = String(new URL(req.url).searchParams.get("q") || "").trim().toLowerCase();
  if (term.length < 2) return [];
  return q(sql,
    `SELECT u.id, u.name, u.email, u.number, u.created_at, r.name home_rink,
       (SELECT string_agg(t.name, ', ') FROM players p JOIN roster_entries re ON re.player_id=p.id JOIN teams t ON t.id=re.team_id WHERE p.user_id=u.id) teams
     FROM users u LEFT JOIN rinks r ON r.id=u.home_rink_id
     WHERE u.merged_into IS NULL AND (lower(u.email) LIKE $1 OR lower(u.name) LIKE $1) ORDER BY u.name NULLS LAST LIMIT 20`, [`%${term}%`]);
});
