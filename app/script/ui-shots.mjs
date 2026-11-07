// Drives the built app in a phone-sized browser through join, claim, captain and draft,
// saving screenshots to shots/. CI publishes them for review.
// Sign-in codes are read from the local mail catcher.
import { spawn } from "node:child_process";
import { mkdirSync } from "node:fs";
import { chromium } from "playwright";
import { latestCode, lastMailId } from "./mail.mjs";

const PORT = 3098, BASE = `http://localhost:${PORT}`;
mkdirSync("shots", { recursive: true });
const srv = spawn("npx", ["next", "start", "-p", String(PORT)], { env: { ...process.env, NODE_ENV: "production", BOOTSTRAP_ADMIN_EMAIL: "graham@example.com" }, stdio: "inherit" });
for (let i = 0; i < 200; i++) { try { if ((await fetch(`${BASE}/api/bootstrap`)).ok) break; } catch {} await new Promise((r) => setTimeout(r, 200)); }

const browser = await chromium.launch();
const errors = [];
let n = 0;
async function shoot(page, name) { await page.waitForTimeout(600); await widthCheck(page, name); await page.screenshot({ path: `shots/${String(++n).padStart(2, "0")}-${name}.png`, fullPage: true }); }

// Nothing may stick out past the screen edge: on a phone that makes the whole page slide sideways.
// Boxes that scroll or clip on their own (the scoresheet photo, truncated names) are fine.
const widthSeen = new Set();
async function widthCheck(page, label) {
  await page.waitForTimeout(450);
  const res = await page.evaluate(() => {
    const W = document.documentElement.clientWidth;
    const contained = (el) => {
      for (let p = el.parentElement; p && p !== document.body && p !== document.documentElement; p = p.parentElement) {
        if (getComputedStyle(p).overflowX !== "visible") return true;
      }
      return false;
    };
    const hits = [];
    for (const el of document.body.querySelectorAll("*")) {
      const r = el.getBoundingClientRect();
      if (!r.width || !r.height) continue;
      if (r.right <= W + 0.5 && r.left >= -0.5) continue;
      if (contained(el)) continue;
      hits.push(el);
    }
    const outer = hits.filter((el) => !hits.includes(el.parentElement));
    return { W, items: outer.slice(0, 6).map((el) => {
      const r = el.getBoundingClientRect();
      const id = el.getAttribute("data-testid");
      const cls = typeof el.className === "string" ? el.className.slice(0, 60) : "";
      return `<${el.tagName.toLowerCase()}${id ? ` testid=${id}` : ""} class="${cls}"> "${(el.textContent || "").trim().slice(0, 32)}" spans ${Math.round(r.left)}..${Math.round(r.right)}`;
    }) };
  });
  for (const it of res.items) {
    const key = `${res.W} ${it}`;
    if (widthSeen.has(key)) continue;
    widthSeen.add(key);
    errors.push(`too wide at ${res.W}px on ${label}: ${it}`);
  }
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
  "GAME 2026-08-23 10:15 PM | Home: Wild Puckers 0 | Away: Hammered Heads 2 | Final | OT/shootout: not shown",
  "PLAYERROW Hammered Heads | Jared A. G1",
  "",
  "ROSTERS (number/position not shown on page)",
  "Hammered Heads",
  "  Adam Y.",
  "  Jared A.",
  "Blue Liners",
  "  Zed Q.",
].join("\n");
function watch(page, who) {
  page.on("pageerror", (e) => errors.push(`${who}: ${e}`));
  page.on("console", (m) => { if (m.type() === "error" && !/fonts|favicon|Failed to load resource/.test(m.text())) errors.push(`${who}: ${m.text()}`); });
}
async function join(page, email, name, number, pos) {
  await page.goto(`${BASE}/join`);
  await page.getByTestId("input-email").fill(email);
  const before = await lastMailId(email);
  await page.getByTestId("button-send-code").click();
  await page.getByTestId("input-code").waitFor();
  const { code } = await latestCode(email, before);
  await page.getByTestId("input-code").fill(code);
  await page.getByTestId("button-verify").click();
  await page.getByTestId("input-name").waitFor();
  await page.getByTestId("input-name").fill(name);
  await page.getByTestId("input-number").fill(number);
  await page.getByTestId(`button-position-${pos}`).click();
  await page.getByTestId("input-age").check();
}

