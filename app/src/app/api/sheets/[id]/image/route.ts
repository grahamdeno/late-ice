import { handle, body, num } from "@/server/http";
import { sql, q, one } from "@/server/db";
import { sheetPhoto } from "@/server/sheets";

export const dynamic = "force-dynamic";
export const GET = handle<{ id: string }>(async (_req, { id }) => {
  const s = await one<any>(sql, "SELECT * FROM sheets WHERE id=$1", [num(id)]);
  const bytes = s ? await sheetPhoto(s.image_path) : null;
  if (!s || !bytes) return new Response(null, { status: 404 });
  return new Response(new Uint8Array(bytes), { headers: { "Content-Type": s.mime, "Cache-Control": "private, max-age=3600" } });
});
