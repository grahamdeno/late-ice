import { handle, body, num } from "@/server/http";
import { sql, q, one } from "@/server/db";
import { requireUser } from "@/server/accounts";
import { HttpError } from "@/server/services";
import * as P from "@/server/permissions";
import { setStarVoting } from "@/server/stars";

export const dynamic = "force-dynamic";

/** Each league at the rink with its three-stars voting switch. Rink managers only. */
export const GET = handle(async (req) => {
  const u = await requireUser(req);
  const rinkId = num(new URL(req.url).searchParams.get("rink"));
  await P.require_(sql, u, "season.manage", { rinkId });
  const leagues = await q(sql,
    "SELECT id, name, level, star_voting AS enabled FROM leagues WHERE rink_id=$1 AND archived_at IS NULL AND level NOT IN ('DEMO','TOURN') ORDER BY sort", [rinkId]);
  return { leagues };
});

/** { leagueId, on } */
export const PUT = handle(async (req) => {
  const u = await requireUser(req);
  const rinkId = num(new URL(req.url).searchParams.get("rink"));
  const b = await body(req);
  return sql.begin(async (tx) => {
    await P.require_(tx, u, "season.manage", { rinkId });
    const l = await one<any>(tx, "SELECT id FROM leagues WHERE id=$1 AND rink_id=$2", [num(b.leagueId), rinkId]);
    if (!l) throw new HttpError(404, "That league isn't at this rink.");
    await setStarVoting(tx, l.id, !!b.on);
    await P.audit(tx, u.id, "league.star_voting", { type: "league", id: l.id, rinkId }, undefined, { starVoting: !!b.on });
    return { ok: true };
  });
});
