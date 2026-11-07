import { handle, body } from "@/server/http";
import { sql, one, q } from "@/server/db";
import { HttpError } from "@/server/services";
import { requireUser } from "@/server/accounts";

export const dynamic = "force-dynamic";

// Own account only. A user id in the body is ignored. requireUser is the check:
// there is no role for "edit my own notification device", same as editing a profile.
function subscription(b: any) {
  const endpoint = String(b?.endpoint || "");
  let url: URL;
  try { url = new URL(endpoint); } catch { throw new HttpError(400, "That subscription is missing an address."); }
  if (url.protocol !== "https:" || url.username || url.password) throw new HttpError(400, "Push needs an https address.");
  if (endpoint.length > 2000) throw new HttpError(400, "That subscription address is too long.");
  const p256dh = String(b?.keys?.p256dh || "");
  const auth = String(b?.keys?.auth || "");
  const key = /^[A-Za-z0-9_-]+=*$/;
  if (!key.test(p256dh) || p256dh.length < 8 || p256dh.length > 200) throw new HttpError(400, "That subscription is missing its key.");
  if (!key.test(auth) || auth.length < 8 || auth.length > 200) throw new HttpError(400, "That subscription is missing its key.");
  return { endpoint, p256dh, auth };
}

export const POST = handle(async (req) => {
  const u = await requireUser(req);
  const sub = subscription(await body(req));
  // One device, one account. Signing in as someone else on this browser takes the device with them.
  await q(sql,
    `INSERT INTO push_subscriptions (user_id, endpoint, p256dh, auth) VALUES ($1,$2,$3,$4)
     ON CONFLICT (endpoint) DO UPDATE SET user_id=EXCLUDED.user_id, p256dh=EXCLUDED.p256dh, auth=EXCLUDED.auth`,
    [u.id, sub.endpoint, sub.p256dh, sub.auth]);
  return { ok: true };
});

export const DELETE = handle(async (req) => {
  const u = await requireUser(req);
  const endpoint = String((await body(req))?.endpoint || "");
  if (!endpoint) throw new HttpError(400, "That subscription is missing an address.");
  const gone = await one(sql, "DELETE FROM push_subscriptions WHERE user_id=$1 AND endpoint=$2 RETURNING id", [u.id, endpoint]);
  if (!gone) throw new HttpError(404, "That device isn't subscribed.");
  return { ok: true };
});
