import "server-only";
// Scans cost money (the scoresheet reader is a paid model). Signed-in players only, with a
// monthly cap for the whole app and a daily cap per person. Both can be changed in Vercel env.
import { one, q, sql, type Tx } from "./db";
import { HttpError } from "./services";
import { can } from "./permissions";
import { isApproved, notify, WAITLIST } from "./accounts";

export const monthlyCap = () => Number(process.env.SCAN_MONTHLY_CAP || 2000);
export const dailyCap = () => Number(process.env.SCAN_DAILY_PER_USER || 15);
const SHOW_DAILY_AFTER = 10;

export async function scanUsage() {
  const r = await one<any>(sql, "SELECT COUNT(*)::int n FROM sheets WHERE created_at >= date_trunc('month', now())");
  return { month: r?.n ?? 0, cap: monthlyCap() };
}

/** In-app notice to admins, once per kind per month. Caller holds the scan-cap lock. */
async function notifyCap(db: Tx, kind: string, title: string, body: string) {
  const told = await one(db, "SELECT 1 FROM notifications WHERE kind=$1 AND created_at >= date_trunc('month', now())", [kind]);
  if (told) return;
  const admins = await q<{ user_id: number }>(db, "SELECT DISTINCT user_id FROM role_grants WHERE role='admin' AND revoked_at IS NULL");
  for (const a of admins) await notify(db, a.user_id, { kind, link: "/staff", title, body });
}

/** Throws if this person may not start a scan right now. */
export async function checkScan(user: any) {
  if (!user) throw new HttpError(401, "Sign in to scan a sheet. It's free and takes a minute.");
  if (!(await isApproved(sql, user))) throw new HttpError(403, WAITLIST);
  // One lock so two scans can't both send the 60% or 100% notice.
  const block = await sql.begin(async (tx) => {
    await q(tx, "SELECT pg_advisory_xact_lock(481004)");
    const month = (await one<{ n: number }>(tx, "SELECT COUNT(*)::int n FROM sheets WHERE created_at >= date_trunc('month', now())"))?.n ?? 0;
    const cap = monthlyCap();
    if (cap > 0 && month * 5 >= cap * 3) {
      await notifyCap(tx, "scan_cap_60", `Scanning has used 60% of this month's cap of ${cap} sheets.`, "You will get one more notice if the cap is reached.");
    }
    if (month >= cap) {
      await notifyCap(tx, "scan_cap", `Scanning paused: this month's cap of ${cap} sheets is reached`, "Raise SCAN_MONTHLY_CAP in Vercel to turn it back on.");
      return "month" as const;
    }
    if (!(await can(tx, user, "ratings.recompute"))) {
      const d = await one<{ n: number }>(tx, "SELECT COUNT(*)::int n FROM sheets WHERE scanned_by=$1 AND created_at > now() - interval '1 day'", [user.id]);
      if ((d?.n ?? 0) >= dailyCap()) return "day" as const;
    }
    return null;
  });
  if (block === "month") throw new HttpError(429, "Scanning is paused until next month. The organizers have been told.");
  if (block === "day") throw new HttpError(429, `That's ${dailyCap()} sheets today. Try again tomorrow.`);
}

/** What the Scan screen shows after a player has used 10 scans today. Admins are not capped. */
export async function dailyAllowance(user: any) {
  const cap = dailyCap();
  const used = (await one<{ n: number }>(sql, "SELECT COUNT(*)::int n FROM sheets WHERE scanned_by=$1 AND created_at > now() - interval '1 day'", [user.id]))?.n ?? 0;
  if (await can(sql, user, "ratings.recompute")) return { show: false, used, left: null as number | null, cap };
  return { show: used >= SHOW_DAILY_AFTER, used, left: Math.max(0, cap - used), cap };
}
