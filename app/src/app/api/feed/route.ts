import { handle, body, num } from "@/server/http";
import { sql, q, one } from "@/server/db";
import { gameCards, leaders } from "@/server/services";
import { applyLoadedNames, sameRinkSql, userFromRequest } from "@/server/accounts";
import { rinkFor, rinkOfLeague, sampleRinkId } from "@/server/visibility";

export const dynamic = "force-dynamic";
export const GET = handle(async (req) => {
  const u = new URL(req.url);
  const viewer = await userFromRequest(req).catch(() => null);
  let lid = u.searchParams.get("league") ? num(u.searchParams.get("league")) : null;
  // Signed out: only the sample rink. A league from a real rink falls back to the sample rink.
  if (lid && !viewer && (await rinkOfLeague(sql, lid)) !== (await sampleRinkId(sql))) lid = null;
  // With no league picked, the rink picks the scope. No rink either: every rink (old links keep working).
  const rid = lid ? null : await rinkFor(sql, viewer, u.searchParams.get("rink") ? num(u.searchParams.get("rink")) : null);
  const where = lid ? "WHERE g.league_id=$1" : rid ? "WHERE l.rink_id=$1 AND l.level NOT IN ('DEMO','TOURN')" : "WHERE l.level NOT IN ('DEMO','TOURN')";
  const args = lid ? [lid] : rid ? [rid] : [];
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
  const waiting = viewer ? await waitingForCaptain(viewer.id) : [];
  return { games, movers, leaders: await leaders(sql, lid, 5, null, rid, viewer?.id ?? null), pending, waiting };
});

/** Sheets a player sent in that this viewer, as captain or assistant of either team, can confirm. */
async function waitingForCaptain(userId: number) {
  const teams = new Set((await q<any>(sql, "SELECT scope_id FROM role_grants WHERE user_id=$1 AND scope_type='team' AND role IN ('captain','assistant_captain') AND revoked_at IS NULL", [userId])).map((r) => Number(r.scope_id)));
  if (!teams.size) return [];
  const rows = await q<any>(sql, "SELECT id, submitted_at, proposed_json FROM sheets WHERE status='awaiting' AND game_id IS NULL AND proposed_json IS NOT NULL ORDER BY submitted_at DESC NULLS LAST, id DESC LIMIT 50");
  const out: { id: number; submitted_at: string; teams: string }[] = [];
  for (const r of rows) {
    let p: any = null;
    try { p = JSON.parse(r.proposed_json); } catch { continue; }
    const ids = [p?.homeTeamId, p?.awayTeamId].filter((t) => t != null).map(Number);
    if (!ids.some((t) => teams.has(t))) continue;
    const names = (await q<any>(sql, "SELECT id, name FROM teams WHERE id = ANY($1::int[])", [ids]));
    const nm = (id: number | null) => names.find((t) => Number(t.id) === Number(id))?.name;
    out.push({ id: r.id, submitted_at: r.submitted_at, teams: [nm(p.homeTeamId), nm(p.awayTeamId)].filter(Boolean).join(" vs ") });
    if (out.length >= 5) break;
  }
  return out;
}
