// Scores the scoresheet reader on real handwritten adult-league sheets.
// Answer key: the league's own posted box score for each game (period scores, goals with scorer and assists, penalties).
// Photos and box scores are fetched from the league site at run time; nothing with names is stored or printed.
// The photo goes through the same prep as the phone (camera rotation applied, 2200 px long side, JPEG 0.86)
// and the same prompt as src/server/ocr.ts. Prints percentages only.
import Anthropic from "@anthropic-ai/sdk";
import sharp from "sharp";
import { readFileSync, writeFileSync } from "node:fs";

const MODELS = [
  // model, $ per million input tokens, $ per million output tokens (November 2026)
  ["claude-haiku-5-5", 0.1, 0.5],
  ["claude-sonnet-5-5", 2, 10],
  ["claude-opus-5-5", 4, 20],
];
if (!process.env.ANTHROPIC_API_KEY) { console.log("ANTHROPIC_API_KEY not set"); process.exit(1); }
const PROMPT = readFileSync("src/server/ocr.ts", "utf8").match(/const PROMPT = `([\s\S]*?)`;/)[1];
const client = new Anthropic();
const UA = { "User-Agent": "late-ice-reader-test (one fetch per game)" };

const sheets = readFileSync("ocr-real/sheets.csv", "utf8").replace(/\r/g, "").trim().split("\n").slice(1).map((l) => {
  const [file, box, image, group] = l.split(",");
  return { file, box, image, group };
});

/* ---------- answer key from the box score page ---------- */
const decode = (s) => s.replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/&#39;/g, "'").replace(/&quot;/g, '"').replace(/<[^>]+>/g, "").trim();
const normNum = (x) => (x == null ? null : (String(x).replace(/[^0-9]/g, "").replace(/^0+(?=\d)/, "") || null));
const normName = (s) => String(s || "").toLowerCase().replace(/[^a-z ]/g, " ").replace(/\s+/g, " ").trim();
const lastName = (s) => { const t = normName(s).split(" ").filter(Boolean); return t[t.length - 1] || ""; };
function bigrams(s) { s = normName(s).replace(/ /g, ""); const o = []; for (let i = 0; i < s.length - 1; i++) o.push(s.slice(i, i + 2)); return o; }
function sim(a, b) { const A = bigrams(a), B = bigrams(b); if (!A.length || !B.length) return 0; const m = new Map(); A.forEach((x) => m.set(x, (m.get(x) || 0) + 1)); let h = 0; B.forEach((x) => { const c = m.get(x) || 0; if (c) { h++; m.set(x, c - 1); } }); return (2 * h) / (A.length + B.length); }
const normTime = (t) => { const m = String(t || "").match(/(\d{1,2}):(\d{2})/); return m ? `${Number(m[1])}:${m[2]}` : null; };

