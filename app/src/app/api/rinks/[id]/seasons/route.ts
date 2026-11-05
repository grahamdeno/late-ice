import { handle, body, num } from "@/server/http";
import { sql, q, one } from "@/server/db";
import { HttpError } from "@/server/services";
import * as A from "@/server/accounts";
import * as P from "@/server/permissions";
import { clean } from "@/server/manage";

export const dynamic = "force-dynamic";

/** Add a season. Dates can't overlap another season at the rink, so every game lands in one. */
export const POST = handle<{ id: string }>(async (req, { id }) => {
  const u = await A.requireUser(req);
  const rinkId = num(id), b = await body(req);
  await P.require_(sql, u, "season.manage", { rinkId });
  const name = clean(b.name, 40), starts = String(b.startsOn || ""), ends = String(b.endsOn || "");
  if (!name || !/^\d{4}-\d{2}-\d{2}$/.test(starts) || !/^\d{4}-\d{2}-\d{2}$/.test(ends) || ends < starts) throw new HttpError(400, "A name, a start date and an end date after it.");
  const clash = await one<any>(sql, "SELECT name FROM seasons WHERE rink_id=$1 AND starts_on<=$3 AND ends_on>=$2", [rinkId, starts, ends]);
  if (clash) throw new HttpError(409, `Those dates overlap ${clash.name}.`);
  return sql.begin(async (tx) => {
    const s = await one<any>(tx, "INSERT INTO seasons (rink_id, name, starts_on, ends_on) VALUES ($1,$2,$3,$4) RETURNING id", [rinkId, name, starts, ends]);
    await P.audit(tx, u.id, "season.create", { type: "season", id: s.id, rinkId }, undefined, { name, starts, ends });
    return { id: s.id };
  });
});
