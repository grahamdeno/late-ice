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
  if (b.archived !== undefined) {
    await P.require_(sql, u, "rink.create", {});
    const on = !!b.archived;
    await sql.begin(async (tx) => {
      await q(tx, "UPDATE rinks SET archived_at=CASE WHEN $1 THEN now() ELSE NULL END WHERE id=$2", [on, rinkId]);
      await P.audit(tx, u.id, on ? "rink.archive" : "rink.restore", { type: "rink", id: rinkId, rinkId }, undefined, { name: r.name });
    });
    return { ok: true };
  }
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

/** Delete a rink added by mistake. Admins only, and only while nothing hangs off it. Anything with history gets archived instead. */
export const DELETE = handle<{ id: string }>(async (req, { id }) => {
  const u = await A.requireUser(req);
  const rinkId = num(id);
  await P.require_(sql, u, "rink.create", {});
  const r = await one<any>(sql, "SELECT * FROM rinks WHERE id=$1", [rinkId]);
  if (!r) throw new HttpError(404, "Rink not found.");
  if (await one(sql, "SELECT 1 FROM leagues WHERE rink_id=$1", [rinkId])) throw new HttpError(409, "This rink has leagues. Archive it instead, or remove its leagues first.");
  if (await one(sql, "SELECT 1 FROM users WHERE home_rink_id=$1", [rinkId])) throw new HttpError(409, "Players call this their home rink. Archive it instead.");
  try {
    await sql.begin(async (tx) => {
      await q(tx, "DELETE FROM seasons WHERE rink_id=$1", [rinkId]);
      await q(tx, "UPDATE role_grants SET revoked_at=now() WHERE scope_type='rink' AND scope_id=$1 AND revoked_at IS NULL", [rinkId]);
      await q(tx, "DELETE FROM rinks WHERE id=$1", [rinkId]);
      await P.audit(tx, u.id, "rink.remove", { type: "rink", id: rinkId, rinkId: null }, { name: r.name }, undefined);
    });
  } catch (e: any) {
    if (e?.code === "23503") throw new HttpError(409, "Something still points at this rink. Archive it instead.");
    throw e;
  }
  return { ok: true };
});
