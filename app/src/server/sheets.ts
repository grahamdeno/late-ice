import "server-only";
import fs from "node:fs/promises";
import path from "node:path";
import { one, q, sql } from "./db";
import { readScoresheet, checkSheet, type OcrResult } from "./ocr";
import { suggest } from "./services";
import { supabaseAdmin, SHEETS_BUCKET } from "./supabase";

export const SAMPLES = [
  { id: "demo-flyers-owls", title: "Demo · Flyers vs Owls", file: "demo-flyers-owls.jpg" },
  { id: "demo-salts-dadbods", title: "Demo · Old Salts vs Dad Bod Squad", file: "demo-salts-dadbods.jpg" },
];

export async function samplePhoto(file: string) {
  return fs.readFile(path.join(process.cwd(), "public", "samples", file));
}

/** Store the photo in the private bucket and record the sheet. OCR runs after the response. */
export async function createSheet(bytes: Buffer, mime: string, source: string, scannedBy: number | null) {
  const ext = mime === "image/png" ? "png" : mime === "image/webp" ? "webp" : "jpg";
  const key = `${new Date().toISOString().slice(0, 10)}/sheet-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
  const { error } = await supabaseAdmin().storage.from(SHEETS_BUCKET).upload(key, bytes, { contentType: mime, upsert: false });
  if (error) throw new Error(`Photo upload failed: ${error.message}`);
  const row = await one<{ id: number }>(sql, "INSERT INTO sheets (image_path,mime,status,source,scanned_by) VALUES ($1,$2,'processing',$3,$4) RETURNING id", [key, mime, source, scannedBy]);
  return row!.id;
}

export async function sheetPhoto(imagePath: string) {
  const { data, error } = await supabaseAdmin().storage.from(SHEETS_BUCKET).download(imagePath);
  if (error || !data) return null;
  return Buffer.from(await data.arrayBuffer());
}

export async function runOcr(sheetId: number) {
  const s = await one<any>(sql, "SELECT * FROM sheets WHERE id=$1", [sheetId]);
  if (!s) return;
  const t0 = Date.now();
  try {
    const bytes = await sheetPhoto(s.image_path);
    if (!bytes) throw new Error("The photo could not be loaded.");
    const { result, model } = await readScoresheet(bytes.toString("base64"), s.mime);
    await q(sql, "UPDATE sheets SET status='review', extracted_json=$1, warnings_json=$2, model=$3, ms=$4, error=NULL WHERE id=$5",
      [JSON.stringify(result), JSON.stringify(checkSheet(result)), model, Date.now() - t0, sheetId]);
  } catch (e: any) {
    await q(sql, "UPDATE sheets SET status='failed', error=$1, ms=$2 WHERE id=$3", [String(e?.message || e).slice(0, 400), Date.now() - t0, sheetId]);
  }
}

export async function sheetView(s: any) {
  const data: OcrResult | null = s.extracted_json ? JSON.parse(s.extracted_json) : null;
  return {
    id: s.id, status: s.status, source: s.source, error: s.error, model: s.model, ms: s.ms, gameId: s.game_id, createdAt: s.created_at,
    data, warnings: s.warnings_json ? JSON.parse(s.warnings_json) : [],
    suggestion: data && s.status === "review" ? await suggest(sql, data) : null,
  };
}
