import "server-only";
import { one, q, type Tx } from "./db";
import { HttpError } from "./services";
import { applyViewerNames } from "./accounts";
import { gameStars } from "./stars";
import { milestonesFor } from "./milestones";

export const SIZES = { wide: { width: 1200, height: 630 }, story: { width: 1080, height: 1920 } } as const;
export type CardFormat = keyof typeof SIZES;
export const cardFormat = (v: string | null): CardFormat => (v === "story" ? "story" : "wide");

/** Team colors come from user input; only plain hex values reach the image. */
export const safeColor = (c: unknown, fallback = "#2f6bff") => (typeof c === "string" && /^#[0-9a-f]{3,8}$/i.test(c) ? c : fallback);

/** What the result card shows. Public: names go through the same privacy rules as the public game page. */
export async function gameCardData(db: Tx, gameId: number) {
  const g = await one<any>(db,
    `SELECT g.id, g.played_on, g.home_score, g.away_score, l.name AS league,
       ht.name AS home, ht.color AS home_color, at.name AS away, at.color AS away_color
     FROM games g JOIN leagues l ON l.id=g.league_id JOIN teams ht ON ht.id=g.home_team_id JOIN teams at ON at.id=g.away_team_id WHERE g.id=$1`, [gameId]);
  if (!g) throw new HttpError(404, "Game not found.");
  const s = await gameStars(db, gameId, null);
  const stars = await applyViewerNames(db, null, s.stars, "player_id");
  return { ...g, stars: stars.map((x: any) => ({ name: String(x.name), line: `${x.goals}G ${x.assists}A` })), mode: s.mode };
}

/** What the player card shows. Only players who have claimed their spot and haven't hidden themselves. */
export async function playerCardData(db: Tx, playerId: number) {
  const p = await one<any>(db,
    `SELECT p.id, p.display_name, p.position, p.rating, p.games_rated, p.user_id, p.hidden, u.hidden AS user_hidden
     FROM players p LEFT JOIN users u ON u.id=p.user_id WHERE p.id=$1`, [playerId]);
  if (!p || !p.user_id || p.hidden || p.user_hidden) throw new HttpError(404, "No card for this player.");
  const team = await one<any>(db,
    `SELECT t.name, t.color, re.number FROM roster_entries re JOIN teams t ON t.id=re.team_id
     WHERE re.player_id=$1 ORDER BY re.id DESC LIMIT 1`, [playerId]);
  const t = (await one<any>(db,
    `SELECT COUNT(*)::int gp, COALESCE(SUM(goals),0)::int g, COALESCE(SUM(assists),0)::int a FROM player_game_stats WHERE player_id=$1`, [playerId]))!;
  const imp = (await one<any>(db,
    `SELECT COUNT(DISTINCT game_id)::int gp, COALESCE(SUM(goals),0)::int g, COALESCE(SUM(assists),0)::int a FROM imported_game_lines WHERE player_id=$1`, [playerId]))!;
  const latest = (await milestonesFor(db, playerId)).slice(-1)[0] ?? null;
  return {
    name: String(p.display_name), position: p.position as string, number: team?.number ?? null,
    team: team?.name ?? null, color: team?.color ?? null,
    rating: Math.round(p.rating * 10) / 10, rated: p.games_rated,
    gp: t.gp + imp.gp, g: t.g + imp.g, a: t.a + imp.a,
    milestone: latest ? latest.label : null,
  };
}
