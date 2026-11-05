import type { Express, Request, Response, NextFunction } from "express";
import type { Server } from "http";
import fs from "node:fs";
import path from "node:path";
import { sqlite, seed } from "./db";
import { readScoresheet, checkSheet, type OcrResult } from "./ocr";
import { suggest, confirmSheet, standings, leaders, gameCard, teamRecord, teamRating, currentSeason, seasonsWithData } from "./services";

const q = <T = any>(sql: string, ...p: any[]) => sqlite.prepare(sql).all(...p) as T[];
const one = <T = any>(sql: string, ...p: any[]) => sqlite.prepare(sql).get(...p) as T | undefined;

const ROOT = process.cwd();
const UPLOADS = process.env.LATE_ICE_UPLOADS || (process.env.LATE_ICE_DB ? path.join(path.dirname(process.env.LATE_ICE_DB), "uploads") : path.join(ROOT, "uploads"));
const SAMPLES = path.join(ROOT, "samples");
fs.mkdirSync(UPLOADS, { recursive: true });

const SAMPLE_LIST = [
  { id: "demo-flyers-owls", title: "Demo · Flyers vs Owls", file: "demo-flyers-owls.jpg" },
  { id: "demo-salts-dadbods", title: "Demo · Old Salts vs Dad Bod Squad", file: "demo-salts-dadbods.jpg" },
];

const wrap = (fn: (req: Request, res: Response) => any) => (req: Request, res: Response, next: NextFunction) =>
  Promise.resolve(fn(req, res)).catch(next);

async function runOcr(sheetId: number) {
  const s = one<any>("SELECT * FROM sheets WHERE id=?", sheetId);
  if (!s) return;
  const t0 = Date.now();
  try {
    const b64 = fs.readFileSync(s.image_path).toString("base64");
    const { result, model } = await readScoresheet(b64, s.mime);
    sqlite
      .prepare("UPDATE sheets SET status='review', extracted_json=?, warnings_json=?, model=?, ms=?, error=NULL WHERE id=?")
      .run(JSON.stringify(result), JSON.stringify(checkSheet(result)), model, Date.now() - t0, sheetId);
  } catch (e: any) {
    sqlite.prepare("UPDATE sheets SET status='failed', error=?, ms=? WHERE id=?").run(String(e?.message || e).slice(0, 400), Date.now() - t0, sheetId);
  }
}

function sheetView(s: any) {
  const data: OcrResult | null = s.extracted_json ? JSON.parse(s.extracted_json) : null;
  return {
    id: s.id, status: s.status, source: s.source, error: s.error, model: s.model, ms: s.ms, gameId: s.game_id, createdAt: s.created_at,
    data, warnings: s.warnings_json ? JSON.parse(s.warnings_json) : [],
    suggestion: data && s.status === "review" ? suggest(data) : null,
  };
}

