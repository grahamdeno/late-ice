import { handle, body, num } from "@/server/http";
import { sql, q, one } from "@/server/db";
import { HttpError } from "@/server/services";
import * as A from "@/server/accounts";
import * as P from "@/server/permissions";
import * as S from "@/server/staff";

export const dynamic = "force-dynamic";

// Move an old account into a new one. Support starts it with a 24-hour hold; admins can run it now.
export const GET = handle(async (req) => {
  const u = await A.requireUser(req);
  await P.require_(sql, u, "support.merge");
  return q(sql,
    `SELECT m.*, f.name from_name, f.email from_email, t.name to_name, t.email to_email FROM account_merges m
     JOIN users f ON f.id=m.from_user_id JOIN users t ON t.id=m.to_user_id ORDER BY m.id DESC LIMIT 50`);
});

export const POST = handle(async (req) => {
  const u = await A.requireUser(req);
  const b = await body(req);
  const now = !!b?.now;
  const result = await sql.begin(async (tx) => {
    await P.require_(tx, u, "support.merge");
    if (now) await P.require_(tx, u, "system.grant");
    const from = await S.findUser(tx, { userId: b?.fromUserId, email: b?.fromEmail });
    const to = await S.findUser(tx, { userId: b?.toUserId, email: b?.toEmail });
    if (from.id === to.id) throw new HttpError(400, "Pick two different accounts.");
    if (await one(tx, "SELECT 1 FROM account_merges WHERE status='pending' AND (from_user_id=$1 OR to_user_id=$1)", [from.id])) throw new HttpError(409, "A merge for that account is already waiting.");
    const runAfter = new Date(Date.now() + (now ? 0 : S.MERGE_HOLD_MS));
    const m = (await one<any>(tx, "INSERT INTO account_merges (from_user_id,to_user_id,requested_by,run_after) VALUES ($1,$2,$3,$4) RETURNING *", [from.id, to.id, u.id, runAfter.toISOString()]))!;
    await P.audit(tx, u.id, "account.merge_requested", { type: "user", id: from.id }, undefined, { into: to.id, runAfter, now });
    if (now) { await S.runMerge(tx, m, u.id); return { merge: m, ran: true, from }; }
    return { merge: m, ran: false, from };
  });
  if (!result.ran && result.from.email) {
    const sent = await S.sendEmail(result.from.email, "Your Late Ice account is being moved",
      "Someone asked to move your Late Ice account to a new email address. If this wasn't you, reply to this email or write to support@tangomike.app within 24 hours to stop it.");
    if (sent) await q(sql, "UPDATE account_merges SET notified_at=now() WHERE id=$1", [result.merge.id]);
  }
  return { ok: true, id: result.merge.id, ran: result.ran, runAfter: result.merge.run_after };
});

export const DELETE = handle(async (req) => {
  const u = await A.requireUser(req);
  await P.require_(sql, u, "support.merge");
  const id = Number(new URL(req.url).searchParams.get("id")) || 0;
  await q(sql, "UPDATE account_merges SET status='cancelled' WHERE id=$1 AND status='pending'", [id]);
  await P.audit(sql, u.id, "account.merge_cancelled", { type: "merge", id });
  return { ok: true };
});
