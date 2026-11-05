import { handle, body, num } from "@/server/http";
import { sql, q, one } from "@/server/db";
import { HttpError } from "@/server/services";
import * as A from "@/server/accounts";

export const dynamic = "force-dynamic";

// The draft pool: registered players at a rink, visible to captains there.
export const GET = handle(async (req) => {
  const u = await A.requireUser(req);
  const rinkId = Number(new URL(req.url).searchParams.get("rink") || u.home_rink_id || 0);
  const captainHere = await one(sql, "SELECT 1 FROM team_roles r JOIN teams t ON t.id=r.team_id JOIN leagues l ON l.id=t.league_id WHERE r.user_id=$1 AND r.role='captain' AND l.rink_id=$2", [u.id, rinkId]);
  if (!captainHere) throw new HttpError(403, "The draft pool is for captains at this rink.");
  const players = [];
  for (const x of await q<any>(sql, "SELECT u.id, u.name, u.number, u.position, u.status, u.status_until, u.created_at FROM users u WHERE u.home_rink_id=$1 AND u.name IS NOT NULL ORDER BY u.name", [rinkId])) {
    const slots = await q<any>(sql,
      `SELECT t.id team_id, t.name team_name, l.level, p.rating, p.games_rated FROM players p JOIN roster_entries re ON re.player_id=p.id
       JOIN teams t ON t.id=re.team_id JOIN leagues l ON l.id=t.league_id WHERE p.user_id=$1 AND l.level<>'DEMO'`, [x.id]);
    const rated = slots.filter((s) => s.games_rated > 0).sort((a, b) => b.games_rated - a.games_rated)[0];
    players.push({ ...x, teams: slots.map((s) => ({ id: s.team_id, name: s.team_name, level: s.level })), rating: rated?.rating ?? slots[0]?.rating ?? null });
  }
  return { rinkId, players };
});