export async function registerRoutes(httpServer: Server, app: Express): Promise<Server> {
  seed();

  app.get("/api/bootstrap", (_req, res) => {
    const region = one("SELECT * FROM regions LIMIT 1");
    const rink = one("SELECT * FROM rinks LIMIT 1");
    const leagues = q("SELECT * FROM leagues ORDER BY sort").map((l: any) => ({
      ...l, teams: q("SELECT id,name,color,logo,is_sample FROM teams WHERE league_id=? ORDER BY name", l.id),
    }));
    const season = currentSeason(rink.id);
    const seasons = q("SELECT * FROM seasons WHERE rink_id=? ORDER BY starts_on", rink.id);
    const counts = {
      games: one<any>("SELECT COUNT(*) c FROM games g JOIN leagues l ON l.id=g.league_id WHERE l.level<>'DEMO'")!.c,
      players: one<any>("SELECT COUNT(DISTINCT p.id) c FROM players p JOIN roster_entries re ON re.player_id=p.id JOIN teams t ON t.id=re.team_id JOIN leagues l ON l.id=t.league_id WHERE l.level<>'DEMO'")!.c,
      sheets: one<any>("SELECT COUNT(*) c FROM sheets WHERE status='confirmed'")!.c,
    };
    res.json({ region, rink, leagues, counts, season, seasons });
  });

  app.get("/api/feed", (req, res) => {
    const lid = req.query.league ? Number(req.query.league) : null;
    const games = q(
      "SELECT g.* FROM games g JOIN leagues l ON l.id=g.league_id " + (lid ? "WHERE g.league_id=? " : "WHERE l.level<>'DEMO' ") + "ORDER BY g.played_on DESC, g.id DESC LIMIT 20",
      ...(lid ? [lid] : []),
    ).map(gameCard);
    const movers = q(
      `SELECT rh.player_id id, p.name, rh.before, rh.after, (rh.after-rh.before) delta, rh.game_id
       FROM rating_history rh JOIN players p ON p.id=rh.player_id JOIN games g ON g.id=rh.game_id
       JOIN leagues l ON l.id=g.league_id ${lid ? "WHERE g.league_id=?" : "WHERE l.level<>'DEMO'"} ORDER BY rh.id DESC LIMIT 200`, ...(lid ? [lid] : []),
    ).sort((a: any, b: any) => b.delta - a.delta).slice(0, 5);
    const pending = q("SELECT id,status,created_at FROM sheets WHERE status IN ('processing','review','failed') ORDER BY id DESC LIMIT 5");
    res.json({ games, movers, leaders: leaders(lid, 5), pending });
  });

  app.get("/api/leagues/:id", (req, res) => {
    const l = one<any>("SELECT * FROM leagues WHERE id=?", Number(req.params.id));
    if (!l) return res.status(404).json({ message: "League not found" });
    const seasons = seasonsWithData(l.id);
    const cur = currentSeason(l.rink_id);
    const sid = req.query.season ? Number(req.query.season) : (seasons[0]?.id ?? cur?.id ?? null);
    const season = one("SELECT * FROM seasons WHERE id=?", sid) ?? cur;
    const games = q("SELECT * FROM games WHERE league_id=? AND (season_id=? OR ? IS NULL) ORDER BY played_on DESC, id DESC", l.id, sid, sid).map(gameCard);
    const imports = one<any>("SELECT MAX(as_of) as_of, MAX(source) source, SUM(gp) gp FROM team_imports ti JOIN teams t ON t.id=ti.team_id WHERE t.league_id=? AND ti.season_id=?", l.id, sid);
    res.json({ league: l, season, seasons, standings: standings(l.id, sid), leaders: leaders(l.id, 10, sid), games, imported: imports?.gp ? imports : null });
  });

  app.get("/api/teams/:id", (req, res) => {
    const t = one<any>("SELECT * FROM teams WHERE id=?", Number(req.params.id));
    if (!t) return res.status(404).json({ message: "Team not found" });
    const league = one("SELECT * FROM leagues WHERE id=?", t.league_id);
    const roster = q(
      `SELECT p.id, p.name, p.position, p.rating, p.games_rated, re.number,
        COALESCE((SELECT SUM(goals) FROM player_game_stats s WHERE s.player_id=p.id AND s.team_id=re.team_id),0) + COALESCE((SELECT SUM(g) FROM player_imports i WHERE i.player_id=p.id AND i.team_id=re.team_id),0) g,
        COALESCE((SELECT SUM(assists) FROM player_game_stats s WHERE s.player_id=p.id AND s.team_id=re.team_id),0) + COALESCE((SELECT SUM(a) FROM player_imports i WHERE i.player_id=p.id AND i.team_id=re.team_id),0) a,
        COALESCE((SELECT SUM(pim) FROM player_game_stats s WHERE s.player_id=p.id AND s.team_id=re.team_id),0) + COALESCE((SELECT SUM(pim) FROM player_imports i WHERE i.player_id=p.id AND i.team_id=re.team_id),0) pim,
        (SELECT COUNT(*) FROM player_game_stats s WHERE s.player_id=p.id AND s.team_id=re.team_id) + COALESCE((SELECT SUM(gp) FROM player_imports i WHERE i.player_id=p.id AND i.team_id=re.team_id),0) gp
       FROM roster_entries re JOIN players p ON p.id=re.player_id WHERE re.team_id=? ORDER BY (g+a) DESC, p.rating DESC`, t.id,
    );
    const games = q("SELECT * FROM games WHERE home_team_id=? OR away_team_id=? ORDER BY played_on DESC, id DESC", t.id, t.id).map(gameCard);
    const season = currentSeason(league.rink_id);
    const imported = one<any>("SELECT MAX(as_of) as_of, MAX(source) source, SUM(gp) gp FROM team_imports WHERE team_id=?", t.id);
    res.json({ team: t, league, season, record: teamRecord(t.id, season?.id ?? null), career: teamRecord(t.id), rating: teamRating(t.id), roster, games, imported: imported?.gp ? imported : null });
  });

  app.get("/api/players", (req, res) => {
    const lid = req.query.league ? Number(req.query.league) : null;
    const rows = q(
      `SELECT p.id, p.name, p.position, p.rating, p.games_rated,
        GROUP_CONCAT(DISTINCT t.name) teams, GROUP_CONCAT(DISTINCT l.level) levels,
        COALESCE((SELECT SUM(goals+assists) FROM player_game_stats s WHERE s.player_id=p.id),0) + COALESCE((SELECT SUM(g+a) FROM player_imports i WHERE i.player_id=p.id),0) pts,
        (SELECT after-before FROM rating_history rh WHERE rh.player_id=p.id ORDER BY rh.id DESC LIMIT 1) last_delta
       FROM players p JOIN roster_entries re ON re.player_id=p.id JOIN teams t ON t.id=re.team_id JOIN leagues l ON l.id=t.league_id
       ${lid ? "WHERE l.id=?" : "WHERE l.level<>'DEMO'"} GROUP BY p.id ORDER BY p.rating DESC, pts DESC`, ...(lid ? [lid] : []),
    );
    res.json(rows);
  });

  app.get("/api/players/:id", (req, res) => {
    const p = one<any>("SELECT * FROM players WHERE id=?", Number(req.params.id));
    if (!p) return res.status(404).json({ message: "Player not found" });
    const teams = q(
      `SELECT t.id, t.name, t.color, t.logo, re.number, l.level, l.id league_id FROM roster_entries re JOIN teams t ON t.id=re.team_id JOIN leagues l ON l.id=t.league_id WHERE re.player_id=?`, p.id,
    );
    const history = q(
      `SELECT rh.*, g.played_on FROM rating_history rh JOIN games g ON g.id=rh.game_id WHERE rh.player_id=? ORDER BY rh.id`, p.id,
    ).map((h: any) => ({ ...h, reasons: JSON.parse(h.reasons_json), game: gameCard(one("SELECT * FROM games WHERE id=?", h.game_id)) }));
    const scanned = one<any>(
      "SELECT COUNT(*) gp, COALESCE(SUM(goals),0) g, COALESCE(SUM(assists),0) a, COALESCE(SUM(pim),0) pim FROM player_game_stats WHERE player_id=?", p.id,
    );
    const imp = one<any>("SELECT COALESCE(SUM(gp),0) gp, COALESCE(SUM(g),0) g, COALESCE(SUM(a),0) a, COALESCE(SUM(pim),0) pim, MAX(as_of) as_of, MAX(source) source FROM player_imports WHERE player_id=?", p.id);
    const totals = { gp: scanned.gp + imp.gp, g: scanned.g + imp.g, a: scanned.a + imp.a, pim: scanned.pim + imp.pim };
    const lines = q("SELECT * FROM player_game_stats WHERE player_id=?", p.id);
    // Rank inside each league they play in.
    const ranks = teams.map((t: any) => {
      const ids = q<any>(
        `SELECT DISTINCT p.id, p.rating FROM players p JOIN roster_entries re ON re.player_id=p.id JOIN teams t ON t.id=re.team_id WHERE t.league_id=? ORDER BY p.rating DESC`, t.league_id,
      );
      // Tied ratings share a rank (everyone at the league start rating is T-1st).
      return { level: t.level, rank: ids.filter((x: any) => x.rating > p.rating).length + 1, of: ids.length, tied: ids.filter((x: any) => x.rating === p.rating).length > 1 };
    });
    res.json({ player: p, teams, history, totals, imported: imp.gp ? imp : null, lines, ranks, reliability: Math.min(100, p.games_rated * 10) });
  });

  app.get("/api/games/:id", (req, res) => {
    const g = one<any>("SELECT * FROM games WHERE id=?", Number(req.params.id));
    if (!g) return res.status(404).json({ message: "Game not found" });
    const lines = q(
      `SELECT s.*, p.name, (SELECT after-before FROM rating_history rh WHERE rh.player_id=s.player_id AND rh.game_id=s.game_id) delta
       FROM player_game_stats s JOIN players p ON p.id=s.player_id WHERE s.game_id=? ORDER BY (s.goals+s.assists) DESC, p.name`, g.id,
    );
    res.json({
      ...gameCard(g),
      periods: JSON.parse(g.periods_json || "{}"), goals: JSON.parse(g.goals_json || "{}"),
      penalties: JSON.parse(g.penalties_json || "{}"), shots: JSON.parse(g.shots_json || "{}"), lines,
    });
  });

  app.get("/api/rink", (_req, res) => {
    const rink = one<any>("SELECT * FROM rinks LIMIT 1");
    const region = one<any>("SELECT * FROM regions WHERE id=?", rink.region_id);
    const season = currentSeason(rink.id);
    const leagues = q<any>("SELECT * FROM leagues WHERE rink_id=? AND level<>'DEMO' ORDER BY sort", rink.id).map((l) => {
      const st = standings(l.id, season?.id ?? null);
      return {
        ...l,
        teams: one<any>("SELECT COUNT(*) c FROM teams WHERE league_id=?", l.id)!.c,
        games: st.reduce((a: number, t: any) => a + t.gp, 0) / 2,
        leader: st[0] ?? null,
      };
    });
    const top = q("SELECT p.id,p.name,p.rating,p.position FROM players p WHERE p.games_rated>0 AND EXISTS (SELECT 1 FROM roster_entries re JOIN teams t ON t.id=re.team_id JOIN leagues l ON l.id=t.league_id WHERE re.player_id=p.id AND l.level<>'DEMO') ORDER BY p.rating DESC LIMIT 5");
    const seasons = q("SELECT * FROM seasons WHERE rink_id=? ORDER BY starts_on", rink.id);
    res.json({ rink, region, season, seasons, leagues, top });
  });

  /* ---------- scoresheets ---------- */

  app.get("/api/samples", (_req, res) => res.json(SAMPLE_LIST.map(({ id, title }) => ({ id, title, image: `/api/samples/${id}/image` }))));
  app.get("/api/samples/:id/image", (req, res) => {
    const s = SAMPLE_LIST.find((x) => x.id === req.params.id);
    if (!s) return res.status(404).end();
    res.sendFile(path.join(SAMPLES, s.file));
  });

  app.get("/api/sheets", (_req, res) => res.json(q("SELECT * FROM sheets ORDER BY id DESC LIMIT 30").map(sheetView)));

  app.post("/api/sheets", wrap(async (req, res) => {
    const { image } = req.body as { image?: string };
    const m = image?.match(/^data:(image\/(jpeg|png|webp|gif));base64,(.+)$/);
    if (!m) return res.status(400).json({ message: "Send a JPEG or PNG photo of the scoresheet." });
    const ext = m[2] === "jpeg" ? "jpg" : m[2];
    const file = path.join(UPLOADS, `sheet-${Date.now()}-${Math.random().toString(36).slice(2, 7)}.${ext}`);
    fs.writeFileSync(file, Buffer.from(m[3], "base64"));
    const id = Number(sqlite.prepare("INSERT INTO sheets (image_path,mime,status,source) VALUES (?,?,'processing','upload')").run(file, m[1]).lastInsertRowid);
    runOcr(id);
    res.status(202).json({ id });
  }));

  app.post("/api/sheets/sample/:id", (req, res) => {
    const s = SAMPLE_LIST.find((x) => x.id === req.params.id);
    if (!s) return res.status(404).json({ message: "Unknown sample" });
    const file = path.join(UPLOADS, `sample-${Date.now()}.jpg`);
    fs.copyFileSync(path.join(SAMPLES, s.file), file);
    const id = Number(sqlite.prepare("INSERT INTO sheets (image_path,mime,status,source) VALUES (?,?,'processing','sample')").run(file, "image/jpeg").lastInsertRowid);
    runOcr(id);
    res.status(202).json({ id });
  });

  app.get("/api/sheets/:id", (req, res) => {
    const s = one<any>("SELECT * FROM sheets WHERE id=?", Number(req.params.id));
    if (!s) return res.status(404).json({ message: "Sheet not found" });
    res.json(sheetView(s));
  });

  app.get("/api/sheets/:id/image", (req, res) => {
    const s = one<any>("SELECT * FROM sheets WHERE id=?", Number(req.params.id));
    if (!s || !fs.existsSync(s.image_path)) return res.status(404).end();
    res.type(s.mime).sendFile(s.image_path);
  });

  app.post("/api/sheets/:id/retry", (req, res) => {
    const id = Number(req.params.id);
    sqlite.prepare("UPDATE sheets SET status='processing', error=NULL WHERE id=? AND game_id IS NULL").run(id);
    runOcr(id);
    res.status(202).json({ id });
  });

  app.post("/api/sheets/:id/discard", (req, res) => {
    sqlite.prepare("UPDATE sheets SET status='discarded' WHERE id=? AND game_id IS NULL").run(Number(req.params.id));
    res.json({ ok: true });
  });

  app.post("/api/sheets/:id/confirm", (req, res) => {
    try {
      const gameId = confirmSheet(Number(req.params.id), req.body);
      res.json({ gameId });
    } catch (e: any) {
      res.status(e.status || 500).json({ message: e.message, gameId: e.gameId });
    }
  });

  return httpServer;
}
