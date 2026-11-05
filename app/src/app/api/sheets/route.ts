import { after } from "next/server";
import { handle, body, num } from "@/server/http";
import { sql, q, one } from "@/server/db";
import { createSheet, runOcr, sheetView } from "@/server/sheets";
import { userFromRequest } from "@/server/accounts";
import { HttpError } from "@/server/services";
import { checkScan } from "@/server/scanlimits";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export const GET = handle(async () => {
  const out = [];
  for (const s of await q(sql, "SELECT * FROM sheets ORDER BY id DESC LIMIT 30")) out.push(await sheetView(s));
  return out;
});

export const POST = handle(async (req) => {
  const user = await userFromRequest(req);
  await checkScan(user);
  const { image } = await body<{ image?: string }>(req);
  const m = image?.match(/^data:(image\/(jpeg|png|webp));base64,(.+)$/);
  if (!m) throw new HttpError(400, "Send a JPEG or PNG photo of the scoresheet.");
  const bytes = Buffer.from(m[3], "base64");
  if (bytes.length > 8 * 1024 * 1024) throw new HttpError(413, "That photo is too big. Try again; the app shrinks it before sending.");
  const id = await createSheet(bytes, m[1], "upload", user?.id ?? null);
  after(() => runOcr(id));
  return Response.json({ id }, { status: 202 });
});
