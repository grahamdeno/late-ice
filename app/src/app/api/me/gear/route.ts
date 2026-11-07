import { handle, body } from "@/server/http";
import { sql } from "@/server/db";
import { requireUser } from "@/server/accounts";
import { gearFor, saveGear } from "@/server/gamenight";

export const dynamic = "force-dynamic";

export const GET = handle(async (req) => {
  const u = await requireUser(req);
  return gearFor(sql, u.id);
});

/** { sharpenedOn: "2026-11-02" | null, every: 15 } */
export const PUT = handle(async (req) => {
  const u = await requireUser(req);
  await saveGear(sql, u.id, await body(req));
  return gearFor(sql, u.id);
});
