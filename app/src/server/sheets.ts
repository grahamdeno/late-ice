import "server-only";
import fs from "node:fs/promises";
import path from "node:path";
import { one, q, sql, type Tx } from "./db";
import { readScoresheet, checkSheet, type OcrResult, type OcrTeam } from "./ocr";
import { HttpError, suggest } from "./services";
import { supabaseAdmin, SHEETS_BUCKET } from "./supabase";
import { logEvent } from "./appevents";

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
  if (scannedBy) await logEvent(sql, { userId: scannedBy, kind: "scan" });
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
    const { result, model, inputTokens, outputTokens } = await readScoresheet(bytes.toString("base64"), s.mime);
    await q(sql, "UPDATE sheets SET status='review', extracted_json=$1, warnings_json=$2, model=$3, ms=$4, error=NULL, input_tokens=$5, output_tokens=$6 WHERE id=$7",
      [JSON.stringify(result), JSON.stringify(checkSheet(result)), model, Date.now() - t0, inputTokens, outputTokens, sheetId]);
  } catch (e: any) {
    const usage = e?.usage as { input?: number; output?: number } | undefined;
    await q(sql, "UPDATE sheets SET status='failed', error=$1, ms=$2, input_tokens=$3, output_tokens=$4 WHERE id=$5",
      [String(e?.message || e).slice(0, 400), Date.now() - t0, usage ? usage.input ?? null : null, usage ? usage.output ?? null : null, sheetId]);
  }
}

function cleanHandName(v: unknown) {
  const s = String(v ?? "").trim().replace(/\s+/g, " ").slice(0, 60);
  if (!s) throw new HttpError(400, "Enter both team names.");
  return s;
}
function cleanHandScore(v: unknown) {
  const n = typeof v === "string" && v.trim() === "" ? NaN : Number(v);
  if (!Number.isInteger(n) || n < 0 || n > 99) throw new HttpError(400, "Enter the final score as a number from 0 to 99.");
  return n;
}
function cleanHandNumbers(v: unknown) {
  const raw = Array.isArray(v) ? v.map((x) => String(x)).join(" ") : String(v ?? "");
  const parts = raw.split(/[^0-9]+/).filter(Boolean);
  if (!parts.length) throw new HttpError(400, "List who dressed, by number.");
  const out: string[] = [];
  for (const p of parts) {
    if (p.length > 2) throw new HttpError(400, "Jersey numbers are 1 or 2 digits.");
    if (out.includes(p)) throw new HttpError(400, "A jersey number is listed twice.");
    out.push(p);
  }
  return out;
}
function handTeam(name: string, score: number, numbers: string[]): OcrTeam {
  return {
    name,
    roster: numbers.map((n) => ({ number: n, name: null, position: null })),
    goals: [],
    penalties: [],
    shots_by_period: [],
    score_by_period: [],
    total: score,
  };
}

/** Build review data from a hand entry. Does not confirm the game. */
export function sheetFromHand(raw: any): OcrResult {
  return {
    is_scoresheet: true,
    date: null,
    time: null,
    league_text: null,
    rink_text: null,
    home: handTeam(cleanHandName(raw?.homeName), cleanHandScore(raw?.homeScore), cleanHandNumbers(raw?.homeNumbers)),
    away: handTeam(cleanHandName(raw?.awayName), cleanHandScore(raw?.awayScore), cleanHandNumbers(raw?.awayNumbers)),
    confidence: 1,
    notes: ["Entered by hand."],
  };
}

/** A failed read, or one that is not a scoresheet, becomes review data for the normal confirm path. */
export async function saveHandEntry(db: Tx, sheetId: number, raw: any) {
  const s = await one<any>(db, "SELECT * FROM sheets WHERE id=$1 FOR UPDATE", [sheetId]);
  if (!s) throw new HttpError(404, "Sheet not found");
  if (s.game_id || s.status === "confirmed") throw new HttpError(409, "This sheet is already in the books.", { gameId: s.game_id });
  if (s.status === "discarded") throw new HttpError(400, "This scan was discarded.");
  let extracted: any = null;
  if (s.extracted_json) {
    try { extracted = JSON.parse(s.extracted_json); } catch { extracted = null; }
  }
  const stuck = s.status === "failed" || extracted?.is_scoresheet === false;
  if (!stuck) throw new HttpError(400, "This sheet is already ready to check.");
  const data = sheetFromHand(raw);
  await q(db, "UPDATE sheets SET status='review', extracted_json=$1, warnings_json=$2, error=NULL WHERE id=$3",
    [JSON.stringify(data), JSON.stringify(checkSheet(data)), s.id]);
  return data;
}

export async function sheetView(s: any) {
  // A sheet a player sent to the captains shows their corrections and team picks.
  const proposal = s.status === "awaiting" && s.proposed_json ? JSON.parse(s.proposed_json) : null;
  const data: OcrResult | null = proposal?.data ?? (s.extracted_json ? JSON.parse(s.extracted_json) : null);
  let suggestion: any = data && (s.status === "review" || s.status === "awaiting") ? await suggest(sql, data) : null;
  if (suggestion && proposal) {
    suggestion = { ...suggestion, eventId: proposal.eventId ?? null, leagueId: proposal.leagueId ?? suggestion.leagueId,
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
