// UX walkthrough: real jobs, in order, as the people who do them, against a seeded season.
// Phone-sized WebKit (Safari's engine) and Chromium, rink time zone, several people signed in at once.
// Every step: a first-screen and a full-page picture, tap targets, small text, sideways overflow,
// layout shift, axe (WCAG 2.2 AA), page height. Every job: done or not, taps, typing, estimated
// human time against a pass line. Writes audit/walk.md, audit/walk.json, audit/walk/*.jpg.
// Findings never fail the run; only a crash of the harness does.
import { spawn } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { chromium, webkit } from "playwright";
import postgres from "postgres";
import { latestCode, lastMailId } from "./mail.mjs";

const require = createRequire(import.meta.url);
const AXE = readFileSync(require.resolve("axe-core/axe.min.js"), "utf8");
const PORT = 3095, BASE = `http://localhost:${PORT}`;
const PHONE = { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, hasTouch: true, isMobile: true, timezoneId: "America/New_York", locale: "en-US" };
const ENGINES = (process.env.WALK_ENGINES || "webkit,chromium").split(",");
const SEED = JSON.parse(readFileSync("audit/seed.json", "utf8"));
const OUT = "audit/walk";
mkdirSync(OUT, { recursive: true });
const db = postgres(process.env.DATABASE_URL, { prepare: false, max: 2, onnotice: () => {} });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const srv = spawn("npx", ["next", "start", "-p", String(PORT)], {
  env: { ...process.env, NODE_ENV: "production", BOOTSTRAP_ADMIN_EMAIL: "staff@example.com", LATEICE_FAKE_OCR: "1", LATEICE_MAP_LOOKUP: "off" },
  stdio: ["ignore", "ignore", "inherit"],
});
for (let i = 0; i < 300; i++) { try { if ((await fetch(`${BASE}/api/bootstrap`)).ok) break; } catch {} await sleep(200); }
{
  const r = await fetch(`${BASE}/api/cron/recompute`, { headers: { authorization: `Bearer ${process.env.CRON_SECRET}` } });
  console.log("ratings replay", r.status);
}

// Estimated human time (keystroke-level model, phone): tap 1.5 s, typed character 0.35 s,
// reading a new screen 2 s, switching to email for a code and back 20 s.
const KLM = { tap: 1.5, char: 0.35, screen: 2, email: 20 };
const findings = [], jobs = [], seen = new Set();
let shotN = 0;
const SEV = ["blocker", "serious", "moderate", "minor"];

function find(severity, kind, ctx, detail, key) {
  const k = `${ctx.engine}|${kind}|${key ?? detail}`;
  if (seen.has(k)) return;
  seen.add(k);
  findings.push({ severity, kind, engine: ctx.engine, job: ctx.job, step: ctx.step, detail, shot: ctx.shot });
}

const INIT = `window.__cls=0;try{new PerformanceObserver(l=>{for(const e of l.getEntries()){if(!e.hadRecentInput)window.__cls+=e.value}}).observe({type:'layout-shift',buffered:true})}catch{}`;

async function person(browser, engine, who, { throttle = false } = {}) {
  // WebKit runs in dark mode (the app's default on most iPhones at night), Chromium in light.
  const ctx = await browser.newContext({ ...PHONE, colorScheme: engine === "webkit" ? "dark" : "light" });
  await ctx.addInitScript(INIT);
  const page = await ctx.newPage();
  const state = { engine, who, job: "", step: "", shot: "", fake: null };
  page.on("pageerror", (e) => find("blocker", "page crash", state, `${e.message}`.slice(0, 240)));
  page.on("console", (m) => {
    if (m.type() !== "error") return;
    const t = m.text();
    if (/fonts|favicon|Failed to load resource|webauthn|passkey|NotAllowedError|AbortError|RSC payload/i.test(t)) return;
    find("moderate", "console error", state, t.slice(0, 240));
  });
  page.on("response", (r) => {
    const u = r.url(); if (!u.startsWith(BASE)) return;
    const s = r.status(), path = u.replace(BASE, "");
    if (s >= 500) find("blocker", "server error", state, `${s} ${r.request().method()} ${path}`, `${s} ${path.replace(/\d+/g, "N")}`);
    else if (s >= 400 && path.startsWith("/api/") && !(s === 401 && /^\/api\/(me|notifications|push|sheets\/allowance)/.test(path)))
      find("serious", "request refused", state, `${s} ${r.request().method()} ${path}`, `${s} ${path.replace(/\d+/g, "N")}`);
  });
  page.on("dialog", async (d) => {
    find("minor", "native dialog", state, `Uses the browser's ${d.type()} box: "${d.message().slice(0, 110)}"`, d.message().slice(0, 40));
    await d.accept().catch(() => {});
  });
  // The phone resizes the photo on a canvas, which drops anything appended to it. The fake reader's
  // script is added here, after the app has done its own work, so the upload path stays real.
  await ctx.route("**/api/sheets", async (route) => {
    const req = route.request();
    if (req.method() !== "POST" || !state.fake) return route.continue();
    const raw = req.postDataBuffer() ?? Buffer.from(req.postData() || "{}");
    const b = JSON.parse(raw.toString("utf8") || "{}");
    const m = String(b.image || "").match(/^data:(image\/[a-z]+);base64,(.+)$/);
    if (!m) return route.continue();
    const bytes = Buffer.concat([Buffer.from(m[2], "base64"), Buffer.from("LATEICE_FAKE:" + JSON.stringify(state.fake))]);
    // Sent from here and handed back, because WebKit ignores a rewritten body on continue().
    const resp = await route.fetch({ postData: JSON.stringify({ ...b, image: `data:${m[1]};base64,${bytes.toString("base64")}` }) });
    return route.fulfill({ response: resp });
  });
  if (throttle && engine === "chromium") {
    const c = await ctx.newCDPSession(page);
    await c.send("Network.enable");
    await c.send("Network.emulateNetworkConditions", { offline: false, latency: 150, downloadThroughput: 200000, uploadThroughput: 93750 });
    await c.send("Emulation.setCPUThrottlingRate", { rate: 4 });
    state.throttled = true;
  }
  return { ctx, page, state };
}

