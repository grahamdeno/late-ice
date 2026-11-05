import Database from "better-sqlite3";

export const sqlite = new Database(process.env.LATE_ICE_DB || "data.db");
sqlite.pragma("journal_mode = WAL");
sqlite.pragma("foreign_keys = ON");

sqlite.exec(`
CREATE TABLE IF NOT EXISTS regions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  slug TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  state TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS rinks (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  region_id INTEGER NOT NULL REFERENCES regions(id),
  slug TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  former_name TEXT,
  address TEXT,
  phone TEXT,
  sheets INTEGER DEFAULT 1,
  surface TEXT,
  website TEXT
);
CREATE TABLE IF NOT EXISTS seasons (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  rink_id INTEGER NOT NULL REFERENCES rinks(id),
  name TEXT NOT NULL,
  starts_on TEXT NOT NULL,
  ends_on TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS leagues (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  rink_id INTEGER NOT NULL REFERENCES rinks(id),
  level TEXT NOT NULL,
  name TEXT NOT NULL,
  blurb TEXT,
  season TEXT NOT NULL,
  sort INTEGER DEFAULT 0
);
CREATE TABLE IF NOT EXISTS teams (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  league_id INTEGER NOT NULL REFERENCES leagues(id),
  name TEXT NOT NULL,
  color TEXT NOT NULL,
  is_sample INTEGER DEFAULT 0,
  created_from_sheet INTEGER,
  logo TEXT
);
CREATE TABLE IF NOT EXISTS team_imports (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  team_id INTEGER NOT NULL REFERENCES teams(id),
  season_id INTEGER REFERENCES seasons(id),
  gp INTEGER NOT NULL, w INTEGER NOT NULL, l INTEGER NOT NULL, t INTEGER NOT NULL, otl INTEGER DEFAULT 0,
  as_of TEXT NOT NULL, source TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS player_imports (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  player_id INTEGER NOT NULL REFERENCES players(id),
  team_id INTEGER NOT NULL REFERENCES teams(id),
  season_id INTEGER REFERENCES seasons(id),
  gp INTEGER NOT NULL, g INTEGER NOT NULL, a INTEGER NOT NULL, pim INTEGER NOT NULL,
  as_of TEXT NOT NULL, source TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS players (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  name_key TEXT NOT NULL,
  position TEXT DEFAULT 'F',
  rating REAL NOT NULL,
  games_rated INTEGER DEFAULT 0,
  claimed INTEGER DEFAULT 0,
  created_at TEXT DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS players_key ON players(name_key);
CREATE TABLE IF NOT EXISTS roster_entries (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  team_id INTEGER NOT NULL REFERENCES teams(id),
  player_id INTEGER NOT NULL REFERENCES players(id),
  number TEXT,
  UNIQUE(team_id, player_id)
);
CREATE TABLE IF NOT EXISTS sheets (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  image_path TEXT NOT NULL,
  mime TEXT NOT NULL,
  status TEXT NOT NULL,
  source TEXT DEFAULT 'upload',
  extracted_json TEXT,
  warnings_json TEXT,
  error TEXT,
  model TEXT,
  ms INTEGER,
  game_id INTEGER,
  created_at TEXT DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS games (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  league_id INTEGER NOT NULL REFERENCES leagues(id),
  season_id INTEGER REFERENCES seasons(id),
  home_team_id INTEGER NOT NULL REFERENCES teams(id),
  away_team_id INTEGER NOT NULL REFERENCES teams(id),
  played_on TEXT,
  start_time TEXT,
  home_score INTEGER NOT NULL,
  away_score INTEGER NOT NULL,
  periods_json TEXT,
  goals_json TEXT,
  penalties_json TEXT,
  shots_json TEXT,
  sheet_id INTEGER,
  created_at TEXT DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS player_game_stats (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  game_id INTEGER NOT NULL REFERENCES games(id),
  player_id INTEGER NOT NULL REFERENCES players(id),
  team_id INTEGER NOT NULL REFERENCES teams(id),
  number TEXT,
  goals INTEGER DEFAULT 0,
  assists INTEGER DEFAULT 0,
  pim INTEGER DEFAULT 0,
  is_goalie INTEGER DEFAULT 0,
  shots_against INTEGER,
  goals_against INTEGER
);
CREATE TABLE IF NOT EXISTS rating_history (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  player_id INTEGER NOT NULL REFERENCES players(id),
  game_id INTEGER NOT NULL REFERENCES games(id),
  before REAL NOT NULL,
  after REAL NOT NULL,
  reasons_json TEXT NOT NULL,
  created_at TEXT DEFAULT (datetime('now'))
);
`);