function parseBox(html) {
  const out = { date: null, teams: [], goals: [], penalties: [], numberOf: new Map() };
  const d = html.match(/(20\d\d-\d\d-\d\d) \d\d:\d\d/); out.date = d?.[1] ?? null;
  // Line score: "<td>Home: Team</td>" then period cells, the last one is the total.
  for (const m of html.matchAll(/<td>\s*(Home|Away|Visitor):\s*([^<]+)<\/td>([\s\S]*?)<\/tr>/gi)) {
    const cells = [...m[3].matchAll(/<div align='center'>\s*(\d+)\s*<\/div>/g)].map((x) => Number(x[1]));
    out.teams.push({ side: /home/i.test(m[1]) ? "home" : "away", name: decode(m[2]), periods: cells.slice(0, -1), total: cells[cells.length - 1] });
  }
  // Jersey numbers next to player links anywhere on the page (rosters, goalies).
  for (const m of html.matchAll(/(\d{1,2})(?:&nbsp;|\s)*<a href='playerpage\.php\?PlayerID=(\d+)'>/g)) out.numberOf.set(m[2], m[1]);
  const teamFor = (short) => {
    const s = normName(decode(short));
    return out.teams.find((t) => normName(t.name) === s) ?? out.teams.find((t) => normName(t.name).includes(s) || s.includes(normName(t.name))) ?? null;
  };
  const player = (frag) => { const m = frag.match(/PlayerID=(\d+)'>([^<]*)</); return m ? { id: m[1], name: decode(m[2]) } : null; };
  const section = (title) => { const i = html.search(new RegExp(`<h3>${title}`, "i")); if (i < 0) return ""; const j = html.indexOf("</table>", i); return html.slice(i, j); };
  const split = (sec) => { const parts = sec.split(/<TH class='bs_periodmarker'[^>]*>/i); return parts.slice(1).map((p) => ({ period: Number((p.match(/Period\s*(\d+)/i) || p.match(/(\d+)/))?.[1]), body: p })); };
  for (const { period, body } of split(section("Scoring Summary"))) {
    for (const m of body.matchAll(/<strong>([^<]+?) - (<a[^>]+>[^<]*<\/a>)\s*<\/strong>\s*(\(([\s\S]*?)\))?\s*,\s*(\d{1,2}:\d\d)/g)) {
      const scorer = player(m[2]);
      const assists = m[4] ? [...m[4].matchAll(/<a[^>]+>[^<]*<\/a>/g)].map((x) => player(x[0])).filter(Boolean) : [];
      out.goals.push({ period, team: teamFor(m[1])?.side ?? null, scorer, assists, time: m[5] });
    }
  }
  for (const { period, body } of split(section("Penalties"))) {
    for (const m of body.matchAll(/<strong>([^<]+?) - (<a[^>]+>[^<]*<\/a>)\s*<\/strong>\s*-\s*\(([^)]*)\)\s*(\d+)\s*min/g)) {
      out.penalties.push({ period, team: teamFor(m[1])?.side ?? null, player: player(m[2]), minutes: Number(m[4]) });
    }
  }
  return out;
}

/* ---------- the reader, as the app calls it ---------- */
async function prep(url) {
  const raw = Buffer.from(await (await fetch(url, { headers: UA })).arrayBuffer());
  const jpg = await sharp(raw).rotate().resize(2200, 2200, { fit: "inside", withoutEnlargement: true }).jpeg({ quality: 86 }).toBuffer();
  return jpg.toString("base64");
}
function parseJson(text) { const s = text.indexOf("{"), e = text.lastIndexOf("}"); if (s < 0 || e < 0) throw new Error("no JSON"); return JSON.parse(text.slice(s, e + 1)); }
async function read(model, img) {
  const image = { type: "image", source: { type: "base64", media_type: "image/jpeg", data: img } };
  const t0 = Date.now(); let inT = 0, outT = 0;
  let msg = await client.messages.create({ model, max_tokens: 8192, messages: [{ role: "user", content: [image, { type: "text", text: PROMPT }] }] });
  let text = msg.content.map((c) => (c.type === "text" ? c.text : "")).join(""); inT += msg.usage.input_tokens; outT += msg.usage.output_tokens;
  let raw; let retried = false;
  try { raw = parseJson(text); } catch {
    retried = true;
    msg = await client.messages.create({ model, max_tokens: 8192, messages: [{ role: "user", content: [image, { type: "text", text: PROMPT }] }, { role: "assistant", content: text || " " }, { role: "user", content: "Return only the JSON object." }] });
    text = msg.content.map((c) => (c.type === "text" ? c.text : "")).join(""); inT += msg.usage.input_tokens; outT += msg.usage.output_tokens;
    raw = parseJson(text);
  }
  return { raw, ms: Date.now() - t0, inT, outT, retried };
}

/* ---------- grading ---------- */
function grade(key, r) {
  const f = {}; const add = (k, ok) => { f[k] ??= [0, 0]; f[k][1]++; if (ok) f[k][0]++; };
  add("read as a scoresheet", r.is_scoresheet !== false);
  if (key.date) add("date", r.date === key.date);
  // Pair the reader's two teams with the box score's by name; fall back to Home/Away as labeled.
  const boxHome = key.teams.find((t) => t.side === "home"), boxAway = key.teams.find((t) => t.side === "away");
  const straight = sim(r.home?.name, boxHome?.name) + sim(r.away?.name, boxAway?.name);
  const crossed = sim(r.home?.name, boxAway?.name) + sim(r.away?.name, boxHome?.name);
  const swap = crossed > straight + 0.2;
  const sideOf = { home: swap ? r.away : r.home, away: swap ? r.home : r.away };
  add("home and away the right way round", !swap);
  for (const t of key.teams) {
    const rt = sideOf[t.side] || {};
    add("team name", sim(rt.name, t.name) >= 0.6);
    add("final score", Number(rt.total) === t.total);
    const per = (rt.score_by_period || []).map(Number);
    add("score by period", t.periods.length > 0 && t.periods.every((v, i) => per[i] === v));
    const roster = rt.roster || [];
    const nameOfNum = (n) => roster.find((p) => normNum(p.number) === normNum(n))?.name ?? null;
    // A box score player matches a number on the sheet by jersey number when the page lists it, else by last name.
    const same = (boxPlayer, num) => {
      if (!boxPlayer || num == null) return false;
      const known = key.numberOf.get(boxPlayer.id);
      if (known) return normNum(known) === normNum(num);
      const nm = nameOfNum(num); if (!nm) return false;
      return lastName(nm) === lastName(boxPlayer.name) || sim(lastName(nm), lastName(boxPlayer.name)) >= 0.8;
    };
    const pool = (rt.goals || []).slice();
    for (const g of key.goals.filter((x) => x.team === t.side)) {
      let i = pool.findIndex((x) => Number(x.period) === g.period && same(g.scorer, x.scorer));
      if (i < 0) i = pool.findIndex((x) => same(g.scorer, x.scorer));
      add("goals: scorer", i >= 0);
      if (i < 0) continue;
      const x = pool[i]; pool.splice(i, 1);
      add("goals: period", Number(x.period) === g.period);
      const ra = [x.assist1, x.assist2].filter((a) => a != null && a !== "");
      const allAssists = g.assists.length === ra.length && g.assists.every((a) => ra.some((n) => same(a, n)));
      add("goals: assists", allAssists);
      add("goals: time", normTime(x.time) === normTime(g.time));
    }
    add("no extra goals", pool.length === 0);
    const pens = (rt.penalties || []).slice();
    for (const p of key.penalties.filter((x) => x.team === t.side)) {
      const i = pens.findIndex((x) => Number(x.minutes) === p.minutes && same(p.player, x.number));
      add("penalties: player and minutes", i >= 0);
      if (i >= 0) pens.splice(i, 1);
    }
  }
  return f;
}

/* ---------- run ---------- */
const results = { sheets: [], models: {} };
const keys = [];
for (const s of sheets) {
  try {
    const html = await (await fetch(s.box, { headers: UA })).text();
    const key = parseBox(html);
    const ok = key.teams.length === 2 && key.goals.length === key.teams.reduce((a, t) => a + t.total, 0);
    keys.push({ ...s, key, ok, img: ok ? await prep(s.image) : null });
    console.log(`${s.file} key: ${key.teams.length} teams, ${key.goals.length} goals (line score ${key.teams.map((t) => t.total).join("-")}), ${key.penalties.length} penalties, ${key.numberOf.size} jersey numbers on page${ok ? "" : "  SKIPPED: key incomplete"}`);
  } catch (e) { console.log(`${s.file} key failed: ${String(e).slice(0, 120)}`); keys.push({ ...s, ok: false }); }
  await new Promise((r) => setTimeout(r, 400));
}
const usable = keys.filter((k) => k.ok);
for (const [model, pin, pout] of MODELS) {
  const all = {}, byGroup = { clear: {}, hard: {} }, calls = [], perSheet = [];
  await Promise.all([0, 1, 2, 3].map(async (w) => {
    for (let i = w; i < usable.length; i += 4) {
      const k = usable[i];
      try {
        const r = await read(model, k.img);
        const f = grade(k.key, r.raw);
        for (const [n, [c, t]] of Object.entries(f)) for (const bag of [all, byGroup[k.group] ?? (byGroup[k.group] = {})]) { bag[n] ??= [0, 0]; bag[n][0] += c; bag[n][1] += t; }
        calls.push({ ms: r.ms, usd: (r.inT * pin + r.outT * pout) / 1e6, inT: r.inT, outT: r.outT, retried: r.retried });
        const pct = (n) => (f[n] ? `${f[n][0]}/${f[n][1]}` : "-");
        perSheet.push({ file: k.file, group: k.group, score: pct("final score"), scorers: pct("goals: scorer"), assists: pct("goals: assists"), pens: pct("penalties: player and minutes") });
      } catch (e) { calls.push({ error: String(e?.message || e).slice(0, 160) }); perSheet.push({ file: k.file, group: k.group, error: true }); }
    }
  }));
  const pct = (bag) => Object.fromEntries(Object.entries(bag).map(([n, [c, t]]) => [n, t ? Math.round((1000 * c) / t) / 10 : null]));
  const ok = calls.filter((c) => !c.error);
  const avg = (k) => (ok.length ? ok.reduce((a, c) => a + c[k], 0) / ok.length : 0);
  results.models[model] = { all: pct(all), clear: pct(byGroup.clear), hard: pct(byGroup.hard), avgMs: avg("ms"), usd: avg("usd"), inT: avg("inT"), outT: avg("outT"), retried: ok.filter((c) => c.retried).length, failed: calls.filter((c) => c.error).map((c) => c.error), perSheet: perSheet.sort((a, b) => a.file.localeCompare(b.file)) };
  console.log(model, JSON.stringify({ all: results.models[model].all, failed: results.models[model].failed.length }));
}

/* ---------- report (numbers only) ---------- */
const names = MODELS.map((m) => m[0]);
const fields = [...new Set(names.flatMap((m) => Object.keys(results.models[m].all)))];
const L = [`# Scoresheet reader on real sheets`, ``,
  `${usable.length} of ${sheets.length} real adult-league sheets had a complete answer key (${usable.filter((k) => k.group === "clear").length} clear, ${usable.filter((k) => k.group === "hard").length} hard). One read per model per sheet. Answer key: the league's posted box score.`, ``,
  `| % correct | ${names.join(" | ")} |`, `| --- | ${names.map(() => "---").join(" | ")} |`];
for (const f of fields) L.push(`| ${f} | ${names.map((m) => results.models[m].all[f] ?? "-").join(" | ")} |`);
for (const g of ["clear", "hard"]) for (const f of ["final score", "goals: scorer", "goals: assists"]) L.push(`| ${f} (${g} sheets) | ${names.map((m) => results.models[m][g][f] ?? "-").join(" | ")} |`);
L.push(`| Avg seconds per read | ${names.map((m) => (results.models[m].avgMs / 1000).toFixed(1)).join(" | ")} |`);
L.push(`| Avg input / output tokens | ${names.map((m) => `${Math.round(results.models[m].inT)} / ${Math.round(results.models[m].outT)}`).join(" | ")} |`);
L.push(`| Cost per scan USD | ${names.map((m) => results.models[m].usd.toFixed(4)).join(" | ")} |`);
L.push(`| JSON retry needed | ${names.map((m) => results.models[m].retried).join(" | ")} |`);
L.push(`| Failed reads | ${names.map((m) => results.models[m].failed.length).join(" | ")} |`, ``);
L.push(`## Per sheet (final score right, scorers found, assists right, penalties found)`, ``, `| Sheet | Group | ${names.join(" | ")} |`, `| --- | --- | ${names.map(() => "---").join(" | ")} |`);
for (const k of usable) L.push(`| ${k.file} | ${k.group} | ${names.map((m) => { const r = results.models[m].perSheet.find((p) => p.file === k.file); return !r ? "-" : r.error ? "failed" : `${r.score} · ${r.scorers} · ${r.assists} · ${r.pens}`; }).join(" | ")} |`);
writeFileSync("ocr-real/report.md", L.join("\n") + "\n");
console.log("\n" + L.join("\n"));
