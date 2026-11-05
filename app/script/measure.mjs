// Measures the built app on a throttled phone, against the seeded local database.
// iPhone-sized viewport (390x844), 4G (1.6 Mbps down, 750 kbps up, 150 ms RTT), 4x CPU slowdown.
// Writes measure.json and measure.md into ./measure.
// Optional: PROD_BASE=https://late-ice.tangomike.app adds signed-out loads of the live site (read-only page views).
import { spawn } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { chromium } from "playwright";
import postgres from "postgres";
import { latestCode, lastMailId } from "./mail.mjs";

const PORT = 3097, BASE = `http://localhost:${PORT}`, RUNS = 3, EMAIL = "measure@example.com";
const OUT = "measure";
mkdirSync(OUT, { recursive: true });
const db = postgres(process.env.DATABASE_URL, { prepare: false, max: 2, onnotice: () => {} });
const median = (a) => { const b = a.filter((x) => x != null).sort((x, y) => x - y); return b.length ? Math.round(b[Math.floor((b.length - 1) / 2)]) : null; };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const srv = spawn("npx", ["next", "start", "-p", String(PORT)], { env: { ...process.env, NODE_ENV: "production", BOOTSTRAP_ADMIN_EMAIL: "boss@example.com", LATEICE_MAP_LOOKUP: "off" }, stdio: ["ignore", "ignore", "inherit"] });
for (let i = 0; i < 300; i++) { try { if ((await fetch(`${BASE}/api/bootstrap`)).ok) break; } catch {} await sleep(200); }

const result = { config: { viewport: "390x844", network: "1.6 Mbps down / 750 kbps up / 150 ms RTT", cpu: "4x slowdown", runs: RUNS, server: "next start on the CI runner, local Supabase (no cold starts, ~0 ms DB latency)" } };

// Ratings, display names and the rest of the nightly job, as production runs it.
{
  const t0 = Date.now();
  const r = await fetch(`${BASE}/api/cron/recompute`, { headers: { authorization: `Bearer ${process.env.CRON_SECRET}` } });
  const j = await r.json().catch(() => ({}));
  result.recompute = { status: r.status, ms: Date.now() - t0, games: j.games, replayMs: j.ms };
}

const browser = await chromium.launch();

async function throttle(page) {
  const c = await page.context().newCDPSession(page);
  await c.send("Network.enable");
  await c.send("Network.emulateNetworkConditions", { offline: false, latency: 150, downloadThroughput: 200000, uploadThroughput: 93750 });
  await c.send("Emulation.setCPUThrottlingRate", { rate: 4 });
}
async function newPage(state) {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true, ...(state ? { storageState: state } : {}) });
  await ctx.addInitScript(() => {
    window.__lcp = 0;
    try { new PerformanceObserver((l) => { for (const e of l.getEntries()) window.__lcp = e.startTime; }).observe({ type: "largest-contentful-paint", buffered: true }); } catch {}
  });
  const page = await ctx.newPage();
  page.__api = [];
  page.on("request", (r) => { if (new URL(r.url()).pathname.startsWith("/api/")) page.__api.push(r.url()); });
  return page;
}

// "Ready" = the page shows its own content: right path, no loading dot, no blank placeholder cards, real text in main.
const READY = {
  "/": '[data-testid^="card-game-"], [data-testid="button-empty-scan"]',
  "/leagues": '[data-testid^="link-standings-team-"]',
  "/scan": '[data-testid="button-take-photo"], [data-testid="card-scan-signin"]',
  "/players": '[data-testid^="row-player-"]',
  "/rink": '[data-testid="text-rink-name"]',
  "/me": '[data-testid="text-me-name"]',
};
const readyFn = ([path, sel]) => {
  if (location.pathname !== path) return false;
  if (document.querySelector('[data-testid="status-loading"]')) return false;
  if (document.querySelector("main .card.h-40")) return false;
  if (sel && !document.querySelector(sel)) return false;
  if ((document.querySelector("main")?.innerText || "").length < 40) return false;
  return true;
};

async function coldLoad(base, path, state, sel) {
  const page = await newPage(state);
  await throttle(page);
  const t0 = Date.now();
  await page.goto(base + path, { waitUntil: "commit", timeout: 60000 });
  let ready = null;
  try { await page.waitForFunction(readyFn, [path, sel], { polling: "raf", timeout: 45000 }); ready = Date.now() - t0; } catch {}
  await sleep(500);
  const m = await page.evaluate(() => {
    const nav = performance.getEntriesByType("navigation")[0];
    const fcp = performance.getEntriesByName("first-contentful-paint")[0]?.startTime ?? null;
    const res = performance.getEntriesByType("resource");
    const js = res.filter((r) => r.initiatorType === "script" || r.name.endsWith(".js")).reduce((a, r) => a + (r.transferSize || 0), 0);
    const all = res.reduce((a, r) => a + (r.transferSize || 0), 0) + (nav?.transferSize || 0);
    const api = res.filter((r) => new URL(r.name).pathname.startsWith("/api/")).map((r) => Math.round(r.duration));
    const fonts = res.filter((r) => /fonts\.|fontshare/.test(r.name)).map((r) => Math.round(r.responseEnd));
    return { ttfb: nav ? nav.responseStart : null, fcp, lcp: window.__lcp || null, jsKB: Math.round(js / 1024), totalKB: Math.round(all / 1024), apiMs: api, fontsDoneMs: fonts.length ? Math.max(...fonts) : null };
  });
  const out = { ...m, ready, apiCalls: page.__api.length };
  await page.context().close();
  return out;
}
function summarize(runs) {
  const keys = ["ttfb", "fcp", "lcp", "ready", "jsKB", "totalKB", "apiCalls", "fontsDoneMs"];
  return Object.fromEntries(keys.map((k) => [k, median(runs.map((r) => r[k]))]));
}

