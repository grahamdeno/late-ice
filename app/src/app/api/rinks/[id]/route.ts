import { handle, body, num } from "@/server/http";
import { sql, q, one } from "@/server/db";
import { HttpError } from "@/server/services";
import * as A from "@/server/accounts";
import * as P from "@/server/permissions";
import { clean } from "@/server/manage";

export const dynamic = "force-dynamic";

/** Edit the rink's profile: name, address, phone, website, sheets of ice. */
export const PATCH = handle<{ id: string }>(async (req, { id }) => {
  const u = await A.requireUser(req);
  const rinkId = num(id), b = await body(req);
  await P.require_(sql, u, "rink.manage", { rinkId });
  const r = await one<any>(sql, "SELECT * FROM rinks WHERE id=$1", [rinkId]);
  if (!r) throw new HttpError(404, "Rink not found.");
  const next = {
    name: b.name !== undefined ? clean(b.name) || r.name : r.name,
    address: b.address !== undefined ? clean(b.address, 120) || null : r.address,
    phone: b.phone !== undefined ? clean(b.phone, 30) || null : r.phone,
    website: b.website !== undefined ? clean(b.website, 120) || null : r.website,
    sheets: b.sheets !== undefined ? Math.max(1, Math.min(8, Number(b.sheets) || 1)) : r.sheets,
  };
  await sql.begin(async (tx) => {
    await q(tx, "UPDATE rinks SET name=$1, address=$2, phone=$3, website=$4, sheets=$5 WHERE id=$6", [next.name, next.address, next.phone, next.website, next.sheets, rinkId]);
    await P.audit(tx, u.id, "rink.edit", { type: "rink", id: rinkId, rinkId }, { name: r.name, address: r.address, phone: r.phone, website: r.website }, next);
  });
  return { ok: true };
});
