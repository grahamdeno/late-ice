import { handle, body, num } from "@/server/http";
import { sql, q, one } from "@/server/db";
import { HttpError } from "@/server/services";
import * as A from "@/server/accounts";
import * as P from "@/server/permissions";
import * as S from "@/server/staff";

export const dynamic = "force-dynamic";

// Grant or revoke staff roles. Admins grant rink managers, support and admins;
// rink managers grant scorekeepers and commissioners at their rink.
export const POST = handle(async (req) => {
  const u = await A.requireUser(req);
  const b = await body(req);
  const role = String(b?.role || "") as P.Role;
  if (!(role in P.ROLE_SCOPE)) throw new HttpError(400, "Unknown role.");
  const scopeId = P.ROLE_SCOPE[role] === "system" ? null : Number(b?.scopeId) || 0;
  const grantId = await sql.begin(async (tx) => {
    const rinkId = await S.requireCanGrant(tx, u, role, scopeId);
    const target = await S.findUser(tx, { userId: b?.userId, email: b?.email });
    const id = await P.grant(tx, target.id, role, scopeId, u.id, String(b?.note || "").slice(0, 100) || undefined);
    if (!id) throw new HttpError(409, `${target.name ?? target.email} already has that role.`);
    await P.audit(tx, u.id, `grant.${role}`, { type: "user", id: target.id, rinkId }, undefined, { role, scopeId });
    await A.notify(tx, target.id, { kind: "role", link: "/staff", title: `You're now ${P.ROLE_LABEL[role].toLowerCase()}${role === "admin" || role === "support" ? "" : " here"}`, body: "Open the staff page from your profile." });
    return id;
  });
  return { ok: true, grantId };
});

export const DELETE = handle(async (req) => {
  const u = await A.requireUser(req);
  const id = Number(new URL(req.url).searchParams.get("id")) || 0;
  await sql.begin(async (tx) => {
    const g = await one<any>(tx, "SELECT * FROM role_grants WHERE id=$1 AND revoked_at IS NULL", [id]);
    if (!g) throw new HttpError(404, "That role is already gone.");
    const rinkId = await S.requireCanGrant(tx, u, g.role, g.scope_id);
    if (g.role === "admin" && g.user_id === u.id) {
      const others = await one<any>(tx, "SELECT COUNT(*) c FROM role_grants WHERE role='admin' AND revoked_at IS NULL AND user_id<>$1", [u.id]);
      if (!others?.c) throw new HttpError(400, "You're the only admin. Make someone else an admin first.");
    }
    await P.revoke(tx, g.id, u.id, "revoked");
    await P.audit(tx, u.id, `revoke.${g.role}`, { type: "user", id: g.user_id, rinkId }, { role: g.role, scopeId: g.scope_id });
  });
  return { ok: true };
});
