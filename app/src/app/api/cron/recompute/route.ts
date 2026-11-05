import { handle, body, num } from "@/server/http";
import { sql, q, one } from "@/server/db";
import { recomputeAll } from "@/server/rating";
import { refreshDisplays } from "@/server/accounts";

export const dynamic = "force-dynamic";
export const maxDuration = 60;
// Vercel Cron calls this nightly with "Authorization: Bearer $CRON_SECRET".
export const GET = handle(async (req) => {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get("authorization") !== `Bearer ${secret}`) return new Response("Unauthorized", { status: 401 });
  const r = await recomputeAll();
  await refreshDisplays(sql, true);
  return r;
});
