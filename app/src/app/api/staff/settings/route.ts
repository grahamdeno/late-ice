import { handle, body } from "@/server/http";
import { sql, q } from "@/server/db";
import * as A from "@/server/accounts";
import * as P from "@/server/permissions";

export const dynamic = "force-dynamic";

export const GET = handle(async (req) => {
  const u = await A.requireUser(req);
  await P.require_(sql, u, "system.grant");
  return { signupsPaused: await A.signupsPaused() };
});

/** The sign-up pause switch. Existing players keep signing in either way. */
export const PUT = handle(async (req) => {
  const u = await A.requireUser(req);
  await P.require_(sql, u, "system.grant");
  const b = await body(req);
  const paused = !!b.signupsPaused;
  await sql.begin(async (tx) => {
    await q(tx, "INSERT INTO app_settings (key, value, updated_by) VALUES ('signups_paused', $1::text::jsonb, $2) ON CONFLICT (key) DO UPDATE SET value=EXCLUDED.value, updated_by=EXCLUDED.updated_by, updated_at=now()", [JSON.stringify(paused), u.id]);
    await P.audit(tx, u.id, paused ? "signups.pause" : "signups.resume", { type: "system" }, undefined, { paused });
  });
  return { signupsPaused: paused };
});
