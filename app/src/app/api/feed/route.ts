import { handle, body, num } from "@/server/http";
import { sql, q, one } from "@/server/db";
import { gameCards, leaders } from "@/server/services";
import { applyViewerNames, userFromRequest } from "@/server/accounts";

export const dynamic = "force-dynamic";
export const GET = handle(async (req) => {
  const u = new URL(req.url);
  const lid = u.searchParams.get("league") ? num(u.searchParams.get("league")) : null;
  // With no league picked, the rink picks the scope. No rink either: every rink (old links keep working).
  const rid = !lid && u.searchParams.get("rink") ? num(u.searchParams.get("rink")) : null;
  const where = lid ? "WHERE g.league_id=$1" : rid ? "WHERE l.rink_id=$1 AND l.level NOT IN ('DEMO','TOURN')" : "WHERE l.level NOT IN ('DEMO','TOURN')";
  const args = lid ? [lid] : rid ? [rid] : [];
  const games = await gameCards(sql, await q(sql,
    `SELECT g.* FROM games g JOIN leagues l ON l.id=g.league_id ${where} ORDER BY g.played_on DESC NULLS LAST, g.id DESC LIMIT 20`, args));
  const movers = (await q<any>(sql,
    `SELECT rh.player_id id, p.display_name AS name, rh.before, rh.after, (rh.after-rh.before) delta, rh.game_id
     FROM rating_history rh JOIN players p ON p.id=rh.player_id JOIN games g ON g.id=rh.game_id
     JOIN leagues l ON l.id=g.league_id ${where} ORDER BY rh.id DESC LIMIT 200`, args))
    .sort((a, b) => b.delta - a.delta).slice(0, 5);
  const pending = await q(sql, "SELECT id,status,created_at FROM sheets WHERE status IN ('processing','review','failed') ORDER BY id DESC LIMIT 5");
  const viewer = await userFromRequest(req).catch(() => null);
  return { games, movers: await applyViewerNames(sql, viewer, movers), leaders: await applyViewerNames(sql, viewer, await leaders(sql, lid, 5, null, rid)), pending };
});
