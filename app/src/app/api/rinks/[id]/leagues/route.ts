import { handle, body, num } from "@/server/http";
import { sql } from "@/server/db";
import * as A from "@/server/accounts";
import * as P from "@/server/permissions";
import { createLeague } from "@/server/manage";

export const dynamic = "force-dynamic";

export const POST = handle<{ id: string }>(async (req, { id }) => {
  const u = await A.requireUser(req);
  const rinkId = num(id), b = await body(req);
  await P.require_(sql, u, "league.create", { rinkId });
  return sql.begin(async (tx) => {
    const l = await createLeague(tx, rinkId, b);
    await P.audit(tx, u.id, "league.create", { type: "league", id: l.id, rinkId }, undefined, { name: l.name, level: l.level });
    return { id: l.id };
  });
});
