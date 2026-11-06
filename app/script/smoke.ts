// End-to-end smoke test: the built Next.js app against a local Supabase stack.
// Covers sign-in, the draft pool, captain tools, name privacy, the scoresheet confirm
// path, photo storage, and the nightly rating replay. CI runs it after `next build`.
import { spawn, type ChildProcess } from "node:child_process";
import { readFileSync, unlinkSync } from "node:fs";
import { createServer } from "node:http";
import postgres from "postgres";
import { createClient } from "@supabase/supabase-js";
// @ts-ignore plain JS helper
import { latestCode, lastMailId } from "./mail.mjs";

const PORT = 3099;
const BASE = `http://localhost:${PORT}`;
const env = process.env;
const db = postgres(env.DATABASE_URL!, { prepare: false, max: 2, onnotice: () => {} });
let srv: ChildProcess | null = null;
let passed = 0;

function ok(cond: unknown, msg: string): asserts cond {
  if (!cond) throw new Error(`FAIL: ${msg}`);
  passed++;
  console.log(`  ok  ${msg}`);
}

async function start() {
  await startConfigured();
}
async function stop() {
  if (!srv?.pid) { srv = null; return; }
  const p = new Promise((r) => srv!.once("exit", r));
  // npx does not forward the signal, so stop the whole group or the old server keeps the port.
  try { process.kill(-srv.pid, "SIGTERM"); } catch { srv.kill("SIGTERM"); }
  await Promise.race([p, new Promise((r) => setTimeout(r, 4000))]);
  try { process.kill(-srv.pid, "SIGKILL"); } catch { /* already gone */ }
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
  return { status: res.status, json, text, headers: res.headers };
}

/** x-query-count from a server started with LATEICE_COUNT_QUERIES=1. */
function okFast(url: string, r: { status: number; headers: Headers }) {
  const n = Number(r.headers.get("x-query-count"));
  ok(r.status === 200 && Number.isFinite(n) && n <= 10, `${url} uses ${n} queries`);
}

/** Null stays null. A number matches only the same number. */
function numSame(a: unknown, b: unknown) {
  if (a == null && b == null) return true;
  if (a == null || b == null) return false;
  return Number(a) === Number(b);
}

/** Sign in by emailed code (read from the local mail catcher) and register. */
async function signUp(email: string, profile: { name: string; number: string; position: string }, opts: { waitlist?: boolean; blocked?: boolean } = {}) {
  const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL!, env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, { auth: { persistSession: false } });
  const inbox = email.toLowerCase();
  const before = await lastMailId(inbox);
  const s = await sb.auth.signInWithOtp({ email, options: { shouldCreateUser: true } });
  ok(!s.error, `code requested for ${email}${s.error ? ": " + s.error.message : ""}`);
  const { code } = await latestCode(inbox, before);
  ok(/^\d{6}$/.test(code), `email for ${email} shows a 6-digit code`);
  const wrong = await sb.auth.verifyOtp({ email, token: code === "000000" ? "111111" : "000000", type: "email" });
  ok(!!wrong.error, "a wrong code is rejected");
  const v = await sb.auth.verifyOtp({ email, token: code, type: "email" });
  ok(!v.error && v.data.session, `verified ${email}${v.error ? ": " + v.error.message : ""}`);
  const again = await sb.auth.verifyOtp({ email, token: code, type: "email" });
  ok(!!again.error, "a used code can't be reused");
  const token = v.data.session!.access_token;
  const me = await call("GET", "/api/me", undefined, token);
  if (opts.blocked) { ok(me.status === 403 && /paused/i.test(me.json?.message ?? ""), `${email} can't make an account while sign-ups are paused`); return token; }
  ok(me.status === 200 && me.json.user.profileComplete === false && me.json.user.email === email.toLowerCase() && me.json.user.phone === null, `${email} gets a new account keyed on email, no phone`);
  const rinks = await call("GET", "/api/rinks");
  const p = await call("PATCH", "/api/me", { ...profile, homeRinkId: rinks.json.rinks.find((r: any) => r.name === "Polar Ice Wilmington").id, age18: true }, token);
  ok(p.status === 200 && p.json.user.profileComplete, `${profile.name} profile complete`);
  ok(p.json.user.access === (inbox === "boss@example.com" ? "approved" : "waiting"), `${email} starts ${inbox === "boss@example.com" ? "let in (bootstrap admin)" : "on the waitlist"}`);
  // Most test players are let in straight away; the gate has its own checks below.
  if (!opts.waitlist) await db`UPDATE users SET access='approved' WHERE email=${inbox}`;
  return token;
}

/** A reviewed scoresheet built from samples/truth.json, the way the reader would return it. */
function sheetFromTruth(i: number, overrides: Record<string, string> = {}) {
  const t = JSON.parse(readFileSync("samples/truth.json", "utf8"))[i];
  const [m, d, y] = t.date.split("/");
  const team = (name: string, roster: any[], goals: any[], pen: any[], shots: number[]) => ({
    name,
    roster: roster.map(([n, nm, pos]: any) => ({ number: String(n), name: nm, position: pos || null })),
    goals: goals.map(([p, time, s, a1, a2]: any) => ({ period: p, time, scorer: String(s), assist1: a1 ? String(a1) : null, assist2: a2 ? String(a2) : null })),
    penalties: pen.map(([p, n, off, min]: any) => ({ period: p, number: String(n), offense: off, minutes: min })),
    shots_by_period: shots,
    score_by_period: [1, 2, 3].map((p) => goals.filter((g: any) => g[0] === p).length),
    total: goals.length,
  });
  return {
    is_scoresheet: true, date: overrides.date ?? `${y}-${m}-${d}`, time: t.time, league_text: t.league, rink_text: null,
    home: team(overrides.home ?? t.home, t.home_roster, t.home_goals, t.home_pen, t.home_shots),
    away: team(overrides.away ?? t.away, t.away_roster, t.away_goals, t.away_pen, t.away_shots),
    confidence: 0.95, notes: [],
  };
}

const PUSH_LOG = "/tmp/lateice-g5-push.jsonl";
const PUSH_KINDS = ["game_day", "result", "sub_request", "roster", "confirm"];
type PushLine = { userId?: number; kind?: string; skipped?: string; sent?: boolean; title?: string; devices?: number };

function pushLines(): PushLine[] {
  try { return readFileSync(PUSH_LOG, "utf8").trim().split("\n").filter(Boolean).map((l) => JSON.parse(l)); } catch { return []; }
}
function clearPushLog() { try { unlinkSync(PUSH_LOG); } catch { /* none yet */ } }

async function startConfigured(extra: Record<string, string> = {}) {
  await stop();
  const child: NodeJS.ProcessEnv = { ...env, NODE_ENV: "production", BOOTSTRAP_ADMIN_EMAIL: "boss@example.com", ALLOW_LOCAL_FEEDS: "1", LATEICE_MAP_LOOKUP: "off", LATEICE_FAKE_OCR: "1", LATEICE_COUNT_QUERIES: "1", LATEICE_PUSH_LOG: PUSH_LOG, ...extra };
  if (!("VAPID_PUBLIC_KEY" in extra)) delete child.VAPID_PUBLIC_KEY;
  if (!("VAPID_PRIVATE_KEY" in extra)) delete child.VAPID_PRIVATE_KEY;
  if (!("VAPID_SUBJECT" in extra)) delete child.VAPID_SUBJECT;
  if (!("LATEICE_STUB_PUSH" in extra)) delete child.LATEICE_STUB_PUSH;
  if (!("LATEICE_PUSH_NOW" in extra)) delete child.LATEICE_PUSH_NOW;
  srv = spawn("npx", ["next", "start", "-p", String(PORT)], { env: child, stdio: ["ignore", "ignore", "inherit"], detached: true });
  let exited = false;
  srv.once("exit", () => { exited = true; });
  for (let i = 0; i < 200; i++) {
    if (exited) throw new Error("server exited before it was ready");
    try { const r = await fetch(`${BASE}/api/bootstrap`); if (r.ok) return; } catch {}
    await new Promise((r) => setTimeout(r, 200));
  }
  throw new Error("server did not start");
}

const vapidStub = {
  LATEICE_STUB_PUSH: "1",
  VAPID_PUBLIC_KEY: "smoke-public",
  VAPID_PRIVATE_KEY: "smoke-private",
  VAPID_SUBJECT: "mailto:support@tangomike.app",
};

async function cronCall() {
  const res = await fetch(`${BASE}/api/cron/recompute`, { headers: { Authorization: `Bearer ${env.CRON_SECRET}` } });
  const json = await res.json().catch(() => null);
  return { status: res.status, json };
}

async function pushChecks(ctx: { graham: string; sam: string; outsider: string; fan: string; hh: number; ids: Record<string, number> }) {
  console.log("push");
  const blId = (await db`SELECT id FROM teams WHERE name=${"Blue Liners"}`)[0].id as number;
  const sub = (endpoint: string) => ({ endpoint, keys: { p256dh: "abc123def456", auth: "authkey1234" } });

  clearPushLog();
  await startConfigured();
  ok((await call("GET", "/api/push/prefs")).status === 401, "notification prefs need sign-in");
  ok((await call("POST", "/api/push/subscribe", sub("https://push.example/nope"))).status === 401, "subscribe needs sign-in");
  ok((await call("POST", "/api/push/subscribe", sub("https://push.example/graham"), ctx.graham)).status === 200, "subscribe stores this user's device");
  const prefs = await call("GET", "/api/push/prefs", undefined, ctx.graham);
  ok(prefs.status === 200 && prefs.json.game_day === true && prefs.json.result === true && prefs.json.sub_request === true && prefs.json.roster === true && prefs.json.confirm === true, "the five switches default to on");
  ok(prefs.json.publicKey === null && prefs.json.privateKey === undefined && !JSON.stringify(prefs.json).includes("PRIVATE"), "with no VAPID keys the public key is absent and the private key is never returned");
  ok((await call("PUT", "/api/push/prefs", { game_day: false }, ctx.graham)).json.game_day === false, "a switch saves");
  ok((await call("GET", "/api/push/prefs", undefined, ctx.graham)).json.game_day === false && (await call("GET", "/api/push/prefs", undefined, ctx.graham)).json.result === true, "the saved switch stays off and the others stay on");
  ok((await call("PUT", "/api/push/prefs", { game_day: true }, ctx.graham)).json.game_day === true, "the switch turns back on");
  ok((await call("PUT", "/api/push/prefs", { roster: "yes" }, ctx.graham)).status === 400, "a switch has to be on or off");
  ok((await call("POST", "/api/push/subscribe", { endpoint: "http://push.example/x", keys: { p256dh: "abc123def456", auth: "authkey1234" } }, ctx.graham)).status === 400, "a push address has to be https");
  ok((await call("POST", "/api/push/subscribe", sub("https://push.example/graham"), ctx.sam)).status === 200, "the same device moves to the person who is signed in");
  const owners = await db`SELECT user_id FROM push_subscriptions WHERE endpoint=${"https://push.example/graham"}`;
  ok(owners.length === 1 && owners[0].user_id === ctx.ids.sam, "one row, and it belongs to Sam");
  ok((await call("DELETE", "/api/push/subscribe", { endpoint: "https://push.example/graham" }, ctx.graham)).status === 404, "Graham can't remove Sam's device");
  ok((await call("DELETE", "/api/push/subscribe", { endpoint: "https://push.example/graham" }, ctx.sam)).status === 200, "Sam can remove his own device");
  ok((await db`SELECT count(*)::int AS c FROM push_subscriptions WHERE endpoint=${"https://push.example/graham"}`)[0].c === 0, "the device is gone");

  const push0 = await signUp("push0@example.com", { name: "Ned NoKey", number: "41", position: "F" });
  const push0id = (await call("GET", "/api/me", undefined, push0)).json.user.id;
  ok((await call("POST", `/api/teams/${ctx.hh}/draft`, { userId: push0id, number: "41" }, ctx.graham)).status === 200, "a roster notice is saved while push keys are missing");
  ok((await call("GET", "/api/me", undefined, push0)).json.notifications.some((n: any) => n.kind === "draft"), "the in-app notice is still there");
  ok(pushLines().length === 0, "missing VAPID keys send nothing");

  clearPushLog();
  await startConfigured({ ...vapidStub, LATEICE_PUSH_NOW: "2026-01-15T15:00:00.000Z" });
  const pub = await call("GET", "/api/push/prefs", undefined, ctx.graham);
  ok(pub.status === 200 && pub.json.publicKey === "smoke-public" && !JSON.stringify(pub.json).includes("smoke-private"), `the browser gets the public key only (status ${pub.status})`);
  ok((await call("POST", "/api/push/subscribe", sub("https://push.example/graham-morning"), ctx.graham)).status === 200, "Graham's browser is subscribed for the stubbed sends");
  ok((await call("POST", `/api/teams/${ctx.hh}/schedule`, { date: "2026-01-15", time: "9:15 PM", opponentTeamId: blId, kind: "league" }, ctx.graham)).status === 200, "a game on the morning clock's date");
  const morning = await cronCall();
  ok(morning.status === 200 && morning.json.gameDay >= 1, "the nightly job writes one game-day notice per player");
  const grahamDay = () => pushLines().filter((l) => l.userId === ctx.ids.graham && l.kind === "game_day");
  ok(grahamDay().length === 1 && grahamDay()[0].sent === true && (grahamDay()[0].devices ?? 0) >= 1, "Graham gets one game-day push, and nothing is sent to a push service");
  const again = await cronCall();
  ok(again.status === 200 && again.json.gameDay === 0 && grahamDay().length === 1, "running the job again does not send a second game-day push");

  const pat = await signUp("push1@example.com", { name: "Pat Push", number: "42", position: "F" });
  const patId = (await call("GET", "/api/me", undefined, pat)).json.user.id;
  ok((await call("POST", `/api/teams/${ctx.hh}/draft`, { userId: patId, number: "42" }, ctx.graham)).status === 200, "captain adds Pat");
  ok(pushLines().some((l) => l.userId === patId && l.kind === "roster" && l.sent === true), "adding a player sends a roster push");
  const beforeDecline = pushLines().length;
  ok((await call("POST", `/api/me/decline/${ctx.hh}`, undefined, pat)).status === 200, "Pat declines the team");
  ok(pushLines().length === beforeDecline, "declining is not one of the five pushes");

  const pam = await signUp("push2@example.com", { name: "Pam Quiet", number: "43", position: "D" });
  const pamId = (await call("GET", "/api/me", undefined, pam)).json.user.id;
  ok((await call("PUT", "/api/push/prefs", { roster: false }, pam)).json.roster === false, "Pam turns roster pushes off");
  const added = await call("POST", `/api/teams/${ctx.hh}/draft`, { userId: pamId, number: "43" }, ctx.graham);
  ok(added.status === 200, "captain adds Pam");
  ok(pushLines().some((l) => l.userId === pamId && l.kind === "roster" && l.skipped === "pref") && !pushLines().some((l) => l.userId === pamId && l.kind === "roster" && l.sent), "the roster switch holds that push");
  ok((await call("PUT", "/api/push/prefs", { roster: true }, pam)).json.roster === true, "Pam turns roster pushes back on");
  ok((await call("POST", `/api/teams/${ctx.hh}/slots/${added.json.playerId}/remove`, undefined, ctx.graham)).status === 200, "captain takes Pam off");
  ok(pushLines().some((l) => l.userId === pamId && l.kind === "roster" && l.sent === true), "taking a player off sends a roster push when the switch is on");

  ok((await call("PATCH", "/api/me", { willSub: true }, pam)).status === 200, "Pam will sub");
  const subGame = await call("POST", `/api/teams/${ctx.hh}/schedule`, { date: "2027-06-02", time: "9:15 PM", opponentTeamId: blId, kind: "league" }, ctx.graham);
  ok(subGame.status === 200, "a game to ask a sub for");
  const asked = await call("POST", `/api/schedule/${subGame.json.id}/subs`, { userId: pamId }, ctx.graham);
  ok(asked.status === 200, `captain asks Pam to sub${asked.status === 200 ? "" : " (" + asked.status + " " + (asked.json?.message || "") + ")"}`);
  ok(pushLines().some((l) => l.userId === pamId && l.kind === "sub_request" && l.sent === true), "a sub request sends a push");
  const beforeAnswer = pushLines().length;
  const ask = (await call("GET", "/api/me", undefined, pam)).json.subRequests.find((r: any) => r.game_id === subGame.json.id);
  ok(ask && (await call("PUT", `/api/sub-requests/${ask.id}`, { answer: "yes" }, pam)).status === 200, "Pam says yes");
  ok(pushLines().length === beforeAnswer, "answering a sub request does not send another push");

  const lg = (await db`SELECT league_id FROM teams WHERE id=${ctx.hh}`)[0].league_id as number;
  const [sheetId] = await db`INSERT INTO sheets (image_path,mime,status,source) VALUES ('test/none.jpg','image/jpeg','review','upload') RETURNING id`;
  const sent = await call("POST", `/api/sheets/${sheetId.id}/submit`, { leagueId: lg, homeTeamId: ctx.hh, awayTeamId: blId, data: { is_scoresheet: true } }, ctx.outsider);
  ok(sent.status === 200, "a player sends a sheet to the captains");
  ok(pushLines().some((l) => l.userId === ctx.ids.graham && l.kind === "confirm" && l.sent === true), "a sheet waiting on the captain sends a confirm push");

  await startConfigured({ ...vapidStub, LATEICE_PUSH_NOW: "2026-01-15T12:30:00.000Z" });
  await db`DELETE FROM notifications WHERE kind='game_day' AND link=${"/me?gameDay=2026-01-15"}`;
  let mark = pushLines().length;
  ok((await cronCall()).status === 200, "the job runs at 7:30am New York");
  ok(pushLines().slice(mark).some((l) => l.userId === ctx.ids.graham && l.kind === "game_day" && l.skipped === "quiet"), "before 8am in New York holds the game-day push");
  await db`ALTER TABLE rinks ADD COLUMN IF NOT EXISTS timezone text`;
  await db`UPDATE rinks SET timezone='Europe/London' WHERE name=${"Polar Ice Wilmington"}`;
  await db`DELETE FROM notifications WHERE kind='game_day' AND link=${"/me?gameDay=2026-01-15"}`;
  mark = pushLines().length;
  await cronCall();
  ok(pushLines().slice(mark).some((l) => l.userId === ctx.ids.graham && l.kind === "game_day" && l.sent === true), "noon in the home rink's zone still sends");

  await startConfigured({ ...vapidStub, LATEICE_PUSH_NOW: "2026-01-15T04:00:00.000Z" });
  await db`UPDATE rinks SET timezone='America/New_York' WHERE name=${"Polar Ice Wilmington"}`;
  ok((await call("POST", `/api/teams/${ctx.hh}/schedule`, { date: "2026-01-14", time: "9:15 PM", opponentTeamId: blId, kind: "league" }, ctx.graham)).status === 200, "a game on the evening clock's date");
  mark = pushLines().length;
  await cronCall();
  ok(pushLines().slice(mark).some((l) => l.userId === ctx.ids.graham && l.kind === "game_day" && l.skipped === "quiet"), "after 10pm in New York holds the game-day push");
  await db`UPDATE rinks SET timezone='Not/AZone' WHERE name=${"Polar Ice Wilmington"}`;
  await db`DELETE FROM notifications WHERE kind='game_day' AND link=${"/me?gameDay=2026-01-14"}`;
  mark = pushLines().length;
  await cronCall();
  ok(pushLines().slice(mark).some((l) => l.userId === ctx.ids.graham && l.kind === "game_day" && l.skipped === "quiet"), "a bad zone name falls back to New York");
  await db`UPDATE rinks SET timezone='America/Chicago' WHERE name=${"Polar Ice Wilmington"}`;
  await db`DELETE FROM notifications WHERE kind='game_day' AND link=${"/me?gameDay=2026-01-14"}`;
  mark = pushLines().length;
  await cronCall();
  ok(pushLines().slice(mark).some((l) => l.userId === ctx.ids.graham && l.kind === "game_day" && l.skipped === "quiet"), "10pm in the home rink zone is quiet");
  await db`UPDATE rinks SET timezone='America/Denver' WHERE name=${"Polar Ice Wilmington"}`;
  await db`DELETE FROM notifications WHERE kind='game_day' AND link=${"/me?gameDay=2026-01-14"}`;
  mark = pushLines().length;
  await cronCall();
  ok(pushLines().slice(mark).some((l) => l.userId === ctx.ids.graham && l.kind === "game_day" && l.sent === true), "9pm in the home rink zone still sends");

  const slot = (await db`SELECT p.name, re.number FROM players p JOIN roster_entries re ON re.player_id=p.id WHERE p.user_id=${ctx.ids.graham} AND re.team_id=${ctx.hh} LIMIT 1`)[0];
  const resultSheet = {
    is_scoresheet: true, date: "2026-03-21", time: "9:00 PM", league_text: "C", rink_text: null, confidence: 0.9, notes: [],
    home: { name: "Hammer'd Heads", roster: [{ number: slot.number || "88", name: slot.number ? slot.name : "Graham D.", position: null }], goals: [], penalties: [], shots_by_period: [1, 1, 1], score_by_period: [0, 0, 0], total: 0 },
    away: { name: "Blue Liners", roster: [{ number: "5", name: "Zed Quill", position: null }], goals: [], penalties: [], shots_by_period: [1, 1, 1], score_by_period: [0, 0, 0], total: 0 },
  };
  const [resultRow] = await db`INSERT INTO sheets (image_path,mime,status,source,extracted_json) VALUES ('test/none.jpg','image/jpeg','review','upload',${JSON.stringify(resultSheet)}) RETURNING id`;
  mark = pushLines().length;
  const confirmed = await call("POST", `/api/sheets/${resultRow.id}/confirm`, { leagueId: lg, homeTeamId: ctx.hh, awayTeamId: blId, data: resultSheet }, ctx.graham);
  ok(confirmed.status === 200, `a final that includes Graham is confirmed during quiet hours${confirmed.status === 200 ? "" : " (" + confirmed.status + " " + (confirmed.json?.message || confirmed.text) + ")"}`);
  ok(pushLines().slice(mark).some((l) => l.userId === ctx.ids.graham && l.kind === "result" && l.sent === true), "a result still sends during quiet hours");

  await startConfigured({ ...vapidStub, LATEICE_PUSH_NOW: "2026-01-15T13:00:00.000Z" });
  await db`UPDATE rinks SET timezone='America/New_York' WHERE name=${"Polar Ice Wilmington"}`;
  await db`DELETE FROM notifications WHERE kind='game_day' AND link=${"/me?gameDay=2026-01-15"}`;
  mark = pushLines().length;
  await cronCall();
  ok(pushLines().slice(mark).some((l) => l.userId === ctx.ids.graham && l.kind === "game_day" && l.sent === true), "8am in New York is outside quiet hours");

  const seen = new Set(pushLines().map((l) => l.kind));
  for (const k of PUSH_KINDS) ok(seen.has(k), `push covers ${k}`);
  ok([...seen].every((k) => PUSH_KINDS.includes(String(k))), "no push outside those five kinds");
  const raw = readFileSync(PUSH_LOG, "utf8");
  ok(!raw.includes("smoke-private") && !raw.includes("https://push.example"), "the push log has no private key and no device address");
  await db`UPDATE rinks SET timezone='America/New_York' WHERE name=${"Polar Ice Wilmington"}`;
  await stop();
}

