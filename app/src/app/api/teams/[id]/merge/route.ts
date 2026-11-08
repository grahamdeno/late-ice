import { handle, body, num } from "@/server/http";
import { sql } from "@/server/db";
import { audit, require_ } from "@/server/permissions";
import type { Tx } from "@/server/db";
import * as A from "@/server/accounts";

export const dynamic = "force-dynamic";

// Same person on two spots (a spelling variant, a misread number).
// Direction is unchanged: when only one spot is registered, that one is kept.
async function prepare(tx: Tx, u: any, teamId: number, fromId: number, intoId: number) {
  const t = await A.teamOrThrow(tx, teamId);
  await require_(tx, u, "roster.merge", { teamId, leagueId: t.league_id, rinkId: t.rink_id });
  const from = await A.slotOnTeam(tx, teamId, fromId);
  const into = await A.slotOnTeam(tx, teamId, intoId);
  const { movingId, keptId } = A.mergeDirection(from, into);
  const moving = movingId === from.id ? from : into;
  const kept = keptId === from.id ? from : into;
  const counts = await A.moveCounts(tx, moving.id);
  const label = (s: any) => ({ id: s.id as number, name: (s.display_name as string) || A.obfuscate(s.name), number: (s.number as string | null) ?? null });
  return { t, moving, kept, counts, movingLabel: label(moving), keptLabel: label(kept) };
}

export const GET = handle<{ id: string }>(async (req, { id }) => {
  const u = await A.requireUser(req);
  const teamId = num(id);
  const url = new URL(req.url);
  const fromId = num(url.searchParams.get("from"));
  const intoId = num(url.searchParams.get("into"));
  return sql.begin(async (tx) => {
    const p = await prepare(tx, u, teamId, fromId, intoId);
    return { moving: p.movingLabel, kept: p.keptLabel, games: p.counts.games, points: p.counts.points };
  });
});

export const POST = handle<{ id: string }>(async (req, { id }) => {
  const u = await A.requireUser(req);
  const teamId = num(id);
  const b = await body(req);
  const playerId = await sql.begin(async (tx) => {
    const p = await prepare(tx, u, teamId, Number(b?.fromId) || 0, Number(b?.intoId) || 0);
    await A.mergePlayers(tx, p.moving.id, p.kept.id);
    await A.logAction(tx, teamId, u.id, "merge", p.kept.id, p.kept.user_id ?? null, { merged: p.moving.id, numbers: [p.moving.number, p.kept.number], games: p.counts.games, points: p.counts.points });
    await audit(tx, u.id, "roster.merge", { type: "player", id: p.kept.id, rinkId: p.t.rink_id },
      { movingId: p.moving.id, keptId: p.kept.id },
      { movingId: p.moving.id, keptId: p.kept.id, games: p.counts.games, points: p.counts.points, scannedGames: p.counts.scannedGames, importedGames: p.counts.importedGames, scannedPoints: p.counts.scannedPoints, importedPoints: p.counts.importedPoints });
    return p.kept.id;
  });
  return { ok: true, playerId };
});
