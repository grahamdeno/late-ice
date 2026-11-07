import { handle } from "@/server/http";
import { sql } from "@/server/db";
import { sendWeekly } from "@/server/weekly";

export const dynamic = "force-dynamic";
export const maxDuration = 60;
// Monday morning Eastern. Vercel Cron calls this with "Authorization: Bearer $CRON_SECRET".
export const GET = handle(async (req) => {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get("authorization") !== `Bearer ${secret}`) return new Response("Unauthorized", { status: 401 });
  return { weekly: await sendWeekly(sql) };
});
