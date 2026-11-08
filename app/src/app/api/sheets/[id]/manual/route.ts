import { handle, body, num } from "@/server/http";
import { sql } from "@/server/db";
import { saveHandEntry } from "@/server/sheets";
import { requireApproved } from "@/server/accounts";

export const dynamic = "force-dynamic";

/** Turn a failed or not-a-scoresheet read into review data. Confirm still goes through the normal path. */
export const POST = handle<{ id: string }>(async (req, { id }) => {
  await requireApproved(req);
  const raw = await body(req);
  const data = await sql.begin((tx) => saveHandEntry(tx, num(id), raw));
  return { ok: true, data };
});
