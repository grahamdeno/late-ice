// Seeds a realistic season into the LOCAL CI database for measurement only.
// C league at Polar Ice: 8 teams, 150 players (144 rostered + 6 subs), 40 confirmed games
// (10 per team) with goals, assists and penalties, and 3 upcoming games per team.
// Ratings are produced afterwards by the nightly replay (/api/cron/recompute).
// Never point this at production: it refuses any DATABASE_URL that is not localhost.
import postgres from "postgres";

const url = process.env.DATABASE_URL || "";
if (!/127\.0\.0\.1|localhost/.test(url)) throw new Error("seed-season only runs against a local database");
const db = postgres(url, { prepare: false, max: 2, onnotice: () => {} });

// Deterministic randomness so every run measures the same data.
let s = 20261105;
const rnd = () => { s |= 0; s = (s + 0x6d2b79f5) | 0; let t = Math.imul(s ^ (s >>> 15), 1 | s); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
const pick = <T,>(a: T[]) => a[Math.floor(rnd() * a.length)];
const int = (lo: number, hi: number) => lo + Math.floor(rnd() * (hi - lo + 1));

const FIRST = ["Mike", "Dan", "Chris", "Sam", "Jake", "Tom", "Ryan", "Nick", "Ben", "Luke", "Paul", "Eric", "Matt", "Kyle", "Josh", "Drew", "Alex", "Pete", "Tyler", "Gary", "Bill", "Greg", "Phil", "Scott", "Brian", "Kevin", "Jason", "Steve", "Mark", "Adam", "Jared", "Cody", "Zach", "Evan", "Sean", "Brett", "Derek", "Cole", "Trent", "Wes"];
const LAST = ["Tolliver", "Reyes", "Hales", "Okafor", "Brandt", "Kuehn", "Pell", "Ferraro", "Ashby", "Marsh", "Grady", "Lunde", "Cho", "Brennan", "Weller", "Fisk", "Novak", "Simms", "Voss", "Pruitt", "Hanlon", "Barone", "Lutz", "Mercer", "Doyle", "Keane", "Walsh", "Hobbs", "Ruiz", "Becker", "Lang", "Moss", "Pike", "Shaw", "Tate", "Quinn", "Burke", "Nash", "Price", "Rhodes", "Sutter", "Ivey", "Gant", "Holt", "Vance"];
const key = (n: string) => n.toLowerCase().replace(/[^a-z]/g, "");

async function main() {
  const league = (await db`SELECT l.id, l.rink_id FROM leagues l JOIN rinks r ON r.id=l.rink_id WHERE r.slug='polar-ice-wilmington' AND l.level='C'`)[0];
  if (!league) throw new Error("C league not found; run against a freshly migrated database");
  const season = (await db`SELECT id FROM seasons WHERE rink_id=${league.rink_id} AND name='Fall 2026'`)[0];
  const teams = await db`SELECT id, name FROM teams WHERE league_id=${league.id} ORDER BY id`;
  if (teams.length !== 8) throw new Error(`expected 8 C league teams, found ${teams.length}`);
  if ((await db`SELECT COUNT(*)::int n FROM games WHERE league_id=${league.id}`)[0].n > 0) { console.log("already seeded"); return; }

  const used = new Set<string>();
  const newName = () => { for (;;) { const n = `${pick(FIRST)} ${pick(LAST)}`; if (!used.has(n)) { used.add(n); return n; } } };
  const roster = new Map<number, { id: number; num: string; g: boolean; strength: number }[]>();
  const subs: { id: number; num: string; strength: number }[] = [];

  for (const t of teams) {
    const nums = new Set<number>();
    const list: { id: number; num: string; g: boolean; strength: number }[] = [];
    for (let i = 0; i < 18; i++) {
      let n = i === 0 ? int(1, 35) : int(2, 98);
      while (nums.has(n)) n = int(2, 98);
      nums.add(n);
      const name = newName();
      const strength = 3.8 + (rnd() - 0.5) * 0.8;
      const pos = i === 0 ? "G" : i < 7 ? "D" : "F";
      const [p] = await db`INSERT INTO players (name,name_key,position,rating,start_rating) VALUES (${name},${key(name)},${pos},3.8,3.8) RETURNING id`;
      await db`INSERT INTO roster_entries (team_id,player_id,number,source,added_at) VALUES (${t.id},${p.id},${String(n)},'sheet',now())`;
      list.push({ id: p.id, num: String(n), g: i === 0, strength });
    }
    roster.set(t.id, list);
  }
  for (let i = 0; i < 6; i++) {
    const name = newName();
    const [p] = await db`INSERT INTO players (name,name_key,position,rating,start_rating) VALUES (${name},${key(name)},'F',3.8,3.8) RETURNING id`;
    subs.push({ id: p.id, num: String(int(60, 99)), strength: 3.8 });
  }

  // Circle-method round robin: 7 rounds, then rounds 1-3 again = 10 games per team.
  const ids = teams.map((t) => t.id as number);
  const rounds: [number, number][][] = [];
  const arr = ids.slice();
  for (let r = 0; r < 7; r++) {
    const pairs: [number, number][] = [];
    for (let i = 0; i < 4; i++) pairs.push(r % 2 ? [arr[i], arr[7 - i]] : [arr[7 - i], arr[i]]);
    rounds.push(pairs);
    arr.splice(1, 0, arr.pop()!);
  }
  rounds.push(rounds[0], rounds[1], rounds[2]);

  const TIMES = ["8:00 PM", "9:15 PM", "10:30 PM", "11:15 PM"];
  const strengthOf = (tid: number) => roster.get(tid)!.reduce((a, p) => a + p.strength, 0) / 18;
  let games = 0;
  for (let r = 0; r < rounds.length; r++) {
    const d = new Date(Date.UTC(2026, 8, 1 + r * 6));
    const date = d.toISOString().slice(0, 10);
    for (let gi = 0; gi < 4; gi++) {
      const [home, away] = rounds[r][gi];
      const lam = (a: number, b: number) => Math.max(0.6, 3 + (strengthOf(a) - strengthOf(b)) * 3);
      const pois = (l: number) => { let k = 0, p = Math.exp(-l), c = p; const u = rnd(); while (u > c && k < 12) { k++; p *= l / k; c += p; } return k; };
      const score = { [home]: pois(lam(home, away)), [away]: pois(lam(away, home)) };
      const sides: Record<number, { dressed: { id: number; num: string; g: boolean }[]; goals: any[]; pens: any[] }> = {};
      for (const tid of [home, away]) {
        const all = roster.get(tid)!;
        const skaters = all.filter((p) => !p.g).filter(() => rnd() > 0.2);
        const dressed: { id: number; num: string; g: boolean }[] = [all[0], ...skaters];
        if (rnd() < 0.25) dressed.push({ ...pick(subs), g: false });
        const goals = [];
        for (let k = 0; k < score[tid]; k++) {
          const sk = dressed.filter((p) => !p.g);
          const sc = pick(sk), a1 = rnd() < 0.8 ? pick(sk.filter((p) => p !== sc)) : null, a2 = a1 && rnd() < 0.55 ? pick(sk.filter((p) => p !== sc && p !== a1)) : null;
          goals.push({ period: int(1, 3), time: `${int(0, 14)}:${String(int(0, 59)).padStart(2, "0")}`, scorer: sc.num, assist1: a1?.num ?? null, assist2: a2?.num ?? null });
        }
        const pens = [];
        for (let k = 0, n = int(0, 4); k < n; k++) pens.push({ period: int(1, 3), number: pick(dressed.filter((p) => !p.g)).num, offense: pick(["Tripping", "Hooking", "Slashing", "Interference", "Holding", "Roughing"]), minutes: 2 });
        sides[tid] = { dressed, goals, pens };
      }
      const [g] = await db`INSERT INTO games (league_id,season_id,home_team_id,away_team_id,played_on,start_time,home_score,away_score,periods_json,goals_json,penalties_json,shots_json,source)
        VALUES (${league.id},${season?.id ?? null},${home},${away},${date},${TIMES[gi]},${score[home]},${score[away]},
          ${JSON.stringify({ home: [], away: [] })},${JSON.stringify({ home: sides[home].goals, away: sides[away].goals })},
          ${JSON.stringify({ home: sides[home].pens, away: sides[away].pens })},${JSON.stringify({ home: [], away: [] })},'sheet') RETURNING id`;
      for (const tid of [home, away]) {
        const sd = sides[tid], against = tid === home ? score[away] : score[home];
        for (const p of sd.dressed) {
          const goals = sd.goals.filter((x) => x.scorer === p.num).length;
          const assists = sd.goals.filter((x) => x.assist1 === p.num || x.assist2 === p.num).length;
          const pim = sd.pens.filter((x) => x.number === p.num).reduce((a, x) => a + x.minutes, 0);
          await db`INSERT INTO player_game_stats (game_id,player_id,team_id,number,goals,assists,pim,is_goalie,goals_against) VALUES (${g.id},${p.id},${tid},${p.num},${goals},${assists},${pim},${p.g ? 1 : 0},${p.g ? against : null})`;
          if (subs.some((x) => x.id === p.id)) await db`INSERT INTO roster_entries (team_id,player_id,number,source,added_at,is_sub) VALUES (${tid},${p.id},${p.num},'sheet',now(),true) ON CONFLICT DO NOTHING`;
        }
      }
      games++;
    }
  }

  // Three upcoming games per team, starting tomorrow, 9:15 PM Eastern.
  for (let w = 0; w < 3; w++) {
    const d = new Date(Date.now() + (1 + w * 7) * 86400000);
    const local = d.toISOString().slice(0, 10);
    for (const [home, away] of rounds[3 + w]) {
      const startsAt = `${local}T21:15:00-05:00`;
      for (const [tid, opp, isHome] of [[home, away, true], [away, home, false]] as const) {
        await db`INSERT INTO scheduled_games (team_id,opponent_team_id,is_home,starts_at,local_date,local_time,location,kind,source) VALUES (${tid},${opp},${isHome},${startsAt},${local},'9:15 PM','Polar Ice Wilmington','league','manual')`;
      }
    }
  }
  const n = (await db`SELECT COUNT(DISTINCT player_id)::int n FROM roster_entries re JOIN teams t ON t.id=re.team_id WHERE t.league_id=${league.id}`)[0].n;
  console.log(`seeded ${games} games, ${n} players, ${8 * 3} upcoming games`);
}

main().then(() => db.end()).catch(async (e) => { console.error(e); await db.end(); process.exit(1); });
