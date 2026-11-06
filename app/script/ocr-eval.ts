// Scores the scoresheet reader against the synthetic samples' ground truth (samples/truth.json).
// Uses the exact prompt from src/server/ocr.ts. Runs each sample RUNS times per model.
// Writes measure/ocr-eval.json and measure/ocr-eval.md. Needs ANTHROPIC_API_KEY.
// Note: the samples are clean, printed-style synthetic sheets. Scores are a ceiling, not real handwriting.
import Anthropic from "@anthropic-ai/sdk";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";

const MODELS: [string, number, number][] = [
  // model, $ per million input tokens, $ per million output tokens (November 2026)
  ["claude-haiku-5-5", 0.1, 0.5],
  ["claude-sonnet-5-5", 2, 10],
  ["claude-opus-5-5", 4, 20],
];
const RUNS = Number(process.env.OCR_RUNS || 3);
if (!process.env.ANTHROPIC_API_KEY) { console.log("ANTHROPIC_API_KEY not set; skipping the OCR eval."); process.exit(0); }

const src = readFileSync("src/server/ocr.ts", "utf8");
const PROMPT = src.match(/const PROMPT = `([\s\S]*?)`;/)![1];
const truth: any[] = JSON.parse(readFileSync("samples/truth.json", "utf8"));
const client = new Anthropic();

const norm = (x: any) => (x == null ? "" : String(x).toLowerCase().replace(/[^a-z0-9]/g, ""));
const isoDate = (us: string) => { const [m, d, y] = us.split("/"); return `${y}-${m.padStart(2, "0")}-${d.padStart(2, "0")}`; };

function score(t: any, r: any) {
  const f: Record<string, [number, number]> = {}; // field -> [correct, total]
  const add = (k: string, ok: boolean) => { f[k] ??= [0, 0]; f[k][1]++; if (ok) f[k][0]++; };
  add("date", r.date === isoDate(t.date));
  for (const side of ["home", "away"] as const) {
    const rt = r[side] || {};
    add("team names", norm(rt.name) === norm(t[side]));
    const roster: any[] = rt.roster || [];
    for (const [num, name, pos] of t[`${side}_roster`]) {
      const hit = roster.find((p) => norm(p.number) === norm(num));
      add("jersey numbers", !!hit);
      add("player names", !!hit && norm(hit.name) === norm(name));
      if (pos === "G") add("goalie marked", !!hit && String(hit.position || "").toUpperCase().startsWith("G"));
    }
    add("extra roster rows (none expected)", roster.length <= t[`${side}_roster`].length);
    const goals: any[] = (rt.goals || []).slice();
    for (const [period, time, sc, a1, a2] of t[`${side}_goals`]) {
      const i = goals.findIndex((g) => norm(g.scorer) === norm(sc) && norm(g.assist1) === norm(a1) && norm(g.assist2) === norm(a2));
      add("goals (scorer + assists)", i >= 0);
      add("goal period and time", i >= 0 && Number(goals[i].period) === period && norm(goals[i].time) === norm(time));
      if (i >= 0) goals.splice(i, 1);
    }
    add("final score", Number(rt.total) === t[`${side}_goals`].length);
    const pens: any[] = rt.penalties || [];
    for (const [, num, , min] of t[`${side}_pen`]) add("penalties (number + minutes)", pens.some((p) => norm(p.number) === norm(num) && Number(p.minutes) === min));
  }
  return f;
}

async function main() {
  mkdirSync("measure", { recursive: true });
  const out: any = { runs: RUNS, samples: truth.map((t) => t.id), models: {} };
  for (const [model, pin, pout] of MODELS) {
    const fields: Record<string, [number, number]> = {};
    const calls: { ms: number; in: number; out: number; usd: number; error?: string }[] = [];
    for (const t of truth) {
      const img = readFileSync(`public/samples/${t.id}.jpg`).toString("base64");
      for (let i = 0; i < RUNS; i++) {
        const t0 = Date.now();
        try {
          const msg = await client.messages.create({
            model, max_tokens: 4096,
            messages: [{ role: "user", content: [{ type: "image", source: { type: "base64", media_type: "image/jpeg", data: img } }, { type: "text", text: PROMPT }] }],
          });
          const text = msg.content.map((c: any) => (c.type === "text" ? c.text : "")).join("");
          const raw = JSON.parse(text.slice(text.indexOf("{"), text.lastIndexOf("}") + 1));
          for (const [k, [c, n]] of Object.entries(score(t, raw))) { fields[k] ??= [0, 0]; fields[k][0] += c; fields[k][1] += n; }
          const u = msg.usage;
          calls.push({ ms: Date.now() - t0, in: u.input_tokens, out: u.output_tokens, usd: (u.input_tokens * pin + u.output_tokens * pout) / 1e6 });
        } catch (e: any) {
          calls.push({ ms: Date.now() - t0, in: 0, out: 0, usd: 0, error: String(e?.message || e).slice(0, 200) });
        }
      }
    }
    const ok = calls.filter((c) => !c.error);
    const avg = (k: "ms" | "in" | "out" | "usd") => (ok.length ? ok.reduce((a, c) => a + c[k], 0) / ok.length : null);
    const all = Object.values(fields).reduce((a, [c, n]) => [a[0] + c, a[1] + n], [0, 0]);
    out.models[model] = {
      accuracy: Object.fromEntries(Object.entries(fields).map(([k, [c, n]]) => [k, Math.round((1000 * c) / n) / 10])),
      overall: all[1] ? Math.round((1000 * all[0]) / all[1]) / 10 : null,
      avgMs: avg("ms"), avgInputTokens: avg("in"), avgOutputTokens: avg("out"), usdPerScan: avg("usd"),
      failures: calls.filter((c) => c.error).map((c) => c.error),
    };
    console.log(model, JSON.stringify(out.models[model]));
  }
  const names = MODELS.map((m) => m[0]);
  const keys = Array.from(new Set(names.flatMap((m) => Object.keys(out.models[m].accuracy))));
  const L = [`# Scoresheet reader eval\n\n${truth.length} synthetic sheets x ${RUNS} runs per model, prompt from src/server/ocr.ts. Clean printed-style samples: treat as a ceiling, not handwriting.\n`,
    `| Field (% correct) | ${names.join(" | ")} |`, `| --- | ${names.map(() => "---").join(" | ")} |`];
  for (const k of keys) L.push(`| ${k} | ${names.map((m) => out.models[m].accuracy[k] ?? "-").join(" | ")} |`);
  L.push(`| **Overall** | ${names.map((m) => out.models[m].overall ?? "-").join(" | ")} |`);
  L.push(`| Avg latency ms | ${names.map((m) => Math.round(out.models[m].avgMs ?? 0)).join(" | ")} |`);
  L.push(`| Avg input tokens | ${names.map((m) => Math.round(out.models[m].avgInputTokens ?? 0)).join(" | ")} |`);
  L.push(`| Avg output tokens | ${names.map((m) => Math.round(out.models[m].avgOutputTokens ?? 0)).join(" | ")} |`);
  L.push(`| Cost per scan USD | ${names.map((m) => (out.models[m].usdPerScan ?? 0).toFixed(4)).join(" | ")} |`);
  L.push(`| Failed calls | ${names.map((m) => out.models[m].failures.length).join(" | ")} |`);
  writeFileSync("measure/ocr-eval.json", JSON.stringify(out, null, 2));
  writeFileSync("measure/ocr-eval.md", L.join("\n") + "\n");
  console.log(L.join("\n"));
}
main().catch((e) => { console.error(e); process.exit(1); });
