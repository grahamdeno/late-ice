import "server-only";
// Scans cost money (the scoresheet reader is a paid model). Signed-in players only, with a
// monthly cap for the whole app and a daily cap per person. Both can be changed in Vercel env.
import { one, q, sql } from "./db";
import { HttpError } from "./services";
import { can } from "./permissions";
import { isApproved, notify, WAITLIST } from "./accounts";

export const monthlyCap = () => Number(process.env.SCAN_MONTHLY_CAP || 400);
export const dailyCap = () => Number(process.env.SCAN_DAILY_PER_USER || 15);

export async function scanUsage() {
  const r = await one<any>(sql, "SELECT COUNT(*)::int n FROM sheets WHERE created_at >= date_trunc('month', now())");
  return { month: r?.n ?? 0, cap: monthlyCap() };
}

/** Throws if this person may not start a scan right now. */
export async function checkScan(user: any) {
  if (!user) throw new HttpError(401, "Sign in to scan a sheet. It's free and takes a minute.");
  if (!(await isApproved(sql, user))) throw new HttpError(403, WAITLIST);
  const { month, cap } = await scanUsage();
  if (month >= cap) {
    const told = await one(sql, "SELECT 1 FROM notifications WHERE kind='scan_cap' AND created_at >= date_trunc('month', now())");
    if (!told) for (const a of await q<{ user_id: number }>(sql, "SELECT DISTINCT user_id FROM role_grants WHERE role='admin' AND revoked_at IS NULL")) {
      await notify(sql, a.user_id, { kind: "scan_cap", link: "/staff", title: `Scanning paused: this month's cap of ${cap} sheets is reached`, body: "Raise SCAN_MONTHLY_CAP in Vercel to turn it back on." });
    }
    throw new HttpError(429, "Scanning is paused until next month. The organizers have been told.");
  }
  if (!(await can(sql, user, "ratings.recompute"))) {
    const d = await one<any>(sql, "SELECT COUNT(*)::int n FROM sheets WHERE scanned_by=$1 AND created_at > now() - interval '1 day'", [user.id]);
    if ((d?.n ?? 0) >= dailyCap()) throw new HttpError(429, `That's ${dailyCap()} sheets today. Try again tomorrow.`);
  }
}
