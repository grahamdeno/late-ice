import { handle, body, num } from "@/server/http";
import { sql, q } from "@/server/db";
import { requireUser } from "@/server/accounts";
import { HttpError } from "@/server/services";
import { sendEmail } from "@/server/staff";
import { rinkWeek, setWeekly, weeklyEmail, weeklyOn } from "@/server/weekly";
import * as P from "@/server/permissions";

export const dynamic = "force-dynamic";

/** Whether the Monday email is on for me. */
export const GET = handle(async (req) => {
  const u = await requireUser(req);
  return { on: await weeklyOn(sql, u.id) };
});

/** Turn the Monday email on or off. */
export const PUT = handle(async (req) => {
  const u = await requireUser(req);
  const b = await body<{ on?: unknown }>(req);
  await setWeekly(sql, u.id, b.on !== false);
  return { on: b.on !== false };
});

/** This week's email for one rink, sent to me now, with the text to show on the page. */
export const POST = handle(async (req) => {
  const u = await requireUser(req);
  const rinkId = num(new URL(req.url).searchParams.get("rink"));
  if (!(await P.can(sql, u, "game.resolve", { rinkId })) && !(await P.can(sql, u, "rink.manage", { rinkId }))) {
    const leagues = await q<{ id: number }>(sql, "SELECT id FROM leagues WHERE rink_id=$1", [rinkId]);
    let ok = false;
    for (const l of leagues) if (await P.can(sql, u, "game.resolve", { leagueId: l.id, rinkId })) { ok = true; break; }
    if (!ok) throw new HttpError(403, "The weekly email is for this rink's staff.");
  }
  const { subject, text } = weeklyEmail(await rinkWeek(sql, u, rinkId));
  const sent = u.email ? await sendEmail(u.email, subject, text) : false;
  return { sent, to: u.email ?? null, subject, text };
});
