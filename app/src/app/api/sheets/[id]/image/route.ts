import { handle, body, num } from "@/server/http";
import { sql, q, one } from "@/server/db";
import { sheetPhoto } from "@/server/sheets";
import { userFromRequest } from "@/server/accounts";
import { imageKeyValid } from "@/server/visibility";

export const dynamic = "force-dynamic";
export const GET = handle<{ id: string }>(async (req, { id }) => {
  const s = await one<any>(sql, "SELECT * FROM sheets WHERE id=$1", [num(id)]);
  // Photos of real scoresheets need a sign-in. The sheet image is loaded with the token in a header or as a blob.
  if (s && s.source !== "sample" && !imageKeyValid(new URL(req.url).searchParams.get("k")) && !(await userFromRequest(req).catch(() => null))) return new Response(null, { status: 401 });
  const bytes = s ? await sheetPhoto(s.image_path) : null;
  if (!s || !bytes) return new Response(null, { status: 404 });
  return new Response(new Uint8Array(bytes), { headers: { "Content-Type": s.mime, "Cache-Control": "private, max-age=3600" } });
});