async function settle(page) {
  await page.waitForLoadState("networkidle", { timeout: 5000 }).catch(() => {});
  await page.waitForTimeout(300);
}

/** One job, done by one person, measured against its pass line. */
async function job(p, id, name, goal, target, fn) {
  const j = { id, engine: p.state.engine, who: p.state.who, name, goal, target, ok: true, taps: 0, chars: 0, screens: 0, emails: 0, ms: 0, steps: [], notes: [], blockedAt: null, throttled: !!p.state.throttled };
  jobs.push(j);
  p.state.job = name; p.state.step = "";
  const t0 = Date.now();
  const t = {
    tap: async (loc, label) => { j.taps++; await loc.first().scrollIntoViewIfNeeded({ timeout: 8000 }).catch(() => {}); await loc.first().click({ timeout: 10000 }); await settle(p.page); if (label) await t.step(label); },
    type: async (loc, text) => { j.chars += String(text).length; await loc.first().fill(String(text), { timeout: 10000 }); },
    step: (label) => shot(p, j, label),
    email: () => { j.emails++; },
    check: (cond, severity, kind, detail) => { if (!cond) find(severity, kind, p.state, `${name}: ${detail}`); return !!cond; },
    note: (s) => j.notes.push(s),
  };
  try { await fn(t); }
  catch (e) {
    j.ok = false; j.blockedAt = p.state.step || "start";
    await shot(p, j, `blocked`).catch(() => {});
    find("blocker", "job not done", p.state, `${name}: stopped after "${j.blockedAt}": ${String(e.message).split("\n")[0].slice(0, 220)}`);
  }
  j.ms = Date.now() - t0;
  j.human = Math.round(j.taps * KLM.tap + j.chars * KLM.char + j.screens * KLM.screen + j.emails * KLM.email);
  j.pass = j.ok && (target.taps == null || j.taps <= target.taps) && (target.human == null || j.human <= target.human);
  return j;
}

