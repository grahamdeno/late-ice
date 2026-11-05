import { after } from "next/server";
import { handle, body, num } from "@/server/http";
import { sql, q, one } from "@/server/db";
import { runOcr } from "@/server/sheets";

export const dynamic = "force-dynamic";
export const maxDuration = 60;
export const POST = handle<{ id: string }>(async (_req, { id }) => {
  const sid = num(id);
  await q(sql, "UPDATE sheets SET status='processing', error=NULL WHERE id=$1 AND game_id IS NULL", [sid]);
  after(() => runOcr(sid));
  return Response.json({ id: sid }, { status: 202 });
});
