import { handle, body, num } from "@/server/http";
import { sql, q, one } from "@/server/db";
import { HttpError } from "@/server/services";
import * as A from "@/server/accounts";
import * as P from "@/server/permissions";
import { clean } from "@/server/manage";

export const dynamic = "force-dynamic";

async function load(id: string) {
  const s = await one<any>(sql, "SELECT * FROM seasons WHERE id=$1", [num(id)]);
  if (!s) throw new HttpError(404, "Season not found.");
  return s;
}

/** Rename a season or move its dates. Dates still can't overlap another season at the rink. */
export const PATCH = handle<{ id: string }>(async (req, { id }) => {
  const u = await A.requireUser(req);
  const s = await load(id);
  await P.require_(sql, u, "season.manage", { rinkId: s.rink_id });
  const b = await body(req);
  const name = b.name !== undefined ? clean(b.name, 40) : s.name;
  const starts = b.startsOn !== undefined ? String(b.startsOn) : s.starts_on;
  const ends = b.endsOn !== undefined ? String(b.endsOn) : s.ends_on;
  if (!name || !/^\d{4}-\d{2}-\d{2}$/.test(starts) || !/^\d{4}-\d{2}-\d{2}$/.test(ends) || ends < starts) throw new HttpError(400, "A name, a start date and an end date after it.");
  const clash = await one<any>(sql, "SELECT name FROM seasons WHERE rink_id=$1 AND id<>$4 AND starts_on<=$3 AND ends_on>=$2", [s.rink_id, starts, ends, s.id]);
  if (clash) throw new HttpError(409, `Those dates overlap ${clash.name}.`);
  await sql.begin(async (tx) => {
    await q(tx, "UPDATE seasons SET name=$1, starts_on=$2, ends_on=$3 WHERE id=$4", [name, starts, ends, s.id]);
    await P.audit(tx, u.id, "season.edit", { type: "season", id: s.id, rinkId: s.rink_id }, { name: s.name, starts: s.starts_on, ends: s.ends_on }, { name, starts, ends });
  });
  return { ok: true };
});

/** Delete a season only while no game, standings import or vote belongs to it. */
export const DELETE = handle<{ id: string }>(async (req, { id }) => {
  const u = await A.requireUser(req);
  const s = await load(id);
  await P.require_(sql, u, "season.manage", { rinkId: s.rink_id });
  if (await one(sql, "SELECT 1 FROM games WHERE season_id=$1", [s.id]) || await one(sql, "SELECT 1 FROM team_imports WHERE season_id=$1", [s.id]) || await one(sql, "SELECT 1 FROM player_imports WHERE season_id=$1", [s.id]))
    throw new HttpError(409, "This season has games. Change its dates instead.");
  try {
    await sql.begin(async (tx) => {
      await q(tx, "DELETE FROM seasons WHERE id=$1", [s.id]);
      await P.audit(tx, u.id, "season.remove", { type: "season", id: s.id, rinkId: s.rink_id }, { name: s.name }, undefined);
    });
  } catch (e: any) {
    if (e?.code === "23503") throw new HttpError(409, "Something still belongs to this season. Change its dates instead.");
    throw e;
  }
  return { ok: true };
});
