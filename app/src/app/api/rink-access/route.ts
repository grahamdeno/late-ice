import { handle, body, num } from "@/server/http";
import { sql, q, one } from "@/server/db";
import { HttpError } from "@/server/services";
import * as A from "@/server/accounts";
import * as P from "@/server/permissions";
import * as S from "@/server/staff";

export const dynamic = "force-dynamic";

// "Run this rink? Request access." Lands in the admin queue; an admin verifies by phone.
export const POST = handle(async (req) => {
  const u = await A.requireApproved(req);
  const b = await body(req);
  const rinkId = Number(b?.rinkId) || 0;
  const rink = await one<any>(sql, "SELECT id, name FROM rinks WHERE id=$1", [rinkId]);
  if (!rink) throw new HttpError(400, "Pick a rink.");
  await sql.begin(async (tx) => {
    if (await one(tx, "SELECT 1 FROM role_requests WHERE kind='rink_manager' AND status='open' AND user_id=$1 AND scope_id=$2", [u.id, rinkId])) return;
    const role = ["owner", "hockey_director", "league_coordinator", "front_desk", "other"].includes(b?.role) ? b.role : "other";
    await q(tx, "INSERT INTO role_requests (kind,user_id,scope_type,scope_id,message,details) VALUES ('rink_manager',$1,'rink',$2,$3,$4::text::jsonb)",
      [u.id, rinkId, String(b?.message || "").slice(0, 500) || null, JSON.stringify({ role })]);
    for (const a of await q<{ user_id: number }>(tx, "SELECT DISTINCT user_id FROM role_grants WHERE role='admin' AND revoked_at IS NULL")) {
      await A.notify(tx, a.user_id, { kind: "request", link: "/staff", title: `${u.name ?? u.email} asked to manage ${rink.name}`, body: "Call the rink to confirm before approving." });
    }
  });
  return { ok: true };
});
