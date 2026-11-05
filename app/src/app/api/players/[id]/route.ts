import { handle, body, num } from "@/server/http";
import { sql, q, one } from "@/server/db";
import { gameCard, HttpError } from "@/server/services";
import { userFromRequest } from "@/server/accounts";

export const dynamic = "force-dynamic";
export const GET = handle<{ id: string }>(async (req, { id }) => {
  const raw = await one<any>(sql, "SELECT * FROM players WHERE id=$1", [num(id)]);
  if (!raw) throw new HttpError(404, "Player not found");
  const me = await userFromRequest(req);
  const { name_key: _k, name: _n, user_id: uid, display_name, start_rating: _s, ...rest } = raw;
  const p = { ...rest, name: display_name, registered: !!uid, mine: !!me && me.id === uid };
  const teams = await q<any>(sql, "SELECT t.id, t.name, t.color, t.logo, re.number, l.level, l.id league_id FROM roster_entries re JOIN teams t ON t.id=re.team_id JOIN leagues l ON l.id=t.league_id WHERE re.player_id=$1", [raw.id]);
  const history = [];
  for (const h of await q<any>(sql, "SELECT rh.*, g.played_on FROM rating_history rh JOIN games g ON g.id=rh.game_id WHERE rh.player_id=$1 ORDER BY rh.id", [raw.id])) {
    history.push({ ...h, reasons: JSON.parse(h.reasons_json), game: await gameCard(sql, await one(sql, "SELECT * FROM games WHERE id=$1", [h.game_id])) });
  }
  const scanned = (await one<any>(sql, "SELECT COUNT(*) gp, COALESCE(SUM(goals),0) g, COALESCE(SUM(assists),0) a, COALESCE(SUM(pim),0) pim FROM player_game_stats WHERE player_id=$1", [raw.id]))!;
  const imp = (await one<any>(sql, "SELECT COALESCE(SUM(gp),0) gp, COALESCE(SUM(g),0) g, COALESCE(SUM(a),0) a, COALESCE(SUM(pim),0) pim, MAX(as_of) as_of, MAX(source) source FROM player_imports WHERE player_id=$1", [raw.id]))!;
  const totals = { gp: scanned.gp + imp.gp, g: scanned.g + imp.g, a: scanned.a + imp.a, pim: scanned.pim + imp.pim };
  const lines = await q(sql, "SELECT * FROM player_game_stats WHERE player_id=$1", [raw.id]);
  const ranks = [];
  for (const t of teams) {
    const ids = await q<any>(sql, "SELECT DISTINCT p.id, p.rating FROM players p JOIN roster_entries re ON re.player_id=p.id JOIN teams t ON t.id=re.team_id WHERE t.league_id=$1", [t.league_id]);
    ranks.push({ level: t.level, rank: ids.filter((x: any) => x.rating > raw.rating).length + 1, of: ids.length, tied: ids.filter((x: any) => x.rating === raw.rating).length > 1 });
  }
  return { player: p, teams, history, totals, imported: imp.gp ? imp : null, lines, ranks, reliability: Math.min(100, raw.games_rated * 10) };
});
