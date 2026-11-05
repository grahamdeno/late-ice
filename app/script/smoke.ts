// End-to-end API smoke test for sign-in, the draft pool, captain roster tools and name privacy.
// Runs the built server (dist/index.cjs) against a scratch database. CI runs it after `npm run build`.
import { spawn, type ChildProcess } from "node:child_process";
import { mkdtempSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import Database from "better-sqlite3";

const PORT = 5099;
const BASE = `http://localhost:${PORT}`;
const DB = path.join(mkdtempSync(path.join(os.tmpdir(), "lateice-")), "smoke.db");
let srv: ChildProcess | null = null;
let passed = 0;

function ok(cond: unknown, msg: string): asserts cond {
  if (!cond) throw new Error(`FAIL: ${msg}`);
  passed++;
  console.log(`  ok  ${msg}`);
}

async function start() {
  srv = spawn("node", ["dist/index.cjs"], {
    env: { ...process.env, NODE_ENV: "production", PORT: String(PORT), LATE_ICE_DB: DB, SMS_TEST_MODE: "", TWILIO_ACCOUNT_SID: "" },
    stdio: ["ignore", "ignore", "inherit"],
  });
  for (let i = 0; i < 100; i++) {
    try { const r = await fetch(`${BASE}/api/bootstrap`); if (r.ok) return; } catch {}
    await new Promise((r) => setTimeout(r, 150));
  }
  throw new Error("server did not start");
}
async function stop() {
  if (!srv) return;
  const p = new Promise((r) => srv!.once("exit", r));
  srv.kill();
  await p;
  srv = null;
}

async function call(method: string, url: string, body?: unknown, token?: string) {
  const res = await fetch(BASE + url, {
    method,
    headers: { ...(body ? { "Content-Type": "application/json" } : {}), ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let json: any = null;
  try { json = JSON.parse(text); } catch {}
  return { status: res.status, json, text };
}

async function signUp(phone: string, profile: { name: string; number: string; position: string }) {
  const s = await call("POST", "/api/auth/start", { phone });
  ok(s.status === 200 && /^\d{6}$/.test(s.json.testCode), `code sent to ${phone} (test mode returns it)`);
  const v = await call("POST", "/api/auth/verify", { phone, code: s.json.testCode });
  ok(v.status === 200 && v.json.token, `verified ${phone}`);
  const rinks = await call("GET", "/api/rinks");
  const p = await call("PATCH", "/api/me", { ...profile, homeRinkId: rinks.json[0].id }, v.json.token);
  ok(p.status === 200 && p.json.user.profileComplete, `${profile.name} profile complete`);
  return v.json.token as string;
}

async function main() {
  // Phase 1: seed a database, then add sheet-style slots with full names the way a scan would.
  await start();
  await stop();
  const db = new Database(DB);
  const hh = (db.prepare("SELECT id FROM teams WHERE name=?").get("Hammer'd Heads") as any).id as number;
  const addSlot = (name: string, num: string) => {
    const id = Number(db.prepare("INSERT INTO players (name,name_key,position,rating) VALUES (?,?,'F',3.8)").run(name, name.toLowerCase().replace(/[^a-z]/g, "")).lastInsertRowid);
    db.prepare("INSERT INTO roster_entries (team_id,player_id,number) VALUES (?,?,?)").run(hh, id, num);
    return id;
  };
  const mike = addSlot("Mike Tolliver", "44");
  const mikeVariant = addSlot("M Tolliver", "4");
  db.close();

  // Phase 2: boot again; display names are refreshed on start.
  await start();
  console.log("privacy");
  let team = await call("GET", `/api/teams/${hh}`);
  ok(team.status === 200, "team page loads");
  ok(!team.text.includes("Tolliver"), "unclaimed full surname never leaves the server");
  ok(team.json.roster.some((r: any) => r.name === "Mike T."), "unclaimed slot shows first name and last initial");
  ok(team.json.captain === null, "no captain yet");
  const legacy = ["/api/bootstrap", "/api/feed", "/api/players", "/api/rink", `/api/leagues/${team.json.league.id}`, `/api/players/${mike}`];
  for (const u of legacy) { const r = await call("GET", u); ok(r.status === 200 && !r.text.includes("Tolliver"), `${u} ok and private`); }

  console.log("sign-in");
  ok((await call("GET", "/api/auth/config")).json.smsTestMode === true, "test mode on without a text provider");
  ok((await call("GET", "/api/me")).status === 401, "signed-out /api/me is 401");
  ok((await call("POST", "/api/auth/start", { phone: "555" })).status === 400, "bad phone rejected");
  const s1 = await call("POST", "/api/auth/start", { phone: "910-555-0199" });
  ok((await call("POST", "/api/auth/verify", { phone: "9105550199", code: s1.json.testCode === "000000" ? "111111" : "000000" })).status === 400, "wrong code rejected");
  for (let i = 0; i < 4; i++) await call("POST", "/api/auth/start", { phone: "9105550199" });
  ok((await call("POST", "/api/auth/start", { phone: "9105550199" })).status === 429, "sixth code in an hour is rate limited");

  const graham = await signUp("(910) 555-0101", { name: "Graham DeNoyer", number: "12", position: "F" });
  ok((await call("PATCH", "/api/me", { name: "Graham" }, graham)).status === 400, "one-word name rejected");
  let me = await call("GET", "/api/me", undefined, graham);
  ok(me.status === 200 && me.json.user.name === "Graham DeNoyer", "me loads");
  const sug = me.json.suggestions.find((s: any) => s.name === "Graham D.");
  ok(sug && sug.team_id === hh, "suggests the posted 'Graham D.' on Hammer'd Heads");

  console.log("claim and captain");
  ok((await call("POST", `/api/teams/${hh}/captain`, undefined, graham)).status === 403, "can't take captain before claiming a spot");
  ok((await call("POST", `/api/players/${sug.id}/claim`, undefined, graham)).status === 200, "claim the slot");
  team = await call("GET", `/api/teams/${hh}`);
  const mine = team.json.roster.find((r: any) => r.id === sug.id);
  ok(mine.name === "Graham DeNoyer" && mine.registered === 1, "claimed slot shows full name and registered");
  ok((await call("POST", `/api/teams/${hh}/captain`, undefined, graham)).status === 200, "take the captain role");
  team = await call("GET", `/api/teams/${hh}`);
  ok(team.json.captain?.name === "Graham DeNoyer", "team shows the captain");
  const p = await call("GET", `/api/players/${sug.id}`, undefined, graham);
  ok(p.json.player.mine === true && p.json.player.registered === true, "player page knows it's mine");

  console.log("draft pool and draft");
  const sam = await signUp("9105550102", { name: "Sam Okafor", number: "9", position: "D" });
  ok((await call("GET", "/api/pool", undefined, sam)).status === 403, "pool is captains only");
  const pool = await call("GET", "/api/pool", undefined, graham);
  const samRow = pool.json.players.find((x: any) => x.name === "Sam Okafor");
  ok(samRow && samRow.teams.length === 0, "pool lists Sam as a free agent");
  ok((await call("POST", `/api/teams/${hh}/draft`, { userId: samRow.id, number: "44" }, graham)).status === 409, "draft onto a number held by a sheet slot is refused (use match)");
  ok((await call("POST", `/api/teams/${hh}/draft`, { userId: samRow.id }, sam)).status === 403, "non-captain can't draft");
  ok((await call("POST", `/api/teams/${hh}/draft`, { userId: samRow.id }, graham)).status === 200, "captain drafts Sam as #9");
  ok((await call("POST", `/api/teams/${hh}/draft`, { userId: samRow.id }, graham)).status === 409, "can't draft twice");
  me = await call("GET", "/api/me", undefined, sam);
  ok(me.json.unread === 1 && me.json.notifications[0].kind === "draft", "Sam gets a draft notice");
  ok(me.json.slots.some((s: any) => s.team_id === hh && s.number === "9" && s.source === "draft"), "Sam is on the roster as #9");
  ok((await call("PATCH", `/api/teams/${hh}`, { name: "Hammerd" }, sam)).status === 403, "non-captain can't rename the team");
  ok((await call("POST", `/api/me/decline/${hh}`, undefined, sam)).status === 200, "Sam declines");
  me = await call("GET", "/api/me", undefined, graham);
  ok(me.json.notifications.some((n: any) => n.kind === "decline"), "captain hears about the decline");

  console.log("match, release, merge");
  const mt = await signUp("9105550103", { name: "Mike Tolliver", number: "44", position: "F" });
  ok((await call("POST", `/api/teams/${hh}/match`, { playerId: mike, userId: (await call("GET", "/api/me", undefined, mt)).json.user.id }, graham)).status === 200, "captain matches Mike to the #44 sheet slot");
  team = await call("GET", `/api/teams/${hh}`);
  ok(team.json.roster.find((r: any) => r.id === mike)?.name === "Mike Tolliver", "matched slot shows full name");
  me = await call("GET", "/api/me", undefined, mt);
  ok(me.json.slots.some((s: any) => s.id === mike) && me.json.notifications[0].kind === "match", "Mike sees the slot and a notice");
  ok((await call("POST", `/api/teams/${hh}/slots/${mike}/release`, undefined, graham)).status === 200, "captain releases the match");
  team = await call("GET", `/api/teams/${hh}`);
  ok(team.json.roster.find((r: any) => r.id === mike)?.name === "Mike T.", "released slot goes back to private name");
  const before = team.json.roster.length;
  ok((await call("POST", `/api/teams/${hh}/merge`, { fromId: mikeVariant, intoId: mike }, graham)).status === 200, "merge the #4 spelling variant into #44");
  team = await call("GET", `/api/teams/${hh}`);
  ok(team.json.roster.length === before - 1 && !team.json.roster.some((r: any) => r.id === mikeVariant), "roster has one fewer spot");
  ok((await call("POST", `/api/players/${sug.id}/claim`, undefined, mt)).status === 409, "can't claim a spot someone else holds");
  const manage = await call("GET", `/api/teams/${hh}/manage`, undefined, graham);
  ok(manage.status === 200 && manage.json.actions.length >= 5, "roster history is logged");
  ok((await call("GET", `/api/teams/${hh}/manage`, undefined, mt)).status === 403, "manage view is captain only");

  console.log("hide");
  const jared = team.json.roster.find((r: any) => r.name === "Jared A.");
  ok((await call("POST", `/api/players/${jared.id}/hide`, { contact: "x" })).status === 200, "anyone can hide a name without an account");
  ok((await call("GET", `/api/players/${jared.id}`)).json.player.name === "Hidden player", "hidden name is replaced");
  ok((await call("POST", `/api/players/${jared.id}/unhide`, undefined, mt)).status === 403, "only the player or captain can unhide");
  ok((await call("POST", `/api/players/${jared.id}/unhide`, undefined, graham)).status === 200, "captain can unhide");
  ok((await call("PATCH", "/api/me", { hidden: true }, graham)).status === 200, "Graham hides himself");
  ok((await call("GET", `/api/players/${sug.id}`)).json.player.name === "Hidden player", "self-hide applies to the claimed slot");
  await call("PATCH", "/api/me", { hidden: false }, graham);

  console.log("status and sign-out");
  ok((await call("PATCH", "/api/me", { status: "ir", statusUntil: "2026-12-01" }, sam)).json.user.status === "ir", "set injured reserve");
  ok((await call("POST", "/api/auth/logout", undefined, sam)).status === 200, "sign out");
  ok((await call("GET", "/api/me", undefined, sam)).status === 401, "token no longer works");

  // Restart keeps everything (migrations are idempotent).
  await stop();
  await start();
  ok((await call("GET", "/api/me", undefined, graham)).json.user.name === "Graham DeNoyer", "survives a restart");
  ok((await call("GET", `/api/teams/${hh}`)).json.captain?.name === "Graham DeNoyer", "captain survives a restart");

  await stop();
  console.log(`\nsmoke: ${passed} checks passed`);
}

main().catch(async (e) => { console.error(e.message || e); await stop(); process.exit(1); });
