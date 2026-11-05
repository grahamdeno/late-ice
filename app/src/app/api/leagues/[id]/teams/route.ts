import { handle, body, num } from "@/server/http";
import { sql, one } from "@/server/db";
import { HttpError } from "@/server/services";
import * as A from "@/server/accounts";
import * as P from "@/server/permissions";
import { createTeam } from "@/server/manage";

export const dynamic = "force-dynamic";

export const POST = handle<{ id: string }>(async (req, { id }) => {
  const u = await A.requireUser(req);
  const l = await one<any>(sql, "SELECT * FROM leagues WHERE id=$1", [num(id)]);
  if (!l) throw new HttpError(404, "League not found.");
  await P.require_(sql, u, "team.create", { leagueId: l.id, rinkId: l.rink_id });
  const b = await body(req);
  return sql.begin(async (tx) => {
    const t = await createTeam(tx, l.id, b);
    await P.audit(tx, u.id, "team.create", { type: "team", id: t.id, rinkId: l.rink_id }, undefined, { name: t.name, league: l.name });
    return { id: t.id };
  });
});