try {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
  const page = await ctx.newPage();
  watch(page, "graham");

  await page.goto(BASE);
  await shoot(page, "home-signed-out");
  await page.goto(`${BASE}/join`);
  await page.getByTestId("input-email").fill("graham@example.com");
  await shoot(page, "join-email");
  // Code step: wrong code shows a clear error; resend is on cooldown.
  const before0 = await lastMailId("graham@example.com");
  await page.getByTestId("button-send-code").click();
  await page.getByTestId("input-code").waitFor();
  await latestCode("graham@example.com", before0);
  await page.getByTestId("input-code").fill("000000");
  await page.getByTestId("button-verify").click();
  await page.getByTestId("text-error").waitFor();
  await shoot(page, "join-code-wrong");
  if (!/doesn't match/.test(await page.getByTestId("text-error").innerText())) errors.push("wrong code should say it doesn't match");
  const t1 = await page.getByTestId("button-resend").innerText();
  await page.waitForTimeout(2500);
  const t2 = await page.getByTestId("button-resend").innerText();
  if (t1 === t2) errors.push(`resend countdown is not ticking (${t1})`);
  if (!(await page.getByTestId("button-resend").isDisabled())) errors.push("resend should be on cooldown");
  // Start over with a fresh page; the server allows a new code after 1 second locally.
  await page.waitForTimeout(1500);
  await join(page, "graham@example.com", "Graham DeNoyer", "12", "C");
  await shoot(page, "join-profile");
  await page.getByTestId("button-save-profile").click();
  await page.waitForURL(/\/me$/);
  await shoot(page, "me-suggestions");
  if (!(await page.locator('[data-testid^="button-claim-"]').count())) errors.push("no claim suggestion shown");
  await page.locator('[data-testid^="button-claim-"]').first().click();
  await page.waitForTimeout(800);
  await page.locator('[data-testid^="button-become-captain-"]').first().click();
  await page.waitForTimeout(800);
  await shoot(page, "me-captain");

  // Second player registers so the pool has someone in it.
  const ctx2 = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const p2 = await ctx2.newPage();
  watch(p2, "sam");
  await join(p2, "sam@example.com", "Sam Okafor", "9", "D");
  await p2.getByTestId("button-save-profile").click();
  await p2.waitForURL(/\/me$/);

  await page.locator('[data-testid^="button-manage-"]').first().click();
  await page.waitForURL(/\/team\/\d+\/manage$/);
  await page.waitForTimeout(1000);
  await shoot(page, "manage-team");
  await page.locator('[data-testid^="button-slot-"]').first().click();
  await shoot(page, "manage-team-row-open");
  await page.getByTestId("button-more-add-player").click();
  await page.getByTestId("input-spot-name").fill("Pat Newguy");
  await page.getByTestId("button-spot-position-D").click();
  await page.getByTestId("button-add-spot").click();
  await page.waitForTimeout(900);
  if (!(await page.getByTestId("text-spot-added").count())) errors.push("adding a player by hand showed no confirmation");
  await shoot(page, "manage-team-added");
  const manageTeamId = await page.evaluate(() => location.pathname.split("/")[2]);
  await page.goto(BASE + `/team/${manageTeamId}`); await page.waitForTimeout(1000);
  if (await page.locator('[data-testid^="link-lineup-"]').count()) {
    await page.locator('[data-testid^="link-lineup-"]').first().click();
    await page.waitForURL(/\/lineup\//); await page.waitForTimeout(1200);
    await shoot(page, "lineup");
    await page.locator('[data-testid="slot-f0-0"]').click();
    await page.waitForTimeout(400);
    await shoot(page, "lineup-pick");
  }
  // The draft pool link lives on the Manage team page, so go back there first.
  await page.goto(BASE + `/team/${manageTeamId}/manage`); await page.waitForTimeout(1000);
  await page.getByTestId("button-more-invites").click();
  await page.getByTestId("link-draft").click();
  await page.waitForURL(/\/pool\//);
  await page.waitForTimeout(1000);
  await shoot(page, "pool");
  await page.locator('[data-testid^="row-pool-"]').first().click();
  await shoot(page, "pool-pick");
  await page.getByTestId("button-confirm-pick").click();
  await page.waitForURL(/\/team\//);
  await page.waitForTimeout(1000);
  await shoot(page, "team-after-draft");

  await p2.reload();
  await p2.waitForTimeout(1500);
  await shoot(p2, "sam-notified");
  if (!(await p2.getByTestId(/card-my-team-/).count())) errors.push("drafted player does not see the team");

  // Signed-out views.
  const ctx3 = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const p3 = await ctx3.newPage();
  watch(p3, "public");
  for (const [path, name] of [["/leagues", "leagues"], ["/players", "players-public"], ["/rink", "rink"], ["/scan", "scan"]]) {
    await p3.goto(BASE + path);
    await p3.waitForTimeout(1200);
    await shoot(p3, name);
  }
  await p3.goto(`${BASE}/players`);
  await p3.waitForTimeout(1000);
  await p3.locator('[data-testid^="row-player-"]').nth(3).click();
  await p3.waitForURL(/\/player\//);
  await p3.waitForTimeout(1000);
  await shoot(p3, "player-public-claim");

  // Every page, at small-phone widths, signed in as an admin with imported games on the books.
  const boot = await api(page, "GET", "/api/bootstrap");
  const imp = await api(page, "POST", "/api/staff/import", { text: FIXTURE, rinkId: boot.json.rink.id, apply: true });
  if (imp.status !== 200) errors.push(`fixture import failed: ${imp.status} ${JSON.stringify(imp.json)}`);
  const meNow = await api(page, "GET", "/api/me");
  const myTeam = meNow.json?.slots?.[0]?.team_id;
  if (myTeam) {
    const d = new Date(Date.now() + 4 * 86400000).toISOString().slice(0, 10);
    const add = await api(page, "POST", `/api/teams/${myTeam}/schedule`, { date: d, time: "21:15", opponentName: "Raleigh Rebels", kind: "tournament", location: "Wake Competition Center" });
    if (add.status !== 200) errors.push(`adding a game failed: ${add.status} ${JSON.stringify(add.json)}`);
  } else errors.push("graham has no team for the schedule check");
  const hrefs = async (pg, path, prefix, k = 1) => {
    await pg.goto(BASE + path); await pg.waitForTimeout(1200);
    return (await pg.$$eval(`a[href^="${prefix}"]`, (as) => as.map((a) => a.getAttribute("href")))).filter((h, i, arr) => arr.indexOf(h) === i).slice(0, k);
  };
  const routes = ["/", "/leagues", "/players", "/rink", "/scan", "/me", "/settings", "/staff"];
  routes.push(...await hrefs(page, "/", "/game/", 3));
  routes.push(...await hrefs(page, "/leagues", "/league/", 1));
  routes.push(...await hrefs(page, "/leagues", "/team/", 2));
  routes.push(...await hrefs(page, "/players", "/player/", 2));
  routes.push(...await hrefs(page, "/me", "/team/", 1));
  for (const w of [320, 375, 390]) {
    await page.setViewportSize({ width: w, height: 760 });
    for (const r of routes) {
      await page.goto(BASE + r);
      await page.waitForTimeout(1300);
      await widthCheck(page, r);
    }
    // Open pieces that only show on tap.
    await page.goto(`${BASE}/staff`); await page.waitForTimeout(1200);
    await page.getByTestId("input-support-search").fill("example");
    await page.getByTestId("button-support-search").click();
    await page.waitForTimeout(900);
    if (await page.locator('[data-testid^="row-account-"]').count()) {
      await page.locator('[data-testid^="row-account-"]').first().click();
      await page.waitForTimeout(900);
    }
    await widthCheck(page, "/staff (account open)");
    await page.goto(BASE + "/"); await page.waitForTimeout(900);
    await page.getByTestId("button-league-switcher").click();
    await widthCheck(page, "league switcher");
    if (w === 390) {
      // With the sheet open, scrolling must not move the page underneath.
      const top = () => page.evaluate(() => document.querySelector("main").getBoundingClientRect().top);
      const t0 = await top();
      await page.mouse.move(195, 700); await page.mouse.wheel(0, 900); await page.waitForTimeout(500);
      if (Math.abs((await top()) - t0) > 1) errors.push("page scrolled under the open top sheet");
      await page.getByTestId("button-change-rink").click();
      await page.waitForTimeout(600);
      await widthCheck(page, "rink picker");
      if (!(await page.getByTestId("rink-picker").count())) errors.push("Change rink didn't open the rink picker");
      await page.getByTestId("button-close-switcher").click();
    }
  }
  await page.setViewportSize({ width: 375, height: 760 });
  await page.goto(BASE + "/"); await shoot(page, "home-375");
  await page.setViewportSize({ width: 390, height: 844 });
  if (myTeam) { await page.goto(`${BASE}/team/${myTeam}`); await page.waitForTimeout(1200); await shoot(page, "team-schedule"); }
  await page.goto(`${BASE}/players`); await page.waitForTimeout(1000);
  await page.getByTestId("button-pos-D").click(); await shoot(page, "players-defense");
  await api(page, "PATCH", "/api/me", { avatar: { skin: 3, hair: 1, helmet: "team", guard: "cage", beard: "full", style: "flow", eyeBlack: false } });
  await page.goto(`${BASE}/me`); await page.waitForTimeout(1200);
  await page.getByTestId("row-avatar").click(); await page.waitForTimeout(400);
  await page.getByTestId("card-avatar-builder").scrollIntoViewIfNeeded().catch(() => {});
  await shoot(page, "me-bobblehead");
  // Light mode: the phone's setting, then the profile override.
  await page.emulateMedia({ colorScheme: "light" });
  for (const [path, name] of [["/", "light-home"], ["/leagues", "light-leagues"], [myTeam ? `/team/${myTeam}` : "/leagues", "light-team"], ["/players", "light-players"], ["/me", "light-me"], ["/staff", "light-staff"]]) {
    await page.goto(BASE + path); await page.waitForTimeout(1100); await shoot(page, name);
  }
  await page.emulateMedia({ colorScheme: "dark" });
  await page.goto(`${BASE}/settings`); await page.waitForTimeout(1000);
  await page.getByTestId("button-theme-light").click();
  await page.reload(); await page.waitForTimeout(1000);
  if ((await page.evaluate(() => document.documentElement.dataset.theme)) !== "light") errors.push("picking Light on the profile didn't stick");
  await shoot(page, "light-me-override");
  await page.getByTestId("button-theme-auto").click();
  await page.goto(BASE + "/staff"); await shoot(page, "staff-375");
  // Rink Desk, at laptop size.
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto(BASE + "/desk"); await page.waitForTimeout(1500); await shoot(page, "desk-home");
  await page.goto(BASE + "/desk/lineups"); await page.waitForTimeout(1500); await shoot(page, "desk-lineups");
  const gap = page.locator('[data-testid^="row-gap-"]').first();
  if (await gap.count()) {
    await gap.click(); await page.waitForURL(/\/desk\/lineups\/\d+/); await page.waitForTimeout(1500);
    await shoot(page, "desk-team-lineup");
  } else errors.push("Rink Desk shows no team with imported games");
  await page.goto(BASE + "/desk/sheets"); await page.waitForTimeout(1500); await shoot(page, "desk-sheets");
  await page.getByTestId("tab-sheets-done").click(); await page.waitForTimeout(500);
  const doneRow = page.locator('[data-testid^="row-sheet-"]').first();
  const doneId = (await doneRow.count()) ? (await doneRow.getAttribute("data-testid")).replace("row-sheet-", "") : null;
  if (doneId) {
    await page.goto(BASE + `/desk/sheets/${doneId}`); await page.waitForTimeout(1500); await shoot(page, "desk-sheet-done");
  }
  for (const [path, name] of [["/desk/roster", "desk-roster"], ["/desk/ratings", "desk-ratings"], ["/desk/imports", "desk-imports"]]) {
    await page.goto(BASE + path); await page.waitForTimeout(1800); await shoot(page, name);
  }
  await page.setViewportSize({ width: 375, height: 760 });
  const pubW = await browser.newContext({ viewport: { width: 320, height: 700 } });
  const pw = await pubW.newPage();
  for (const r of ["/", "/join", "/leagues", "/players", "/rink"]) { await pw.goto(BASE + r); await pw.waitForTimeout(1200); await widthCheck(pw, `${r} signed out`); }
} catch (e) {
  errors.push(`walkthrough stopped: ${e.message}`);
} finally {
  await browser.close();
  srv.kill();
}
if (errors.length) { console.log("browser errors:\n" + errors.join("\n")); process.exitCode = 1; }
console.log(`ui-shots: ${n} screenshots`);