export const LEVEL_START: Record<string, number> = { A: 5.0, B: 4.4, C: 3.8, D: 3.2, "40+": 3.9 };

const TEAM_SEED: Record<string, [string, string][]> = {
  A: [["Port City Pilots", "#3B82F6"], ["Riverwalk Rats", "#F59E0B"], ["Masonboro Mariners", "#14B8A6"], ["Seahawk Alumni", "#A855F7"]],
  B: [["Wrightsville Waves", "#06B6D4"], ["Azalea Assassins", "#EC4899"], ["Oak Island Otters", "#84CC16"], ["Carolina Kegs", "#F97316"]],
  C: [["Backside Checkers", "#EF4444"], ["Blue Liners", "#3B82F6"], ["Fighting Irish", "#22C55E"], ["Hammer'd Heads", "#F5B301"], ["Hinson Hookers", "#EC4899"], ["Seal Team Sticks (Muckers)", "#14B8A6"], ["Whiskey Dekes", "#A855F7"], ["Wild Puckers", "#F97316"]],
  D: [["Pelican Pucks", "#F43F5E"], ["Kure Beach Bums", "#10B981"], ["Monkey Junction Jammers", "#F59E0B"]],
  "40+": [["Masters Blue", "#60A5FA"], ["Masters Orange", "#FB923C"], ["Masters Gray", "#A3A3A3"], ["Masters Green", "#34D399"]],
  DEMO: [["Front Street Flyers", "#EF4444"], ["Ogden Owls", "#8B5CF6"], ["Old Salts", "#60A5FA"], ["Dad Bod Squad", "#FB923C"]],
};

// Real C League standings as posted by the rink, 2026-11-05. 10 games played each.
const C_STANDINGS: [string, number, number][] = [
  ["Hammer'd Heads", 8, 2], ["Seal Team Sticks (Muckers)", 7, 3], ["Wild Puckers", 6, 4], ["Whiskey Dekes", 6, 4],
  ["Hinson Hookers", 4, 6], ["Blue Liners", 4, 6], ["Fighting Irish", 3, 7], ["Backside Checkers", 2, 8],
];
// Hammer'd Heads season totals as posted by the rink: name, G, A, PIM, GP.
const HAMMERD_HEADS: [string, number, number, number, number][] = [
  ["Jared A.", 4, 4, 0, 3], ["Nathan B.", 0, 0, 0, 2], ["Joshua B.", 4, 3, 0, 2], ["Graham D.", 0, 1, 0, 4], ["Alex F.", 1, 0, 0, 4],
  ["Steve G.", 0, 3, 0, 5], ["Tristan H.", 0, 0, 0, 0], ["Claude H.", 1, 1, 0, 3], ["Joseph H.", 4, 0, 0, 1], ["Seth L.", 2, 0, 0, 5],
  ["Matt M.", 0, 0, 0, 4], ["Steven M.", 2, 0, 0, 3], ["Ben M.", 1, 0, 0, 5], ["Dan M.", 3, 1, 0, 6], ["Rob N.", 0, 0, 0, 1],
  ["Kristian S.", 0, 0, 0, 2], ["Adam Y.", 6, 4, 0, 5],
];
const IMPORT_SRC = "Polar Ice Wilmington league stats page";
const IMPORT_AS_OF = "2026-11-05";

