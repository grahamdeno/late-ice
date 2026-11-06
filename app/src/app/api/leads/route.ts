import { handle, body } from "@/server/http";
import { sql, q, one } from "@/server/db";
import { HttpError } from "@/server/services";

export const dynamic = "force-dynamic";

// A few submissions per address per hour is plenty for a real rink; more is a bot.
const recent = new Map<string, number[]>();
function allow(ip: string, now = Date.now()) {
  const hits = (recent.get(ip) ?? []).filter((t) => now - t < 3600_000);
  if (hits.length >= 5) return false;
  hits.push(now);
  recent.set(ip, hits);
  return true;
}
const clip = (v: unknown, n: number) => (typeof v === "string" ? v.trim().slice(0, n) : "");

/** The website's claim form. Saves the lead and tells admins in the app. */
export const POST = handle(async (req) => {
  const b = await body(req);
  if (clip(b?.website, 200)) return { ok: true }; // honeypot: people never fill the hidden field
  const ip = (req.headers.get("x-forwarded-for") || "").split(",")[0].trim() || "unknown";
  if (!allow(ip)) throw new HttpError(429, "That's a lot of requests. Try again in an hour, or email us.");
  const rinkName = clip(b?.rinkName, 120), contact = clip(b?.contactName, 80), email = clip(b?.email, 160).toLowerCase();
  if (!rinkName || !contact || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) throw new HttpError(400, "Rink, your name and a work email are needed.");
  const rinkId = Number(b?.rinkId) || null;
  if (rinkId && !(await one(sql, "SELECT 1 FROM rinks WHERE id=$1", [rinkId]))) throw new HttpError(400, "Pick your rink from the list, or choose Not listed.");
  const lead = await one<{ id: number }>(sql,
    `INSERT INTO rink_leads (rink_id, rink_name, city, contact_name, role, email, phone, league_count, scheduler, founding, notes, source)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) RETURNING id`,
    [rinkId, rinkName, clip(b?.city, 80) || null, contact, clip(b?.role, 40) || null, email, clip(b?.phone, 40) || null,
     clip(b?.leagueCount, 20) || null, clip(b?.scheduler, 40) || null, b?.founding !== false, clip(b?.notes, 1000) || null, clip(b?.source, 40) || "website"]);
  const { notify } = await import("@/server/accounts");
  const admins = await q<{ user_id: number }>(sql, "SELECT DISTINCT user_id FROM role_grants WHERE role IN ('admin','support') AND revoked_at IS NULL");
  for (const a of admins) {
    await notify(sql, a.user_id, { kind: "lead", title: `${rinkName}: ${rinkId ? "wants to claim their rink" : "wants to join Late Ice"}`, body: `${contact}${clip(b?.role, 40) ? `, ${clip(b?.role, 40)}` : ""} · ${email}`, link: "/staff" }).catch(() => {});
  }
  const { sendEmail } = await import("@/server/staff");
  const to = process.env.LEADS_EMAIL;
  if (to) await sendEmail(to, `New rink lead: ${rinkName}`, `${contact} (${clip(b?.role, 40) || "role not given"}) ${email} ${clip(b?.phone, 40)}\n${clip(b?.city, 80)}\nLeagues: ${clip(b?.leagueCount, 20)} · Scheduler: ${clip(b?.scheduler, 40)}\n${clip(b?.notes, 1000)}`).catch(() => {});
  return { ok: true, id: lead!.id };
});
