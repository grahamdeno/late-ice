// UX audit: walks real jobs as real people in phone-sized Chromium and WebKit (Safari's engine),
// measuring every step. Writes audit/report.md, audit/report.json and audit/shots/*.png.
// It never fails CI on findings; it reports them. Only a crash of the harness itself exits non-zero.
import { spawn } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { chromium, webkit } from "playwright";
import { latestCode, lastMailId } from "./mail.mjs";

const require = createRequire(import.meta.url);
const AXE = readFileSync(require.resolve("axe-core/axe.min.js"), "utf8");
const PORT = 3097, BASE = `http://localhost:${PORT}`;
const PHONE = { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, hasTouch: true, isMobile: true };
const ENGINES = (process.env.AUDIT_ENGINES || "chromium,webkit").split(",");
mkdirSync("audit/shots", { recursive: true });

const srv = spawn("npx", ["next", "start", "-p", String(PORT)], { env: { ...process.env, NODE_ENV: "production", BOOTSTRAP_ADMIN_EMAIL: "graham@example.com" }, stdio: "inherit" });
for (let i = 0; i < 300; i++) { try { if ((await fetch(`${BASE}/api/bootstrap`)).ok) break; } catch {} await new Promise((r) => setTimeout(r, 200)); }

const findings = [];   // { severity, kind, engine, journey, step, detail, shot }
const journeys = [];   // { engine, persona, name, goal, ok, taps, ms, steps: [] }
const seen = new Set();
let shotN = 0;
const SEV = ["blocker", "serious", "moderate", "minor"];

function find(severity, kind, ctx, detail, dedupeKey) {
  const key = `${kind}|${dedupeKey ?? detail}`;
  if (seen.has(key)) return;
  seen.add(key);
  findings.push({ severity, kind, engine: ctx.engine, journey: ctx.journey, step: ctx.step, detail, shot: ctx.shot });
}

/** Records layout shift from the first paint. */
const INIT = `window.__cls=0;try{new PerformanceObserver(l=>{for(const e of l.getEntries()){if(!e.hadRecentInput)window.__cls+=e.value}}).observe({type:'layout-shift',buffered:true})}catch{}`;

async function newPerson(browser, engine, persona, opts = {}) {
  const ctx = await browser.newContext({ ...PHONE, ...opts });
  await ctx.addInitScript(INIT);
  const page = await ctx.newPage();
  const state = { engine, persona, journey: "", step: "", shot: "" };
  page.on("pageerror", (e) => find("blocker", "page crash", state, `${e.message}`.slice(0, 240)));
  page.on("console", (m) => {
    if (m.type() !== "error") return;
    const t = m.text();
    if (/fonts|favicon|Failed to load resource|webauthn|passkey|NotAllowedError|AbortError/i.test(t)) return;
    find("moderate", "console error", state, t.slice(0, 240));
  });
  page.on("response", (r) => {
    const u = r.url();
    if (!u.startsWith(BASE)) return;
    const s = r.status();
    if (s >= 500) find("blocker", "server error", state, `${s} ${r.request().method()} ${u.replace(BASE, "")}`, `${s} ${u.replace(BASE, "").replace(/\d+/g, "N")}`);
    const path = u.replace(BASE, "");
    // A refused request the person didn't cause is usually why a screen sits empty.
    if (s >= 400 && s < 500 && path.startsWith("/api/") && !/99999999/.test(path) && !(s === 401 && /^\/api\/(me|notifications|push)/.test(path)))
      find("serious", "request refused", state, `${s} ${r.request().method()} ${path}`, `${s} ${path.replace(/\d+/g, "N")}`);
  });
  page.on("dialog", async (d) => {
    find("minor", "native dialog", state, `Uses the browser's ${d.type()} box: "${d.message().slice(0, 100)}". Feels like a web page, not an app.`, d.message().slice(0, 40));
    await d.accept().catch(() => {});
  });
  return { ctx, page, state };
}

