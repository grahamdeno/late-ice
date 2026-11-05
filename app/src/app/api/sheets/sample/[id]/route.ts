import { after } from "next/server";
import { handle, body, num } from "@/server/http";
import { sql, q, one } from "@/server/db";
import { SAMPLES, createSheet, runOcr, samplePhoto } from "@/server/sheets";
import { userFromRequest } from "@/server/accounts";
import { HttpError } from "@/server/services";

export const dynamic = "force-dynamic";
export const maxDuration = 120;
export const POST = handle<{ id: string }>(async (req, { id }) => {
  const s = SAMPLES.find((x) => x.id === id);
  if (!s) throw new HttpError(404, "Unknown sample");
  const user = await userFromRequest(req);
  const sheetId = await createSheet(await samplePhoto(s.file), "image/jpeg", "sample", user?.id ?? null);
  after(() => runOcr(sheetId));
  return Response.json({ id: sheetId }, { status: 202 });
});
