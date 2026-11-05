// End-to-end smoke test: the built Next.js app against a local Supabase stack.
// Covers sign-in, the draft pool, captain tools, name privacy, the scoresheet confirm
// path, photo storage, and the nightly rating replay. CI runs it after `next build`.
import { spawn, type ChildProcess } from "node:child_process";
import { readFileSync } from "node:fs";
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
  srv = spawn("npx", ["next", "start", "-p", String(PORT)], { env: { ...env, NODE_ENV: "production", BOOTSTRAP_ADMIN_EMAIL: "boss@example.com" }, stdio: ["ignore", "ignore", "inherit"] });
  for (let i = 0; i < 200; i++) {
    try { const r = await fetch(`${BASE}/api/bootstrap`); if (r.ok) return; } catch {}
    await new Promise((r) => setTimeout(r, 200));
  }
  throw new Error("server did not start");
}
async function stop() {
  if (!srv) return;
  const p = new Promise((r) => srv!.once("exit", r));
  srv.kill("SIGTERM");
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

/** Sign in by emailed code (read from the local mail catcher) and register. */
async function signUp(email: string, profile: { name: string; number: string; position: string }) {
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
  ok(me.status === 200 && me.json.user.profileComplete === false && me.json.user.email === email.toLowerCase() && me.json.user.phone === null, `${email} gets a new account keyed on email, no phone`);
  const rinks = await call("GET", "/api/rinks");
  const p = await call("PATCH", "/api/me", { ...profile, homeRinkId: rinks.json[0].id }, token);
  ok(p.status === 200 && p.json.user.profileComplete, `${profile.name} profile complete`);
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
  ok(team.json.roster.some((r: any) => r.name === "Mike T."), "unclaimed slot shows first name and last initial");
  ok(team.json.captain === null, "no captain yet");
  const lg = team.json.league.id;
  for (const u of ["/api/bootstrap", "/api/feed", "/api/players", "/api/rink", `/api/leagues/${lg}`, `/api/players/${mike}`, "/api/samples"]) {
    const r = await call("GET", u);
    ok(r.status === 200 && !r.text.includes("Tolliver"), `${u} ok and private`);
  }

  console.log("sign-in");
  ok((await call("GET", "/api/me")).status === 401, "signed-out /api/me is 401");
  ok((await call("GET", "/api/me", undefined, "not-a-token")).status === 401, "bad token is 401");
  const graham = await signUp("Graham@Example.com", { name: "Graham DeNoyer", number: "12", position: "F" });
  ok((await call("PATCH", "/api/me", { name: "Graham" }, graham)).status === 400, "one-word name rejected");
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

  console.log("scoresheets");
  const tiny = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=";
  ok((await call("POST", "/api/sheets", { image: "nope" })).status === 400, "non-image upload rejected");
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
  const conf = await call("POST", `/api/sheets/${sheet.id}/confirm`, { leagueId: demo, homeTeamId: sv.json.suggestion.home.teamId, awayTeamId: sv.json.suggestion.away.teamId, data });
  ok(conf.status === 200 && conf.json.gameId, "confirming the sheet creates the game");
  const again = await call("POST", `/api/sheets/${sheet.id}/confirm`, { leagueId: demo, homeTeamId: sv.json.suggestion.home.teamId, awayTeamId: sv.json.suggestion.away.teamId, data });
  ok(again.status === 409, "the same sheet can't be confirmed twice");
  const game = await call("GET", `/api/games/${conf.json.gameId}`);
  ok(game.json.homeScore === 4 && game.json.awayScore === 3, "final score 4-3 from the sheet");
  ok(game.json.lines.length === 19 && game.json.lines.every((l: any) => typeof l.delta === "number"), "19 stat lines, every player rated");
  ok(!game.text.includes("Okafor") && game.json.lines.some((l: any) => l.name === "Sam O."), "game page uses private names for unclaimed players");
  const scorer = game.json.lines.find((l: any) => l.name === "Sam O.");
  ok(scorer.goals === 2 && scorer.assists === 1, "#9 has 2 goals and 1 assist");
  const ratingsBefore = await db`SELECT id, rating FROM players ORDER BY id`;
  const rc2 = await fetch(`${BASE}/api/cron/recompute`, { headers: { Authorization: `Bearer ${env.CRON_SECRET}` } });
  const rcj = await rc2.json();
  ok(rc2.status === 200 && rcj.games === 1, "nightly replay rates the one game");
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
  const rinkId = (await call("GET", "/api/rinks")).json[0].id;
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
  const adamPts = await ptsOf("Adam Y.");
  ok((await call("POST", "/api/staff/import", { text: report, rinkId, apply: true }, graham)).status === 403, "a captain can't import");
  const pv = await call("POST", "/api/staff/import", { text: report, rinkId }, mt);
  ok(pv.status === 200 && pv.json.applied === false && pv.json.summary.gamesAdded === 2, "rink manager previews: 2 games");
  ok(pv.json.summary.rosterAdded === 3 && pv.json.summary.rosterExisting === 2, "preview: 3 new roster spots, 2 already here");
  ok(pv.json.summary.warnings.some((w: string) => w.includes("Not A Real Team FC")), "preview flags a team that doesn't match");
  ok(pv.json.summary.unassigned.some((u: any) => u.team === "Hammer'd Heads" && u.goals === 1), "preview counts goals with no scorer");
  ok(!(await call("GET", `/api/teams/${hh}`)).json.games.some((g: any) => g.source === "daysmart"), "preview saves nothing");
  const ap = await call("POST", "/api/staff/import", { text: report, rinkId, apply: true }, mt);
  ok(ap.status === 200 && ap.json.applied && ap.json.summary.gamesAdded === 2, "import applied");
  let after = (await call("GET", `/api/teams/${hh}`)).json;
  ok(after.games.filter((g: any) => g.source === "daysmart").length === 2, "imported games show on the team page");
  ok(JSON.stringify(after.record) === JSON.stringify(hhBefore.record), "standings don't count imported games twice");
  ok((await ptsOf("Adam Y.")) === adamPts, "season points don't count imported games twice");
  const blRoster = (await call("GET", `/api/teams/${(await db`SELECT id FROM teams WHERE name='Blue Liners'`)[0].id}`)).json.roster;
  ok(blRoster.some((r: any) => r.name === "Zed Q.") && blRoster.some((r: any) => r.name === "Ana B."), "opponent roster spots added, all-caps fixed and shown as first name and last initial");
  const ig = after.games.find((g: any) => g.playedOn === "2026-09-06");
  const igPage = await call("GET", `/api/games/${ig.id}`);
  ok(igPage.json.source === "daysmart" && igPage.json.imported.some((l: any) => l.name === "Adam Y." && l.goals === 2 && l.assists === 1), "game page lists credited scorers");
  ok(igPage.json.unassigned.home === 1 && igPage.json.unassigned.away === 0, "game page counts the goal with no scorer");
  const adamId = after.roster.find((r: any) => r.name === "Adam Y.").id;
  ok((await call("GET", `/api/players/${adamId}`)).json.importedGames.length === 1, "player page shows the game log");
  const reimport = await call("POST", "/api/staff/import", { text: report, rinkId, apply: true }, mt);
  ok(reimport.json.summary.gamesAdded === 0 && reimport.json.summary.gamesUpdated === 2 && reimport.json.summary.rosterAdded === 0, "importing again changes nothing new");

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
  const c2 = await call("POST", `/api/sheets/${sh2.id}/confirm`, { leagueId: lg, homeTeamId: hh, awayTeamId: blId, data: real });
  ok(c2.status === 200, "the real sheet goes in");
  after = (await call("GET", `/api/teams/${hh}`)).json;
  ok(!after.games.some((g: any) => g.source === "daysmart" && g.playedOn === "2026-09-06") && after.games.some((g: any) => g.id === c2.json.gameId), "it replaced the imported game");
  ok(after.roster.filter((r: any) => r.name === "Adam Y.").length === 1 && after.roster.find((r: any) => r.name === "Adam Y.").number === "19", "\"Adam Young\" #19 on the sheet is the imported \"Adam Y.\" spot, no duplicate");
  ok(after.record.w === hhBefore.record.w && after.record.l === hhBefore.record.l && after.record.gp === hhBefore.record.gp, "record still adds up: the game moved from the baseline to the sheet");
  ok((await ptsOf("Adam Y.")) === adamPts, "Adam's points still add up (2G 1A, counted once)");

  console.log("status and sign-out");
  ok((await call("PATCH", "/api/me", { status: "ir", statusUntil: "2026-12-01" }, sam)).json.user.status === "ir", "set injured reserve");

  console.log("pages render");
  for (const path of ["/", "/leagues", `/team/${hh}`, `/player/${mike}`, "/players", "/rink", "/scan", "/join", `/game/${conf.json.gameId}`, `/league/${lg}`]) {
    const r = await fetch(BASE + path);
    ok(r.status === 200, `${path} renders`);
  }

  await stop();
  await db.end();
  console.log(`\nsmoke: ${passed} checks passed`);
}

main().catch(async (e) => { console.error(e.message || e); await stop(); await db.end(); process.exit(1); });