export function seed() {
  const has = sqlite.prepare("SELECT COUNT(*) c FROM regions").get() as { c: number };
  if (has.c > 0) return;
  const tx = sqlite.transaction(() => {
    const r = sqlite.prepare("INSERT INTO regions (slug,name,state) VALUES (?,?,?)").run("wilmington-nc", "Wilmington", "NC");
    const rink = sqlite
      .prepare(
        "INSERT INTO rinks (region_id,slug,name,former_name,address,phone,sheets,surface,website) VALUES (?,?,?,?,?,?,?,?,?)",
      )
      .run(
        r.lastInsertRowid,
        "polar-ice-wilmington",
        "Polar Ice Wilmington",
        "Wilmington Ice House",
        "7201 Ogden Business Ln, Wilmington, NC 28411",
        "(910) 686-1987",
        1,
        "NHL-size sheet",
        "https://www.polaricewilmington.com/page/show/7813074-adult-hockey-league",
      );
    // Polar Ice runs four seasons a year. Other rinks define one to four; a sheet's date picks the season.
    const insS = sqlite.prepare("INSERT INTO seasons (rink_id,name,starts_on,ends_on) VALUES (?,?,?,?)");
    const seasonRows: [string, string, string][] = [
      ["Winter 2026", "2026-01-01", "2026-03-31"], ["Spring 2026", "2026-04-01", "2026-06-30"],
      ["Summer 2026", "2026-07-01", "2026-08-31"], ["Fall 2026", "2026-09-01", "2026-12-31"],
      ["Winter 2027", "2027-01-01", "2027-03-31"],
    ];
    let fall = 0;
    for (const [n, a, b] of seasonRows) { const r = insS.run(rink.lastInsertRowid, n, a, b); if (n === "Fall 2026") fall = Number(r.lastInsertRowid); }
    const leagues: [string, string, string][] = [
      ["A", "A League", "Top division. Former college and junior players."],
      ["B", "B League", "Strong rec. Fast, organized, competitive."],
      ["C", "C League", "Eight teams. Most of the rink lives here."],
      ["D", "D League", "Newer players and learn-to-play grads."],
      ["40+", "Over 40", "Age 40 and up. Same intensity, earlier bedtime."],
      ["DEMO", "Demo", "Practice league for trying the scoresheet reader. Nothing here touches real standings."],
    ];
    const insL = sqlite.prepare("INSERT INTO leagues (rink_id,level,name,blurb,season,sort) VALUES (?,?,?,?,?,?)");
    const insT = sqlite.prepare("INSERT INTO teams (league_id,name,color,is_sample) VALUES (?,?,?,?)");
    const REAL = new Set(["C"]);
    const teamIds = new Map<string, number>();
    leagues.forEach(([lvl, name, blurb], i) => {
      const l = insL.run(rink.lastInsertRowid, lvl, name, blurb, "Fall 2026", lvl === "DEMO" ? 99 : i);
      for (const [tn, c] of TEAM_SEED[lvl]) {
        const t = insT.run(l.lastInsertRowid, tn, c, REAL.has(lvl) ? 0 : 1);
        if (lvl === "C") teamIds.set(tn, Number(t.lastInsertRowid));
      }
    });
    const insTI = sqlite.prepare("INSERT INTO team_imports (team_id,season_id,gp,w,l,t,otl,as_of,source) VALUES (?,?,?,?,?,0,0,?,?)");
    for (const [tn, w, l] of C_STANDINGS) insTI.run(teamIds.get(tn), fall, w + l, w, l, IMPORT_AS_OF, IMPORT_SRC);
    const hh = teamIds.get("Hammer'd Heads")!;
    sqlite.prepare("UPDATE teams SET logo=? WHERE id=?").run("/logos/hammerd-heads.jpg", hh);
    const insP = sqlite.prepare("INSERT INTO players (name,name_key,position,rating) VALUES (?,?,'F',?)");
    const insR = sqlite.prepare("INSERT INTO roster_entries (team_id,player_id,number) VALUES (?,?,NULL)");
    const insPI = sqlite.prepare("INSERT INTO player_imports (player_id,team_id,season_id,gp,g,a,pim,as_of,source) VALUES (?,?,?,?,?,?,?,?,?)");
    for (const [name, g, a, pim, gp] of HAMMERD_HEADS) {
      const pid = Number(insP.run(name, name.toLowerCase().replace(/[^a-z]/g, ""), LEVEL_START.C).lastInsertRowid);
      insR.run(hh, pid);
      insPI.run(pid, hh, fall, gp, g, a, pim, IMPORT_AS_OF, IMPORT_SRC);
    }
  });
  tx();
}
