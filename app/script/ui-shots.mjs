// Drives the built app in a phone-sized browser through join, claim, captain and draft,
// saving screenshots to shots/. CI publishes them for review.
// Sign-in codes are read from the local mail catcher.
import { spawn } from "node:child_process";
import { mkdirSync } from "node:fs";
import { chromium } from "playwright";
import { latestCode, lastMailId } from "./mail.mjs";

const PORT = 3098, BASE = `http://localhost:${PORT}`;
mkdirSync("shots", { recursive: true });
const srv = spawn("npx", ["next", "start", "-p", String(PORT)], { env: { ...process.env, NODE_ENV: "production" }, stdio: "inherit" });
for (let i = 0; i < 200; i++) { try { if ((await fetch(`${BASE}/api/bootstrap`)).ok) break; } catch {} await new Promise((r) => setTimeout(r, 200)); }

const browser = await chromium.launch();
const errors = [];
let n = 0;
async function shoot(page, name) { await page.waitForTimeout(600); await page.screenshot({ path: `shots/${String(++n).padStart(2, "0")}-${name}.png`, fullPage: true }); }
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
  if (!(await page.getByTestId("button-resend").isDisabled())) errors.push("resend should be on cooldown");
  // Start over with a fresh page; the server allows a new code after 1 second locally.
  await page.waitForTimeout(1500);
  await join(page, "graham@example.com", "Graham DeNoyer", "12", "F");
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
  await page.waitForURL(/\/team\//);
  await page.waitForTimeout(1000);
  await shoot(page, "team-roster-builder");
  await page.locator('[data-testid^="button-slot-"]').first().click();
  await shoot(page, "team-roster-row-open");
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
} catch (e) {
  errors.push(`walkthrough stopped: ${e.message}`);
} finally {
  await browser.close();
  srv.kill();
}
if (errors.length) { console.log("browser errors:\n" + errors.join("\n")); process.exitCode = 1; }
console.log(`ui-shots: ${n} screenshots`);