// --- Sign in the test player and put him on a team, like a claimed spot.
let state, me = {};
{
  const page = await newPage();
  await page.goto(`${BASE}/join`);
  await page.getByTestId("input-email").fill(EMAIL);
  const before = await lastMailId(EMAIL);
  await page.getByTestId("button-send-code").click();
  await page.getByTestId("input-code").waitFor();
  const { code } = await latestCode(EMAIL, before);
  await page.getByTestId("input-code").fill(code);
  await page.getByTestId("button-verify").click();
  await page.getByTestId("input-name").waitFor();
  await page.getByTestId("input-name").fill("Measure Player");
  await page.getByTestId("input-number").fill("12");
  await page.getByTestId("button-position-D").click();
  await page.getByTestId("button-save-profile").click();
  await page.waitForURL(/\/me$/, { timeout: 30000 }).catch(() => {});
  const [u] = await db`SELECT id FROM users WHERE email=${EMAIL}`;
  const [rink] = await db`SELECT id FROM rinks WHERE slug='polar-ice-wilmington'`;
  const [slot] = await db`SELECT p.id, re.team_id FROM players p JOIN roster_entries re ON re.player_id=p.id JOIN teams t ON t.id=re.team_id
    WHERE t.name='Whiskey Dekes' AND p.position<>'G' AND NOT re.is_sub ORDER BY p.id LIMIT 1`;
  await db`UPDATE users SET access='approved', home_rink_id=${rink.id}, position='D', name='Measure Player', number='12' WHERE id=${u.id}`;
  await db`UPDATE players SET user_id=${u.id}, claimed=1 WHERE id=${slot.id}`;
  await fetch(`${BASE}/api/cron/recompute`, { headers: { authorization: `Bearer ${process.env.CRON_SECRET}` } });
  me = { userId: u.id, playerId: slot.id, teamId: slot.team_id };
  state = await page.context().storageState();
  await page.context().close();
}

// --- Cold loads, signed in and signed out (empty cache, no service worker).
result.cold = {};
for (const path of ["/", "/leagues", "/players", "/me"]) {
  const runs = [];
  for (let i = 0; i < RUNS; i++) runs.push(await coldLoad(BASE, path, state, READY[path]));
  result.cold[`signed in ${path}`] = summarize(runs);
}
{
  const runs = [];
  for (let i = 0; i < RUNS; i++) runs.push(await coldLoad(BASE, "/", null, READY["/"]));
  result.cold["signed out /"] = summarize(runs);
}

// --- Tab switches: tap a bottom tab, time until the route shows (shell) and until its content is ready.
const TABS = [["/leagues", '[data-testid="nav-leagues"]'], ["/scan", '[data-testid="nav-scan"]'], ["/players", '[data-testid="nav-players"]'], ["/rink", '[data-testid="nav-rink"]'], ["/me", '[data-testid="link-me"]'], ["/", '[data-testid="nav-home"]']];
async function tabPass(page) {
  const rows = {};
  for (const [path, sel] of TABS) {
    page.__api = [];
    await page.evaluate((s) => { window.__t0 = performance.now(); document.querySelector(s).click(); }, sel);
    const shell = await (await page.waitForFunction((p) => location.pathname === p && performance.now() - window.__t0, path, { polling: "raf", timeout: 30000 })).jsonValue();
    let ready = null;
    try { ready = await (await page.waitForFunction(([p, s]) => { const f = (([path, sel]) => { if (location.pathname !== path) return false; if (document.querySelector('[data-testid="status-loading"]')) return false; if (document.querySelector("main .card.h-40")) return false; if (sel && !document.querySelector(sel)) return false; if ((document.querySelector("main")?.innerText || "").length < 40) return false; return true; }); return f([p, s]) && performance.now() - window.__t0; }, [path, READY[path]], { polling: "raf", timeout: 30000 })).jsonValue(); } catch {}
    await sleep(800);
    rows[path] = { shellMs: Math.round(shell), readyMs: ready == null ? null : Math.round(ready), apiCalls: page.__api.length };
  }
  return rows;
}
result.tabs = { first: [], warm: [], after35s: [] };
for (let i = 0; i < RUNS; i++) {
  const page = await newPage(state);
  await throttle(page);
  await page.goto(BASE + "/", { timeout: 60000 });
  await page.waitForFunction(readyFn, ["/", READY["/"]], { polling: "raf", timeout: 45000 });
  await sleep(1500);
  result.tabs.first.push(await tabPass(page));
  result.tabs.warm.push(await tabPass(page));
  await sleep(35000);
  result.tabs.after35s.push(await tabPass(page));
  await page.context().close();
}
const tabSummary = (passes) => Object.fromEntries(TABS.map(([p]) => [p, { shellMs: median(passes.map((x) => x[p].shellMs)), readyMs: median(passes.map((x) => x[p].readyMs)), apiCalls: median(passes.map((x) => x[p].apiCalls)) }]));
result.tabSummary = { first: tabSummary(result.tabs.first), warm: tabSummary(result.tabs.warm), after35s: tabSummary(result.tabs.after35s) };

