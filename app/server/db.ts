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
  created_from_sheet INTEGER
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
  C: [["Front Street Flyers", "#EF4444"], ["Ogden Owls", "#8B5CF6"], ["Shell Island Shinnies", "#0EA5E9"], ["Hampstead Hackers", "#22C55E"], ["Brunswick Biscuits", "#EAB308"]],
  D: [["Pelican Pucks", "#F43F5E"], ["Kure Beach Bums", "#10B981"], ["Monkey Junction Jammers", "#F59E0B"]],
  "40+": [["Old Salts", "#60A5FA"], ["Dad Bod Squad", "#FB923C"], ["Graybeards", "#A3A3A3"], ["Cape Fear Geezers", "#34D399"]],
};

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
    const leagues: [string, string, string][] = [
      ["A", "A League", "Top division. Former college and junior players."],
      ["B", "B League", "Strong rec. Fast, organized, competitive."],
      ["C", "C League", "Middle of the pack. Most of the rink lives here."],
      ["D", "D League", "Newer players and learn-to-play grads."],
      ["40+", "Over 40", "Age 40 and up. Same intensity, earlier bedtime."],
    ];
    const insL = sqlite.prepare("INSERT INTO leagues (rink_id,level,name,blurb,season,sort) VALUES (?,?,?,?,?,?)");
    const insT = sqlite.prepare("INSERT INTO teams (league_id,name,color,is_sample) VALUES (?,?,?,1)");
    leagues.forEach(([lvl, name, blurb], i) => {
      const l = insL.run(rink.lastInsertRowid, lvl, name, blurb, "Fall 2026", i);
      for (const [tn, c] of TEAM_SEED[lvl]) insT.run(l.lastInsertRowid, tn, c);
    });
  });
  tx();
}
