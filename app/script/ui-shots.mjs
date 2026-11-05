// Drives the built app in a phone-sized browser through join, claim, captain and draft,
// saving screenshots to shots/. CI uploads them as an artifact for review.
import { spawn } from "node:child_process";
import { mkdirSync, mkdtempSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { chromium } from "playwright";

const PORT = 5098, BASE = `http://localhost:${PORT}`;
const DB = path.join(mkdtempSync(path.join(os.tmpdir(), "lateice-ui-")), "ui.db");
mkdirSync("shots", { recursive: true });
const srv = spawn("node", ["dist/index.cjs"], { env: { ...process.env, NODE_ENV: "production", PORT: String(PORT), LATE_ICE_DB: DB }, stdio: "inherit" });
for (let i = 0; i < 100; i++) { try { if ((await fetch(`${BASE}/api/bootstrap`)).ok) break; } catch {} await new Promise((r) => setTimeout(r, 150)); }

const browser = await chromium.launch();
const errors = [];
let n = 0;
async function shoot(page, name) { await page.waitForTimeout(500); await page.screenshot({ path: `shots/${String(++n).padStart(2, "0")}-${name}.png`, fullPage: true }); }
async function join(page, phone, name, number, pos) {
  await page.goto(`${BASE}/#/join`);
  await page.getByTestId("input-phone").fill(phone);
  await page.getByTestId("button-send-code").click();
  const code = (await page.getByTestId("text-test-code").innerText()).match(/\d{6}/)[0];
  return { code, finish: async () => {
    await page.getByTestId("input-code").fill(code);
    await page.getByTestId("button-verify").click();
    await page.getByTestId("input-name").fill(name);
    await page.getByTestId("input-number").fill(number);
    await page.getByTestId(`button-position-${pos}`).click();
  } };
}

try {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
  const page = await ctx.newPage();
  page.on("pageerror", (e) => errors.push(String(e)));
  page.on("console", (m) => { if (m.type() === "error") errors.push(m.text()); });

  await page.goto(BASE);
  await shoot(page, "home-signed-out");
  const g = await join(page, "9105550101", "Graham DeNoyer", "12", "F");
  await shoot(page, "join-code");
  await g.finish();
  await shoot(page, "join-profile");
  await page.getByTestId("button-save-profile").click();
  await page.waitForURL(/#\/me/);
  await shoot(page, "me-suggestions");
  await page.locator('[data-testid^="button-claim-"]').first().click();
  await page.waitForTimeout(600);
  await page.locator('[data-testid^="button-become-captain-"]').first().click();
  await page.waitForTimeout(600);
  await shoot(page, "me-captain");

  // Second player registers so the pool has someone in it.
  const ctx2 = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const p2 = await ctx2.newPage();
  const s = await join(p2, "9105550102", "Sam Okafor", "9", "D");
  await s.finish();
  await p2.getByTestId("button-save-profile").click();
  await p2.waitForURL(/#\/me/);

  await page.locator('[data-testid^="button-manage-"]').first().click();
  await page.waitForTimeout(800);
  await shoot(page, "team-roster-builder");
  await page.getByTestId("link-draft").click();
  await page.waitForTimeout(800);
  await shoot(page, "pool");
  await page.locator('[data-testid^="row-pool-"]').first().click();
  await shoot(page, "pool-pick");
  await page.getByTestId("button-confirm-pick").click();
  await page.waitForURL(/#\/team\//);
  await page.waitForTimeout(800);
  await shoot(page, "team-after-draft");

  await p2.goto(`${BASE}/#/me`);
  await shoot(p2, "sam-notified");

  // Signed-out view of an unclaimed player.
  const ctx3 = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const p3 = await ctx3.newPage();
  await p3.goto(`${BASE}/#/players`);
  await p3.waitForTimeout(800);
  await shoot(p3, "players-public");
  await p3.locator('[data-testid^="row-player-"]').nth(3).click().catch(() => {});
  await p3.waitForTimeout(800);
  await shoot(p3, "player-public-claim");
} finally {
  await browser.close();
  srv.kill();
}
if (errors.length) { console.log("browser errors:\n" + errors.join("\n")); process.exitCode = 1; }
console.log(`ui-shots: ${n} screenshots`);
