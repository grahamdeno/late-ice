// Seeds the LOCAL CI database for the UX walkthrough. Refuses anything but localhost.
// Polar Ice C league: tops every team up to 16 players with numbers, plays a 10-round season of
// confirmed games (goals, assists, penalties), and schedules tonight's games in rink time
// (America/New_York) plus the next two weeks. Ratings come from the nightly replay afterwards.
// Writes audit/seed.json with the facts the walkthrough needs.
import postgres from "postgres";
import { mkdirSync, writeFileSync } from "node:fs";

const url = process.env.DATABASE_URL || "";
if (!/127\.0\.0\.1|localhost/.test(url)) throw new Error("ux-seed only runs against a local database");
const db = postgres(url, { prepare: false, max: 2, onnotice: () => {} });

let s = 20261107;
const rnd = () => { s |= 0; s = (s + 0x6d2b79f5) | 0; let t = Math.imul(s ^ (s >>> 15), 1 | s); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
const pick = <T,>(a: T[]) => a[Math.floor(rnd() * a.length)];
const int = (lo: number, hi: number) => lo + Math.floor(rnd() * (hi - lo + 1));
const key = (n: string) => n.toLowerCase().replace(/[^a-z]/g, "");

const FIRST = ["Mike", "Dan", "Chris", "Sam", "Jake", "Tom", "Ryan", "Nick", "Ben", "Luke", "Paul", "Eric", "Matt", "Kyle", "Josh", "Drew", "Alex", "Pete", "Tyler", "Gary", "Bill", "Greg", "Phil", "Scott", "Brian", "Kevin", "Jason", "Steve", "Mark", "Adam", "Cody", "Zach", "Evan", "Sean", "Brett", "Derek", "Cole", "Trent", "Wes"];
const LAST = ["Tolliver", "Reyes", "Hales", "Okafor", "Brandt", "Kuehn", "Pell", "Ferraro", "Ashby", "Marsh", "Grady", "Lunde", "Cho", "Brennan", "Weller", "Fisk", "Novak", "Simms", "Voss", "Hanlon", "Barone", "Lutz", "Mercer", "Doyle", "Keane", "Walsh", "Hobbs", "Ruiz", "Becker", "Lang", "Moss", "Pike", "Shaw", "Tate", "Quinn", "Burke", "Nash", "Price", "Rhodes", "Sutter", "Ivey", "Gant", "Holt", "Vance"];
const TZ = "America/New_York";
const localDate = (d: Date) => d.toLocaleDateString("en-CA", { timeZone: TZ });
const localTime = (d: Date) => d.toLocaleTimeString("en-US", { timeZone: TZ, hour: "numeric", minute: "2-digit" });

// Persona pairs: one pair per browser engine, so the two runs never share a team.
const PAIRS: [string, string][] = [["Whiskey Dekes", "Wild Puckers"], ["Blue Liners", "Fighting Irish"], ["Backside Checkers", "Hinson Hookers"], ["Hammer'd Heads", "Seal Team Sticks (Muckers)"]];

async function main() {
  const league = (await db`SELECT l.id, l.rink_id FROM leagues l JOIN rinks r ON r.id=l.rink_id WHERE r.slug='polar-ice-wilmington' AND l.level='C' ORDER BY l.id LIMIT 1`)[0];
  if (!league) throw new Error("Polar Ice C league not found; run against a freshly migrated database");
  const season = (await db`SELECT id FROM seasons WHERE rink_id=${league.rink_id} AND name='Fall 2026'`)[0];
  const teams = await db`SELECT id, name FROM teams WHERE league_id=${league.id} ORDER BY id`;
  const byName = new Map(teams.map((t) => [t.name as string, t.id as number]));
  for (const [a, b] of PAIRS) if (!byName.has(a) || !byName.has(b)) throw new Error(`missing team ${a} or ${b}; found ${teams.map((t) => t.name).join(", ")}`);
  if ((await db`SELECT COUNT(*)::int n FROM games WHERE league_id=${league.id} AND source='sheet'`)[0].n > 0) { console.log("already seeded"); return; }

  const used = new Set((await db`SELECT name FROM players`).map((r) => r.name as string));
  const newName = () => { for (;;) { const n = `${pick(FIRST)} ${pick(LAST)}`; if (!used.has(n)) { used.add(n); return n; } } };
  type P = { id: number; num: string; g: boolean; name: string; strength: number };
  const roster = new Map<number, P[]>();

  for (const t of teams) {
    const have = await db`SELECT p.id, p.name, p.position, re.id AS re_id, re.number FROM roster_entries re JOIN players p ON p.id=re.player_id WHERE re.team_id=${t.id} AND NOT re.is_sub ORDER BY p.id`;
    const nums = new Set(have.map((r) => Number(r.number)).filter((n) => n > 0));
    const nextNum = (lo = 2) => { let n = int(lo, 98); while (nums.has(n)) n = int(2, 98); nums.add(n); return n; };
    const list: P[] = [];
    let hasG = have.some((r) => r.position === "G");
    for (const r of have) {
      let num = r.number;
      if (!num) { num = String(nextNum()); await db`UPDATE roster_entries SET number=${num} WHERE id=${r.re_id}`; }
      list.push({ id: r.id, num: String(num), g: r.position === "G", name: r.name, strength: 3.8 + (rnd() - 0.5) * 0.8 });
    }
    while (list.length < 16) {
      const name = newName();
      const g = !hasG; hasG = true;
      const pos = g ? "G" : list.length % 3 === 0 ? "D" : rnd() < 0.5 ? "C" : "W";
      const num = String(g ? int(1, 35) : nextNum());
      nums.add(Number(num));
      const [p] = await db`INSERT INTO players (name,name_key,position,rating,start_rating) VALUES (${name},${key(name)},${pos},3.8,3.8) RETURNING id`;
      await db`INSERT INTO roster_entries (team_id,player_id,number,source,added_at) VALUES (${t.id},${p.id},${num},'sheet',now())`;
      list.push({ id: p.id, num, g, name, strength: 3.8 + (rnd() - 0.5) * 0.8 });
    }
    // Goalie first, so the sheet builder can find him.
    list.sort((a, b) => Number(b.g) - Number(a.g));
    roster.set(t.id, list);
  }

  // Round robin over all teams, 10 weekly rounds ending last week.
  const ids = teams.map((t) => t.id as number);
  if (ids.length % 2) ids.push(-1);
  const rounds: [number, number][][] = [];
  const arr = ids.slice();
  for (let r = 0; r < arr.length - 1; r++) {
    const pairs: [number, number][] = [];
    for (let i = 0; i < arr.length / 2; i++) { const p: [number, number] = r % 2 ? [arr[i], arr[arr.length - 1 - i]] : [arr[arr.length - 1 - i], arr[i]]; if (p[0] > 0 && p[1] > 0) pairs.push(p); }
    rounds.push(pairs);
    arr.splice(1, 0, arr.pop()!);
  }
  while (rounds.length < 10) rounds.push(rounds[rounds.length % (arr.length - 1)]);
  const TIMES = ["8:00 PM", "9:15 PM", "10:30 PM", "11:15 PM"];
  const str = (tid: number) => { const l = roster.get(tid)!; return l.reduce((a, p) => a + p.strength, 0) / l.length; };
  const now = Date.now();
  let games = 0;
  for (let r = 0; r < 10; r++) {
    const date = localDate(new Date(now - (10 - r) * 7 * 86400000));
    for (let gi = 0; gi < rounds[r].length; gi++) {
      const [home, away] = rounds[r][gi];
      const lam = (a: number, b: number) => Math.max(0.6, 3 + (str(a) - str(b)) * 3);
      const pois = (l: number) => { let k = 0, p = Math.exp(-l), c = p; const u = rnd(); while (u > c && k < 12) { k++; p *= l / k; c += p; } return k; };
      const score: Record<number, number> = { [home]: pois(lam(home, away)), [away]: pois(lam(away, home)) };
      const sides: Record<number, { dressed: P[]; goals: any[]; pens: any[] }> = {};
      for (const tid of [home, away]) {
        const all = roster.get(tid)!;
        const dressed = [all[0], ...all.slice(1).filter(() => rnd() > 0.2)];
        const sk = dressed.filter((p) => !p.g);
        const goals = [];
        for (let k = 0; k < score[tid]; k++) {
          const sc = pick(sk), a1 = rnd() < 0.8 ? pick(sk.filter((p) => p !== sc)) : null, a2 = a1 && rnd() < 0.55 ? pick(sk.filter((p) => p !== sc && p !== a1)) : null;
          goals.push({ period: int(1, 3), time: `${int(0, 14)}:${String(int(0, 59)).padStart(2, "0")}`, scorer: sc.num, assist1: a1?.num ?? null, assist2: a2?.num ?? null });
        }
        const pens = [];
        for (let k = 0, n = int(0, 3); k < n; k++) pens.push({ period: int(1, 3), number: pick(sk).num, offense: pick(["Tripping", "Hooking", "Slashing", "Interference", "Holding", "Roughing"]), minutes: 2 });
        sides[tid] = { dressed, goals, pens };
      }
      const [g] = await db`INSERT INTO games (league_id,season_id,home_team_id,away_team_id,played_on,start_time,home_score,away_score,periods_json,goals_json,penalties_json,shots_json,source)
        VALUES (${league.id},${season?.id ?? null},${home},${away},${date},${TIMES[gi % 4]},${score[home]},${score[away]},
          ${JSON.stringify({ home: [], away: [] })},${JSON.stringify({ home: sides[home].goals, away: sides[away].goals })},
          ${JSON.stringify({ home: sides[home].pens, away: sides[away].pens })},${JSON.stringify({ home: [], away: [] })},'sheet') RETURNING id`;
      for (const tid of [home, away]) {
        const sd = sides[tid], against = tid === home ? score[away] : score[home];
        for (const p of sd.dressed) {
          const gl = sd.goals.filter((x) => x.scorer === p.num).length;
          const as = sd.goals.filter((x) => x.assist1 === p.num || x.assist2 === p.num).length;
          const pim = sd.pens.filter((x) => x.number === p.num).reduce((a, x) => a + x.minutes, 0);
          await db`INSERT INTO player_game_stats (game_id,player_id,team_id,number,goals,assists,pim,is_goalie,goals_against) VALUES (${g.id},${p.id},${tid},${p.num},${gl},${as},${pim},${p.g ? 1 : 0},${p.g ? against : null})`;
        }
      }
      games++;
    }
  }

  // Tonight: every pair plays 100 minutes from now, then the same pairs in one and two weeks.
  // "Tonight" in rink time: 9:15 PM if that's still ahead, else 40 minutes from now, never past 11:55 PM.
  const etNow = new Date(new Date(now).toLocaleString("en-US", { timeZone: TZ }));
  const offset = now - etNow.getTime();
  const at915 = new Date(etNow); at915.setHours(21, 15, 0, 0);
  const at2355 = new Date(etNow); at2355.setHours(23, 55, 0, 0);
  let etGame = at915.getTime() > etNow.getTime() + 40 * 60000 ? at915.getTime() : Math.min(etNow.getTime() + 40 * 60000, at2355.getTime());
  if (etGame < etNow.getTime() + 12 * 60000) etGame = etNow.getTime() + 40 * 60000;
  const tonight = new Date(etGame + offset);
  for (let w = 0; w < 3; w++) {
    const at = new Date(tonight.getTime() + w * 7 * 86400000);
    for (const [hn, an] of PAIRS) {
      const home = byName.get(hn)!, away = byName.get(an)!;
      for (const [tid, opp, isHome] of [[home, away, true], [away, home, false]] as const) {
        await db`INSERT INTO scheduled_games (team_id,opponent_team_id,is_home,starts_at,local_date,local_time,location,kind,source)
          VALUES (${tid},${opp},${isHome},${at.toISOString()},${localDate(at)},${localTime(at)},'Polar Ice Wilmington','league','manual')`;
      }
    }
  }

  // Facts for the walkthrough: per pair, who the captain and the new player are, and both rosters.
  const facts = PAIRS.map(([hn, an]) => {
    const home = byName.get(hn)!, away = byName.get(an)!;
    const hr = roster.get(home)!, ar = roster.get(away)!;
    const full = hr.filter((p) => !p.g && / /.test(p.name) && !/\./.test(p.name));
    const sk = full.length >= 2 ? full : hr.filter((p) => !p.g);
    return {
      home: { id: home, name: hn, roster: hr.map((p) => ({ id: p.id, number: p.num, name: p.name, goalie: p.g })) },
      away: { id: away, name: an, roster: ar.map((p) => ({ id: p.id, number: p.num, name: p.name, goalie: p.g })) },
      captain: { id: sk[0].id, number: sk[0].num, name: sk[0].name }, player: { id: sk[1].id, number: sk[1].num, name: sk[1].name },
    };
  });
  mkdirSync("audit", { recursive: true });
  writeFileSync("audit/seed.json", JSON.stringify({ leagueId: league.id, rinkId: league.rink_id, tonight: { iso: tonight.toISOString(), localDate: localDate(tonight), localTime: localTime(tonight) }, today: localDate(new Date(now)), pairs: facts }, null, 2));
  console.log(`seeded ${games} games over 10 rounds; ${teams.length} teams; tonight ${localDate(tonight)} ${localTime(tonight)} ET`);
}

main().then(() => db.end()).catch(async (e) => { console.error(e); await db.end(); process.exit(1); });
