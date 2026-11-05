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

/** The sample photo. On Vercel the public folder isn't in the function, so fetch it from the site itself. */
export async function samplePhoto(file: string, origin?: string) {
  try { return await fs.readFile(path.join(process.cwd(), "public", "samples", file)); }
  catch {
    if (!origin) throw new Error("Sample photo not found");
    const r = await fetch(new URL(`/samples/${file}`, origin));
    if (!r.ok) throw new Error(`Sample photo not found (${r.status})`);
    return Buffer.from(await r.arrayBuffer());
  }
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
  // A sheet a player sent to the captains shows their corrections and team picks.
  const proposal = s.status === "awaiting" && s.proposed_json ? JSON.parse(s.proposed_json) : null;
  const data: OcrResult | null = proposal?.data ?? (s.extracted_json ? JSON.parse(s.extracted_json) : null);
  let suggestion: any = data && (s.status === "review" || s.status === "awaiting") ? await suggest(sql, data) : null;
  if (suggestion && proposal) {
    suggestion = { ...suggestion, leagueId: proposal.leagueId ?? suggestion.leagueId,
      home: { ...suggestion.home, teamId: proposal.homeTeamId ?? suggestion.home?.teamId }, away: { ...suggestion.away, teamId: proposal.awayTeamId ?? suggestion.away?.teamId } };
  }
  const by = s.submitted_by ? await one<any>(sql, "SELECT name FROM users WHERE id=$1", [s.submitted_by]) : null;
  return {
    id: s.id, status: s.status, source: s.source, error: s.error, model: s.model, ms: s.ms, gameId: s.game_id, createdAt: s.created_at,
    data, warnings: s.warnings_json ? JSON.parse(s.warnings_json) : [], suggestion,
    submitted: proposal ? { by: by?.name ?? "A player", at: s.submitted_at } : null,
  };
}

/** Who may confirm: leagues where this person is staff, and teams they captain or assist. Samples: anyone let in. */
export async function confirmRights(user: any) {
  const { can } = await import("./permissions");
  const leagues: number[] = [];
  if (user) for (const l of await q<any>(sql, "SELECT id, rink_id FROM leagues")) if (await can(sql, user, "sheet.confirm", { leagueId: l.id, rinkId: l.rink_id })) leagues.push(l.id);
  const teams = user ? (await q<any>(sql, "SELECT scope_id FROM role_grants WHERE user_id=$1 AND scope_type='team' AND role IN ('captain','assistant_captain') AND revoked_at IS NULL", [user.id])).map((r) => r.scope_id as number) : [];
  return { leagues, teams };
}
