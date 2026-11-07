import { handle } from "@/server/http";
import { sql, q } from "@/server/db";
import { requireUser } from "@/server/accounts";
import * as P from "@/server/permissions";

export const dynamic = "force-dynamic";

/** Disputed goalie numbers this staff member can settle. */
export const GET = handle(async (req) => {
  const u = await requireUser(req);
  const rows = await q<any>(sql,
    `SELECT r.id, r.game_id, r.shots_against, r.counter_shots, r.goals_against, g.played_on, g.league_id, l.rink_id,
       p.display_name AS goalie, t.name AS team
     FROM goalie_reports r JOIN games g ON g.id=r.game_id JOIN leagues l ON l.id=g.league_id
     JOIN players p ON p.id=r.player_id JOIN teams t ON t.id=r.team_id
     WHERE r.status='disputed' ORDER BY r.created_at`);
  const out = [];
  for (const r of rows) if (await P.can(sql, u, "game.resolve", { leagueId: r.league_id, rinkId: r.rink_id })) out.push(r);
  return out;
});