/** One journey: a person trying to get one job done. */
async function journey(p, name, goal, fn) {
  const j = { engine: p.state.engine, persona: p.state.persona, name, goal, ok: true, taps: 0, ms: 0, steps: [], blockedAt: null };
  journeys.push(j);
  p.state.journey = name;
  const t0 = Date.now();
  const t = {
    tap: async (loc) => {
      j.taps++;
      await loc.first().click({ timeout: 8000 });
      await settle(p.page);
    },
    step: (label) => measure(p, j, label),
    expect: (cond, severity, kind, detail) => { if (!cond) find(severity, kind, p.state, detail); return cond; },
  };
  try { await fn(t); }
  catch (e) {
    j.ok = false; j.blockedAt = p.state.step;
    await measure(p, j, `blocked-${p.state.step || "start"}`).catch(() => {});
    find("blocker", "journey blocked", p.state, `${name}: stopped at "${p.state.step}": ${String(e.message).split("\n")[0].slice(0, 200)}`);
  }
  j.ms = Date.now() - t0;
}

async function settle(page) {
  await page.waitForLoadState("networkidle", { timeout: 4000 }).catch(() => {});
  await page.waitForTimeout(350);
}

/** Everything we check on one screen. */
async function measure(p, j, label) {
  const { page, state } = p;
  state.step = label;
  await settle(page);
  const file = `${String(++shotN).padStart(3, "0")}-${state.engine}-${state.persona}-${label}.png`.replace(/[^a-z0-9.-]+/gi, "-");
  state.shot = file;
  await page.screenshot({ path: `audit/shots/${file}`, fullPage: true }).catch(() => {});
  const m = await page.evaluate(() => {
    const vis = (el) => { const r = el.getBoundingClientRect(); const s = getComputedStyle(el); return r.width > 0 && r.height > 0 && s.visibility !== "hidden" && s.display !== "none" && Number(s.opacity) > 0.05; };
    const desc = (el) => { const id = el.getAttribute("data-testid"); const txt = (el.getAttribute("aria-label") || el.textContent || el.getAttribute("placeholder") || "").trim().replace(/\s+/g, " ").slice(0, 40); return `${el.tagName.toLowerCase()}${id ? `[${id}]` : ""} "${txt}"`; };
    // Tap targets. Links inside running text are exempt, as WCAG allows.
    const small = [], tiny = [];
    for (const el of document.querySelectorAll('a[href],button,input:not([type=hidden]),select,textarea,[role=button],[role=tab],[role=switch]')) {
      if (!vis(el)) continue;
      if (el.tagName === "A" && getComputedStyle(el).display === "inline" && el.parentElement && /^(P|SPAN|LI)$/.test(el.parentElement.tagName)) continue;
      const r = el.getBoundingClientRect();
      const side = Math.min(r.width, r.height);
      if (side < 24) tiny.push(`${desc(el)} ${Math.round(r.width)}x${Math.round(r.height)}`);
      else if (side < 40) small.push(`${desc(el)} ${Math.round(r.width)}x${Math.round(r.height)}`);
    }
    // Text under 12px.
    const tinyText = [];
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    for (let n = walker.nextNode(); n; n = walker.nextNode()) {
      const s = n.textContent.trim(); if (s.length < 2 || !n.parentElement || !vis(n.parentElement)) continue;
      const fs = parseFloat(getComputedStyle(n.parentElement).fontSize);
      if (fs < 12) tinyText.push(`${fs}px "${s.slice(0, 40)}"`);
    }
    // Sideways overflow.
    const W = document.documentElement.clientWidth;
    const wide = document.documentElement.scrollWidth > W + 1;
    const h1 = [...document.querySelectorAll("h1")].filter(vis).map((h) => h.textContent.trim().slice(0, 50));
    return { tiny, small, tinyText: [...new Set(tinyText)], wide, W, h1, cls: window.__cls || 0, title: document.title, path: location.pathname };
  });
  let axe = [];
  try {
    await page.addScriptTag({ content: AXE });
    axe = await page.evaluate(async () => {
      const r = await window.axe.run(document, { runOnly: { type: "tag", values: ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"] }, resultTypes: ["violations"] });
      return r.violations.map((v) => ({ id: v.id, impact: v.impact, help: v.help, nodes: v.nodes.slice(0, 3).map((n) => n.target.join(" ")) , count: v.nodes.length }));
    });
  } catch { /* axe could not run on this screen */ }
  const ctx = state;
  for (const x of m.tiny) find("serious", "tap target under 24px", ctx, `${m.path}: ${x}`, x.replace(/\d+x\d+$/, ""));
  for (const x of m.small) find("moderate", "tap target under 40px", ctx, `${m.path}: ${x}`, x.replace(/\d+x\d+$/, ""));
  if (m.tinyText.length) find("moderate", "text under 12px", ctx, `${m.path}: ${m.tinyText.length} runs, e.g. ${m.tinyText.slice(0, 4).join("; ")}`, `${m.path.replace(/\d+/g, "N")}`);
  if (m.wide) find("serious", "page slides sideways", ctx, `${m.path} is wider than ${m.W}px`, m.path.replace(/\d+/g, "N"));
  if (m.cls > 0.1) find("moderate", "layout shift", ctx, `${m.path}: cumulative shift ${m.cls.toFixed(2)} (over 0.1 feels jumpy)`, m.path.replace(/\d+/g, "N"));
  if (m.h1.length !== 1 && !m.path.startsWith("/desk")) find("minor", "heading structure", ctx, `${m.path}: ${m.h1.length} top headings ${JSON.stringify(m.h1)}`, m.path.replace(/\d+/g, "N"));
  for (const v of axe) {
    const sev = v.impact === "critical" || v.impact === "serious" ? "serious" : "moderate";
    find(sev, `a11y: ${v.id}`, ctx, `${m.path}: ${v.help} (${v.count}x) e.g. ${v.nodes.join(" | ")}`, `${v.id}|${m.path.replace(/\d+/g, "N")}`);
  }
  j.steps.push({ label, path: m.path, shot: file, cls: Number(m.cls.toFixed(3)), axe: axe.length, tiny: m.tiny.length, small: m.small.length });
}

async function join(t, page, email, name, number, pos) {
  await page.goto(`${BASE}/join`);
  await t.step("join-email");
  await page.getByTestId("input-email").fill(email);
  const before = await lastMailId(email);
  await t.tap(page.getByTestId("button-send-code"));
  await page.getByTestId("input-code").waitFor();
  await t.step("join-code");
  const { code } = await latestCode(email, before);
  await page.getByTestId("input-code").fill(code);
  await t.tap(page.getByTestId("button-verify"));
  await page.getByTestId("input-name").waitFor();
  await t.step("join-profile");
  await page.getByTestId("input-name").fill(name);
  await page.getByTestId("input-number").fill(number);
  await t.tap(page.getByTestId(`button-position-${pos}`));
  await page.getByTestId("input-age").check();
  await t.tap(page.getByTestId("button-save-profile"));
  await page.waitForURL(/\/me$/, { timeout: 10000 });
}

async function api(page, method, url, body) {
  return page.evaluate(async ([method, url, body]) => {
    const k = Object.keys(localStorage).find((x) => x === "lateice.auth" || (x.startsWith("sb-") && x.endsWith("-auth-token")));
    const tok = k ? JSON.parse(localStorage.getItem(k)).access_token : "";
    const r = await fetch(url, { method, headers: { "content-type": "application/json", authorization: `Bearer ${tok}` }, body: body ? JSON.stringify(body) : undefined });
    return { status: r.status, json: await r.json().catch(() => null) };
  }, [method, url, body]);
}

const FIXTURE = [
  "RAW REPORT - Test (DaySmart name: 'Hammered Heads'), C League, Adult Hockey Fall 2026, Polar Ice Wilmington",
  "",
  "GAME 2026-09-06 9:00 PM | Home: Hammered Heads 3 | Away: Blue Liners 1 | Final | OT/shootout: not shown",
  "PLAYERROW Hammered Heads | Adam Y. G2 A1",
  "PLAYERROW Opponent | Zed Q. G1",
  "",
  "ROSTERS (number/position not shown on page)",
  "Hammered Heads", "  Adam Y.", "Blue Liners", "  Zed Q.",
].join("\n");

const firstHref = async (page, prefix) => page.$$eval(`a[href^="${prefix}"]`, (as) => as.map((a) => a.getAttribute("href")).find((h) => /\d/.test(h)) || null);

// ---------------------------------------------------------------- journeys

async function visitor(browser, engine) {
  const p = await newPerson(browser, engine, "visitor");
  const { page } = p;
  await journey(p, "Visitor browses standings, a team, a player and a game", "A friend sent a link. Can they see how the league stands without an account?", async (t) => {
    await page.goto(BASE); await t.step("home");
    t.expect(await page.getByTestId("link-home-join").count(), "moderate", "no clear next step", "Signed-out home has no join prompt");
    await t.tap(page.getByRole("link", { name: /standings/i }).or(page.locator('nav a[href="/leagues"]')), "Standings tab");
    await t.step("standings");
    const team = await firstHref(page, "/team/");
    t.expect(team, "serious", "dead end", "Standings show no team links");
    if (team) { await t.tap(page.locator(`a[href="${team}"]`)); await t.step("team"); }
    const player = await firstHref(page, "/player/");
    if (player) { await t.tap(page.locator(`a[href="${player}"]`)); await t.step("player"); }
    if (await page.getByTestId("link-career").count()) { await t.tap(page.getByTestId("link-career")); await t.step("career"); }
    await page.goto(BASE + "/"); await settle(page);
    const game = await firstHref(page, "/game/") || (team && (await page.goto(BASE + team), await firstHref(page, "/game/")));
    if (game) { await page.goto(BASE + game); await t.step("game-shared-link"); }
    const res = await fetch(`${BASE}/api/cards/game/${String(game || "").split("/").pop()}`).catch(() => null);
    if (game) t.expect(res && res.ok && /png/.test(res.headers.get("content-type") || ""), "serious", "share card broken", `Game card for ${game} did not return an image`);
  });
  await journey(p, "Visitor hits a missing page", "A stale link should still leave them somewhere useful.", async (t) => {
    for (const path of ["/team/99999999", "/player/99999999", "/game/99999999", "/nope"]) {
      await page.goto(BASE + path); await t.step(`missing${path.replace(/\W+/g, "-")}`);
      const txt = (await page.locator("main").innerText().catch(() => "")).trim();
      t.expect(txt.length > 10, "serious", "blank error page", `${path} shows an empty page`);
      t.expect(await page.locator("main a[href]").count(), "moderate", "dead end", `${path} offers no way back`);
    }
  });
  await p.ctx.close();
}

async function newPlayer(browser, engine) {
  const p = await newPerson(browser, engine, "new-player");
  const { page } = p;
  const email = `newbie.${engine}@example.com`;
  await journey(p, "New player joins and finds their rating", "From an invite or a friend: sign up, claim my spot, see my rating.", async (t) => {
    await join(t, page, email, `Alex ${engine === "webkit" ? "Safari" : "Chrome"}`, "17", "W");
    await t.step("me-first-visit");
    const offer = await page.getByTestId("card-passkey-offer").count();
    t.expect(offer, "minor", "passkey offer missing", "After the email code, the Face ID offer did not appear (browser may not support passkeys)");
    if (offer) { await t.tap(page.getByTestId("button-offer-passkey-later")); }
    const claim = page.locator('[data-testid^="button-claim-"]');
    if (await claim.count()) { await t.tap(claim); await t.step("me-claimed"); }
    await t.tap(page.locator('nav a[href="/players"]')); await t.step("players");
    await page.goto(BASE + "/me"); await settle(page);
    await t.tap(page.getByTestId("link-settings")); await t.step("settings");
  });
  await journey(p, "New player opens a game and the stars", "After a game: did I get a star, can I share it?", async (t) => {
    await page.goto(BASE + "/"); await settle(page);
    const game = await firstHref(page, "/game/");
    if (!game) { t.expect(false, "moderate", "no recent games", "Home shows no game to open"); return; }
    await t.tap(page.locator(`a[href="${game}"]`)); await t.step("game");
    t.expect(await page.getByTestId("section-stars").count(), "moderate", "stars missing", `${game} shows no three stars section`);
  });
  await p.ctx.close();
}

async function captain(browser, engine) {
  const p = await newPerson(browser, engine, "captain");
  const { page } = p;
  let teamId = null;
  await journey(p, "Captain takes over a team and adds a player", "Claim my team, become captain, add a newcomer by hand.", async (t) => {
    await join(t, page, "graham@example.com", "Graham DeNoyer", "12", "C");
    await t.step("me");
    await t.tap(page.locator('[data-testid^="button-claim-"]'));
    await t.tap(page.locator('[data-testid^="button-become-captain-"]'));
    await t.step("me-captain");
    await t.tap(page.locator('[data-testid^="button-manage-"]'));
    await page.waitForURL(/\/team\/\d+\/manage$/);
    teamId = page.url().split("/")[4];
    await t.step("manage");
    await t.tap(page.getByTestId("button-more-add-player"));
    await page.getByTestId("input-spot-name").fill("Pat Newguy");
    await t.tap(page.getByTestId("button-spot-position-D"));
    await t.tap(page.getByTestId("button-add-spot"));
    await t.step("manage-added");
    t.expect(await page.getByTestId("text-spot-added").count(), "serious", "no confirmation", "Adding a player showed no confirmation");
  });
  await journey(p, "Captain schedules next game and sets tonight's details", "Put Thursday's game on the schedule and tell the team the sheet and locker room.", async (t) => {
    await page.goto(`${BASE}/team/${teamId}`); await t.step("team");
    await t.tap(page.getByTestId("button-add-game"));
    await t.step("add-game-form");
    const d = new Date(Date.now() + 2 * 86400000).toISOString().slice(0, 10);
    await page.getByTestId("input-game-date").fill(d);
    await page.getByTestId("input-game-time").fill("21:15");
    if (await page.getByTestId("input-game-opponent-name").count()) await page.getByTestId("input-game-opponent-name").fill("Raleigh Rebels");
    else await page.getByTestId("select-game-opponent").selectOption({ index: 1 });
    await t.tap(page.getByTestId("button-save-game"));
    await t.step("game-added");
    t.expect(!(await page.getByTestId("text-schedule-error").count()), "serious", "save failed", "Saving the game showed an error");
    await page.goto(BASE + "/"); await t.step("home-next-game");
    t.expect(await page.getByTestId("card-next-game").count(), "serious", "next game missing", "Home did not show the game just scheduled");
    const details = page.getByTestId("link-home-details");
    if (await details.count()) {
      await t.tap(details); await t.step("details-editor");
      const panel = page.locator('[data-testid^="panel-details-"]');
      t.expect(await panel.count(), "serious", "promise not kept", "Set sheet & room did not open the details form");
      if (await panel.count()) {
        await page.locator('[data-testid^="input-sheet-"]').first().fill("2");
        await page.locator('[data-testid^="input-room-"]').first().fill("4");
        const save = panel.getByRole("button", { name: /save/i });
        if (await save.count()) { await t.tap(save); await t.step("details-saved"); }
      }
    }
    else find("moderate", "hard to find", p.state, "From Home there is no visible way to set tonight's sheet, jersey or locker room");
  });
  await journey(p, "Captain fixes a missing goalie", "Home says no goalie. Can I get one from here?", async (t) => {
    await page.goto(BASE + "/"); await settle(page);
    const link = page.getByRole("link", { name: /goalie sub/i });
    if (!(await link.count())) { await t.step("home-no-goalie-prompt"); return; }
    await t.tap(link); await t.step("after-find-goalie");
    await page.waitForTimeout(800);
    const panel = page.locator('[data-testid^="panel-subs-"]');
    t.expect(await panel.count() && await panel.first().isVisible(), "serious", "promise not kept",
      `"Find a goalie sub" lands on ${new URL(page.url()).pathname}${new URL(page.url()).hash} with no goalie or sub action in view`);
  });
  await journey(p, "Captain sets a lineup", "Build lines for Thursday and share them.", async (t) => {
    await page.goto(`${BASE}/team/${teamId}`); await settle(page);
    const lu = page.locator('[data-testid^="link-lineup-"]');
    if (!(await lu.count())) { t.expect(false, "serious", "dead end", "No way to the lineup from the team page with a game scheduled"); return; }
    await t.tap(lu); await t.step("lineup");
    await t.tap(page.locator('[data-testid="slot-f0-0"]')); await t.step("lineup-pick");
    const pick = page.locator('[data-testid^="button-pick-"]');
    if (await pick.count()) await t.tap(pick);
    await t.tap(page.getByTestId("button-save-lineup")); await t.step("lineup-saved");
  });
  await journey(p, "Captain scouts tonight's opponent", "What do I need to know about the other team?", async (t) => {
    await page.goto(BASE + "/"); await settle(page);
    const scout = page.getByTestId("button-scout").or(page.getByRole("link", { name: /scout/i }));
    if (!(await scout.count())) { t.expect(false, "minor", "hard to find", "No scouting entry on Home"); return; }
    await t.tap(scout); await t.step("scout");
  });
  await journey(p, "Scorekeeper opens the scanner", "Just played: snap the sheet.", async (t) => {
    await t.tap(page.getByTestId("nav-scan")); await t.step("scan");
    t.expect(await page.getByTestId("button-take-photo").count(), "serious", "scan unclear", "Scan page has no Take photo button");
  });
  return { p, teamId };
}

async function rinkManager(p) {
  const { page } = p;
  await page.setViewportSize({ width: 1440, height: 900 });
  await journey(p, "Rink manager turns on three-stars voting", "Turn voting on for one league from the desk.", async (t) => {
    const boot = await api(page, "GET", "/api/bootstrap");
    await api(page, "POST", "/api/staff/import", { text: FIXTURE, rinkId: boot.json.rink.id, apply: true });
    await page.goto(BASE + "/desk"); await t.step("desk-home");
    await t.tap(page.locator('a[href="/desk/season"]')); await t.step("desk-season");
    const toggle = page.locator('[data-testid^="toggle-star-voting-"]');
    if (!(await toggle.count())) { t.expect(false, "serious", "missing control", "No three-stars voting switch on desk Season"); return; }
    await t.tap(toggle); await t.step("desk-voting-on");
    t.expect(await toggle.first().isChecked(), "serious", "switch did not stick", "Voting switch did not stay on");
    await t.tap(toggle);
  });
  await page.setViewportSize(PHONE.viewport);
}

async function resilience(browser) {
  const p = await newPerson(browser, "chromium", "conditions");
  const { page, ctx } = p;
  await journey(p, "Slow phone connection", "Rink Wi-Fi is bad. Does Home still feel usable?", async (t) => {
    const cdp = await ctx.newCDPSession(page);
    await cdp.send("Network.enable");
    await cdp.send("Network.emulateNetworkConditions", { offline: false, latency: 400, downloadThroughput: 400 * 1024 / 8, uploadThroughput: 200 * 1024 / 8 });
    const t0 = Date.now();
    await page.goto(BASE + "/", { waitUntil: "domcontentloaded" });
    await page.getByTestId("text-home-title").or(page.locator("main h1")).first().waitFor({ timeout: 20000 });
    const ms = Date.now() - t0;
    await t.step("home-slow-3g");
    t.expect(ms < 6000, "moderate", "slow on weak signal", `Home took ${(ms / 1000).toFixed(1)}s to show its heading on a slow connection`);
    await cdp.send("Network.emulateNetworkConditions", { offline: false, latency: 0, downloadThroughput: -1, uploadThroughput: -1 });
  });
  await journey(p, "Signal drops mid-use", "Lose signal in the locker room, tap Standings.", async (t) => {
    await page.goto(BASE + "/"); await settle(page);
    await ctx.setOffline(true);
    await page.locator('nav a[href="/leagues"]').click().catch(() => {});
    await page.waitForTimeout(2500);
    await t.step("offline-standings");
    const txt = await page.locator("main").innerText().catch(() => "");
    t.expect(/offline|connection|signal|try again|internet/i.test(txt) || txt.trim().length > 40, "moderate", "silent failure offline", "Offline, Standings shows neither content nor a message about the connection");
    await ctx.setOffline(false);
  });
  await journey(p, "Small phone, light mode, reduced motion", "iPhone SE in daylight with motion turned down.", async (t) => {
    await page.setViewportSize({ width: 320, height: 640 });
    await page.emulateMedia({ colorScheme: "light", reducedMotion: "reduce" });
    for (const path of ["/", "/leagues", "/players", "/join"]) { await page.goto(BASE + path); await t.step(`se-light${path.replace(/\W+/g, "-") || "-home"}`); }
    await page.goto(BASE + "/");
    await page.getByTestId("button-league-switcher").click();
    await t.step("se-light-league-sheet");
  });
  await ctx.close();
}

// ---------------------------------------------------------------- run

let crashed = null;
try {
  for (const engine of ENGINES) {
    const browser = await (engine === "webkit" ? webkit : chromium).launch();
    try {
      await visitor(browser, engine);
      await newPlayer(browser, engine);
      if (engine === "chromium") {
        const { p } = await captain(browser, engine);
        await rinkManager(p);
        await p.ctx.close();
        await resilience(browser);
      }
    } finally { await browser.close(); }
  }
} catch (e) { crashed = e; console.error(e); }
finally { srv.kill(); }

// ---------------------------------------------------------------- report

findings.sort((a, b) => SEV.indexOf(a.severity) - SEV.indexOf(b.severity) || a.kind.localeCompare(b.kind));
const count = (s) => findings.filter((f) => f.severity === s).length;
const lines = [];
lines.push(`# Late Ice UX audit`, ``, `Engines: ${ENGINES.join(", ")}. Phone 390x844 unless noted. ${shotN} screens captured.`, ``);
lines.push(`**Findings:** ${SEV.map((s) => `${count(s)} ${s}`).join(", ")}`, ``);
lines.push(`## Journeys`, ``, `| Engine | Person | Job | Done | Taps | Time |`, `|---|---|---|---|---|---|`);
for (const j of journeys) lines.push(`| ${j.engine} | ${j.persona} | ${j.name} | ${j.ok ? "yes" : `**no** (at ${j.blockedAt})`} | ${j.taps} | ${(j.ms / 1000).toFixed(1)}s |`);
lines.push(``);
for (const s of SEV) {
  const fs = findings.filter((f) => f.severity === s);
  if (!fs.length) continue;
  lines.push(`## ${s[0].toUpperCase() + s.slice(1)} (${fs.length})`, ``);
  for (const f of fs) lines.push(`- **${f.kind}** [${f.engine}, ${f.journey} / ${f.step}] ${f.detail}${f.shot ? ` (shot ${f.shot})` : ""}`);
  lines.push(``);
}
writeFileSync("audit/report.md", lines.join("\n"));
writeFileSync("audit/report.json", JSON.stringify({ journeys, findings }, null, 2));
console.log(lines.slice(0, 40).join("\n"));
if (crashed) process.exitCode = 1;
