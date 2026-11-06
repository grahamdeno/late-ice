import { handle, body, num } from "@/server/http";
import { sql, q, one } from "@/server/db";
import { recomputeAll } from "@/server/rating";
import { refreshDisplays, consolidatePeople } from "@/server/accounts";
import { runDueMerges } from "@/server/staff";
import { syncAllFeeds } from "@/server/schedule";
import { runBackup } from "@/server/backup";
import { escalateWaitingSheets } from "@/server/sheetconfirm";
import { deleteOldSheetPhotos } from "@/server/privacy";

export const dynamic = "force-dynamic";
export const maxDuration = 60;
// Vercel Cron calls this nightly with "Authorization: Bearer $CRON_SECRET".
export const GET = handle(async (req) => {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get("authorization") !== `Bearer ${secret}`) return new Response("Unauthorized", { status: 401 });
  const people = await sql.begin((tx) => consolidatePeople(tx));
  const r = { ...(await recomputeAll()), people };
  await refreshDisplays(sql, true);
  const merges = await runDueMerges();
  const feeds = await syncAllFeeds();
  // Injured reserve and Away end on their return date.
  await q(sql, "UPDATE users SET status='active', status_until=NULL WHERE status IN ('ir','away') AND status_until IS NOT NULL AND status_until < to_char(now() AT TIME ZONE 'America/New_York', 'YYYY-MM-DD')");
  const escalated = await escalateWaitingSheets(sql);
  const photos = await deleteOldSheetPhotos();
  // Backup last, so a failure here never blocks the rest; it still shows in the logs.
  const backup = await runBackup().catch((e) => ({ error: String(e?.message ?? e) }));
  return { ...r, merges, feeds, escalated, photos, backup };
});