async function main() {
  // Sheet-style slots with full names, the way a scan creates them (display name not yet set).
  const hh = (await db`SELECT id FROM teams WHERE name=${"Hammer'd Heads"}`)[0].id as number;
  const addSlot = async (name: string, num: string) => {
    const [p] = await db`INSERT INTO players (name,name_key,position,rating,start_rating) VALUES (${name},${name.toLowerCase().replace(/[^a-z]/g, "")},'F',3.8,3.8) RETURNING id`;
    await db`INSERT INTO roster_entries (team_id,player_id,number) VALUES (${hh},${p.id},${num})`;
    return p.id as number;
  };
  const mike = await addSlot("Mike Tolliver", "44");
  const mikeVariant = await addSlot("M Tolliver", "4");

  await start();

  console.log("health");
  {
    const health = await call("GET", "/api/health");
    ok(health.status === 200 && health.json?.ok === true && health.json?.db === true, "health check reads the database");
  }

  console.log("database is locked to the server");
  const anon = createClient(env.NEXT_PUBLIC_SUPABASE_URL!, env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, { auth: { persistSession: false } });
  const leak = await anon.from("players").select("name").limit(1);
  ok(!!leak.error || (leak.data ?? []).length === 0, "browser key can't read players (real names stay private)");
  const write = await anon.from("users").insert({ email: "nope@example.com" });
  ok(!!write.error, "browser key can't write");

  console.log("nightly job");
  ok((await call("GET", "/api/cron/recompute")).status === 401, "recompute needs the cron secret");
  const rc = await fetch(`${BASE}/api/cron/recompute`, { headers: { Authorization: `Bearer ${env.CRON_SECRET}` } });
  ok(rc.status === 200, "recompute runs with the secret (also refreshes display names)");

  console.log("privacy");
  let team = await call("GET", `/api/teams/${hh}`);
  ok(team.status === 200, "team page loads");
  ok(!team.text.includes("Tolliver"), "unclaimed full surname never leaves the server");
  ok(team.json.roster.some((r: any) => r.name === "M. T. #44"), "signed-out unclaimed slot is initials and number");
  ok(team.json.captain === null, "no captain yet");
  const lg = team.json.league.id;
  for (const u of ["/api/bootstrap", "/api/feed", "/api/players", "/api/rink", `/api/leagues/${lg}`, `/api/players/${mike}`, "/api/samples"]) {
    const r = await call("GET", u);
    ok(r.status === 200 && !r.text.includes("Tolliver"), `${u} ok and private`);
  }

  console.log("server speed");
  const rink = await call("GET", "/api/rink");
  const rid = rink.json.rink.id;
  const seasonId = rink.json.season?.id;
  okFast("/api/rink", rink);
  const cLeague = rink.json.leagues.find((l: any) => l.level === "C");
  ok(cLeague && cLeague.teams === 8 && cLeague.games === 40 && cLeague.leader?.name === "Hammer'd Heads" && cLeague.leader.pts === 16 && cLeague.leader.gp === 10, "rink leagues list has team count, game count and the leader");
  ok(!rink.json.leagues.some((l: any) => l.level === "DEMO" || l.level === "TOURN"), "rink leagues skip demo and tournament");
  const bulk = await call("GET", `/api/standings?rink=${rid}`);
  okFast(`/api/standings?rink=${rid}`, bulk);
  const bulkSeason = await call("GET", `/api/standings?rink=${rid}&season=${seasonId}`);
  okFast(`/api/standings?rink=${rid}&season=${seasonId}`, bulkSeason);
  ok(bulk.json.seasonId === seasonId && bulk.json.leagues.length === rink.json.leagues.length, "bulk standings defaults to the current season and every real league");
  ok(!bulk.json.leagues.some((l: any) => l.level === "DEMO" || l.level === "TOURN"), "bulk standings skip demo and tournament");
  const bulkC = bulk.json.leagues.find((l: any) => l.level === "C");
  ok(bulkC.standings[0].name === "Hammer'd Heads" && bulkC.standings.find((t: any) => t.name === "Blue Liners").diff === null, "bulk standings match the league page sort, and missing goals stay unknown");
  okFast("/api/feed", await call("GET", "/api/feed"));
  okFast("/api/bootstrap", await call("GET", "/api/bootstrap"));
  okFast(`/api/leagues/${lg}`, await call("GET", `/api/leagues/${lg}`));
  const blIdEarly = (await db`SELECT id FROM teams WHERE name='Blue Liners'`)[0].id as number;
  const inserted: number[] = [];
  for (let i = 1; i <= 12; i++) {
    const day = String(i).padStart(2, "0");
    const [g] = await db`INSERT INTO games (league_id, season_id, home_team_id, away_team_id, played_on, home_score, away_score, source)
      VALUES (${lg}, ${seasonId}, ${hh}, ${blIdEarly}, ${"2026-10-" + day}, 1, 0, 'daysmart') RETURNING id`;
    inserted.push(g.id as number);
  }
  const limited = await call("GET", `/api/leagues/${lg}`);
  okFast(`/api/leagues/${lg} with a long list`, limited);
  ok(limited.json.games.length === 10 && limited.json.games[0].playedOn === "2026-10-12", "a league page shows the latest 10 games");
  const allGames = await call("GET", `/api/leagues/${lg}?games=all`);
  ok(allGames.status === 200 && allGames.json.games.length === 12, "games=all returns the full list");
  await db`DELETE FROM games WHERE id IN ${db(inserted)}`;
  ok((await call("GET", `/api/leagues/${lg}`)).json.games.length === 0, "the extra games are gone");

  console.log("sign-in");
  ok((await call("GET", "/api/me")).status === 401, "signed-out /api/me is 401");
  ok((await call("GET", "/api/me", undefined, "not-a-token")).status === 401, "bad token is 401");
  const graham = await signUp("Graham@Example.com", { name: "Graham DeNoyer", number: "12", position: "F" });
  ok((await call("PATCH", "/api/me", { name: "Graham" }, graham)).status === 400, "one-word name rejected");
  okFast(`/api/leagues/${lg} signed in`, await call("GET", `/api/leagues/${lg}`, undefined, graham));
  okFast("/api/rink signed in", await call("GET", "/api/rink", undefined, graham));
  okFast("/api/bootstrap signed in", await call("GET", "/api/bootstrap", undefined, graham));
  {
    console.log("bootstrap with no current season");
    const region = (await db`SELECT region_id FROM rinks WHERE id=${rid}`)[0].region_id as number;
    const [gapRink] = await db`INSERT INTO rinks (region_id, slug, name) VALUES (${region}, 'no-current-season', 'No Current Season') RETURNING id`;
    const [older] = await db`INSERT INTO seasons (rink_id, name, starts_on, ends_on) VALUES (${gapRink.id}, 'Ancient', '2000-01-01', '2000-03-31') RETURNING id`;
    const [newer] = await db`INSERT INTO seasons (rink_id, name, starts_on, ends_on) VALUES (${gapRink.id}, 'Past', '2020-01-01', '2020-06-30') RETURNING id`;
    const [gapLeague] = await db`INSERT INTO leagues (rink_id, level, name, blurb, season, sort) VALUES (${gapRink.id}, 'C', 'Old C', 'A past season', 'Past', 0) RETURNING id`;
    await db`INSERT INTO teams (league_id, name, color) VALUES (${gapLeague.id}, 'Old Timers', '#112233')`;
    const gapUrl = `/api/bootstrap?rink=${gapRink.id} signed in, no current season`;
    const gapIn = await call("GET", `/api/bootstrap?rink=${gapRink.id}`, undefined, graham);
    okFast(gapUrl, gapIn);
    ok(gapIn.json.season?.id === newer.id && gapIn.json.season.name === "Past", `no season covers today, so bootstrap uses the latest one (expected Past ${newer.id}, actual ${gapIn.json.season?.name} ${gapIn.json.season?.id})`);
    ok(gapIn.json.season?.id !== older.id, "an older season is not the fallback");
    ok(gapIn.json.rink.id === gapRink.id && gapIn.json.leagues.length === 1 && gapIn.json.leagues[0].teams.length === 1 && gapIn.json.counts.games === 0, "that rink still returns its league, team and counts");
    const gapOut = await call("GET", `/api/bootstrap?rink=${gapRink.id}`);
    okFast(`/api/bootstrap?rink=${gapRink.id} signed out, no current season`, gapOut);
    await db`DELETE FROM teams WHERE league_id=${gapLeague.id}`;
    await db`DELETE FROM leagues WHERE id=${gapLeague.id}`;
    await db`DELETE FROM seasons WHERE rink_id=${gapRink.id}`;
    await db`DELETE FROM rinks WHERE id=${gapRink.id}`;
  }
  {
    const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL!, env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, { auth: { persistSession: false } });
    const before = await lastMailId("graham@example.com");
    await new Promise((r) => setTimeout(r, 1500)); // local limit: one code per address per second
    const r = await sb.auth.signInWithOtp({ email: "graham@example.com", options: { shouldCreateUser: true } });
    ok(!r.error, `returning user can request a new code${r.error ? ": " + r.error.message : ""}`);
    const { code } = await latestCode("graham@example.com", before);
    const v = await sb.auth.verifyOtp({ email: "graham@example.com", token: code, type: "email" });
    const again = await call("GET", "/api/me", undefined, v.data.session!.access_token);
    ok(again.json.user.name === "Graham DeNoyer", "signing in again (any letter case) reaches the same account");
  }
  let me = await call("GET", "/api/me", undefined, graham);
  const sug = me.json.suggestions.find((s: any) => s.name === "Graham D.");
  ok(sug && sug.team_id === hh, "suggests the posted 'Graham D.' on Hammer'd Heads");

  console.log("claim and captain");
  ok((await call("POST", `/api/teams/${hh}/captain`, undefined, graham)).status === 403, "can't take captain before claiming a spot");
  ok((await call("POST", `/api/players/${sug.id}/claim`, undefined, graham)).status === 200, "claim the slot");
  team = await call("GET", `/api/teams/${hh}`);
  const mine = team.json.roster.find((r: any) => r.id === sug.id);
  ok(mine.name === "Graham DeNoyer" && mine.registered === true, "claimed slot shows full name and registered");
  ok((await call("POST", `/api/teams/${hh}/captain`, undefined, graham)).status === 200, "take the captain role");
  ok(!(await call("GET", "/api/me", undefined, graham)).json.suggestions.some((s: any) => s.team_id === hh), "once you hold a spot, the same team isn't suggested again");
  const foundSpots = await call("GET", "/api/me/spots?q=hammer", undefined, graham);
  ok(foundSpots.status === 200 && Array.isArray(foundSpots.json.spots), "find your spot by hand, by team name");
  ok((await call("GET", "/api/me/spots?q=x", undefined, graham)).json.spots.length === 0, "one letter isn't a search");
  ok((await call("GET", `/api/teams/${hh}`)).json.captain?.name === "Graham DeNoyer", "team shows the captain");
  const p = await call("GET", `/api/players/${sug.id}`, undefined, graham);
  ok(p.json.player.mine === true && p.json.player.registered === true && p.json.player.name_key === undefined, "player page knows it's mine and hides internals");

  console.log("draft pool and draft");
  const sam = await signUp("sam@example.com", { name: "Sam Okafor", number: "9", position: "D" });
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
  const mt = await signUp("mike@example.com", { name: "Mike Tolliver", number: "44", position: "F" });
  const mtId = (await call("GET", "/api/me", undefined, mt)).json.user.id;
  ok((await call("POST", `/api/teams/${hh}/match`, { playerId: mike, userId: mtId }, graham)).status === 200, "captain matches Mike to the #44 sheet slot");
  team = await call("GET", `/api/teams/${hh}`);
  ok(team.json.roster.find((r: any) => r.id === mike)?.name === "Mike Tolliver", "matched slot shows full name");
  me = await call("GET", "/api/me", undefined, mt);
  ok(me.json.slots.some((s: any) => s.id === mike) && me.json.notifications[0].kind === "match", "Mike sees the slot and a notice");
  ok((await call("POST", `/api/teams/${hh}/slots/${mike}/release`, undefined, graham)).status === 200, "captain releases the match");
  team = await call("GET", `/api/teams/${hh}`);
  ok(team.json.roster.find((r: any) => r.id === mike)?.name === "M. T. #44", "released slot goes back to initials and number");
  const before = team.json.roster.length;
  ok((await call("POST", `/api/teams/${hh}/merge`, { fromId: mikeVariant, intoId: mike }, graham)).status === 200, "merge the #4 spelling variant into #44");
  team = await call("GET", `/api/teams/${hh}`);
  ok(team.json.roster.length === before - 1 && !team.json.roster.some((r: any) => r.id === mikeVariant), "roster has one fewer spot");
  ok((await call("POST", `/api/players/${sug.id}/claim`, undefined, mt)).status === 409, "can't claim a spot someone else holds");
  const manage = await call("GET", `/api/teams/${hh}/manage`, undefined, graham);
  ok(manage.status === 200 && manage.json.actions.length >= 5, "roster history is logged");
  ok((await call("GET", `/api/teams/${hh}/manage`, undefined, mt)).status === 403, "manage view is captain only");

  console.log("hide");
  const jared = team.json.roster.find((r: any) => r.name === "J. A.");
  ok((await call("POST", `/api/players/${jared.id}/hide`, { contact: "x" })).status === 200, "anyone can hide a name without an account");
  ok((await call("GET", `/api/players/${jared.id}`)).json.player.name === "Hidden player", "hidden name is replaced");
  ok((await call("POST", `/api/players/${jared.id}/unhide`, undefined, mt)).status === 403, "only the player or captain can unhide");
  ok((await call("POST", `/api/players/${jared.id}/unhide`, undefined, graham)).status === 200, "captain can unhide");
  ok((await call("PATCH", "/api/me", { hidden: true }, graham)).status === 200, "Graham hides himself");
  ok((await call("GET", `/api/players/${sug.id}`)).json.player.name === "Hidden player", "self-hide applies to the claimed slot");
  await call("PATCH", "/api/me", { hidden: false }, graham);

  console.log("scoresheets");
  const tiny = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=";
  ok((await call("POST", "/api/sheets", { image: tiny })).status === 401, "scanning needs sign-in");
  ok((await call("POST", "/api/sheets", { image: "nope" }, sam)).status === 400, "non-image upload rejected");
  const up = await call("POST", "/api/sheets", { image: tiny }, sam);
  ok(up.status === 202 && up.json.id, "photo upload stored, reading starts in the background");
  const img = await fetch(`${BASE}/api/sheets/${up.json.id}/image`);
  ok(img.status === 200 && img.headers.get("content-type") === "image/png", "photo comes back from private storage");
  let st: any;
  for (let i = 0; i < 50; i++) { st = await call("GET", `/api/sheets/${up.json.id}`); if (st.json.status !== "processing") break; await new Promise((r) => setTimeout(r, 300)); }
  ok(st.json.status === "failed" && st.json.error, "reader failure is recorded, not lost (no API key in CI)");

  // Turn a sheet into a game using the sample's ground truth as the reviewed result.
  const demo = (await db`SELECT id FROM leagues WHERE level='DEMO'`)[0].id;
  const [sheet] = await db`INSERT INTO sheets (image_path,mime,status,source) VALUES ('test/none.jpg','image/jpeg','review','sample') RETURNING id`;
  const data = sheetFromTruth(0);
  const view = await call("GET", `/api/sheets/${sheet.id}`);
  ok(view.status === 200, "sheet view loads");
  await db`UPDATE sheets SET extracted_json=${JSON.stringify(data)} WHERE id=${sheet.id}`;
  const sv = await call("GET", `/api/sheets/${sheet.id}`);
  ok(sv.json.suggestion?.home?.teamId && sv.json.suggestion?.away?.teamId, "reader result is matched to the Demo teams");
  ok((await call("POST", `/api/sheets/${sheet.id}/confirm`, { leagueId: demo, homeTeamId: sv.json.suggestion.home.teamId, awayTeamId: sv.json.suggestion.away.teamId, data })).status === 401, "confirming needs sign-in");
  const conf = await call("POST", `/api/sheets/${sheet.id}/confirm`, { leagueId: demo, homeTeamId: sv.json.suggestion.home.teamId, awayTeamId: sv.json.suggestion.away.teamId, data }, sam);
  ok(conf.status === 200 && conf.json.gameId, "confirming the sheet creates the game");
  const again = await call("POST", `/api/sheets/${sheet.id}/confirm`, { leagueId: demo, homeTeamId: sv.json.suggestion.home.teamId, awayTeamId: sv.json.suggestion.away.teamId, data }, sam);
  ok(again.status === 409, "the same sheet can't be confirmed twice");
  const game = await call("GET", `/api/games/${conf.json.gameId}`);
  ok(game.json.homeScore === 4 && game.json.awayScore === 3, "final score 4-3 from the sheet");
  ok(game.json.lines.length === 19 && game.json.lines.every((l: any) => typeof l.delta === "number"), "19 stat lines, every player rated");
  ok(!game.text.includes("Okafor") && game.json.lines.some((l: any) => l.name === "S. O. #9"), "game page uses initials and number for unclaimed players");
  const scorer = game.json.lines.find((l: any) => l.name === "S. O. #9");
  ok(scorer.goals === 2 && scorer.assists === 1, "#9 has 2 goals and 1 assist");
  const ratingsBefore = await db`SELECT id, rating FROM players ORDER BY id`;
  const rc2 = await fetch(`${BASE}/api/cron/recompute`, { headers: { Authorization: `Bearer ${env.CRON_SECRET}` } });
  const rcj = await rc2.json();
  ok(rc2.status === 200 && rcj.games === 1, "nightly replay rates the one game");
  ok(rcj.backup?.file && rcj.backup.rows > 0 && rcj.backup.tables > 10, `nightly backup written (${JSON.stringify(rcj.backup)})`);
  const ratingsAfter = await db`SELECT id, rating FROM players ORDER BY id`;
  ok(JSON.stringify(ratingsBefore) === JSON.stringify(ratingsAfter), "replay reproduces the same ratings exactly");
  const feed = await call("GET", `/api/feed?league=${demo}`);
  ok(feed.json.games.length === 1 && feed.json.movers.length > 0, "Demo feed shows the game and rating movers");
  ok((await call("GET", "/api/feed")).json.games.length === 0, "Demo games stay out of the main feed");

  console.log("roles: bootstrap admin");
  const boss = await signUp("boss@example.com", { name: "Pat Boss", number: "1", position: "G" });
  let bossMe = await call("GET", "/api/me", undefined, boss);
  ok(bossMe.json.staff === true && bossMe.json.roles.some((r: any) => r.role === "admin"), "BOOTSTRAP_ADMIN_EMAIL becomes admin on first sign-in");
  ok((await call("GET", "/api/me", undefined, graham)).json.roles.every((r: any) => r.role !== "admin"), "nobody else becomes admin");
  ok((await call("GET", "/api/staff/overview", undefined, sam)).status === 403, "staff page is closed to players");
  ok((await call("GET", "/api/staff/overview", undefined, boss)).status === 200, "admin opens the staff page");
  const ids: Record<string, number> = {};
  for (const [k, t] of [["graham", graham], ["sam", sam], ["mike", mt], ["boss", boss]] as const) ids[k] = (await call("GET", "/api/me", undefined, t)).json.user.id;

  console.log("roles: assistants");
  ok((await call("POST", `/api/teams/${hh}/draft`, { userId: ids.sam, number: "9" }, graham)).status === 200, "captain drafts Sam back");
  ok((await call("POST", `/api/teams/${hh}/match`, { playerId: mike, userId: ids.mike }, graham)).status === 200, "captain matches Mike to #44 again");
  ok((await call("POST", `/api/teams/${hh}/draft`, { userId: ids.boss, number: "1" }, graham)).status === 200, "captain drafts Pat");
  ok((await call("POST", `/api/teams/${hh}/assistants`, { userId: ids.sam }, sam)).status === 403, "a player can't name assistants");
  ok((await call("POST", `/api/teams/${hh}/assistants`, { userId: ids.sam }, graham)).status === 200, "captain names Sam assistant");
  ok((await call("POST", `/api/teams/${hh}/assistants`, { userId: ids.mike }, graham)).status === 200, "captain names Mike assistant");
  ok((await call("POST", `/api/teams/${hh}/assistants`, { userId: ids.boss }, graham)).status === 409, "a third assistant is refused");
  team = await call("GET", `/api/teams/${hh}`);
  ok(team.json.assistants.length === 2, "team shows two assistants");
  ok(team.json.roster.some((r: any) => r.name === "Graham DeNoyer" && r.badge === "C") && team.json.roster.some((r: any) => r.name === "Sam Okafor" && r.badge === "A"), "roster shows C and A badges");
  ok((await call("GET", "/api/me", undefined, sam)).json.captainTeams.some((t: any) => t.id === hh && t.role === "assistant_captain"), "Sam sees he's an assistant");
  ok((await call("GET", `/api/teams/${hh}/manage`, undefined, sam)).status === 200, "assistant opens the roster builder");
  ok((await call("GET", "/api/pool", undefined, sam)).status === 200, "assistant sees the draft pool");
  ok((await call("PATCH", `/api/teams/${hh}`, { name: "Hammered" }, sam)).status === 403, "assistant can't rename the team");
  ok((await call("POST", `/api/teams/${hh}/assistants`, { userId: ids.boss }, sam)).status === 403, "assistant can't name assistants");
  const grahamSlot = team.json.roster.find((r: any) => r.name === "Graham DeNoyer").id;
  ok((await call("POST", `/api/teams/${hh}/slots/${grahamSlot}/remove`, undefined, sam)).status === 403, "assistant can't remove the captain");
  ok((await call("POST", `/api/teams/${hh}/slots/${mike}/remove`, undefined, sam)).status === 403, "assistant can't remove another assistant");

  console.log("roles: hand-off and vacancy");
  ok((await call("POST", `/api/teams/${hh}/captain/handoff`, { userId: ids.mike }, sam)).status === 403, "only the captain can hand off");
  ok((await call("POST", `/api/teams/${hh}/captain/handoff`, { userId: ids.mike }, graham)).status === 200, "captain offers the captaincy to Mike");
  const offer = (await call("GET", "/api/me", undefined, mt)).json.handoffs[0];
  ok(offer && offer.team_id === hh, "Mike sees the offer");
  ok((await call("POST", `/api/requests/${offer.id}`, { decision: "accept" }, sam)).status === 403, "someone else can't accept it");
  ok((await call("POST", `/api/requests/${offer.id}`, { decision: "accept" }, mt)).status === 200, "Mike accepts");
  team = await call("GET", `/api/teams/${hh}`);
  ok(team.json.captain?.name === "Mike Tolliver" && team.json.assistants.map((a: any) => a.name).join() === "Sam Okafor", "Mike is captain, Sam still assistant, Graham a player");
  ok((await call("POST", `/api/teams/${hh}/captain/step-down`, undefined, mt)).status === 200, "Mike steps down");
  team = await call("GET", `/api/teams/${hh}`);
  ok(team.json.captain?.name === "Sam Okafor" && team.json.assistants.length === 0, "the longest-serving assistant becomes captain");

  console.log("roles: contest");
  ok((await call("POST", `/api/teams/${hh}/captain`, { message: "I run this team" }, graham)).status === 202, "Graham contests the captaincy");
  const reqs = await call("GET", "/api/staff/requests", undefined, boss);
  const contest = reqs.json.find((r: any) => r.kind === "captain_contest" && r.scope_id === hh);
  ok(contest, "with no rink staff yet, the contest reaches the admin");
  ok((await call("POST", `/api/staff/requests/${contest.id}`, { decision: "approve" }, sam)).status === 403, "the contested captain can't decide it");
  ok((await call("POST", `/api/staff/requests/${contest.id}`, { decision: "approve" }, boss)).status === 200, "admin approves");
  ok((await call("GET", `/api/teams/${hh}`)).json.captain?.name === "Graham DeNoyer", "Graham is captain again");

  console.log("roles: rink staff");
  const rinkId = (await call("GET", "/api/rinks")).json.rinks.find((r: any) => r.name === "Polar Ice Wilmington").id;
  ok((await call("POST", "/api/staff/grants", { email: "mike@example.com", role: "rink_manager", scopeId: rinkId }, graham)).status === 403, "a captain can't make rink managers");
  ok((await call("POST", "/api/staff/grants", { email: "mike@example.com", role: "rink_manager", scopeId: rinkId }, boss)).status === 200, "admin makes Mike rink manager");
  ok((await call("POST", "/api/staff/grants", { email: "nobody@example.com", role: "support" }, boss)).status === 404, "granting to someone who hasn't joined is refused");
  const ov = await call("GET", "/api/staff/overview", undefined, mt);
  ok(ov.status === 200 && ov.json.rinks.length === 1 && ov.json.rinks[0].manage, "rink manager sees his rink");
  ok((await call("POST", "/api/staff/grants", { email: "sam@example.com", role: "scorekeeper", scopeId: rinkId }, mt)).status === 200, "rink manager adds a scorekeeper");
  ok((await call("POST", "/api/staff/grants", { email: "sam@example.com", role: "support" }, mt)).status === 403, "rink manager can't grant system roles");
  ok((await call("POST", "/api/staff/grants", { email: "graham@example.com", role: "scorekeeper", scopeId: rinkId }, sam)).status === 403, "a scorekeeper can't add staff");
  ok((await call("POST", `/api/teams/${hh}/captain/assign`, { userId: ids.sam }, graham)).status === 403, "a captain can't use staff reassignment");
  ok((await call("POST", `/api/teams/${hh}/captain/assign`, { userId: ids.sam }, mt)).status === 200, "rink manager reassigns the captain");
  ok((await call("GET", `/api/teams/${hh}`)).json.captain?.name === "Sam Okafor", "Sam is captain");
  ok((await call("POST", `/api/teams/${hh}/captain/assign`, { userId: ids.graham }, mt)).status === 200, "and back to Graham");
  ok((await call("GET", `/api/staff/audit?rink=${rinkId}`, undefined, mt)).json.length > 0, "rink manager reads his rink's audit log");
  ok((await call("POST", "/api/rink-access", { rinkId, message: "front desk" }, sam)).status === 200, "a player requests rink access");
  const rq = (await call("GET", "/api/staff/requests", undefined, boss)).json.find((r: any) => r.kind === "rink_manager");
  ok(rq && !(await call("GET", "/api/staff/requests", undefined, mt)).json.some((r: any) => r.kind === "rink_manager"), "rink access requests go to admins only");
  ok((await call("POST", `/api/staff/requests/${rq.id}`, { decision: "decline" }, boss)).status === 200, "admin declines it");

  console.log("roles: support");
  ok((await call("GET", "/api/staff/users?q=graham", undefined, graham)).status === 403, "players can't search accounts");
  ok((await call("POST", "/api/staff/grants", { email: "sam@example.com", role: "support" }, boss)).status === 200, "admin makes Sam support");
  const found = await call("GET", "/api/staff/users?q=graham", undefined, sam);
  ok(found.status === 200 && found.json.some((u: any) => u.email === "graham@example.com"), "support finds an account");
  ok((await call("GET", `/api/staff/users/${ids.graham}`, undefined, sam)).json.slots.length > 0, "support sees its roster spots");
  ok((await call("POST", "/api/staff/fix", { action: "hide", playerId: jared.id }, sam)).status === 200, "support hides a name on request");
  ok((await call("GET", `/api/players/${jared.id}`)).json.player.name === "Hidden player", "the name is hidden");
  await call("POST", "/api/staff/fix", { action: "unhide", playerId: jared.id }, sam);
  ok((await call("PATCH", `/api/teams/${hh}`, { name: "Support FC" }, sam)).status === 403, "support can't change hockey data");
  ok((await call("POST", "/api/staff/recompute", undefined, sam)).status === 403, "support can't run the rating job");

  console.log("roles: account move");
  const oldAcct = await signUp("old@example.com", { name: "Ollie Old", number: "77", position: "F" });
  const oldId = (await call("GET", "/api/me", undefined, oldAcct)).json.user.id;
  ok((await call("POST", `/api/teams/${hh}/draft`, { userId: oldId, number: "77" }, graham)).status === 200, "Ollie is on the roster");
  const newAcct = await signUp("new@example.com", { name: "Ollie Old", number: "77", position: "F" });
  ok((await call("POST", "/api/staff/merges", { fromUserId: oldId, toEmail: "new@example.com", now: true }, sam)).status === 403, "support can't skip the hold");
  const mv = await call("POST", "/api/staff/merges", { fromUserId: oldId, toEmail: "new@example.com" }, sam);
  ok(mv.status === 200 && !mv.json.ran && new Date(mv.json.runAfter).getTime() - Date.now() > 23 * 3600e3, "support starts a move with a 24-hour hold");
  ok((await call("GET", "/api/me", undefined, newAcct)).json.slots.length === 0, "nothing moves during the hold");
  ok((await call("POST", "/api/staff/merges", { runId: mv.json.id }, boss)).status === 200, "admin runs it now");
  ok((await call("GET", "/api/me", undefined, newAcct)).json.slots.some((s: any) => s.team_id === hh && s.number === "77"), "the roster spot moved to the new account");
  ok((await call("GET", "/api/me", undefined, oldAcct)).status === 410, "the old account can't be signed into");

  console.log("roles: admin limits");
  const myAdmin = (await call("GET", "/api/me", undefined, boss)).json.roles.find((r: any) => r.role === "admin");
  ok((await call("DELETE", `/api/staff/grants?id=${myAdmin.id}`, undefined, boss)).status === 400, "the last admin can't remove themselves");
  ok((await call("POST", "/api/staff/recompute", undefined, boss)).status === 200, "admin runs the rating job");

  console.log("import: DaySmart report (made-up names)");
  const report = [
    "RAW REPORT - Test (DaySmart name: 'Hammered Heads'), C League, Adult Hockey Fall 2026, Polar Ice Wilmington",
    "",
    "GAME 2026-09-06 3:00 PM | Home: Hammered Heads 3 | Away: Blue Liners 1 | Final | OT/shootout: not shown",
    "GOAL not shown",
    "PLAYERROW Hammered Heads | Adam Y. G2 A1  (G=goals A=assists SA=shots against; assist type not shown)",
    "PLAYERROW Opponent | Zed Q. G1 SA1  (G=goals A=assists SA=shots against; assist type not shown)",
    "TOTALS HH totals: G3 A1",
    "",
    "GAME 2026-08-23 4:30 PM | Home: Wild Puckers 0 | Away: Hammered Heads 2 | Final | OT/shootout: not shown",
    "PLAYERROW Hammered Heads | Jared A. G1",
    "",
    "TEAM STATS (ignored)",
    "Adam Y. | 1 | 2 | 1 | 3 | 0",
    "",
    "ROSTERS (number/position not shown on page)",
    "Hammered Heads",
    "  Adam Y.",
    "  Jared A.",
    "Blue Liners",
    "  Zed Q.",
    "  ANA BELL",
    "Wild Puckers",
    "  Yuri P.",
    "Not A Real Team FC",
    "  Nobody N.",
  ].join("\n");
  const hhBefore = (await call("GET", `/api/teams/${hh}`)).json;
  const ptsOf = async (name: string) => (await call("GET", `/api/leagues/${lg}`)).json.leaders.find((x: any) => x.name === name)?.pts ?? 0;
  const adamPts = await ptsOf("A. Y.");
  ok((await call("POST", "/api/staff/import", { text: report, rinkId, apply: true }, graham)).status === 403, "a captain can't import");
  const pv = await call("POST", "/api/staff/import", { text: report, rinkId }, mt);
  ok(pv.status === 200 && pv.json.applied === false && pv.json.summary.gamesAdded === 2, "rink manager previews: 2 games");
  ok(pv.json.summary.rosterAdded === 4 && pv.json.summary.rosterExisting === 2, "preview: 4 new roster spots, 2 already here");
  ok(pv.json.summary.teamsCreated.includes("Not A Real Team FC") && !pv.json.summary.leagueCreated, "preview shows a team the league doesn't have yet as new");
  ok(pv.json.summary.unassigned.some((u: any) => u.team === "Hammer'd Heads" && u.goals === 1), "preview counts goals with no scorer");
  ok(!(await call("GET", `/api/teams/${hh}`)).json.games.some((g: any) => g.source === "daysmart"), "preview saves nothing");
  const ap = await call("POST", "/api/staff/import", { text: report, rinkId, apply: true }, mt);
  ok(ap.status === 200 && ap.json.applied && ap.json.summary.gamesAdded === 2, "import applied");
  let after = (await call("GET", `/api/teams/${hh}`)).json;
  ok(after.games.filter((g: any) => g.source === "daysmart").length === 2, "imported games show on the team page");
  ok(JSON.stringify(after.record) === JSON.stringify(hhBefore.record), "standings don't count imported games twice");
  ok((await ptsOf("A. Y.")) === adamPts, "season points don't count imported games twice");
  const blRoster = (await call("GET", `/api/teams/${(await db`SELECT id FROM teams WHERE name='Blue Liners'`)[0].id}`)).json.roster;
  ok(blRoster.some((r: any) => r.name === "Z. Q.") && blRoster.some((r: any) => r.name === "A. B."), "opponent roster spots added, all-caps fixed, shown as initials when signed out");
  const ig = after.games.find((g: any) => g.playedOn === "2026-09-06");
  const igPage = await call("GET", `/api/games/${ig.id}`);
  ok(igPage.json.source === "daysmart" && igPage.json.imported.some((l: any) => l.name === "A. Y." && l.goals === 2 && l.assists === 1), "game page lists credited scorers");
  ok(igPage.json.unassigned.home === 1 && igPage.json.unassigned.away === 0, "game page counts the goal with no scorer");
  const adamId = after.roster.find((r: any) => r.name === "A. Y.").id;
  ok((await call("GET", `/api/players/${adamId}`)).json.importedGames.length === 1, "player page shows the game log");
  const reimport = await call("POST", "/api/staff/import", { text: report, rinkId, apply: true }, mt);
  ok(reimport.json.summary.gamesAdded === 0 && reimport.json.summary.gamesUpdated === 2 && reimport.json.summary.rosterAdded === 0 && reimport.json.summary.teamsCreated.length === 0, "importing again changes nothing new");

  console.log("import: a whole league with standings and season totals");
  const leagueReport = [
    "RAW REPORT - Polar Ice Wilmington, all teams",
    "LEAGUE B League | LEVEL B | SEASON Fall 2026",
    "STANDINGS",
    "TEAMROW Port City Pilots | GP 4 | W 3 | L 1 | T 0 | OTL 0 | GF 15 | GA 8",
    "TEAMROW Azalea Aces | GP 4 | W 1 | L 3 | T 0 | OTL 0 | GF 8 | GA 15",
    "GAME 2026-10-04 8:00 PM | Home: Port City Pilots 5 | Away: Azalea Aces 2 | Final",
    "PLAYERROW Port City Pilots | SAM T G2 A1",
    "PLAYERROW Azalea Aces | Lee R. G1",
    "PLAYERTOTALS",
    "TOTALROW Port City Pilots | Sam T. | GP 4 | G 6 | A 2 | PIM 4",
    "TOTALROW Azalea Aces | Lee R. | GP 4 | G 3 | A 0 | PIM 0",
    "ROSTERS",
    "Port City Pilots",
    "  Sam T.",
    "  Kim W.",
    "Azalea Aces",
    "  Lee R.",
    "  Gil K. (G)",
  ].join("\n");
  const lp = await call("POST", "/api/staff/import", { text: leagueReport, rinkId }, mt);
  ok(lp.status === 200 && lp.json.summary.leagueCreated && lp.json.summary.teamsCreated.length === 2 && lp.json.summary.standingsRows === 2 && lp.json.summary.playerTotals === 2, "preview: new league, 2 new teams, standings and totals read");
  ok(!(await db`SELECT 1 FROM leagues WHERE level='B'`).length, "preview creates nothing");
  ok((await call("POST", "/api/staff/import", { text: leagueReport, rinkId, apply: true }, mt)).status === 200, "league imported");
  const bLg = (await db`SELECT id FROM leagues WHERE level='B'`)[0].id;
  const bl2 = (await call("GET", `/api/leagues/${bLg}`)).json;
  const pcp = bl2.standings.find((t: any) => t.name === "Port City Pilots");
  ok(pcp && pcp.gp === 4 && pcp.w === 3 && pcp.l === 1 && pcp.pts === 6 && pcp.diff === 7, "standings come straight from the league page, with DIFF");
  ok(bl2.standings[0].name === "Port City Pilots", "sorted by points");
  const aces = bl2.standings.find((t: any) => t.name === "Azalea Aces");
  ok((await call("GET", `/api/teams/${aces.id}`)).json.roster.find((r: any) => r.name === "G. K.")?.position === "G", "a roster name marked (G) comes in as a goalie");
  ok(bl2.leaders.find((x: any) => x.name === "S. T.")?.pts === 8, "season totals come from the league page, not just the games listed");
  ok((await call("POST", "/api/staff/import", { text: leagueReport, rinkId, apply: true }, mt)).json.summary.teamsCreated.length === 0, "importing the league again adds no teams");
  const bl3 = (await call("GET", `/api/leagues/${bLg}`)).json;
  ok(bl3.standings.find((t: any) => t.name === "Port City Pilots").gp === 4 && bl3.leaders.find((x: any) => x.name === "S. T.").pts === 8, "and doesn't double anything");

  console.log("import: every league picks a skill level");
  const mk = (head: string, team1: string, team2: string) => ["RAW REPORT - Polar Ice Wilmington", head, "STANDINGS",
    `TEAMROW ${team1} | GP 1 | W 1 | L 0 | T 0 | OTL 0 | GF 3 | GA 1`, `TEAMROW ${team2} | GP 1 | W 0 | L 1 | T 0 | OTL 0 | GF 1 | GA 3`,
    `GAME 2026-10-05 8:30 PM | Home: ${team1} 3 | Away: ${team2} 1 | Final`, "ROSTERS", team1, "  Al One.", "", team2, "  Bo Two."].join("\n");
  const over40 = mk("LEAGUE 40+ League | LEVEL 40+ | SEASON Fall 2026", "E-Ride", "Dockside");
  const p40 = await call("POST", "/api/staff/import", { text: over40, rinkId }, mt);
  ok(p40.status === 200 && p40.json.summary.needsLevel && p40.json.summary.tag === "40+", "40+ is an age tag, so the preview asks for a skill level");
  ok((await call("POST", "/api/staff/import", { text: over40, rinkId, apply: true }, mt)).status === 400, "it won't import without one");
  ok((await call("POST", "/api/staff/import", { text: over40, rinkId, apply: true, level: "B" }, mt)).status === 200, "imported at B");
  ok((await db`SELECT level, tag FROM leagues WHERE name='40+ League'`)[0].level === "B" && (await db`SELECT tag FROM leagues WHERE name='40+ League'`)[0].tag === "40+", "stored as level B, tag 40+");
  ok((await call("POST", "/api/staff/import", { text: mk("LEAGUE Monday A League | LEVEL A | SEASON Fall 2026", "ConeHeads", "Mermen"), rinkId, apply: true }, mt)).status === 200, "Monday A League in");
  ok((await call("POST", "/api/staff/import", { text: mk("LEAGUE Sunday A/B League | LEVEL OTHER | SEASON Fall 2026", "Kraken Beers", "Dirty Birds"), rinkId, apply: true, level: "A" }, mt)).status === 200, "Sunday A/B in at A");
  const aLeagues = await db`SELECT name FROM leagues WHERE level='A' ORDER BY name`;
  ok(aLeagues.length === 2 && aLeagues.some((l: any) => l.name === "Sunday A/B League") && aLeagues.some((l: any) => l.name === "Monday A League"), "two A leagues stay separate, matched by name");
  ok((await call("POST", `/api/rinks/${rinkId}/leagues`, { name: "Wednesday Whatever" }, mt)).status === 400, "adding a league needs a skill level");

  console.log("shot map");
  const outsider = await signUp("outsider@example.com", { name: "Otto Side", number: "3", position: "D" });
  ok((await call("GET", `/api/teams/${hh}/shotmap`)).status === 401, "shot map needs sign-in");
  ok((await call("GET", `/api/teams/${hh}/shotmap`, undefined, outsider)).status === 403, "other players can't see a team's shot map");
  ok((await call("GET", `/api/teams/${hh}/shotmap`, undefined, boss)).status === 200, "admin on the roster sees it as a player");
  const sm = await call("GET", `/api/teams/${hh}/shotmap`, undefined, graham);
  ok(sm.status === 200 && sm.json.sample === true && sm.json.points.every((p: any) => p.sample), "team sees the map, every spot marked sample");
  ok(sm.json.points.filter((p: any) => p.kind === "goal").length === 3 && sm.json.points.filter((p: any) => p.kind === "assist").length === 1, "one spot per credited goal and assist");
  ok(sm.json.points.every((p: any) => p.x >= 0 && p.x <= 100 && p.y >= 0 && p.y <= 100), "spots land on the ice");
  const sm2 = await call("GET", `/api/teams/${hh}/shotmap`, undefined, graham);
  ok(JSON.stringify(sm2.json.points) === JSON.stringify(sm.json.points), "the same goal always lands in the same spot");

  console.log("import: a real sheet replaces the imported game");
  const blId = (await db`SELECT id FROM teams WHERE name='Blue Liners'`)[0].id;
  const [sh2] = await db`INSERT INTO sheets (image_path,mime,status,source) VALUES ('test/none.jpg','image/jpeg','review','upload') RETURNING id`;
  const real = {
    is_scoresheet: true, date: "2026-09-06", time: "3:00 PM", league_text: "C", rink_text: null, confidence: 0.9, notes: [],
    home: { name: "Hammer'd Heads", roster: [{ number: "19", name: "Adam Young", position: null }, { number: "7", name: "Jared Anders", position: null }, { number: "30", name: "Gus Goalie", position: "G" }],
      goals: [{ period: 1, time: "10:00", scorer: "19", assist1: null, assist2: null }, { period: 2, time: "9:00", scorer: "19", assist1: "7", assist2: null }, { period: 3, time: "5:00", scorer: "7", assist1: "19", assist2: null }],
      penalties: [], shots_by_period: [9, 9, 9], score_by_period: [1, 1, 1], total: 3 },
    away: { name: "Blue Liners", roster: [{ number: "5", name: "Zed Quill", position: null }, { number: "31", name: "Gil Keeper", position: "G" }],
      goals: [{ period: 2, time: "4:00", scorer: "5", assist1: null, assist2: null }], penalties: [], shots_by_period: [5, 5, 5], score_by_period: [0, 1, 0], total: 1 },
  };
  await db`UPDATE sheets SET extracted_json=${JSON.stringify(real)} WHERE id=${sh2.id}`;
  const sv2 = (await call("GET", `/api/sheets/${sh2.id}`)).json;
  ok(sv2.suggestion.duplicateGameId === null, "an imported game isn't flagged as already scanned");
  ok((await call("POST", `/api/sheets/${sh2.id}/confirm`, { leagueId: lg, homeTeamId: hh, awayTeamId: blId, data: real }, outsider)).status === 403, "a player who isn't a captain of either team can't confirm");
  const sub2 = await call("POST", `/api/sheets/${sh2.id}/submit`, { leagueId: lg, homeTeamId: hh, awayTeamId: blId, data: real }, outsider);
  ok(sub2.status === 200 && sub2.json.told >= 1, "they send it to the captains instead");
  const aw = (await call("GET", `/api/sheets/${sh2.id}`, undefined, graham)).json;
  ok(aw.status === "awaiting" && aw.submitted?.by === "Otto Side" && aw.suggestion.home.teamId === hh && aw.rights.teams.includes(hh), "the captain sees it waiting, with the sender's picks, and can confirm");
  ok((await call("GET", "/api/me", undefined, graham)).json.notifications.some((n: any) => n.kind === "sheet" && n.link === `/sheet/${sh2.id}`), "and got a notice");
  const c2 = await call("POST", `/api/sheets/${sh2.id}/confirm`, { leagueId: lg, homeTeamId: hh, awayTeamId: blId, data: real }, graham);
  ok(c2.status === 200, "the real sheet goes in");
  after = (await call("GET", `/api/teams/${hh}`)).json;
  ok(!after.games.some((g: any) => g.source === "daysmart" && g.playedOn === "2026-09-06") && after.games.some((g: any) => g.id === c2.json.gameId), "it replaced the imported game");
  ok(after.roster.filter((r: any) => r.name === "A. Y. #19").length === 1 && after.roster.find((r: any) => r.name === "A. Y. #19").number === "19", "\"Adam Young\" #19 on the sheet is the imported \"Adam Y.\" spot, no duplicate");
  ok(after.record.w === hhBefore.record.w && after.record.l === hhBefore.record.l && after.record.gp === hhBefore.record.gp, "record still adds up: the game moved from the baseline to the sheet");
  ok((await ptsOf("A. Y. #19")) === adamPts, "Adam's points still add up (2G 1A, counted once)");

  console.log("schedule: calendar feed and hand-added games");
  const ymd = (days: number) => new Date(Date.now() + days * 86400000).toISOString().slice(0, 10).replace(/-/g, "");
  let feedEvents = [
    ["a1@polarwil", `DTSTART;TZID=America/New_York:${ymd(3)}T211500`, "Hammered Heads vs Blue Liners", "Polar Ice Wilmington\\, Rink 1"],
    ["a2@polarwil", `DTSTART;TZID=America/New_York:${ymd(10)}T221500`, "Hammered Heads @ Wild Puckers", ""],
    ["p1@polarwil", `DTSTART;TZID=America/New_York:${ymd(-7)}T210000`, "Hammered Heads W 6-0 vs Blue Liners", ""],
  ];
  const ics = () => ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//test//EN",
    ...feedEvents.flatMap(([uid, start, sum, loc]) => ["BEGIN:VEVENT", `UID:${uid}`, start, `SUMMARY:${sum}`, ...(loc ? [`LOCATION:${loc}`] : []),
      "DESCRIPTION:A long description that the feed folds onto a second line so the reader has to", " join it back together", "END:VEVENT"]),
    "END:VCALENDAR"].join("\r\n");
  const feedSrv = createServer((req, res) => {
    if (req.url === "/team.ics") { res.writeHead(200, { "content-type": "text/calendar" }); res.end(ics()); }
    else { res.writeHead(200, { "content-type": "text/html" }); res.end("<html>not a calendar</html>"); }
  });
  await new Promise<void>((r) => feedSrv.listen(3197, r));
  const feedLink = "http://localhost:3197/team.ics";
  const fan = await signUp("fan@example.com", { name: "Fran Fan", number: "88", position: "W" });
  ok((await call("PUT", `/api/teams/${hh}/feed`, { url: feedLink }, fan)).status === 403, "a player can't connect the team calendar");
  ok((await call("PUT", `/api/teams/${hh}/feed`, { url: "ftp://nope" }, boss)).status === 400, "a link that isn't web or webcal is refused");
  const notCal = await call("PUT", `/api/teams/${hh}/feed`, { url: "http://localhost:3197/page" }, boss);
  ok(notCal.status === 400 && /calendar/i.test(notCal.json.message), "a page that isn't a calendar is refused with a clear message");
  const fc = await call("PUT", `/api/teams/${hh}/feed`, { url: feedLink }, boss);
  ok(fc.status === 200 && fc.json.events === 3 && fc.json.added === 3, "calendar connected: 3 games read");
  let sch = await call("GET", `/api/teams/${hh}/schedule`);
  ok(sch.status === 200 && sch.json.games.length === 2, "the schedule shows the 2 upcoming games, not the one already played");
  ok(sch.json.feed === null && !sch.text.includes("3197"), "the calendar link never reaches the public");
  const [g1, g2] = sch.json.games;
  ok(g1.opponent === "Blue Liners" && g1.opponent_team_id === blId && g1.local_time === "9:15 PM", "\"vs Blue Liners\" at 9:15 PM matches the league team");
  ok(g1.location === "Polar Ice Wilmington, Rink 1", "location read, escaped comma and all");
  ok(g2.opponent === "Wild Puckers" && g2.is_home === false && g2.local_time === "10:15 PM", "\"@ Wild Puckers\" is an away game at 10:15 PM");
  ok((await call("GET", `/api/teams/${hh}/schedule`, undefined, boss)).json.feed.connected === true, "the captain side sees the calendar is connected");
  const reread = await call("POST", `/api/teams/${hh}/feed`, undefined, boss);
  ok(reread.status === 200 && reread.json.added === 0 && reread.json.updated === 3, "reading it again adds no duplicates");
  feedEvents = feedEvents.filter(([uid]) => uid !== "a2@polarwil");
  ok((await call("POST", `/api/teams/${hh}/feed`, undefined, boss)).json.removed === 1, "a game dropped from the calendar comes off the schedule");
  ok((await call("POST", `/api/teams/${hh}/schedule`, { date: "2026-12-01", opponentName: "Raleigh Rebels", kind: "tournament" }, fan)).status === 403, "a player can't add games");
  const plus5 = ymd(5);
  const man = await call("POST", `/api/teams/${hh}/schedule`, { date: `${plus5.slice(0, 4)}-${plus5.slice(4, 6)}-${plus5.slice(6)}`, time: "19:30", opponentName: "Raleigh Rebels", kind: "tournament", location: "Wake Competition Center" }, boss);
  ok(man.status === 200, "a tournament game added by hand");
  sch = await call("GET", `/api/teams/${hh}/schedule`);
  const tg = sch.json.games.find((g: any) => g.id === man.json.id);
  ok(sch.json.games.length === 2 && sch.json.games[1].id === man.json.id && tg.local_time === "7:30 PM" && tg.kind === "tournament" && tg.opponent === "Raleigh Rebels", "it sits in date order at 7:30 PM as a tournament game");
  console.log("availability: in, out, late");
  const rs = (t?: string) => call("GET", `/api/teams/${hh}/schedule`, undefined, t).then((r) => r.json.games.find((g: any) => g.id === man.json.id).rsvp);
  ok((await call("PUT", `/api/schedule/${man.json.id}/rsvp`, { answer: "in" }, fan)).status === 403, "only players on the roster can answer");
  ok((await call("PUT", `/api/schedule/${man.json.id}/rsvp`, { answer: "maybe" }, graham)).status === 400, "only in, out or late");
  ok((await call("PUT", `/api/schedule/${man.json.id}/rsvp`, { answer: "in" }, graham)).status === 200, "Graham is in");
  ok((await call("PATCH", "/api/me", { status: "ir", statusUntil: "2099-01-01" }, sam)).json.user.status === "ir", "Sam goes on injured reserve");
  let samView = await rs(sam);
  ok(samView.mine === "out" && samView.mineAuto === true, "injured reserve marks Sam out without him answering");
  const capView = await rs(graham);
  ok(capView.counts.in >= 1 && capView.counts.out >= 1 && capView.names.in.length === capView.counts.in, "the team sees the count and who's in");
  ok((await rs()).names === null && (await rs()).counts.in >= 1, "the public sees counts, not names");
  ok((await call("PUT", `/api/schedule/${man.json.id}/rsvp`, { answer: "late" }, sam)).status === 200, "Sam answers Late anyway");
  samView = await rs(sam);
  ok(samView.mine === "late" && !samView.mineAuto, "his own answer wins");
  ok((await call("PATCH", "/api/me", { status: "away", statusUntil: "2000-01-01" }, sam)).json.user.status === "active", "an Away date in the past is already over");
  const sw = await call("PATCH", "/api/me", { lookingForTeam: true, willSub: true }, sam);
  ok(sw.json.user.lookingForTeam === true && sw.json.user.willSub === true, "Looking for a team and Will sub switches");
  ok((await call("PATCH", "/api/me", { status: "resting" }, sam)).status === 400, "Resting is gone");
  await call("PATCH", "/api/me", { status: "active" }, sam);

  console.log("archetypes: voted by teammates");
  const hhNow = (await call("GET", `/api/teams/${hh}`, undefined, graham)).json;
  const samSlot = hhNow.roster.find((r: any) => r.name === "Sam Okafor");
  const grahamRow = hhNow.roster.find((r: any) => r.name === "Graham DeNoyer");
  ok(samSlot && grahamRow && hhNow.archetypes.voter === true, "teammates can vote");
  ok((await call("PUT", `/api/teams/${hh}/archetypes`, { playerId: grahamRow.id, archetype: "sniper" }, graham)).status === 400, "you can't pick your own");
  ok((await call("PUT", `/api/teams/${hh}/archetypes`, { playerId: samSlot.id, archetype: "sniper" }, fan)).status === 403, "only teammates vote");
  ok((await call("PUT", `/api/teams/${hh}/archetypes`, { playerId: samSlot.id, archetype: "wizard" }, graham)).status === 400, "only the listed archetypes");
  ok((await call("PUT", `/api/teams/${hh}/archetypes`, { playerId: samSlot.id, archetype: "sniper" }, graham)).status === 200, "Graham votes Sam a Sniper");
  ok(!(await call("GET", `/api/teams/${hh}`)).json.archetypes.won[samSlot.id], "one vote isn't enough to show");
  ok(hhNow.archetypes.minVotes === (hhNow.roster.length >= 12 ? 3 : 2), "3 votes needed on a roster of 12 or more, 2 below");
  ok((await call("PUT", `/api/teams/${hh}/archetypes`, { playerId: samSlot.id, archetype: "sniper" }, boss)).status === 200, "a second teammate agrees");
  const need = hhNow.archetypes.minVotes;
  if (need === 3) ok((await call("PUT", `/api/teams/${hh}/archetypes`, { playerId: samSlot.id, archetype: "sniper" }, mt)).status === 200, "a third teammate agrees");
  const won = (await call("GET", `/api/teams/${hh}`)).json.archetypes.won[samSlot.id];
  ok(won?.archetype === "sniper" && won.votes === need, "Sam shows as a Sniper");
  ok((await call("PUT", `/api/teams/${hh}/archetypes`, { playerId: samSlot.id, archetype: "sniper" }, graham)).status === 200 && (await call("GET", `/api/teams/${hh}`)).json.archetypes.won[samSlot.id].votes === need, "voting again doesn't count twice");
  const pp = (await call("GET", `/api/players/${samSlot.id}`, undefined, graham)).json;
  const ppa = pp.archetypes.find((x: any) => x.teamId === hh);
  ok(ppa && ppa.won.archetype === "sniper" && ppa.mine === "sniper" && ppa.canVote, "the player page shows it, and your vote to change");
  ok(pp.archetype?.archetype === "sniper" && !pp.archetype.self, "the player card shows his archetype");
  ok((await call("GET", `/api/players/${samSlot.id}`, undefined, sam)).json.archetypes.find((x: any) => x.teamId === hh).canVote === false, "but not on your own page");
  ok((await call("PUT", `/api/teams/${hh}/archetypes`, { playerId: samSlot.id, archetype: "playmaker" }, graham)).status === 200, "anyone can change their vote any time");
  ok((await call("GET", `/api/players/${samSlot.id}`, undefined, graham)).json.archetypes.find((x: any) => x.teamId === hh).mine === "playmaker", "the change sticks");

  console.log("archetypes: the admin picks his own");
  ok((await call("PATCH", "/api/me", { archetypeSelf: "sniper" }, sam)).status === 403, "a player can't pick his own");
  ok((await call("PATCH", "/api/me", { archetypeSelf: "wizard" }, boss)).status === 400, "only the listed archetypes");
  const bossSet = await call("PATCH", "/api/me", { archetypeSelf: "bender" }, boss);
  ok(bossSet.status === 200 && bossSet.json.user.archetypeSelf === "bender", "the system admin picks Bender for himself");
  const bossPid = (await db`SELECT p.id FROM players p JOIN users u ON u.id=p.user_id WHERE u.email='boss@example.com'`)[0].id;
  const bossCard = (await call("GET", `/api/players/${bossPid}`)).json;
  ok(bossCard.archetype?.archetype === "bender" && bossCard.archetype.self === true, "his card shows it, marked as his own pick");
  ok((await call("GET", `/api/teams/${hh}`)).json.archetypes.won[bossPid]?.archetype === "bender", "the roster shows it too");
  ok((await call("PATCH", "/api/me", { archetypeSelf: null }, boss)).json.user.archetypeSelf === null, "and he can hand it back to the team");

  console.log("bobblehead");
  const av = await call("PATCH", "/api/me", { avatar: { skin: 4, hair: 2, helmet: "#EEF3F8", guard: "visor", beard: "full", style: "flow", eyeBlack: true } }, sam);
  ok(av.status === 200 && av.json.user.avatar.guard === "visor" && av.json.user.avatar.style === "flow", "Sam builds his bobblehead");
  const bad = await call("PATCH", "/api/me", { avatar: { skin: 99, helmet: "javascript:x", guard: "mask" } }, sam);
  ok(bad.json.user.avatar.skin === 2 && bad.json.user.avatar.helmet === "team" && bad.json.user.avatar.guard === "cage", "unknown parts fall back to the defaults");
  ok((await call("GET", `/api/teams/${hh}`)).json.roster.find((r: any) => r.id === samSlot.id).avatar?.guard === "cage", "the roster carries it");
  ok((await call("DELETE", `/api/teams/${hh}/schedule/${g1.id}`, undefined, boss)).status === 400, "a calendar game can't be deleted, only marked canceled");
  ok((await call("PATCH", `/api/teams/${hh}/schedule/${g1.id}`, { status: "canceled" }, boss)).status === 200, "marked canceled");
  ok((await call("GET", `/api/teams/${hh}/schedule`)).json.games.find((g: any) => g.id === g1.id).status === "canceled", "shows as canceled");
  ok((await call("DELETE", `/api/teams/${hh}/schedule/${man.json.id}`, undefined, boss)).status === 200, "a hand-added game can be removed");
  const dc = await call("DELETE", `/api/teams/${hh}/feed`, undefined, boss);
  ok(dc.status === 200 && dc.json.removed === 1 && (await call("GET", `/api/teams/${hh}/schedule`)).json.games.length === 0, "disconnecting takes its upcoming games off");
  ok((await db`SELECT COUNT(*)::int c FROM team_feeds`)[0].c === 0, "the link is deleted");
  feedSrv.close();

  console.log("manage: new rinks, leagues, seasons and teams");
  const dupRink = await call("POST", "/api/rink-requests", { name: "Polar Ice", city: "Wilmington", state: "NC" }, fan);
  ok(dupRink.status === 409 && dupRink.json.matches.some((m: any) => /Polar Ice/.test(m.name)), "asking for a rink that's already here points to it");
  const rq1 = await call("POST", "/api/rink-requests", { name: "Cape Fear Ice Arena", city: "Fayetteville", state: "NC", website: "capefearice.com", manage: true, role: "hockey_director" }, fan);
  ok(rq1.status === 200 && rq1.json.requested, "a player asks to add a rink and manage it");
  ok(!(await call("GET", "/api/staff/requests", undefined, mt)).json.some((r: any) => r.kind === "new_rink"), "new rinks go to admins, not rink managers");
  const rqBoss = (await call("GET", "/api/staff/requests", undefined, boss)).json.find((r: any) => r.kind === "new_rink");
  ok(rqBoss && rqBoss.details.manage && rqBoss.details.emailOnDomain === false, "the admin sees it, and that the email isn't on the rink's domain");
  ok((await call("POST", `/api/staff/requests/${rqBoss.id}`, { decision: "approve" }, boss)).status === 400, "a manager can't be approved before a check");
  ok((await call("POST", `/api/staff/requests/${rqBoss.id}/phone`, undefined, boss)).status === 200, "admin records the call to the rink");
  const ap1 = await call("POST", `/api/staff/requests/${rqBoss.id}`, { decision: "approve" }, boss);
  ok(ap1.status === 200 && ap1.json.rinkId, "rink created");
  const cfRink = ap1.json.rinkId;
  ok((await call("GET", "/api/me", undefined, fan)).json.roles.some((r: any) => r.role === "rink_manager" && r.scopeId === cfRink), "and the requester runs it");
  ok((await db`SELECT COUNT(*)::int c FROM seasons WHERE rink_id=${cfRink}`)[0].c === 1, "a new rink starts with the current season");
  ok((await call("POST", `/api/rinks/1/leagues`, { level: "B" }, fan)).status === 403, "a rink manager can't add leagues at someone else's rink");
  const nl = await call("POST", `/api/rinks/${cfRink}/leagues`, { level: "C" }, fan);
  ok(nl.status === 200, "rink manager adds a C League");
  ok((await call("POST", `/api/rinks/${cfRink}/leagues`, { level: "C" }, fan)).status === 409, "the same league twice is refused");
  const nt = await call("POST", `/api/leagues/${nl.json.id}/teams`, { name: "Cape Fear Cubs" }, fan);
  ok(nt.status === 200, "and a team");
  ok((await call("POST", `/api/leagues/${nl.json.id}/teams`, { name: "Cape Fear Cubs" }, fan)).status === 409, "the same team twice is refused");
  ok((await call("POST", `/api/rinks/${cfRink}/seasons`, { name: "Overlap", startsOn: "2026-10-01", endsOn: "2026-10-31" }, fan)).status === 409, "a season that overlaps another is refused");
  ok((await call("POST", `/api/rinks/${cfRink}/seasons`, { name: "Winter 2027", startsOn: "2027-01-01", endsOn: "2027-04-30" }, fan)).status === 200, "a new season");
  ok((await call("PATCH", `/api/rinks/${cfRink}`, { phone: "910-555-0100", sheets: 2 }, fan)).status === 200, "rink profile edited");
  const lgPage = (await call("GET", `/api/leagues/${nl.json.id}`, undefined, fan)).json;
  ok(lgPage.can.addTeam === true && (await call("GET", `/api/leagues/${nl.json.id}`, undefined, sam)).json.can.addTeam === false, "the league page shows + Team only to staff");
  const tr = await call("POST", "/api/team-requests", { leagueId: nl.json.id, name: "Sam's Squad", captain: true }, sam);
  ok(tr.status === 200 && tr.json.requested, "a player asks to start a team");
  const trq = (await call("GET", "/api/staff/requests", undefined, fan)).json.find((r: any) => r.kind === "new_team");
  ok(trq && trq.details.name === "Sam's Squad", "it goes to that rink's staff");
  const tra = await call("POST", `/api/staff/requests/${trq.id}`, { decision: "approve" }, fan);
  ok(tra.status === 200 && tra.json.teamId, "approved");
  ok((await call("GET", "/api/me", undefined, sam)).json.roles.some((r: any) => r.role === "captain" && r.scopeId === tra.json.teamId), "the player who started it is its captain");
  ok((await call("GET", `/api/teams/${nt.json.id}`, undefined, fan)).json.can.remove === true, "an empty team shows Remove to staff");
  ok((await call("DELETE", `/api/teams/${nt.json.id}`, undefined, sam)).status === 403, "a player can't remove a team");
  ok((await call("DELETE", `/api/teams/${nt.json.id}`, undefined, fan)).status === 200, "rink manager removes the empty team");
  ok((await call("DELETE", `/api/teams/${hh}`, undefined, boss)).status === 409, "a team with games can't be removed");
  ok((await call("DELETE", `/api/leagues/${nl.json.id}`, undefined, fan)).status === 409, "a league with teams can't be removed");
  const direct = await call("POST", "/api/rink-requests", { name: "Wilmington Ice House", city: "Wilmington", state: "NC", confirmNew: true }, boss);
  ok(direct.status === 200 && direct.json.created, "an admin adds a rink directly");

  console.log("nationwide: rinks in the US and Canada");
  const ca = await call("POST", "/api/rink-requests", { name: "Scotiabank Pond", city: "Toronto", state: "ON", country: "CA", confirmNew: true }, boss);
  ok(ca.status === 200 && ca.json.created, "an admin adds a Canadian rink with its province");
  ok((await call("POST", "/api/rink-requests", { name: "Nowhere Rink", city: "Toronto", state: "ZZ", country: "CA", confirmNew: true }, boss)).status === 400, "an unknown province is refused");
  ok((await call("POST", "/api/rink-requests", { name: "Mix Up Rink", city: "Toronto", state: "ON", country: "US", confirmNew: true }, boss)).status === 400, "a province with the US picked is refused");
  const caRow = (await call("GET", "/api/rinks?q=toronto")).json.rinks.find((r: any) => r.id === ca.json.rinkId);
  ok(caRow && caRow.country === "CA" && caRow.state === "ON", "rink search finds it by city, with country and province");
  const guess = await (await fetch(`${BASE}/api/rinks`, { headers: { "x-vercel-ip-country": "CA" } })).json();
  ok(guess.yourCountry === "CA", "the connection's country picks where the rink picker opens");
  const bootCa = (await call("GET", `/api/bootstrap?rink=${ca.json.rinkId}`)).json;
  ok(bootCa.rink.id === ca.json.rinkId && bootCa.leagues.length === 0 && bootCa.region.country === "CA", "the app can look at the Toronto rink, with none of Wilmington's leagues");
  const bootHome = (await call("GET", "/api/bootstrap", undefined, sam)).json;
  ok(bootHome.rink.name === "Polar Ice Wilmington", "a signed-in player opens on their home rink");
  ok((await call("GET", `/api/feed?rink=${ca.json.rinkId}`)).json.games.length === 0, "Toronto's home page has no Wilmington games");
  ok((await call("GET", `/api/players?rink=${ca.json.rinkId}`)).json.length === 0, "nor Wilmington's players");
  ok((await call("GET", `/api/players?rink=${rinkId}`)).json.length > 0, "Wilmington's players still show at Wilmington");

  console.log("standings: goal difference");
  let lgS = (await call("GET", `/api/leagues/${lg}`)).json.standings;
  ok(lgS.find((t: any) => t.name === "Blue Liners").diff === null, "no goals on the rink's page: DIFF is unknown, not zero");
  await db`UPDATE team_imports SET gf=30, ga=20 WHERE team_id=${blId}`;
  lgS = (await call("GET", `/api/leagues/${lg}`)).json.standings;
  const bl = lgS.find((t: any) => t.name === "Blue Liners");
  ok(bl.diff === bl.gf - bl.ga && bl.gf >= 30, "with goals for and against loaded, DIFF adds up");

  console.log("positions");
  ok((await call("PATCH", "/api/me", { position: "W" }, sam)).json.user.position === "W", "a player can pick wing");
  ok((await call("PATCH", "/api/me", { position: "X" }, sam)).status === 400, "an unknown position is refused");

  console.log("status and sign-out");
  ok((await call("PATCH", "/api/me", { status: "ir", statusUntil: "2026-12-01" }, sam)).json.user.status === "ir", "set injured reserve");

  console.log("one rating per person");
  const ivId = (await db`SELECT id FROM users WHERE email='invited@example.com'`)[0]?.id ?? (await db`SELECT id FROM users WHERE email='fan@example.com'`)[0].id;
  for (const tm of [hh, blId]) {
    const [pr] = await db`INSERT INTO players (name,name_key,position,rating,start_rating,display_name,user_id,claimed) VALUES ('Ivan Invited','ivaninvited','D',3.8,3.8,'Ivan I.',${ivId},1) RETURNING id`;
    await db`INSERT INTO roster_entries (team_id,player_id,source) VALUES (${tm},${pr.id},'claim')`;
  }
  ok((await db`SELECT COUNT(*)::int c FROM players WHERE user_id=${ivId}`)[0].c >= 2, "set up: one person with a record on two teams");
  const rc3 = await (await fetch(`${BASE}/api/cron/recompute`, { headers: { Authorization: `Bearer ${env.CRON_SECRET}` } })).json();
  ok(rc3.people >= 1 && (await db`SELECT COUNT(*)::int c FROM players WHERE user_id=${ivId}`)[0].c === 1, "the nightly run folds them into one player, one rating");
  ok((await db`SELECT COUNT(DISTINCT re.team_id)::int c FROM roster_entries re JOIN players p ON p.id=re.player_id WHERE p.user_id=${ivId}`)[0].c === 2, "still on both teams");

  console.log("manage team: adding and editing spots, roster sizes");
  const mtBefore = (await call("GET", `/api/teams/${hh}/manage`, undefined, graham)).json;
  ok(mtBefore.counts && mtBefore.counts.rosterMax === 25 && mtBefore.counts.goalieMax === 2, "a league starts at 25 skaters and 2 goalies");
  const lgFirst = (await db`SELECT league_id FROM teams WHERE id=${hh}`)[0].league_id;
  ok((await call("PATCH", `/api/leagues/${lgFirst}`, { rosterMax: 40 }, boss)).status === 200, "staff raise the roster size");
  const added = await call("POST", `/api/teams/${hh}/slots`, { name: "Pat Newguy", number: "71", position: "D" }, graham);
  ok(added.status === 200 && added.json.playerId, "captain adds a player by hand " + added.status + " " + JSON.stringify(added.json));
  ok((await call("POST", `/api/teams/${hh}/slots`, { name: "Pat Newguy", number: "45", position: "D" }, graham)).status === 409, "the same name twice is refused");
  ok((await call("POST", `/api/teams/${hh}/slots`, { name: "Pat", number: "46", position: "D" }, graham)).status === 400, "a first name alone is refused");
  ok((await call("POST", `/api/teams/${hh}/slots`, { name: "Other Guy", number: "71", position: "W" }, graham)).status === 409, "a taken number is refused");
  const nobody = await signUp("nobody.slots@example.com", { name: "Nobody Special", number: "98", position: "F" });
  const nocap = await call("POST", `/api/teams/${hh}/slots`, { name: "Not Captain", number: "47", position: "W" }, nobody);
  ok(nocap.status === 403, "only the team's captains add spots " + nocap.status);
  ok((await call("PATCH", `/api/teams/${hh}/slots/${added.json.playerId}`, { number: "72", position: "G" }, graham)).status === 200, "captain edits number and position of an unregistered spot");
  const mtAfter = (await call("GET", `/api/teams/${hh}/manage`, undefined, graham)).json;
  const pat = mtAfter.slots.find((s: any) => s.id === added.json.playerId);
  ok(pat.number === "72" && pat.position === "G", "the edit stuck");
  ok(mtAfter.counts.goalies === mtBefore.counts.goalies + 1 && mtAfter.counts.skaters === mtBefore.counts.skaters, "he now counts as a goalie, not a skater");
  const lgOf = (await db`SELECT league_id FROM teams WHERE id=${hh}`)[0].league_id;
  ok((await call("PATCH", `/api/leagues/${lgOf}`, { rosterMax: 5 }, boss)).status === 200, "staff set a smaller roster");
  ok((await call("POST", `/api/teams/${hh}/slots`, { name: "One Too Many", number: "49", position: "W" }, graham)).status === 409, "a full roster refuses another skater");
  ok((await call("POST", `/api/teams/${hh}/slots`, { name: "Spare Guy", number: "49", position: "W", sub: true }, graham)).status === 200, "but takes him as a sub");
  await call("PATCH", "/api/me", { status: "ir", statusUntil: "2027-01-01" }, sam);
  const irCounts = (await call("GET", `/api/teams/${hh}/manage`, undefined, graham)).json.counts;
  ok(irCounts.out >= 1, "a player on IR shows as out");
  await call("PATCH", "/api/me", { status: "active" }, sam);
  ok((await call("PATCH", `/api/leagues/${lgOf}`, { rosterMax: 15 }, boss)).status === 200, "and back to 15");
  ok((await call("PATCH", `/api/leagues/${lgOf}`, { rosterMax: 99 }, boss)).status === 400, "an absurd size is refused");

  console.log("lineup");
  const lgGame = await call("POST", `/api/teams/${hh}/schedule`, { date: `${ymd(4).slice(0, 4)}-${ymd(4).slice(4, 6)}-${ymd(4).slice(6)}`, time: "20:00", opponentTeamId: blId, kind: "league" }, graham);
  ok(lgGame.status === 200, "a game to set lines for");
  ok((await call("GET", `/api/teams/${hh}/schedule/${lgGame.json.id}/lineup`)).status === 403, "before the captain sets it, outsiders see nothing");
  const lu = await call("GET", `/api/teams/${hh}/schedule/${lgGame.json.id}/lineup`, undefined, graham);
  ok(lu.status === 200 && !lu.json.saved && lu.json.lineup.f.length === 2 && lu.json.lineup.d.length === 2 && lu.json.players.length > 0, "the team sees a first guess from who's In, two forward lines and two defense pairs");
  const firstTwo = lu.json.players.slice(0, 2).map((p: any) => p.id);
  const lineupBody = { f: [[firstTwo[0], null, null], [null, null, null], [null, null, null]], d: [[firstTwo[1], null], [null, null], [null, null]], g: [null], extras: [] };
  ok((await call("PUT", `/api/teams/${hh}/schedule/${lgGame.json.id}/lineup`, lineupBody, nobody)).status === 403, "only the team's captains set it");
  ok((await call("PUT", `/api/teams/${hh}/schedule/${lgGame.json.id}/lineup`, { ...lineupBody, d: [[firstTwo[0], null], [null, null], [null, null]] }, graham)).status === 400, "a player in two spots is refused");
  ok((await call("PUT", `/api/teams/${hh}/schedule/${lgGame.json.id}/lineup`, { ...lineupBody, g: [999999] }, graham)).status === 400, "someone not on the roster is refused");
  ok((await call("PUT", `/api/teams/${hh}/schedule/${lgGame.json.id}/lineup`, lineupBody, graham)).status === 200, "captain saves the lines");
  const lu2 = (await call("GET", `/api/teams/${hh}/schedule/${lgGame.json.id}/lineup`, undefined, graham)).json;
  ok(lu2.saved && lu2.lineup.f[0][0] === firstTwo[0] && lu2.can.edit === true, "and it comes back as set");
  const pub = await call("GET", `/api/teams/${hh}/schedule/${lgGame.json.id}/lineup`);
  ok(pub.status === 200 && pub.json.can.edit === false && pub.json.players.length === 2 && pub.json.players.every((p: any) => p.answer === null), "once set, outsiders see only the placed players and no In or Out answers");

  console.log("subs");
  const ivSlot = (await db`SELECT p.id FROM players p WHERE p.user_id=${ivId}`)[0].id;
  ok((await call("PATCH", `/api/teams/${blId}/slots/${ivSlot}/sub`, { sub: true }, sam)).status === 403, "only that team's captains mark subs");
  ok((await call("PATCH", `/api/teams/${hh}/slots/${ivSlot}/sub`, { sub: true }, graham)).status === 200, "captain marks Ivan as a sub");
  ok((await call("GET", `/api/teams/${hh}`)).json.roster.find((r: any) => r.id === ivSlot).is_sub === true, "the roster shows him as a sub");
  await call("PATCH", "/api/me", { willSub: true }, fan);
  const subDay = ymd(6);
  const sg = await call("POST", `/api/teams/${hh}/schedule`, { date: `${subDay.slice(0, 4)}-${subDay.slice(4, 6)}-${subDay.slice(6)}`, time: "21:15", opponentTeamId: blId, kind: "league" }, graham);
  ok(sg.status === 200, "a game to fill");
  const finder = await call("GET", `/api/schedule/${sg.json.id}/subs`, undefined, graham);
  ok(finder.status === 200 && finder.json.candidates.some((c: any) => c.name === "Fran Fan") && !finder.json.candidates.some((c: any) => c.name === "Sam Okafor"), "Find a sub lists Will sub players not already on the team");
  ok((await call("GET", `/api/schedule/${sg.json.id}/subs`, undefined, fan)).status === 403, "players can't browse it");
  const franId = finder.json.candidates.find((c: any) => c.name === "Fran Fan").id;
  ok((await call("POST", `/api/schedule/${sg.json.id}/subs`, { userId: franId }, graham)).status === 200, "captain asks Fran");
  const ask = (await call("GET", "/api/me", undefined, fan)).json.subRequests.find((r: any) => r.game_id === sg.json.id);
  ok(ask && ask.status === "asked", "Fran sees the ask");
  ok((await call("PUT", `/api/sub-requests/${ask.id}`, { answer: "yes" }, sam)).status === 404, "only Fran answers it");
  ok((await call("PUT", `/api/sub-requests/${ask.id}`, { answer: "yes" }, fan)).status === 200, "Fran says yes");
  const subGame = (await call("GET", `/api/teams/${hh}/schedule`, undefined, graham)).json.games.find((g: any) => g.id === sg.json.id);
  ok(subGame.rsvp.names.in.includes("Fran Fan (sub)"), "she counts as in, marked sub");
  ok(!subGame.rsvp.names.in.concat(subGame.rsvp.names.none, subGame.rsvp.names.out).some((n: string) => n.startsWith("Ivan")), "a sub isn't asked In/Out as a team member");

  console.log("tournaments");
  const tv = await call("POST", "/api/events", { name: "Port City Classic", startsOn: "2026-10-17", endsOn: "2026-10-18", location: "Wake Competition Center", teamId: hh }, graham);
  ok(tv.status === 200 && tv.json.id, "captain sets up a tournament with the team entered");
  ok((await call("POST", "/api/events", { name: "Nope", startsOn: "2026-10-17", teamId: hh }, fan)).status === 403, "only the team's captains can enter it");
  const hhRec = (await call("GET", `/api/teams/${hh}`)).json.record;
  const tdata = JSON.parse(JSON.stringify(real));
  tdata.date = "2026-10-18"; tdata.away.name = "Raleigh Rebels";
  const [tsh] = await db`INSERT INTO sheets (image_path,mime,status,source,extracted_json) VALUES ('test/none.jpg','image/jpeg','review','upload',${JSON.stringify(tdata)}) RETURNING id`;
  const tc = await call("POST", `/api/sheets/${tsh.id}/confirm`, { leagueId: lg, homeTeamId: hh, awayTeamId: null, data: tdata, eventId: tv.json.id }, graham);
  ok(tc.status === 200, "a tournament game goes in, opponent from outside the app");
  const ev = (await call("GET", `/api/events/${tv.json.id}`, undefined, graham)).json;
  ok(ev.teams.length === 2 && ev.teams.find((t: any) => t.id === hh).w === 1 && ev.games.length === 1, "it shows in the tournament's own standings");
  const hhAfter = (await call("GET", `/api/teams/${hh}`)).json;
  ok(JSON.stringify(hhAfter.record) === JSON.stringify(hhRec), "league standings don't change");
  ok(!(await call("GET", "/api/bootstrap")).json.leagues.some((l: any) => l.level === "TOURN"), "the outside team's guest league stays hidden");
  const th = await db`SELECT reasons_json FROM rating_history WHERE game_id=${tc.json.gameId} LIMIT 1`;
  ok(th.length && JSON.parse(th[0].reasons_json).some((r: any) => /counts half/.test(r.label)), "ratings move at half weight");
  ok((await call("PATCH", `/api/events/${tv.json.id}/teams/${hh}`, { place: 1 }, fan)).status === 403, "only the organizer records the finish");
  ok((await call("PATCH", `/api/events/${tv.json.id}/teams/${hh}`, { place: 1 }, graham)).status === 200, "Hammer'd Heads are champions");
  ok((await call("GET", `/api/events?team=${hh}`)).json.find((e: any) => e.id === tv.json.id).place === 1, "it's in the trophy case");
  const adamRow = hhAfter.roster.find((r: any) => r.name === "A. Y. #19");
  ok((await call("GET", `/api/players/${adamRow.id}`)).json.badges.some((b: any) => b.key === "road_trip"), "players who went get the Road Trip badge");
  const rebel = ev.players.find((p: any) => p.team === "Raleigh Rebels");
  ok(!!rebel && (await call("PUT", `/api/events/${tv.json.id}/mvp`, { playerId: rebel.id }, fan)).status === 403, "only players in the tournament vote MVP");

  console.log("sample sheets and Demo: admins only");
  ok((await call("GET", "/api/samples", undefined, sam)).json.length === 0 && (await call("GET", "/api/samples", undefined, boss)).json.length > 0, "only admins see the sample sheets");
  ok((await call("POST", "/api/sheets/sample/demo-flyers-owls", undefined, sam)).status === 403, "players can't run them");
  ok(!(await call("GET", "/api/bootstrap", undefined, sam)).json.leagues.some((l: any) => l.level === "DEMO") && (await call("GET", "/api/bootstrap", undefined, boss)).json.leagues.some((l: any) => l.level === "DEMO"), "the Demo league is hidden from everyone but admins");

  console.log("sign-up gate");
  const newbie = await signUp("newbie@example.com", { name: "Nora Newbie", number: "71", position: "W" }, { waitlist: true });
  ok((await call("GET", "/api/me", undefined, newbie)).json.user.access === "waiting", "a new account waits");
  const openSlot = (await call("GET", `/api/teams/${hh}`)).json.roster.find((r: any) => !r.registered);
  const blockedClaim = await call("POST", `/api/players/${openSlot.id}/claim`, undefined, newbie);
  ok(blockedClaim.status === 403 && /waitlist/i.test(blockedClaim.json.message), "it can't claim a spot");
  ok((await call("POST", "/api/sheets", { image: tiny }, newbie)).status === 403, "or scan");
  ok((await call("GET", "/api/staff/signups", undefined, boss)).json.some((u: any) => u.email === "newbie@example.com"), "the admin sees it waiting");
  ok((await call("GET", "/api/staff/signups", undefined, sam)).status === 200 && !(await call("GET", "/api/staff/signups", undefined, sam)).json.length, "a player sees nobody to let in");
  const nbId = (await db`SELECT id FROM users WHERE email='newbie@example.com'`)[0].id;
  ok((await call("POST", `/api/staff/signups/${nbId}`, { decision: "approve" }, sam)).status === 403, "a player can't let people in");
  ok((await call("POST", `/api/staff/signups/${nbId}`, { decision: "approve" }, boss)).status === 200, "admin lets Nora in");
  ok((await call("GET", "/api/me", undefined, newbie)).json.user.access === "approved", "and she's in");
  const inv = await call("POST", `/api/teams/${hh}/invite`, undefined, graham);
  ok(inv.status === 200 && inv.json.invite.token && inv.json.invite.uses === 0, "captain makes an invite link");
  ok((await call("POST", `/api/teams/${hh}/invite`, undefined, fan)).status === 403, "only the team's captains and staff can");
  ok((await call("GET", `/api/invites/${inv.json.invite.token}`)).json.team === "Hammer'd Heads", "the link says which team");
  const invited = await signUp("invited@example.com", { name: "Ivan Invited", number: "5", position: "D" }, { waitlist: true });
  const acc = await call("POST", "/api/invites/accept", { token: inv.json.invite.token }, invited);
  ok(acc.status === 200 && acc.json.newlyApproved && acc.json.teamId === hh, "signing in through the link lets you in");
  ok((await call("GET", "/api/me", undefined, invited)).json.user.access === "approved", "no waiting");
  ok((await call("GET", `/api/teams/${hh}/invite`, undefined, graham)).json.invite.uses === 1, "the link counts the use");
  ok((await call("DELETE", `/api/teams/${hh}/invite`, undefined, graham)).status === 200 && !(await call("GET", `/api/invites/${inv.json.invite.token}`)).json.valid, "turning the link off stops it");
  for (let i = 0; i < 2; i++) { await call("POST", `/api/teams/${hh}/invite`, undefined, graham); await call("DELETE", `/api/teams/${hh}/invite`, undefined, graham); }
  ok((await call("POST", `/api/teams/${hh}/invite`, undefined, graham)).status === 429, "three new links a week per team, then it waits");
  ok((await call("PUT", "/api/staff/settings", { signupsPaused: true }, sam)).status === 403, "only an admin can pause sign-ups");
  ok((await call("PUT", "/api/staff/settings", { signupsPaused: true }, boss)).json.signupsPaused === true, "admin pauses sign-ups");
  ok((await call("GET", "/api/signup-status")).json.paused === true, "the join page knows");
  await signUp("toolate@example.com", { name: "Too Late", number: "0", position: "F" }, { blocked: true });
  ok((await call("GET", "/api/me", undefined, sam)).status === 200, "existing players still sign in");
  ok((await call("PUT", "/api/staff/settings", { signupsPaused: false }, boss)).json.signupsPaused === false, "and back open");
  const robots = await (await fetch(`${BASE}/robots.txt`)).text();
  ok(/Disallow: \//.test(robots) && /noindex/.test(await (await fetch(`${BASE}/`)).text()), "search engines are told to stay out");

  console.log("scan resilience");
  const side = (name: string, goalie = true) => ({
    name,
    roster: [{ number: "9", name: "Skater", position: null as string | null }, ...(goalie ? [{ number: "1", name: "Goalie", position: "G" }] : [])],
    goals: [], penalties: [], shots_by_period: [], score_by_period: [], total: 0,
  });
  const ocrBody = (over: Record<string, unknown> = {}) => ({
    is_scoresheet: true, date: "2026-03-01", time: null, league_text: null, rink_text: null, confidence: 0.9, notes: [],
    home: side("Owls"), away: side("Flyers"), ...over,
  });
  const readFake = async (steps: any[]) => {
    const png = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=", "base64");
    const image = `data:image/png;base64,${Buffer.concat([png, Buffer.from("LATEICE_FAKE:" + JSON.stringify(steps))]).toString("base64")}`;
    const up = await call("POST", "/api/sheets", { image }, boss);
    ok(up.status === 202 && up.json.id, "fake scan accepted");
    let st: any;
    for (let i = 0; i < 50; i++) {
      st = await call("GET", `/api/sheets/${up.json.id}`);
      if (st.json.status !== "processing") break;
      await new Promise((r) => setTimeout(r, 200));
    }
    const row = (await db`SELECT input_tokens, output_tokens, model, warnings_json, error FROM sheets WHERE id=${up.json.id}`)[0];
    const warnings = JSON.parse(row.warnings_json || "[]");
    return { id: up.json.id as number, status: st.json.status as string, error: String(st.json.error || row.error || ""), warnings, row };
  };
  const retried = await readFake([
    { op: "text", text: "I cannot read it", inputTokens: 5, outputTokens: 1, expectFollowup: false },
    { op: "json", body: ocrBody({ confidence: 0.91 }), inputTokens: 7, outputTokens: 2, expectFollowup: true },
  ]);
  ok(retried.status === "review" && retried.row.model === "claude-sonnet-5-5", "a parse failure retries the same model once");
  ok(Number(retried.row.input_tokens) === 12 && Number(retried.row.output_tokens) === 3, "token counts from the read and the retry are stored");
  ok(retried.warnings.length === 0, `the retried read has no warnings (${retried.warnings.join("; ")})`);
  const twice = await readFake([
    { op: "text", text: "nope", inputTokens: 3, outputTokens: 1, expectFollowup: false },
    { op: "text", text: "still nope", inputTokens: 4, outputTokens: 1, expectFollowup: true },
  ]);
  ok(twice.status === "failed" && /no JSON/i.test(twice.error) && !/unexpected/i.test(twice.error), "a second parse failure stops, with no fallback model");
  ok(Number(twice.row.input_tokens) === 7, "only the two parse attempts are counted");
  const authFail = await readFake([{ op: "error", message: "401 authentication_error", expectFollowup: false }]);
  ok(authFail.status === "failed" && /401/.test(authFail.error) && !/unexpected/i.test(authFail.error), "an auth failure does not fall back to another model");
  const netFail = await readFake([{ op: "error", message: "network connection reset", expectFollowup: false }]);
  ok(netFail.status === "failed" && /network connection reset/.test(netFail.error) && !/unexpected/i.test(netFail.error), "a network failure does not fall back to another model");
  const fell = await readFake([
    { op: "json", body: ocrBody({ confidence: 0.4, date: null }), inputTokens: 10, outputTokens: 4, expectFollowup: false },
    { op: "json", body: ocrBody({ confidence: 0.95 }), inputTokens: 8, outputTokens: 3, expectFollowup: false },
  ]);
  ok(fell.status === "review" && fell.row.model === "claude-opus-5-5", "confidence under 0.6 calls the fallback model");
  ok(fell.warnings.length === 0, `the read with fewer warnings is kept (${fell.warnings.join("; ")})`);
  ok(Number(fell.row.input_tokens) === 18 && Number(fell.row.output_tokens) === 7, "fallback tokens are added to the sheet");
  const worse = await readFake([
    { op: "json", body: ocrBody({ confidence: 0.5 }), inputTokens: 10, outputTokens: 2, expectFollowup: false },
    { op: "json", body: ocrBody({ confidence: 0.2, date: null, home: side("Owls", false), away: side("Flyers", false) }), inputTokens: 6, outputTokens: 2, expectFollowup: false },
  ]);
  ok(worse.row.model === "claude-sonnet-5-5" && worse.warnings.length === 0 && Number(worse.row.input_tokens) === 16, "a fallback with more warnings is dropped");
  const tie = await readFake([
    { op: "json", body: ocrBody({ confidence: 0.4, date: null }), inputTokens: 4, outputTokens: 1, expectFollowup: false },
    { op: "json", body: ocrBody({ confidence: 0.99, date: null }), inputTokens: 4, outputTokens: 1, expectFollowup: false },
  ]);
  ok(tie.row.model === "claude-sonnet-5-5" && tie.warnings.length === 1, `equal warnings keep the first read (${tie.warnings.join("; ")})`);
  const boundary = await readFake([
    { op: "json", body: ocrBody({ confidence: 0.6, home: side("Owls", false), away: side("Flyers", false) }), inputTokens: 9, outputTokens: 2, expectFollowup: false },
  ]);
  ok(boundary.status === "review" && boundary.row.model === "claude-sonnet-5-5" && Number(boundary.row.input_tokens) === 9, "confidence 0.6 with fewer than 3 warnings does not call the fallback");
  ok(boundary.warnings.length === 2, `those two warnings are the goalies (${boundary.warnings.join("; ")})`);
  const three = await readFake([
    { op: "json", body: ocrBody({ confidence: 0.99, date: null, home: side("Owls", false), away: side("Flyers", false) }), inputTokens: 11, outputTokens: 3, expectFollowup: false },
    { op: "json", body: ocrBody({ confidence: 0.9 }), inputTokens: 5, outputTokens: 1, expectFollowup: false },
  ]);
  ok(three.row.model === "claude-opus-5-5" && three.warnings.length === 0, `three warnings call the fallback even when confidence is high (${three.warnings.join("; ")})`);

  console.log("hand entry");
  const failed = await readFake([{ op: "error", message: "unreadable", expectFollowup: false }]);
  ok(failed.status === "failed", "a failed read stays failed until someone enters it");
  const hand = { homeName: "Demo Owls", awayName: "Demo Flyers", homeScore: 4, awayScore: 2, homeNumbers: "81 82", awayNumbers: "83" };
  ok((await call("POST", `/api/sheets/${failed.id}/manual`, hand)).status === 401, "entering a score by hand needs sign-in");
  ok((await call("POST", `/api/sheets/${failed.id}/manual`, { ...hand, homeName: " " }, sam)).status === 400, "hand entry needs both team names");
  ok((await call("POST", `/api/sheets/${failed.id}/manual`, { ...hand, homeNumbers: "" }, sam)).status === 400, "hand entry needs who dressed, by number");
  const saved = await call("POST", `/api/sheets/${failed.id}/manual`, hand, sam);
  ok(saved.status === 200 && saved.json.data?.home?.total === 4 && saved.json.data?.away?.total === 2, "hand entry stores the final score");
  ok(saved.json.data.home.roster.map((p: any) => p.number).join(",") === "81,82" && saved.json.data.is_scoresheet === true, "hand entry stores who dressed and becomes review data");
  const mid = await call("GET", `/api/sheets/${failed.id}`);
  ok(mid.json.status === "review" && mid.json.gameId == null, "hand entry does not confirm the game");
  const demoId = (await db`SELECT id FROM leagues WHERE level='DEMO'`)[0].id;
  const demoTeams = await db`SELECT t.id FROM teams t WHERE t.league_id=${demoId} ORDER BY t.id LIMIT 2`;
  const homeTeamId = demoTeams[0].id;
  const awayTeamId = demoTeams[1].id;
  ok((await call("POST", `/api/sheets/${failed.id}/confirm`, { leagueId: demoId, homeTeamId, awayTeamId, data: saved.json.data }, fan)).status === 403, "hand entry still needs a captain or staff to confirm");
  const booked = await call("POST", `/api/sheets/${failed.id}/confirm`, { leagueId: demoId, homeTeamId, awayTeamId, data: saved.json.data }, boss);
  ok(booked.status === 200 && booked.json.gameId, "staff confirm the hand-entered sheet on the normal path");
  const bookedGame = await call("GET", `/api/games/${booked.json.gameId}`);
  ok(bookedGame.json.homeScore === 4 && bookedGame.json.awayScore === 2, "the hand-entered score is the final score");
  ok(bookedGame.json.lines.some((l: any) => l.number === "81") && bookedGame.json.lines.some((l: any) => l.number === "83"), "the dressed numbers are on the game");
  ok((await call("POST", `/api/sheets/${failed.id}/manual`, hand, sam)).status === 409, "a confirmed sheet cannot be entered again");

  const failed2 = await readFake([{ op: "error", message: "unreadable", expectFollowup: false }]);
  const hand2 = { homeName: "Demo Owls", awayName: "Demo Flyers", homeScore: 1, awayScore: 0, homeNumbers: "71", awayNumbers: "72" };
  const saved2 = await call("POST", `/api/sheets/${failed2.id}/manual`, hand2, sam);
  ok(saved2.status === 200, "the score for the captain is saved first");
  const sent = await call("POST", `/api/sheets/${failed2.id}/submit`, { leagueId: demoId, homeTeamId, awayTeamId, data: saved2.json.data }, sam);
  ok(sent.status === 200, "send to the captain uses the proposal path");
  const waiting = await call("GET", `/api/sheets/${failed2.id}`, undefined, boss);
  ok(waiting.json.status === "awaiting" && waiting.json.gameId == null && waiting.json.data.home.total === 1, "the proposal is waiting and is not a game yet");
  const sentGame = await call("POST", `/api/sheets/${failed2.id}/confirm`, { leagueId: demoId, homeTeamId, awayTeamId, data: waiting.json.data }, boss);
  ok(sentGame.status === 200, "the normal confirm path accepts what was sent");
  ok((await call("GET", `/api/games/${sentGame.json.gameId}`)).json.homeScore === 1, "the sent score is the one that is confirmed");

  const notSheet = ocrBody({ is_scoresheet: false });
  const [ns] = await db`INSERT INTO sheets (image_path, mime, status, source, extracted_json) VALUES ('test/ns.jpg','image/jpeg','review','upload',${JSON.stringify(notSheet)}) RETURNING id`;
  const nsSaved = await call("POST", `/api/sheets/${ns.id}/manual`, hand, sam);
  ok(nsSaved.status === 200 && nsSaved.json.data.is_scoresheet === true, "a photo that is not a scoresheet can be entered by hand");

  const opens = Number((await db`SELECT COUNT(*)::int n FROM app_events WHERE user_id=${ids.graham} AND kind='app_open'`)[0].n);
  ok(opens === 1, "opening the app is logged once per user per day");
  await call("GET", "/api/me", undefined, graham);
  ok(Number((await db`SELECT COUNT(*)::int n FROM app_events WHERE user_id=${ids.graham} AND kind='app_open'`)[0].n) === 1, "a second visit the same day does not log another open");
  ok(Number((await db`SELECT COUNT(*)::int n FROM app_events WHERE user_id=${ids.boss} AND kind='scan'`)[0].n) >= 1, "a scan is logged");
  ok(Number((await db`SELECT COUNT(*)::int n FROM app_events WHERE user_id=${ids.graham} AND kind='rsvp' AND team_id=${hh} AND game_id=${man.json.id}`)[0].n) >= 1, "an RSVP is logged with the team and the game");
  ok(Number((await db`SELECT COUNT(*)::int n FROM app_events WHERE user_id=${ids.boss} AND kind='confirm' AND game_id=${booked.json.gameId}`)[0].n) === 1, "confirming a sheet is logged with the game");
  const eventCols = (await db`SELECT column_name FROM information_schema.columns WHERE table_schema='public' AND table_name='app_events'`).map((c) => c.column_name).sort().join(",");
  ok(eventCols === "created_at,game_id,id,kind,team_id,user_id", "the loop log stores ids only");
  ok(Number((await db`SELECT COUNT(*)::int n FROM app_events WHERE kind LIKE '%photo%' OR kind LIKE '%@%' OR length(kind) > 32`)[0].n) === 0, "loop events do not carry sheet text, photos, or addresses");

  const samUsed = Number((await db`SELECT COUNT(*)::int n FROM sheets WHERE scanned_by=${ids.sam} AND created_at > now() - interval '1 day'`)[0].n);
  const allowBefore = await call("GET", "/api/sheets/allowance", undefined, sam);
  ok(allowBefore.status === 200 && allowBefore.json.show === (samUsed >= 10), "the daily allowance stays hidden until 10 scans");
  if (samUsed < 10) await db`INSERT INTO sheets (image_path, mime, status, source, scanned_by) SELECT 'test/day.jpg', 'image/jpeg', 'failed', 'upload', ${ids.sam} FROM generate_series(1, ${10 - samUsed})`;
  const allowAfter = await call("GET", "/api/sheets/allowance", undefined, sam);
  ok(allowAfter.json.show === true && allowAfter.json.used === 10 && allowAfter.json.left === 5, "after 10 scans the player sees how many are left today");
  await db`INSERT INTO sheets (image_path, mime, status, source, scanned_by) SELECT 'test/day.jpg', 'image/jpeg', 'failed', 'upload', ${ids.boss} FROM generate_series(1, 10)`;
  ok((await call("GET", "/api/sheets/allowance", undefined, boss)).json.show === false, "admins are not capped per day, so no allowance line");

  const padMonth = async (n: number) => {
    const cur = Number((await db`SELECT COUNT(*)::int n FROM sheets WHERE created_at >= date_trunc('month', now())`)[0].n);
    if (cur < n) await db`INSERT INTO sheets (image_path, mime, status, source) SELECT 'test/cap.jpg', 'image/jpeg', 'failed', 'upload' FROM generate_series(1, ${n - cur})`;
  };
  const admins = Number((await db`SELECT COUNT(DISTINCT user_id)::int n FROM role_grants WHERE role='admin' AND revoked_at IS NULL`)[0].n);
  await padMonth(1200);
  const capImage = `data:image/png;base64,${Buffer.concat([Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=", "base64"), Buffer.from("LATEICE_FAKE:" + JSON.stringify([{ op: "json", body: ocrBody(), inputTokens: 1, outputTokens: 1, expectFollowup: false }]))]).toString("base64")}`;
  const at60 = await Promise.all([call("POST", "/api/sheets", { image: capImage }, boss), call("POST", "/api/sheets", { image: capImage }, boss)]);
  ok(at60.every((r) => r.status === 202), "scans still go through at 60 percent of the monthly cap");
  const n60 = Number((await db`SELECT COUNT(*)::int n FROM notifications WHERE kind='scan_cap_60' AND created_at >= date_trunc('month', now())`)[0].n);
  ok(n60 === admins, "admins are told once at 60 percent");
  await call("POST", "/api/sheets", { image: capImage }, boss);
  ok(Number((await db`SELECT COUNT(*)::int n FROM notifications WHERE kind='scan_cap_60' AND created_at >= date_trunc('month', now())`)[0].n) === n60, "the 60 percent notice is not sent again");
  await padMonth(2000);
  const atCap = await Promise.all([call("POST", "/api/sheets", { image: capImage }, sam), call("POST", "/api/sheets", { image: capImage }, sam)]);
  ok(atCap.every((r) => r.status === 429 && /paused/i.test(r.json?.message ?? "")), "the monthly cap pauses scanning");
  const n100 = Number((await db`SELECT COUNT(*)::int n FROM notifications WHERE kind='scan_cap' AND created_at >= date_trunc('month', now())`)[0].n);
  ok(n100 === admins, "admins are told once when the monthly cap is reached");
  await call("POST", "/api/sheets", { image: capImage }, sam);
  ok(Number((await db`SELECT COUNT(*)::int n FROM notifications WHERE kind='scan_cap' AND created_at >= date_trunc('month', now())`)[0].n) === n100, "the cap notice is not sent again");

  console.log("standings numbers agree");
  {
    const fields = ["gp", "w", "l", "t", "pts", "diff"] as const;
    const board = await call("GET", `/api/rink?id=${rid}`);
    ok(board.status === 200 && board.json.season?.id, "rink board has a season");
    const sid = board.json.season.id;
    const bulkNow = await call("GET", `/api/standings?rink=${rid}&season=${sid}`);
    ok(bulkNow.status === 200, "bulk standings load for the number check");
    ok(bulkNow.json.leagues.length === board.json.leagues.length, `league count: rink ${board.json.leagues.length} standings ${bulkNow.json.leagues.length}`);
    let teamsChecked = 0;
    let sawPoints = false;
    let sawUnknownDiff = false;
    let sawKnownDiff = false;
    for (const listed of board.json.leagues) {
      const fromBulk = bulkNow.json.leagues.find((l: any) => l.id === listed.id);
      ok(fromBulk, `standings is missing league ${listed.id} ${listed.name}`);
      const page = await call("GET", `/api/leagues/${listed.id}?season=${sid}&games=all`);
      ok(page.status === 200 && page.json.season?.id === sid, `league ${listed.name} page is for season ${sid}, actual ${page.json?.season?.id}`);
      const pageRows = page.json.standings as any[];
      ok(Number(listed.teams) === pageRows.length, `league ${listed.name} team count: rink ${listed.teams} league page ${pageRows.length}`);
      const oldRows: { id: number; name: string; rec: any }[] = [];
      for (const row of fromBulk.standings) {
        const onPage = pageRows.find((t) => t.id === row.id);
        ok(onPage && onPage.name === row.name, `league ${listed.name} team ${row.id} ${row.name} is missing on the league page`);
        const teamPage = await call("GET", `/api/teams/${row.id}`);
        ok(teamPage.status === 200 && teamPage.json.season?.id === sid, `team ${row.name} record is for season ${sid}, actual ${teamPage.json?.season?.id}`);
        const rec = teamPage.json.record;
        oldRows.push({ id: row.id, name: row.name, rec });
        for (const k of fields) {
          ok(numSame(row[k], onPage[k]), `league ${listed.name} team ${row.name} ${k}: bulk standings ${row[k]} league page ${onPage[k]}`);
          ok(numSame(row[k], rec[k]), `league ${listed.name} team ${row.name} ${k}: expected ${rec[k]} from the team record, actual ${row[k]} on standings`);
        }
        if (Number(rec.pts) > 0) sawPoints = true;
        if (rec.diff == null) sawUnknownDiff = true;
        if (typeof rec.diff === "number") sawKnownDiff = true;
        teamsChecked++;
      }
      ok(fromBulk.standings.length === pageRows.length, `league ${listed.name} row count: standings ${fromBulk.standings.length} league page ${pageRows.length}`);
      const oldGp = oldRows.reduce((sum, t) => sum + Number(t.rec.gp), 0);
      ok(numSame(listed.games, oldGp / 2), `league ${listed.name} game count: rink ${listed.games} expected ${oldGp / 2} from team records`);
      const ranked = [...oldRows].sort((a, b) => b.rec.pts - a.rec.pts || (b.rec.diff ?? 0) - (a.rec.diff ?? 0) || (b.rec.gf ?? 0) - (a.rec.gf ?? 0) || String(a.name).localeCompare(String(b.name)));
      if (!ranked.length) {
        ok(listed.leader == null, `league ${listed.name} leader: expected none, actual ${listed.leader?.name}`);
      } else {
        ok(listed.leader && listed.leader.id === ranked[0].id, `league ${listed.name} leader: expected ${ranked[0].name} (${ranked[0].id}), actual ${listed.leader?.name} (${listed.leader?.id})`);
        for (const k of fields) {
          ok(numSame(listed.leader[k], ranked[0].rec[k]), `league ${listed.name} leader ${ranked[0].name} ${k}: expected ${ranked[0].rec[k]} actual ${listed.leader?.[k]}`);
        }
      }
    }
    ok(teamsChecked > 0 && sawPoints && sawUnknownDiff && sawKnownDiff, `compared ${teamsChecked} teams, with points ${sawPoints}, unknown diff ${sawUnknownDiff}, known diff ${sawKnownDiff}`);
  }

  console.log("home rink time zone");
  ok((await db`SELECT timezone FROM rinks WHERE slug='polar-ice-wilmington'`)[0].timezone === "America/New_York", "a rink starts in Eastern time");
  const clocks = (await db`SELECT to_char(now() AT TIME ZONE 'Pacific/Honolulu', 'YYYY-MM-DD') AS west, to_char(now() AT TIME ZONE 'Pacific/Kiritimati', 'YYYY-MM-DD') AS east, to_char(now() AT TIME ZONE 'America/New_York', 'YYYY-MM-DD') AS ny`)[0];
  const regionId = (await db`SELECT region_id FROM rinks WHERE slug='polar-ice-wilmington'`)[0].region_id;
  const [westRink] = await db`INSERT INTO rinks (region_id, slug, name, timezone) VALUES (${regionId}, 'tz-west', 'TZ West', 'Pacific/Honolulu') RETURNING id`;
  const [eastRink] = await db`INSERT INTO rinks (region_id, slug, name, timezone) VALUES (${regionId}, 'tz-east', 'TZ East', 'Pacific/Kiritimati') RETURNING id`;
  const [westUser] = await db`INSERT INTO users (email, name, access, status, status_until, home_rink_id) VALUES ('tz-west@example.com', 'West TZ', 'approved', 'ir', ${clocks.west}, ${westRink.id}) RETURNING id`;
  const [eastUser] = await db`INSERT INTO users (email, name, access, status, status_until, home_rink_id) VALUES ('tz-east@example.com', 'East TZ', 'approved', 'away', ${clocks.west}, ${eastRink.id}) RETURNING id`;
  const tzCron = await fetch(`${BASE}/api/cron/recompute`, { headers: { Authorization: `Bearer ${env.CRON_SECRET}` } });
  ok(tzCron.status === 200, "nightly job runs with per-rink clocks");
  const westAfter = (await db`SELECT status, status_until FROM users WHERE id=${westUser.id}`)[0];
  const eastAfter = (await db`SELECT status FROM users WHERE id=${eastUser.id}`)[0];
  ok(westAfter.status === "ir" && westAfter.status_until === clocks.west, `IR lasts through today on the home rink clock (Honolulu ${clocks.west}, New York ${clocks.ny})`);
  ok(eastAfter.status === "active", `the same date has already passed on a rink a day ahead (Kiritimati ${clocks.east})`);
  await db`DELETE FROM users WHERE id IN ${db([westUser.id, eastUser.id])}`;
  await db`DELETE FROM rinks WHERE id IN ${db([westRink.id, eastRink.id])}`;

  console.log("g6 trust");
  const polarId = (await db`SELECT id FROM rinks WHERE slug = 'polar-ice-wilmington'`)[0].id as number;
  const [jane] = await db`INSERT INTO players (name, name_key, position, rating, start_rating) VALUES ('Jane Skater', 'janeskaterg6', 'F', 3.2, 3.2) RETURNING id`;
  await db`INSERT INTO roster_entries (team_id, player_id, number) VALUES (${hh}, ${jane.id}, '61')`;
  const pubJane = await call("GET", `/api/teams/${hh}`);
  ok(pubJane.json.roster.find((r: any) => r.id === jane.id)?.name === "J. S. #61" && !pubJane.text.includes("Skater"), "signed-out viewers see initials and number, not the surname");
  const sameJane = await call("GET", `/api/teams/${hh}`, undefined, graham);
  ok(sameJane.json.roster.find((r: any) => r.id === jane.id)?.name === "Jane S.", "a signed-in player at the same rink sees the short name");
  const [region] = await db`SELECT id FROM regions LIMIT 1`;
  const [otherRink] = await db`INSERT INTO rinks (region_id, slug, name) VALUES (${region.id}, 'g6-other-rink', 'Other Rink') RETURNING id`;
  const away = await signUp("away.g6@example.com", { name: "Away Fan", number: "63", position: "F" });
  await db`UPDATE users SET home_rink_id = ${otherRink.id} WHERE email = 'away.g6@example.com'`;
  const awayJane = await call("GET", `/api/teams/${hh}`, undefined, away);
  ok(awayJane.json.roster.find((r: any) => r.id === jane.id)?.name === "J. S. #61", "a signed-in player at another rink sees initials");
  ok(awayJane.json.roster.some((r: any) => r.name === "Graham DeNoyer"), "claimed players still show the profile name");
  ok(!(await call("GET", "/api/players")).text.includes("Skater") && !(await call("GET", "/api/feed")).text.includes("Skater"), "player list and feed do not leak the surname");

  const young = await signUp("young.g6@example.com", { name: "Young Player", number: "64", position: "W" });
  await db`UPDATE users SET name = NULL, position = NULL, home_rink_id = NULL, age_confirmed_at = NULL WHERE email = 'young.g6@example.com'`;
  ok((await call("PATCH", "/api/me", { name: "Young Player", number: "64", position: "W", homeRinkId: polarId }, young)).status === 400, "the server refuses a profile without the age check");
  ok((await call("PATCH", "/api/me", { name: "Young Player", number: "64", position: "W", homeRinkId: polarId, age18: false }, young)).status === 400, "saying no to 18 or older is refused");
  const aged = await call("PATCH", "/api/me", { name: "Young Player", number: "64", position: "W", homeRinkId: polarId, age18: true }, young);
  ok(aged.status === 200 && aged.json.user.profileComplete === true && aged.json.user.ageConfirmed === true, "checking 18 or older completes the profile");

  const [inD] = await db`INSERT INTO users (email, name, access, home_rink_id, age_confirmed_at) VALUES ('g6-ind@example.com', 'In Defense', 'approved', ${polarId}, now()) RETURNING id`;
  const [lateD] = await db`INSERT INTO users (email, name, access, home_rink_id, age_confirmed_at) VALUES ('g6-lated@example.com', 'Late Defense', 'approved', ${polarId}, now()) RETURNING id`;
  const [outD] = await db`INSERT INTO users (email, name, access, home_rink_id, age_confirmed_at) VALUES ('g6-outd@example.com', 'Out Defense', 'approved', ${polarId}, now()) RETURNING id`;
  const [inG] = await db`INSERT INTO users (email, name, access, home_rink_id, age_confirmed_at) VALUES ('g6-ing@example.com', 'In Goal', 'approved', ${polarId}, now()) RETURNING id`;
  const addLined = async (userId: number, name: string, pos: string, num: string, rating: number) => {
    const [p] = await db`INSERT INTO players (name, name_key, position, rating, start_rating, claimed, user_id, display_name) VALUES (${name}, ${name.toLowerCase().replace(/[^a-z]/g, "") + userId}, ${pos}, ${rating}, ${rating}, 1, ${userId}, ${name}) RETURNING id`;
    await db`INSERT INTO roster_entries (team_id, player_id, number) VALUES (${hh}, ${p.id}, ${num})`;
    return p.id as number;
  };
  const inDId = await addLined(inD.id, "In Defense", "D", "20", 1.1);
  const lateDId = await addLined(lateD.id, "Late Defense", "D", "3", 6.8);
  const outDId = await addLined(outD.id, "Out Defense", "D", "4", 6.9);
  const inGId = await addLined(inG.id, "In Goal", "G", "70", 1.2);
  const [orderGame] = await db`INSERT INTO scheduled_games (team_id, starts_at, local_date, local_time, kind, source) VALUES (${hh}, now() + interval '3 days', '2026-12-20', '8:00 PM', 'league', 'manual') RETURNING id`;
  await db`INSERT INTO rsvps (scheduled_game_id, user_id, answer) VALUES (${orderGame.id}, ${inD.id}, 'in'), (${orderGame.id}, ${lateD.id}, 'late'), (${orderGame.id}, ${outD.id}, 'out'), (${orderGame.id}, ${inG.id}, 'in')`;
  const ordered = await call("GET", `/api/teams/${hh}/schedule/${orderGame.id}/lineup`, undefined, graham);
  const flatD = (ordered.json.lineup.d as (number | null)[][]).flat();
  const placed = [...ordered.json.lineup.f.flat(), ...flatD, ...ordered.json.lineup.g, ...ordered.json.lineup.extras];
  ok(ordered.status === 200 && ordered.json.lineup.f.length === 2 && ordered.json.lineup.d.length === 2, "auto-fill starts with two lines and two pairs");
  ok(ordered.json.lineup.g[0] === inGId, "the goalie who said In is in net ahead of a higher rating with no answer");
  ok(flatD[0] === inDId && flatD.indexOf(lateDId) > 0, "defense is In first, then Late, not by rating or jersey number");
  ok(!placed.includes(outDId), "a player who said Out is left off");

  const [spotA] = await db`INSERT INTO players (name, name_key, position, rating, start_rating, display_name) VALUES ('Alex One', 'alexoneg6', 'F', 3, 3, 'Alex O.') RETURNING id`;
  const [spotB] = await db`INSERT INTO players (name, name_key, position, rating, start_rating, display_name) VALUES ('Alex Two', 'alextwog6', 'F', 3, 3, 'Alex T.') RETURNING id`;
  await db`INSERT INTO roster_entries (team_id, player_id, number) VALUES (${hh}, ${spotA.id}, '71'), (${hh}, ${spotB.id}, '72')`;
  const statGame = (await db`SELECT id, home_team_id FROM games LIMIT 1`)[0];
  await db`INSERT INTO player_game_stats (game_id, player_id, team_id, number, goals, assists) VALUES (${statGame.id}, ${spotA.id}, ${statGame.home_team_id}, '71', 2, 1)`;
  const samId = (await db`SELECT id FROM users WHERE email = 'sam@example.com'`)[0].id;
  const named = await call("POST", `/api/teams/${hh}/assistants`, { userId: samId }, graham);
  ok(named.status === 200 || named.status === 409, "Sam can be the assistant used for the denial check");
  ok((await call("POST", `/api/teams/${hh}/merge`, { fromId: spotA.id, intoId: spotB.id }, sam)).status === 403, "an assistant cannot merge two spots");
  const preview = await call("GET", `/api/teams/${hh}/merge?from=${spotA.id}&into=${spotB.id}`, undefined, graham);
  ok(preview.status === 200 && preview.json.games === 1 && preview.json.points === 3 && preview.json.moving?.name && preview.json.kept?.name && preview.json.moving.name !== preview.json.kept.name, "merge preview names both players and the games and points that move");
  ok((await call("POST", `/api/teams/${hh}/merge`, { fromId: spotA.id, intoId: spotB.id }, graham)).status === 200, "the captain merges after the counts");
  const auditRow = (await db`SELECT before_json, after_json FROM audit_log WHERE action = 'roster.merge' ORDER BY id DESC LIMIT 1`)[0];
  const auditAfter = JSON.parse(auditRow.after_json);
  const auditBefore = JSON.parse(auditRow.before_json);
  ok(auditBefore.movingId === spotA.id && auditBefore.keptId === spotB.id && auditAfter.movingId === spotA.id && auditAfter.keptId === spotB.id && auditAfter.games === 1 && auditAfter.points === 3, "the audit row stores both ids and the moved counts");
  ok((await db`SELECT COUNT(*)::int n FROM players WHERE id = ${spotA.id}`)[0].n === 0, "the spot that moved is gone");
  ok((await db`SELECT COUNT(*)::int n FROM player_game_stats WHERE player_id = ${spotB.id} AND goals = 2 AND assists = 1`)[0].n === 1, "the game line moved onto the kept player");

  const bye = await signUp("bye.g6@example.com", { name: "Bye Player", number: "62", position: "F" });
  const byeUser = (await call("GET", "/api/me", undefined, bye)).json.user.id;
  const [byePlayer] = await db`INSERT INTO players (name, name_key, position, rating, start_rating, claimed, user_id, display_name) VALUES ('Bye Player', 'byeplayerg6', 'F', 3.4, 3.4, 1, ${byeUser}, 'Bye Player') RETURNING id`;
  await db`INSERT INTO player_game_stats (game_id, player_id, team_id, number, goals, assists) VALUES (${statGame.id}, ${byePlayer.id}, ${statGame.home_team_id}, '62', 1, 0)`;
  await db`INSERT INTO notifications (user_id, kind, title) VALUES (${byeUser}, 'note', 'bye private note')`;
  const samNote = (await db`SELECT id FROM users WHERE email = 'sam@example.com'`)[0].id;
  await db`INSERT INTO notifications (user_id, kind, title) VALUES (${samNote}, 'note', 'sam secret note g6')`;
  const exported = await call("GET", "/api/me/export", undefined, bye);
  ok(exported.status === 200 && exported.json.profile.email === "bye.g6@example.com" && exported.json.gameLines.some((l: any) => l.goals === 1) && exported.json.notifications.some((n: any) => n.title === "bye private note") && !exported.text.includes("sam secret note g6") && !exported.text.includes("auth_id"), "export has this user's lines and notes only");
  ok((await call("POST", "/api/me/delete", {}, bye)).status === 400, "delete without confirm is refused");
  const removed = await call("POST", "/api/me/delete", { confirm: true }, bye);
  ok(removed.status === 200 && removed.json.gameLinesKept >= 1 && removed.json.authUserRemoved === true && removed.json.accessTokenRevoked === false, "delete keeps game lines, removes the local auth user, and does not claim the access token died");
  ok((await call("GET", "/api/me", undefined, bye)).status === 401, "the deleted account cannot be read");
  ok((await db`SELECT name FROM players WHERE id = ${byePlayer.id}`)[0].name === "Player #62", "the player row is anonymized to Player and the number");
  ok((await db`SELECT COUNT(*)::int n FROM player_game_stats WHERE player_id = ${byePlayer.id} AND goals = 1`)[0].n === 1, "that game line is still stored");
  ok((await db`SELECT COUNT(*)::int n FROM users WHERE id = ${byeUser}`)[0].n === 0, "the user row is gone");
  ok((await db`SELECT COUNT(*)::int n FROM auth.users WHERE email = 'bye.g6@example.com'`)[0].n === 0, "the local auth user is gone");

  const png = Buffer.from(tiny.split(",")[1], "base64");
  const store = createClient(env.NEXT_PUBLIC_SUPABASE_URL!, env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });
  const oldKey = `g6/old-${Date.now()}.png`;
  const edgeKey = `g6/edge-${Date.now()}.png`;
  const freshKey = `g6/fresh-${Date.now()}.png`;
  for (const key of [oldKey, edgeKey, freshKey]) {
    const up = await store.storage.from("sheets").upload(key, png, { contentType: "image/png" });
    ok(!up.error, `test photo stored ${up.error ? up.error.message : "ok"}`);
  }
  const [oldSheet] = await db`INSERT INTO sheets (image_path, mime, status, source, extracted_json, confirmed_at) VALUES (${oldKey}, 'image/png', 'confirmed', 'upload', '{"kept":true}', now() - interval '90 days' - interval '1 minute') RETURNING id`;
  const [edgeSheet] = await db`INSERT INTO sheets (image_path, mime, status, source, extracted_json, confirmed_at) VALUES (${edgeKey}, 'image/png', 'confirmed', 'upload', '{"kept":true}', now() - interval '90 days' + interval '5 minutes') RETURNING id`;
  const [freshSheet] = await db`INSERT INTO sheets (image_path, mime, status, source, extracted_json, confirmed_at) VALUES (${freshKey}, 'image/png', 'confirmed', 'upload', '{"kept":true}', now() - interval '89 days') RETURNING id`;
  const cleanup = await fetch(`${BASE}/api/cron/recompute`, { headers: { Authorization: `Bearer ${env.CRON_SECRET}` } });
  const cleanupBody = await cleanup.json();
  ok(cleanup.status === 200 && cleanupBody.photos.deleted >= 1, "nightly cleanup deletes photos confirmed more than 90 days ago");
  const oldRow = (await db`SELECT photo_deleted_at, extracted_json, image_path FROM sheets WHERE id = ${oldSheet.id}`)[0];
  ok(oldRow.photo_deleted_at && String(oldRow.extracted_json).includes("kept") && oldRow.image_path === oldKey, "the old photo is marked deleted only after removal, and the extract stays");
  ok((await fetch(`${BASE}/api/sheets/${oldSheet.id}/image`)).status === 404, "the deleted photo no longer downloads");
  ok((await db`SELECT photo_deleted_at FROM sheets WHERE id = ${edgeSheet.id}`)[0].photo_deleted_at === null, "a sheet just under 90 days confirmed is kept");
  ok((await db`SELECT photo_deleted_at FROM sheets WHERE id = ${freshSheet.id}`)[0].photo_deleted_at === null, "a sheet confirmed 89 days ago is kept");
  const second = await fetch(`${BASE}/api/cron/recompute`, { headers: { Authorization: `Bearer ${env.CRON_SECRET}` } });
  ok(second.status === 200, "running cleanup again still succeeds");
  const oldAgain = (await db`SELECT photo_deleted_at FROM sheets WHERE id = ${oldSheet.id}`)[0].photo_deleted_at;
  ok(new Date(oldAgain).getTime() === new Date(oldRow.photo_deleted_at).getTime(), "a second run does not rewrite the delete time");

  const rateUser = await signUp("limit.g6@example.com", { name: "Limit Player", number: "65", position: "F" });
  let blocked: { status: number; json: any } | null = null;
  let writes = 0;
  for (let i = 0; i < 70; i++) {
    const r = await call("PATCH", "/api/me", { status: "active" }, rateUser);
    if (r.status === 429) { blocked = r; break; }
    writes++;
    ok(r.status === 200, `write ${i + 1} before the limit is allowed`);
  }
  ok(blocked?.status === 429 && writes === 59 && /too many saves/i.test(blocked.json?.message ?? ""), "the 61st write in a minute returns 429");
  ok((await call("POST", "/api/sheets", { image: tiny })).status === 401, "a signed-out write is refused as signed out, not rate limited");

  const terms = await (await fetch(`${BASE}/terms`)).text();
  ok(terms.includes("18 or older") && terms.includes("support@tangomike.app") && terms.includes("/privacy"), "the terms page is up");

  console.log("pages render");
  for (const path of ["/", "/leagues", `/team/${hh}`, `/player/${mike}`, "/players", "/rink", "/scan", "/join", "/privacy", "/terms", `/game/${conf.json.gameId}`, `/league/${lg}`, `/team/${hh}/manage`, `/team/${hh}/lineup/${lgGame.json.id}`]) {
    const r = await fetch(BASE + path);
    ok(r.status === 200, `${path} renders`);
  }

  await pushChecks({ graham, sam, outsider, fan, hh, ids });
  await db.end();
  console.log(`\nsmoke: ${passed} checks passed`);
}

main().catch(async (e) => { console.error(e.message || e); await stop(); await db.end(); process.exit(1); });
