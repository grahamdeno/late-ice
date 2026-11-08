import "server-only";
import Anthropic from "@anthropic-ai/sdk";

export interface OcrPlayer { number: string | null; name: string | null; position: string | null }
export interface OcrGoal { period: number | null; time: string | null; scorer: string | null; assist1: string | null; assist2: string | null }
export interface OcrPenalty { period: number | null; number: string | null; offense: string | null; minutes: number | null }
export interface OcrTeam {
  name: string | null;
  roster: OcrPlayer[];
  goals: OcrGoal[];
  penalties: OcrPenalty[];
  shots_by_period: (number | null)[];
  score_by_period: (number | null)[];
  total: number | null;
}
export interface OcrResult {
  is_scoresheet: boolean;
  date: string | null;
  time: string | null;
  league_text: string | null;
  rink_text: string | null;
  home: OcrTeam;
  away: OcrTeam;
  confidence: number;
  notes: string[];
}

const PROMPT = `You are reading a photographed ice hockey game scoresheet (usually a USA Hockey style official scoresheet, filled in by hand).
Extract exactly what is written. Do not invent players, goals or numbers. If a value is unreadable, use null.

Return ONLY a JSON object, no prose, matching this shape:
{
  "is_scoresheet": true,
  "date": "YYYY-MM-DD or null",
  "time": "e.g. 8:45 PM or null",
  "league_text": "league or division as written, e.g. C, B, 40+, Over 40",
  "rink_text": "rink name as written or null",
  "home": TEAM,
  "away": TEAM,
  "confidence": 0.0-1.0 overall legibility,
  "notes": ["short notes about anything ambiguous, crossed out, or hard to read"]
}
TEAM = {
  "name": "team name as written",
  "roster": [{"number": "jersey number as string", "name": "player name", "position": "G for goalie, else null"}],
  "goals": [{"period": 1, "time": "12:41", "scorer": "jersey number", "assist1": "jersey number or null", "assist2": "jersey number or null"}],
  "penalties": [{"period": 1, "number": "jersey number", "offense": "Tripping", "minutes": 2}],
  "shots_by_period": [numbers per period, empty if not recorded],
  "score_by_period": [goals per period as written in the score box],
  "total": final score as written
}
"home" is the team labeled HOME; "away" is VISITOR/AWAY. Keep roster order as written. Skip empty rows. If the image is not a hockey scoresheet set is_scoresheet false.`;

let client: Anthropic | null = null;
function getClient() {
  if (!client) client = new Anthropic();
  return client;
}

class SheetParseError extends Error {}

function parseJson(text: string): any {
  const s = text.indexOf("{");
  const e = text.lastIndexOf("}");
  if (s < 0 || e < 0) throw new SheetParseError("Model returned no JSON");
  try {
    return JSON.parse(text.slice(s, e + 1));
  } catch (e) {
    throw new SheetParseError(e instanceof Error ? e.message : "Model returned no JSON");
  }
}

function normTeam(t: any): OcrTeam {
  const arr = (x: any) => (Array.isArray(x) ? x : []);
  const str = (x: any) => (x === null || x === undefined || x === "" ? null : String(x).trim());
  const num = (x: any) => (x === null || x === undefined || x === "" || isNaN(Number(x)) ? null : Number(x));
  return {
    name: str(t?.name),
    roster: arr(t?.roster)
      .map((p: any) => ({ number: str(p?.number), name: str(p?.name), position: str(p?.position) }))
      .filter((p: OcrPlayer) => p.name || p.number),
    goals: arr(t?.goals).map((g: any) => ({
      period: num(g?.period), time: str(g?.time), scorer: str(g?.scorer), assist1: str(g?.assist1), assist2: str(g?.assist2),
    })),
    penalties: arr(t?.penalties).map((p: any) => ({
      period: num(p?.period), number: str(p?.number), offense: str(p?.offense), minutes: num(p?.minutes),
    })),
    shots_by_period: arr(t?.shots_by_period).map(num),
    score_by_period: arr(t?.score_by_period).map(num),
    total: num(t?.total),
  };
}

type Usage = { input: number; output: number };

function fail(e: unknown, usage: Usage): never {
  if (e && typeof e === "object") (e as { usage?: Usage }).usage = usage;
  throw e;
}

type ModelReply = { text: string; input: number; output: number };

/** Test double. LATEICE_FAKE_OCR=1 never calls the provider. A script may be appended to the image bytes. */
function fakeReply(imageBase64: string, followup: boolean, maxTokens: number, cursor: { i: number }): ModelReply {
  if (maxTokens !== 8192) throw new Error("max_tokens was not 8192");
  const buf = Buffer.from(imageBase64, "base64");
  const marker = "LATEICE_FAKE:";
  const at = buf.indexOf(marker);
  if (at < 0) throw new Error("The scoresheet reader has no API key.");
  const rest = buf.subarray(at + marker.length).toString("utf8").trim();
  const end = rest.lastIndexOf("]");
  if (end < 0) throw new Error("fake OCR script is not a JSON list");
  const steps = JSON.parse(rest.slice(0, end + 1));
  if (!Array.isArray(steps)) throw new Error("fake OCR script is not a JSON list");
  const step = steps[cursor.i++];
  if (!step) throw new Error("fake OCR received an unexpected call");
  if (step.expectFollowup === true && !followup) throw new Error("fake OCR expected a JSON follow-up");
  if (step.expectFollowup === false && followup) throw new Error("fake OCR did not expect a follow-up");
  if (step.op === "error") throw new Error(step.message || "The scoresheet reader could not be reached.");
  const text = step.op === "json" ? JSON.stringify(step.body ?? {}) : String(step.text ?? "");
  return { text, input: step.inputTokens ?? 0, output: step.outputTokens ?? 0 };
}

