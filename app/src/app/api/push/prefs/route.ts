import { handle, body } from "@/server/http";
import { sql, one, q } from "@/server/db";
import { HttpError } from "@/server/services";
import { requireUser } from "@/server/accounts";
import { vapidPublicKey } from "@/server/push";

export const dynamic = "force-dynamic";

const KEYS = ["game_day", "result", "sub_request", "roster", "confirm"] as const;
type Key = (typeof KEYS)[number];

async function readPrefs(userId: number) {
  const row = await one<Record<Key, boolean>>(sql,
    "SELECT game_day, result, sub_request, roster, confirm FROM notification_prefs WHERE user_id=$1", [userId]);
  const out: Record<string, boolean | string | null> = { publicKey: vapidPublicKey() };
  for (const k of KEYS) out[k] = row ? row[k] !== false : true;
  return out;
}

export const GET = handle(async (req) => {
  const u = await requireUser(req);
  return readPrefs(u.id);
});

export const PUT = handle(async (req) => {
  const u = await requireUser(req);
  const b = await body<Record<string, unknown>>(req);
  const patch: Partial<Record<Key, boolean>> = {};
  for (const k of KEYS) {
    if (b[k] === undefined) continue;
    if (typeof b[k] !== "boolean") throw new HttpError(400, "Each switch is on or off.");
    patch[k] = b[k] as boolean;
  }
  const keys = Object.keys(patch) as Key[];
  if (keys.length) {
    const cols = ["user_id", ...keys].join(",");
    const vals = keys.map((_, i) => `$${i + 2}`).join(",");
    const sets = keys.map((k) => `${k}=EXCLUDED.${k}`).join(",");
    await q(sql,
      `INSERT INTO notification_prefs (${cols}) VALUES ($1,${vals}) ON CONFLICT (user_id) DO UPDATE SET ${sets}`,
      [u.id, ...keys.map((k) => patch[k])]);
  }
  return readPrefs(u.id);
});
