import { handle } from "@/server/http";
import { sql } from "@/server/db";
import { sendGameDayNotices } from "@/server/push";

export const dynamic = "force-dynamic";
export const maxDuration = 60;
// Game-day alerts go out mid-morning, after quiet hours end. The nightly job runs at 3 am Eastern,
// inside quiet hours, so every push from it was held. Vercel Cron calls this with "Authorization: Bearer $CRON_SECRET".
export const GET = handle(async (req) => {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get("authorization") !== `Bearer ${secret}`) return new Response("Unauthorized", { status: 401 });
  return { gameDay: await sendGameDayNotices(sql) };
});