async function callModel(model: string, imageBase64: string, mime: string, followup: { previous: string } | null, cursor: { i: number }): Promise<ModelReply> {
  if (process.env.LATEICE_FAKE_OCR === "1") return fakeReply(imageBase64, followup !== null, 8192, cursor);
  const image = { type: "image" as const, source: { type: "base64" as const, media_type: mime as any, data: imageBase64 } };
  const messages: Anthropic.MessageParam[] = followup
    ? [
        { role: "user", content: [image, { type: "text", text: PROMPT }] },
        { role: "assistant", content: followup.previous || " " },
        { role: "user", content: "Return only the JSON object." },
      ]
    : [{ role: "user", content: [image, { type: "text", text: PROMPT }] }];
  const msg = await getClient().messages.create({ model, max_tokens: 8192, messages });
  const text = msg.content.map((c) => (c.type === "text" ? c.text : "")).join("");
  return { text, input: msg.usage?.input_tokens ?? 0, output: msg.usage?.output_tokens ?? 0 };
}

function resultFromText(text: string): OcrResult {
  const raw = parseJson(text);
  return {
    is_scoresheet: raw.is_scoresheet !== false,
    date: raw.date ?? null,
    time: raw.time ?? null,
    league_text: raw.league_text ?? null,
    rink_text: raw.rink_text ?? null,
    home: normTeam(raw.home),
    away: normTeam(raw.away),
    confidence: typeof raw.confidence === "number" ? raw.confidence : 0.5,
    notes: Array.isArray(raw.notes) ? raw.notes.map(String) : [],
  };
}

export async function readScoresheet(imageBase64: string, mime: string): Promise<{ result: OcrResult; model: string; inputTokens: number; outputTokens: number }> {
  // Primary model, then one fallback. The list is LATE_ICE_OCR_MODELS; the default is opus then sonnet.
  // Opus reads real handwritten sheets best (82% of scorers vs 76% for Sonnet, November 8 test on 22 real sheets).
  // A JSON parse failure retries the same model once. The fallback runs only after a read succeeded
  // and (confidence < 0.6 or checkSheet reports 3 or more warnings). Network, auth, and a second parse failure do not.
  const models = (process.env.LATE_ICE_OCR_MODELS || "claude-opus-5-5,claude-sonnet-5-5").split(",").map((m) => m.trim()).filter(Boolean);
  const primary = models[0];
  if (!primary) throw new Error("No OCR model configured");
  const usage: Usage = { input: 0, output: 0 };
  const cursor = { i: 0 };

  let first: ModelReply;
  try {
    first = await callModel(primary, imageBase64, mime, null, cursor);
  } catch (e) {
    fail(e, usage);
  }
  usage.input += first.input;
  usage.output += first.output;

  let result: OcrResult;
  try {
    result = resultFromText(first.text);
  } catch (e) {
    if (!(e instanceof SheetParseError)) fail(e, usage);
    let second: ModelReply;
    try {
      second = await callModel(primary, imageBase64, mime, { previous: first.text }, cursor);
    } catch (e2) {
      fail(e2, usage);
    }
    usage.input += second.input;
    usage.output += second.output;
    try {
      result = resultFromText(second.text);
    } catch (e3) {
      fail(e3, usage);
    }
  }

  const warnings = checkSheet(result);
  const fallback = models[1];
  // Precedence: the read succeeded, and (low confidence or 3 or more warnings).
  if (fallback && (result.confidence < 0.6 || warnings.length >= 3)) {
    try {
      const alt = await callModel(fallback, imageBase64, mime, null, cursor);
      usage.input += alt.input;
      usage.output += alt.output;
      const altResult = resultFromText(alt.text);
      if (checkSheet(altResult).length < warnings.length) {
        return { result: altResult, model: fallback, inputTokens: usage.input, outputTokens: usage.output };
      }
    } catch {
      // The first read succeeded. A fallback that fails to answer does not replace it.
    }
  }
  return { result, model: primary, inputTokens: usage.input, outputTokens: usage.output };
}

/** Cross-check the sheet against itself. Every warning is something a human should glance at. */
export function checkSheet(r: OcrResult): string[] {
  const w: string[] = [];
  if (!r.is_scoresheet) w.push("This does not look like a hockey scoresheet.");
  for (const side of ["home", "away"] as const) {
    const t = r[side];
    const label = side === "home" ? "Home" : "Visitor";
    if (!t.name) w.push(`${label} team name could not be read.`);
    const goalsListed = t.goals.length;
    const boxTotal = t.total;
    const periodSum = t.score_by_period.reduce<number>((a, b) => a + (b ?? 0), 0);
    if (boxTotal !== null && goalsListed !== boxTotal)
      w.push(`${label}: ${goalsListed} goals in the scoring list but the score box says ${boxTotal}.`);
    if (t.score_by_period.length && boxTotal !== null && periodSum !== boxTotal)
      w.push(`${label}: period scores add to ${periodSum}, total says ${boxTotal}.`);
    const nums = new Set(t.roster.map((p) => p.number).filter(Boolean));
    for (const g of t.goals) {
      for (const n of [g.scorer, g.assist1, g.assist2]) if (n && !nums.has(n)) w.push(`${label}: #${n} is on the scoring list but not the roster.`);
    }
    if (!t.roster.some((p) => (p.position || "").toUpperCase().startsWith("G"))) w.push(`${label}: no goalie marked.`);
  }
  if (!r.date) w.push("Game date could not be read.");
  return Array.from(new Set(w));
}