/** Everything checked on one screen, plus a picture of the first screen and of the whole page. */
async function shot(p, j, label) {
  const { page, state } = p;
  state.step = label;
  await settle(page);
  j.screens++;
  const base = `${String(++shotN).padStart(3, "0")}-${state.engine}-${j.id}-${label}`.replace(/[^a-z0-9.-]+/gi, "-").slice(0, 90);
  state.shot = `${base}.jpg`;
  await page.screenshot({ path: `${OUT}/${base}.jpg`, type: "jpeg", quality: 62 }).catch(() => {});
  await page.screenshot({ path: `${OUT}/${base}-full.jpg`, type: "jpeg", quality: 50, fullPage: true }).catch(() => {});
  const m = await page.evaluate(() => {
    const vis = (el) => { const r = el.getBoundingClientRect(); const s = getComputedStyle(el); return r.width > 0 && r.height > 0 && s.visibility !== "hidden" && s.display !== "none" && Number(s.opacity) > 0.05; };
    const desc = (el) => { const id = el.getAttribute("data-testid"); const txt = (el.getAttribute("aria-label") || el.textContent || el.getAttribute("placeholder") || "").trim().replace(/\s+/g, " ").slice(0, 40); return `${el.tagName.toLowerCase()}${id ? `[${id}]` : ""} "${txt}"`; };
    const small = [], tiny = [];
    for (const el of document.querySelectorAll('a[href],button,input:not([type=hidden]),select,textarea,[role=button],[role=radio],[role=switch]')) {
      if (!vis(el)) continue;
      if (el.tagName === "A" && getComputedStyle(el).display === "inline" && el.parentElement && /^(P|SPAN|LI)$/.test(el.parentElement.tagName)) continue;
      const r = el.getBoundingClientRect(), side = Math.min(r.width, r.height);
      if (side < 24) tiny.push(`${desc(el)} ${Math.round(r.width)}x${Math.round(r.height)}`);
      else if (side < 44) small.push(`${desc(el)} ${Math.round(r.width)}x${Math.round(r.height)}`);
    }
    const tinyText = new Set();
    const w = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    for (let n = w.nextNode(); n; n = w.nextNode()) {
      const s = n.textContent.trim(); if (s.length < 2 || !n.parentElement || !vis(n.parentElement)) continue;
      const fs = parseFloat(getComputedStyle(n.parentElement).fontSize); if (fs < 12) tinyText.add(`${fs}px "${s.slice(0, 30)}"`);
    }
    // What the first screen says: headings, then what you can tap, top to bottom.
    const H = innerHeight, above = [];
    for (const el of document.querySelectorAll("h1,h2,h3,[data-testid^=card-],a[href],button")) {
      if (!vis(el)) continue;
      const r = el.getBoundingClientRect(); if (r.top < 0 || r.top > H - 90) continue;
      if (el.closest("nav") || el.closest("header")) continue;
      const txt = (el.getAttribute("aria-label") || el.innerText || "").trim().replace(/\s+/g, " ").slice(0, 60);
      if (txt) above.push(`${/^H/.test(el.tagName) ? "#" : "·"} ${txt}`);
    }
    const W = document.documentElement.clientWidth;
    return { path: location.pathname + location.search, tiny, small, tinyText: [...tinyText], wide: document.documentElement.scrollWidth > W + 1, W, height: document.documentElement.scrollHeight, cls: window.__cls || 0, above: [...new Set(above)].slice(0, 14), h1: [...document.querySelectorAll("h1")].filter(vis).length };
  });
  let axe = [];
  try {
    await page.addScriptTag({ content: AXE });
    axe = await page.evaluate(async () => (await window.axe.run(document, { runOnly: { type: "tag", values: ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"] }, resultTypes: ["violations"] }))
      .violations.map((v) => ({ id: v.id, impact: v.impact, help: v.help, nodes: v.nodes.slice(0, 3).map((n) => n.target.join(" ")), count: v.nodes.length })));
  } catch { /* axe could not run here */ }
  const P = m.path.replace(/\d+/g, "N");
  for (const x of m.tiny) find("serious", "tap target under 24 pt", state, `${m.path}: ${x}`, x.replace(/\d+x\d+$/, "").replace(/\d+/g, "N"));
  for (const x of m.small) find("moderate", "tap target under 44 pt", state, `${m.path}: ${x}`, x.replace(/\d+x\d+$/, "").replace(/\d+/g, "N"));
  if (m.tinyText.length) find("moderate", "text under 12 pt", state, `${m.path}: ${m.tinyText.slice(0, 4).join("; ")}`, P);
  if (m.wide) find("serious", "page slides sideways", state, `${m.path} is wider than ${m.W}px`, `${P}|${state.zoom ? "zoom" : ""}`);
  if (m.cls > 0.1) find("moderate", "layout shift", state, `${m.path}: shift ${m.cls.toFixed(2)}`, P);
  for (const v of axe) find(v.impact === "critical" || v.impact === "serious" ? "serious" : "moderate", `a11y ${v.id}`, state, `${m.path}: ${v.help} (${v.count}x) e.g. ${v.nodes.join(" | ")}`, `${v.id}|${P}`);
  j.steps.push({ label, path: m.path, shot: state.shot, screens: Math.round((m.height / 844) * 10) / 10, cls: Number(m.cls.toFixed(3)), axe: axe.length, above: m.above });
}

// ---------------------------------------------------------------- helpers

async function emailCode(t, page, email) {
  await t.type(page.getByTestId("input-email"), email);
  const before = await lastMailId(email);
  await t.tap(page.getByTestId("button-send-code"));
  await page.getByTestId("input-code").waitFor({ timeout: 15000 });
  await t.step("code");
  t.email();
  const { code } = await latestCode(email, before);
  await t.type(page.getByTestId("input-code"), code);
  await t.tap(page.getByTestId("button-verify"));
}

async function profile(t, page, name, number, pos) {
  await page.getByTestId("input-name").waitFor({ timeout: 15000 });
  await t.step("profile");
  await t.type(page.getByTestId("input-name"), name);
  await t.type(page.getByTestId("input-number"), number);
  await t.tap(page.getByTestId(`button-position-${pos}`));
  // The home rink starts on the rink being viewed. Note what it defaulted to, then make sure it's Polar Ice.
  const polar = page.getByTestId(`button-rink-${SEED.rinkId}`);
  const preset = (await polar.count()) && /border-\[var\(--red\)\]/.test((await polar.first().getAttribute("class")) || "");
  t.note(`home rink preset to Polar Ice: ${preset ? "yes" : "no"}`);
  if (!preset) {
    if (!(await polar.count())) await t.type(page.getByTestId("input-rink-search"), "Polar");
    await page.getByTestId(`button-rink-${SEED.rinkId}`).first().waitFor({ timeout: 8000 });
    await t.tap(page.getByTestId(`button-rink-${SEED.rinkId}`));
  }
  await page.getByTestId("input-age").check(); t.check(true);
  await t.tap(page.getByTestId("button-save-profile"));
  await page.waitForURL(/\/me$/, { timeout: 20000 });
}

const today = SEED.today;
async function tonightGameId(teamId) { const [g] = await db`SELECT id FROM scheduled_games WHERE team_id=${teamId} AND starts_at > now() ORDER BY starts_at LIMIT 1`; return g?.id; }

/** What the scoresheet reader "sees" for tonight's game: both rosters, 3-2, the player scores once. */
function sheetFor(pair, scorerNumber) {
  const side = (t) => ({ name: t.name, roster: t.roster.slice(0, 14).map((p) => ({ number: p.number, name: p.name, position: p.goalie ? "G" : null })) });
  const skaters = (t) => t.roster.filter((p) => !p.goalie).map((p) => p.number);
  const hs = skaters(pair.home), as = skaters(pair.away);
  const home = side(pair.home), away = side(pair.away);
  const hg = [[1, "12:41", scorerNumber, hs[2], null], [2, "8:03", hs[3], scorerNumber, hs[4]], [3, "4:10", hs[5], null, null]];
  const ag = [[1, "4:20", as[1], as[2], null], [3, "9:44", as[3], as[1], null]];
  const goals = (g) => g.map(([period, time, s, a1, a2]) => ({ period, time, scorer: String(s), assist1: a1 ? String(a1) : null, assist2: a2 ? String(a2) : null }));
  const per = (g) => [1, 2, 3].map((p) => g.filter((x) => x[0] === p).length);
  Object.assign(home, { goals: goals(hg), penalties: [{ period: 2, number: String(hs[6]), offense: "Tripping", minutes: 2 }], shots_by_period: [9, 11, 12], score_by_period: per(hg), total: 3 });
  Object.assign(away, { goals: goals(ag), penalties: [{ period: 1, number: String(as[4]), offense: "Hooking", minutes: 2 }], shots_by_period: [8, 10, 9], score_by_period: per(ag), total: 2 });
  return { is_scoresheet: true, date: today, time: SEED.tonight.localTime, league_text: "C League", rink_text: "Polar Ice Wilmington", home, away, confidence: 0.93, notes: [] };
}

async function upload(t, page, label) {
  const chooser = page.waitForEvent("filechooser", { timeout: 10000 });
  await t.tap(page.getByTestId("button-upload"));
  await (await chooser).setFiles("public/samples/demo-flyers-owls.jpg");
  await page.waitForURL(/\/sheet\/\d+/, { timeout: 30000 });
  await t.step(`${label}-reading`);
  await page.locator('[data-testid="button-send-to-captains"], [data-testid="button-confirm-final"], [data-testid="text-sheet-stuck"]').first().waitFor({ timeout: 45000 });
}

// ---------------------------------------------------------------- the jobs, in the order a week runs

async function week(browser, engine, pairIdx) {
  const pair = SEED.pairs[pairIdx];
  const team = pair.home, opp = pair.away;
  const capEmail = `captain.${engine}@example.com`, plEmail = `player.${engine}@example.com`;
  const cap = await person(browser, engine, "captain");
  const pl = await person(browser, engine, "player", { throttle: true });
  let invitePath = null, playerId = pair.player.id, gameId = null, sheetId = null;

  // 1. Captain gets set up and makes the team's invite link.
  await job(cap, "captain-setup", "Captain claims his team and shares the invite link", "Sign in, get let in, claim my spot, take the C, send the link to the group chat.", { taps: 12 }, async (t) => {
    const page = cap.page;
    await page.goto(BASE + "/"); await t.step("home-signed-out");
    await t.tap(page.getByTestId("link-home-join").or(page.getByTestId("nav-me")), "join");
    await emailCode(t, page, capEmail);
    await profile(t, page, pair.captain.name, pair.captain.number, "C");
    await t.step("me-waiting");
    t.check(await page.getByTestId("card-waitlist").count(), "moderate", "unclear state", "A new captain without an invite should see he is on the waitlist");
    // Staff let him in (Rink Desk does this in real life).
    await db`UPDATE users SET access='approved' WHERE email=${capEmail}`;
    await page.reload(); await settle(page); await t.step("me-let-in");
    const claim = page.locator('[data-testid^="button-claim-"]');
    if (!t.check(await claim.count(), "serious", "claim not offered", `"Is this you?" did not offer ${pair.captain.name} on ${team.name}`)) {
      await t.tap(page.getByTestId("button-find-spot"));
      await t.type(page.getByTestId("input-find-spot"), pair.captain.name);
      await page.locator('[data-testid^="button-claim-spot-"]').first().waitFor({ timeout: 8000 });
      await t.tap(page.locator('[data-testid^="button-claim-spot-"]'));
    } else await t.tap(claim);
    await t.step("me-claimed");
    await t.tap(page.locator(`[data-testid="button-become-captain-${team.id}"]`), "me-captain");
    await t.tap(page.locator(`[data-testid="button-manage-${team.id}"]`));
    await page.waitForURL(/\/manage$/); await t.step("manage");
    await t.tap(page.getByTestId("button-more-invites"), "invites-open");
    if (await page.getByTestId("button-make-invite").count()) await t.tap(page.getByTestId("button-make-invite"));
    await page.getByTestId("text-invite-url").waitFor({ timeout: 8000 });
    await t.step("invite-link");
    invitePath = new URL((await page.getByTestId("text-invite-url").innerText()).trim(), BASE).pathname + new URL((await page.getByTestId("text-invite-url").innerText()).trim(), BASE).search;
    t.note(`invite ${invitePath}`);
  });

  // 2. New player: the first two minutes, from the group-chat link to his team.
  await job(pl, "first-two-minutes", "New player: invite link to his team in two minutes", "Tap the captain's link, sign in, four fields, see my team and my next game.", { taps: 9, human: 120 }, async (t) => {
    const page = pl.page;
    if (!invitePath) throw new Error("no invite link from the captain");
    await page.goto(BASE + invitePath); await t.step("invite-landing");
    t.check(await page.getByTestId("card-invite-banner").count(), "serious", "invite not recognised", "The invite link does not say which team it is for");
    if (!(await page.getByTestId("input-email").count())) await t.tap(page.getByTestId("link-home-join").or(page.getByTestId("nav-me")));
    await emailCode(t, page, plEmail);
    await profile(t, page, pair.player.name, pair.player.number, "W");
    await t.step("me-first");
    const offer = page.getByTestId("button-offer-passkey-later");
    if (await offer.count()) await t.tap(offer);
    const claim = page.locator('[data-testid^="button-claim-"]');
    if (await claim.count()) { t.note("Is this you? offered"); await t.tap(claim, "me-claimed"); }
    else t.note("no Is this you? card");
    const onTeam = await page.locator(`[data-testid="card-my-team-${team.id}"]`).count();
    t.check(onTeam, "blocker", "not on the team", `After the invite and sign-up, ${team.name} is not on Me`);
    await t.tap(page.getByTestId("nav-home"), "home-first");
    t.check(await page.getByTestId("card-next-game").count(), "serious", "next game missing", "Home does not show the next game after joining");
    const [u] = await db`SELECT p.id FROM players p JOIN users u ON u.id=p.user_id WHERE u.email=${plEmail} LIMIT 1`;
    if (u) playerId = u.id;
  });

  // 3. Game night, the player: am I playing, say In.
  await job(pl, "game-night-in", "Game night: say In", "Open the app at work in the afternoon, see tonight's game, say I'm in.", { taps: 1, human: 8 }, async (t) => {
    const page = pl.page;
    gameId = await tonightGameId(team.id);
    await page.goto(BASE + "/"); await t.step("home");
    const title = (await page.getByTestId("text-home-title").innerText().catch(() => "")).trim();
    t.note(`Home title: ${title}`);
    t.check(title === "Tonight", "moderate", "tonight not obvious", `Home calls tonight's game "${title}" (game ${SEED.tonight.localTime} ET today)`);
    await t.tap(page.getByTestId(`button-rsvp-in-${gameId}`), "said-in");
    t.check((await page.getByTestId(`button-rsvp-in-${gameId}`).getAttribute("aria-checked")) === "true", "serious", "answer did not stick", "In is not shown as picked");
    const counts = (await page.getByTestId("text-next-counts").innerText().catch(() => "")).trim();
    t.note(`counts: ${counts}`);
    t.check(/1 in/.test(counts), "moderate", "count did not update", `Header still says "${counts}"`);
  });

  // 4. Game night, the captain: who's coming, and tell them the room.
  await job(cap, "game-night-captain", "Game night: captain checks who's in and posts the room", "See who said In, set sheet 2, white jerseys, locker room 4.", { taps: 5 }, async (t) => {
    const page = cap.page;
    await page.goto(BASE + "/"); await t.step("home");
    if (await page.getByTestId(`button-rsvp-counts-${gameId}`).count()) await t.tap(page.getByTestId(`button-rsvp-counts-${gameId}`), "who-is-in");
    else t.check(false, "moderate", "can't see who's in", "No way from Home to see who said In");
    await t.tap(page.getByTestId("link-home-details"));
    await page.locator(`[data-testid="panel-details-${gameId}"]`).waitFor({ timeout: 8000 });
    await t.step("details-form");
    await t.type(page.getByTestId(`input-sheet-${gameId}`), "2");
    await t.type(page.getByTestId(`input-jersey-${gameId}`), "White");
    await t.type(page.getByTestId(`input-room-${gameId}`), "4");
    await t.tap(page.getByTestId(`button-save-details-${gameId}`), "details-saved");
    await page.goto(BASE + "/"); await t.step("home-after");
    t.check(await page.getByTestId(`details-game-${gameId}`).count(), "serious", "details not shown", "Home does not show the sheet, jersey and room just saved");
  });
  // The player sees the room on his Home.
  await job(pl, "game-night-room", "Game night: player sees sheet and room", "Which room? Without asking the group chat.", { taps: 0, human: 4 }, async (t) => {
    await pl.page.goto(BASE + "/"); await t.step("home");
    t.check(await pl.page.getByTestId(`details-game-${gameId}`).count(), "serious", "details not shown", "The player's Home does not show sheet, jersey and room");
  });

  // 5. After the game: the player scans the sheet and sends it to the captains.
  await job(pl, "scan-sheet", "After the game: scan the sheet and send it", "In the locker room: snap the sheet, glance, send.", { taps: 4, human: 30 }, async (t) => {
    const page = pl.page;
    pl.state.fake = [{ op: "json", body: sheetFor(pair, pair.player.number), inputTokens: 2383, outputTokens: 1550 }];
    await t.tap(page.getByTestId("nav-scan"), "scan");
    await upload(t, page, "scan");
    sheetId = Number(page.url().match(/\/sheet\/(\d+)/)[1]);
    await t.step("review");
    const home = await page.getByTestId("text-score-home").innerText().catch(() => "?"), away = await page.getByTestId("text-score-away").innerText().catch(() => "?");
    t.note(`review shows ${home}-${away}`);
    t.check(home.trim() === "3" && away.trim() === "2", "serious", "score misread on review", `Review shows ${home}-${away}, sheet says 3-2`);
    const teamSel = await page.getByTestId("select-team-home").inputValue().catch(() => "");
    t.check(teamSel && teamSel !== "", "serious", "team not matched", "Home team was not matched to a team in the league");
    if (await page.getByTestId("list-warnings").count()) t.note(`warnings: ${(await page.getByTestId("list-warnings").innerText()).replace(/\s+/g, " ").slice(0, 200)}`);
    await t.tap(page.getByTestId("button-send-to-captains"), "sent");
    t.check(await page.getByTestId("text-sent-to-captains").count(), "serious", "no confirmation", "Sending to the captains showed nothing");
    pl.state.fake = null;
  });

  // 6. The captain gets the notice and confirms.
  await job(cap, "captain-confirm", "Captain confirms the sheet", "Phone buzzes on the drive home: check it, confirm.", { taps: 3, human: 20 }, async (t) => {
    const page = cap.page;
    await page.goto(BASE + "/"); await t.step("home");
    const pending = page.locator(`[data-testid="link-pending-${sheetId}"]`);
    const dot = await page.locator('[data-testid="nav-me"] .rounded-full.bg-\\[var\\(--red\\)\\]').count();
    t.note(`Home pending card: ${await pending.count() ? "yes" : "no"}; unread dot on Me: ${dot ? "yes" : "no"}`);
    if (await pending.count()) await t.tap(pending);
    else {
      t.check(false, "moderate", "waiting sheet hard to find", "Home does not show the sheet waiting for the captain");
      await t.tap(page.getByTestId("nav-me"), "me");
      await t.tap(page.getByTestId("row-notifications"), "notifications");
      await t.tap(page.locator('[data-testid^="row-notice-"][href^="/sheet/"]'));
    }
    await page.getByTestId("button-confirm-final").waitFor({ timeout: 15000 });
    await t.step("sheet-to-confirm");
    await t.tap(page.getByTestId("button-confirm-final"));
    await page.waitForURL(/\/game\/\d+/, { timeout: 20000 });
    await t.step("game-in-books");
  });

  // 7. The payoff: the player sees the result, his line and why his rating moved.
  await job(pl, "see-rating-move", "Player sees his line and why his rating moved", "Next morning: did we win, what did I get, why did my number change?", { taps: 3, human: 16 }, async (t) => {
    const page = pl.page;
    await page.goto(BASE + "/"); await t.step("home");
    const last = page.getByTestId("card-last-result");
    t.check(await last.count(), "serious", "result missing", "Home has no last-game card after the confirmed game");
    const txt = (await last.innerText().catch(() => "")).replace(/\s+/g, " ");
    t.note(`last result card: ${txt}`);
    t.check(/Rating/.test(txt), "moderate", "rating move not shown", `Last game card does not show the rating change: "${txt}"`);
    await t.tap(last, "game");
    t.check(await page.locator(`[data-testid="row-line-${playerId}"]`).count(), "serious", "own line missing", "The game page does not show the player's own line");
    const ratingLink = page.locator(`a[href="/player/${playerId}"], a[href="/player/${playerId}#why"]`);
    await t.tap(ratingLink.or(page.locator(`[data-testid="row-line-${playerId}"]`)), "player");
    const hist = page.locator('[data-testid^="button-history-"]');
    t.check(await hist.count(), "serious", "why missing", "Player page has no rating history to explain the move");
    if (await hist.count()) await t.tap(hist, "why-open");
  });

  // 8. A sheet that can't be read: recover without a dead end.
  await job(pl, "scan-failed", "A scan fails: recover by hand", "Bad light, the read fails. Get the score in anyway.", { taps: 4, human: 45 }, async (t) => {
    const page = pl.page;
    pl.state.fake = [{ op: "error", message: "The scoresheet reader could not be reached." }];
    await t.tap(page.getByTestId("nav-scan"), "scan");
    await upload(t, page, "fail");
    await t.step("stuck");
    t.check(await page.getByTestId("text-sheet-stuck").count(), "serious", "dead end", "A failed read did not show the recovery screen");
    await t.tap(page.getByTestId("button-enter-by-hand"), "by-hand");
    await t.type(page.getByTestId("input-manual-home-name"), team.name);
    await t.type(page.getByTestId("input-manual-away-name"), SEED.pairs[(pairIdx + 2) % 4].home.name);
    await t.type(page.getByTestId("input-manual-home-score"), "4");
    await t.type(page.getByTestId("input-manual-away-score"), "1");
    await t.type(page.getByTestId("input-manual-home-numbers"), team.roster.slice(0, 8).map((p) => p.number).join(" "));
    await t.type(page.getByTestId("input-manual-away-numbers"), SEED.pairs[(pairIdx + 2) % 4].home.roster.slice(0, 8).map((p) => p.number).join(" "));
    await t.tap(page.getByTestId("button-manual-save"), "by-hand-saved");
    if (await page.getByTestId("text-manual-error").count()) t.note(`manual error: ${await page.getByTestId("text-manual-error").innerText()}`);
    pl.state.fake = null;
    if (await page.getByTestId("button-discard").count()) await page.getByTestId("button-discard").click().catch(() => {});
  });

  // 9. Standings: where do we stand.
  await job(pl, "standings", "Where do we stand?", "Open standings, find my team, open it.", { taps: 2, human: 10 }, async (t) => {
    const page = pl.page;
    await page.goto(BASE + "/"); await settle(page);
    await t.tap(page.getByTestId("nav-leagues"), "standings");
    const mine = page.locator(`[data-testid="link-standings-team-${team.id}"]`);
    t.check(await mine.count(), "serious", "my team missing", `${team.name} is not on the standings screen`);
    await t.tap(mine, "my-team");
  });

  // 10. Look someone up.
  await job(pl, "find-player", "Look up tonight's opponent's top player", "Who is #" + opp.roster[2].number + " on " + opp.name + "?", { taps: 3, human: 16 }, async (t) => {
    const page = pl.page;
    await t.tap(page.getByTestId("nav-players"), "players");
    if (await page.getByTestId("button-player-search").count()) await t.tap(page.getByTestId("button-player-search"));
    const [first, last] = opp.roster[2].name.split(" ");
    await t.type(page.getByTestId("input-player-search"), last);
    await settle(page); await t.step("search-surname");
    if (!(await page.locator('[data-testid^="row-player-"]').count())) {
      const empty = (await page.locator("main").innerText()).replace(/\s+/g, " ");
      t.check(false, "moderate", "surname search finds nothing", `Searching "${last}" (a rostered player) finds no one; screen says "${empty.slice(empty.indexOf("No "), empty.indexOf("No ") + 40)}"`);
      await t.type(page.getByTestId("input-player-search"), first);
      await settle(page); await t.step("search-first-name");
    }
    await t.tap(page.locator('[data-testid^="row-player-"]'), "player");
  });

  // 11. Settings: appearance, availability, notifications.
  await job(pl, "settings", "Change appearance, availability and notifications", "Find settings without hunting; light mode; I'm injured for two weeks; check notifications.", { taps: 5, human: 30 }, async (t) => {
    const page = pl.page;
    await t.tap(page.getByTestId("nav-me"), "me");
    await t.tap(page.getByTestId("link-settings"), "settings");
    await t.tap(page.getByTestId("button-theme-light"), "light");
    const statuses = page.locator('[data-testid^="button-status-"]');
    if (await statuses.count() > 1) await t.tap(statuses.nth(1), "status");
    const until = new Date(Date.now() + 14 * 86400000).toLocaleDateString("en-CA");
    if (await page.getByTestId("input-status-until").count()) { await t.type(page.getByTestId("input-status-until"), until); await page.getByTestId("input-status-until").blur(); }
    if (await page.getByTestId("button-notification-settings").count()) await t.tap(page.getByTestId("button-notification-settings"), "notifications");
    else t.check(false, "moderate", "notifications hard to find", "No notification settings on the Settings page");
    await page.goto(BASE + "/"); await t.step("home-light");
    await page.goto(BASE + "/settings"); await settle(page);
    await page.getByTestId("button-theme-auto").click().catch(() => {});
    if (await statuses.count()) await statuses.nth(0).click().catch(() => {});
  });

  // 12. Sign out and back in.
  await job(pl, "sign-out-in", "Sign out, then back in", "Hand the phone to my kid; come back later.", { taps: 6, human: 45 }, async (t) => {
    const page = pl.page;
    await page.goto(BASE + "/settings"); await settle(page);
    await t.tap(page.getByTestId("button-sign-out"), "signed-out");
    t.check(!(await page.locator(`[data-testid="card-my-team-${team.id}"]`).count()), "blocker", "still signed in", "Team still showing after sign out");
    await t.tap(page.getByTestId("nav-me"), "join");
    await emailCode(t, page, plEmail);
    await page.waitForURL(/\/me$/, { timeout: 20000 });
    await t.step("back-in");
    t.check(await page.locator(`[data-testid="card-my-team-${team.id}"]`).count(), "serious", "lost team on sign in", "After signing back in the team is gone");
  });

  // 13. Bigger text: the app at 200 percent.
  await job(pl, "text-200", "Read it with text at 200 percent", "Larger text from the phone's settings; nothing should be cut off or slide sideways.", {}, async (t) => {
    const page = pl.page;
    pl.state.zoom = true;
    for (const path of ["/", "/me", "/leagues", `/team/${team.id}`, "/settings", `/game/${(await db`SELECT game_id FROM sheets WHERE id=${sheetId}`)[0]?.game_id ?? ""}`]) {
      await page.goto(BASE + path); await settle(page);
      await page.addStyleTag({ content: "html{font-size:200% !important;-webkit-text-size-adjust:200% !important}" });
      await t.step(`zoom${path.replace(/\W+/g, "-")}`);
    }
    pl.state.zoom = false;
  });

  // 14. A teammate opens a shared game link without an account.
  const mate = await person(browser, engine, "teammate");
  await job(mate, "shared-game-link", "Teammate opens the shared game link, not signed in", "The captain posts last night's game in the group chat. Does it open?", { taps: 1, human: 10 }, async (t) => {
    const page = mate.page;
    const [g] = await db`SELECT game_id FROM sheets WHERE id=${sheetId}`;
    await page.goto(`${BASE}/game/${g?.game_id}`); await t.step("game-link");
    const txt = (await page.locator("main").innerText().catch(() => "")).replace(/\s+/g, " ");
    t.check(await page.getByTestId("text-final-score").count(), "serious", "shared link shows nothing", `A shared game link opened signed out shows: "${txt.slice(0, 120)}"`);
    t.check(/sign in|join/i.test(txt) || (await page.locator('a[href="/join"]').count()), "moderate", "no way in", "Signed-out game page gives no path to sign in");
  });
  await mate.ctx.close();

  // 15. Leaving: delete the account.
  const gone = await person(browser, engine, "leaver");
  await job(gone, "leaver-signup", "Leaver signs up (setup for the delete job)", "Setup only.", {}, async (t) => {
    const page = gone.page;
    await page.goto(BASE + "/join"); await t.step("join");
    await emailCode(t, page, `leaver.${engine}@example.com`);
    await profile(t, page, "Dana Leaving", "44", "D");
  });
  await job(gone, "delete-account", "Delete my account", "I'm done with it; take my name off.", { taps: 3, human: 15 }, async (t) => {
    const page = gone.page;
    await page.goto(BASE + "/me"); await t.step("me");
    await t.tap(page.getByTestId("link-settings"), "settings");
    await t.tap(page.getByTestId("button-delete-account"), "deleted");
    const r = await page.evaluate(async () => (await fetch("/api/me", { headers: { authorization: "Bearer " + (JSON.parse(localStorage.getItem(Object.keys(localStorage).find((k) => k === "lateice.auth" || /-auth-token$/.test(k)) || "null") || "{}").access_token || "") } })).status);
    t.check(r === 401 || r === 403 || r === 404, "blocker", "account not deleted", `After delete, /api/me answers ${r}`);
    const [u] = await db`SELECT id FROM users WHERE email=${`leaver.${engine}@example.com`}`;
    t.check(!u, "serious", "account row kept", "The users row still exists after delete");
  });
  await gone.ctx.close();
  await cap.ctx.close(); await pl.ctx.close();
}

// ---------------------------------------------------------------- run

let crashed = null;
try {
  for (const [i, engine] of ENGINES.entries()) {
    const browser = await (engine === "webkit" ? webkit : chromium).launch();
    try { await week(browser, engine, i); } finally { await browser.close(); }
  }
} catch (e) { crashed = e; console.error(e); }
finally { srv.kill("SIGTERM"); await db.end().catch(() => {}); }

// ---------------------------------------------------------------- report

findings.sort((a, b) => SEV.indexOf(a.severity) - SEV.indexOf(b.severity) || a.kind.localeCompare(b.kind));
const L = [];
const n = (s) => findings.filter((f) => f.severity === s).length;
L.push(`# Late Ice UX walkthrough`, ``, `Seeded C league season at Polar Ice; tonight's games at ${SEED.tonight.localTime} ET. Phone 390x844, America/New_York. Engines: ${ENGINES.join(", ")} (Chromium player runs throttled to 4G with 4x CPU). ${shotN} screens.`, ``);
L.push(`Estimated human time = taps x ${KLM.tap}s + typed characters x ${KLM.char}s + screens x ${KLM.screen}s + email code trips x ${KLM.email}s.`, ``);
L.push(`**Findings:** ${SEV.map((s) => `${n(s)} ${s}`).join(", ")}`, ``);
L.push(`## Jobs`, ``, `| Engine | Who | Job | Done | Taps (pass) | Typed | Screens | Est. human s (pass) | Machine s | Pass |`, `|---|---|---|---|---|---|---|---|---|---|`);
for (const j of jobs) L.push(`| ${j.engine}${j.throttled ? " 4G" : ""} | ${j.who} | ${j.name} | ${j.ok ? "yes" : `**no** (${j.blockedAt})`} | ${j.taps} (${j.target.taps ?? "-"}) | ${j.chars} | ${j.screens} | ${j.human} (${j.target.human ?? "-"}) | ${(j.ms / 1000).toFixed(1)} | ${j.pass ? "yes" : "**no**"} |`);
L.push(``, `## Notes per job`, ``);
for (const j of jobs) if (j.notes.length) L.push(`- **${j.engine} / ${j.id}:** ${j.notes.join("; ")}`);
L.push(``);
for (const s of SEV) {
  const fs = findings.filter((f) => f.severity === s); if (!fs.length) continue;
  L.push(`## ${s[0].toUpperCase() + s.slice(1)} (${fs.length})`, ``);
  for (const f of fs) L.push(`- **${f.kind}** [${f.engine}, ${f.job} / ${f.step}] ${f.detail}${f.shot ? ` (${f.shot})` : ""}`);
  L.push(``);
}
L.push(`## Screens`, ``, `| Shot | Path | Height (screens) | First screen |`, `|---|---|---|---|`);
for (const j of jobs) for (const st of j.steps) L.push(`| ${st.shot} | ${st.path} | ${st.screens} | ${st.above.join(" ").replace(/\|/g, "/").slice(0, 300)} |`);
writeFileSync("audit/walk.md", L.join("\n") + "\n");
writeFileSync("audit/walk.json", JSON.stringify({ seed: SEED, jobs, findings }, null, 2));
console.log(L.slice(0, 60).join("\n"));
if (crashed) process.exitCode = 1;
