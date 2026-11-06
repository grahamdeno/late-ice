import { handle, body, num } from "@/server/http";
import { sql, q, one } from "@/server/db";
import { gameCards, leaders } from "@/server/services";
import { applyLoadedNames, sameRinkSql, userFromRequest } from "@/server/accounts";

export const dynamic = "force-dynamic";
export const GET = handle(async (req) => {
  const u = new URL(req.url);
  const lid = u.searchParams.get("league") ? num(u.searchParams.get("league")) : null;
  // With no league picked, the rink picks the scope. No rink either: every rink (old links keep working).
  const rid = !lid && u.searchParams.get("rink") ? num(u.searchParams.get("rink")) : null;
  const where = lid ? "WHERE g.league_id=$1" : rid ? "WHERE l.rink_id=$1 AND l.level NOT IN ('DEMO','TOURN')" : "WHERE l.level NOT IN ('DEMO','TOURN')";
  const args = lid ? [lid] : rid ? [rid] : [];
  const viewer = await userFromRequest(req).catch(() => null);
  const viewerParam = args.length + 1;
  const games = await gameCards(sql, await q(sql,
    `SELECT g.* FROM games g JOIN leagues l ON l.id=g.league_id ${where} ORDER BY g.played_on DESC NULLS LAST, g.id DESC LIMIT 20`, args));
  const movers = (await q<any>(sql,
    `SELECT rh.player_id id, p.display_name AS name, p.name AS real_name, p.user_id, p.hidden,
       (SELECT u2.hidden FROM users u2 WHERE u2.id = p.user_id) AS user_hidden,
       (SELECT re.number FROM roster_entries re WHERE re.player_id = p.id AND re.number IS NOT NULL AND re.number <> '' ORDER BY re.id LIMIT 1) AS number,
       ${sameRinkSql("p.id", `$${viewerParam}`)} AS same_rink,
       rh.before, rh.after, (rh.after-rh.before) delta, rh.game_id
     FROM rating_history rh JOIN players p ON p.id=rh.player_id JOIN games g ON g.id=rh.game_id
     JOIN leagues l ON l.id=g.league_id ${where} ORDER BY rh.id DESC LIMIT 200`, [...args, viewer?.id ?? null]))
    .sort((a, b) => b.delta - a.delta).slice(0, 5).map((row) => applyLoadedNames(row));
  const pending = await q(sql, "SELECT id,status,created_at FROM sheets WHERE status IN ('processing','review','failed') ORDER BY id DESC LIMIT 5");
  return { games, movers, leaders: await leaders(sql, lid, 5, null, rid, viewer?.id ?? null), pending };
});
