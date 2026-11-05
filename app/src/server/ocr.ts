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

function parseJson(text: string): any {
  const s = text.indexOf("{");
  const e = text.lastIndexOf("}");
  if (s < 0 || e < 0) throw new Error("Model returned no JSON");
  return JSON.parse(text.slice(s, e + 1));
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

export async function readScoresheet(imageBase64: string, mime: string): Promise<{ result: OcrResult; model: string }> {
  // Sonnet reads most sheets; Opus is the fallback for hard handwriting or a failed parse.
  const models = (process.env.LATE_ICE_OCR_MODELS || "claude-sonnet-5-5,claude-opus-5-5").split(",").map((m) => m.trim()).filter(Boolean);
  let lastErr: unknown;
  for (const model of models) {
    try {
      const msg = await getClient().messages.create({
        model,
        max_tokens: 4096,
        messages: [
          {
            role: "user",
            content: [
              { type: "image", source: { type: "base64", media_type: mime as any, data: imageBase64 } },
              { type: "text", text: PROMPT },
            ],
          },
        ],
      });
      const text = msg.content.map((c: any) => (c.type === "text" ? c.text : "")).join("");
      const raw = parseJson(text);
      const result: OcrResult = {
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
      return { result, model };
    } catch (e) {
      lastErr = e;
    }
  }
  throw lastErr instanceof Error ? lastErr : new Error(String(lastErr));
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