// --- Page length in screens (scrollHeight / 844), signed in, unthrottled.
{
  const [c] = await db`SELECT l.id FROM leagues l JOIN rinks r ON r.id=l.rink_id WHERE r.slug='polar-ice-wilmington' AND l.level='C'`;
  const [g] = await db`SELECT id FROM games WHERE home_team_id=${me.teamId} OR away_team_id=${me.teamId} ORDER BY played_on DESC LIMIT 1`;
  const [other] = await db`SELECT p.id FROM players p JOIN player_game_stats s ON s.player_id=p.id GROUP BY p.id ORDER BY SUM(s.goals+s.assists) DESC LIMIT 1`;
  const routes = ["/", "/leagues", `/league/${c.id}`, `/team/${me.teamId}`, "/scan", `/game/${g.id}`, "/players", `/player/${me.playerId}`, `/player/${other.id}`, "/rink", "/me"];
  const page = await newPage(state);
  result.length = {};
  for (const r of routes) {
    await page.goto(BASE + r, { waitUntil: "networkidle", timeout: 60000 }).catch(() => {});
    await sleep(1200);
    const h = await page.evaluate(() => document.documentElement.scrollHeight);
    result.length[r] = { px: h, screens: Math.round((h / 844) * 10) / 10 };
  }
  await page.context().close();
}

// --- The live site, signed out: real Vercel functions and the real Supabase pooler. Page views only.
if (process.env.PROD_BASE) {
  result.prod = {};
  for (const path of ["/", "/leagues", "/players"]) {
    const runs = [];
    for (let i = 0; i < RUNS; i++) runs.push(await coldLoad(process.env.PROD_BASE, path, null, null));
    result.prod[path] = { ...summarize(runs), apiMs: runs.map((r) => r.apiMs) };
  }
}

await browser.close();
srv.kill("SIGTERM");
await db.end();

// --- Report.
const L = [];
L.push(`# Late Ice measurements\n\n${Object.entries(result.config).map(([k, v]) => `- ${k}: ${v}`).join("\n")}\n`);
L.push(`Rating replay: ${result.recompute.games} games in ${result.recompute.replayMs} ms (whole nightly job ${result.recompute.ms} ms).\n`);
L.push(`## Cold load (median of ${RUNS}, ms unless noted)\n\n| Page | TTFB | FCP | LCP | Content ready | JS KB | Total KB | API calls | Fonts done |\n| --- | --- | --- | --- | --- | --- | --- | --- | --- |`);
for (const [k, v] of Object.entries(result.cold)) L.push(`| ${k} | ${v.ttfb} | ${v.fcp} | ${v.lcp} | ${v.ready} | ${v.jsKB} | ${v.totalKB} | ${v.apiCalls} | ${v.fontsDoneMs} |`);
for (const [name, rows] of Object.entries(result.tabSummary)) {
  L.push(`\n## Tab switch: ${name} (median of ${RUNS})\n\n| Tab | Route shown ms | Content ready ms | API calls |\n| --- | --- | --- | --- |`);
  for (const [p, v] of Object.entries(rows)) L.push(`| ${p} | ${v.shellMs} | ${v.readyMs} | ${v.apiCalls} |`);
}
L.push(`\n## Page length (390x844)\n\n| Route | Height px | Screens |\n| --- | --- | --- |`);
for (const [p, v] of Object.entries(result.length)) L.push(`| ${p} | ${v.px} | ${v.screens} |`);
if (result.prod) {
  L.push(`\n## Live site, signed out, throttled (median of ${RUNS})\n\n| Page | TTFB | FCP | LCP | Content ready | JS KB | API calls | API durations ms (each run) |\n| --- | --- | --- | --- | --- | --- | --- | --- |`);
  for (const [p, v] of Object.entries(result.prod)) L.push(`| ${p} | ${v.ttfb} | ${v.fcp} | ${v.lcp} | ${v.ready} | ${v.jsKB} | ${v.apiCalls} | ${v.apiMs.map((a) => a.join("/")).join(" ; ")} |`);
}
writeFileSync(`${OUT}/measure.json`, JSON.stringify(result, null, 2));
writeFileSync(`${OUT}/measure.md`, L.join("\n") + "\n");
console.log(L.join("\n"));
