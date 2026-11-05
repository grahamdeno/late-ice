import { handle, body, num } from "@/server/http";
import { sql, q, one } from "@/server/db";
import { recomputeAll } from "@/server/rating";
import { refreshDisplays } from "@/server/accounts";
import { runDueMerges } from "@/server/staff";
import { syncAllFeeds } from "@/server/schedule";

export const dynamic = "force-dynamic";
export const maxDuration = 60;
// Vercel Cron calls this nightly with "Authorization: Bearer $CRON_SECRET".
export const GET = handle(async (req) => {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get("authorization") !== `Bearer ${secret}`) return new Response("Unauthorized", { status: 401 });
  const r = await recomputeAll();
  await refreshDisplays(sql, true);
  const merges = await runDueMerges();
  const feeds = await syncAllFeeds();
  // Injured reserve and Away end on their return date.
  await q(sql, "UPDATE users SET status='active', status_until=NULL WHERE status IN ('ir','away') AND status_until IS NOT NULL AND status_until < to_char(now() AT TIME ZONE 'America/New_York', 'YYYY-MM-DD')");
  return { ...r, merges, feeds };
});
