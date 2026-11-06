import { handle, body, num } from "@/server/http";
import { sql, q, one } from "@/server/db";
import { currentSeason, gameCards, leaders, seasonsWithData, standings, HttpError } from "@/server/services";
import * as A from "@/server/accounts";
import * as P from "@/server/permissions";
import { clean, LEVELS, TAGS } from "@/server/manage";

export const dynamic = "force-dynamic";
/** seasonsWithData adds a count column; the response season is the plain seasons row. */
function seasonRow(s: any) {
  if (!s) return null;
  const { n: _n, ...rest } = s;
  return rest;
}

export const GET = handle<{ id: string }>(async (req, { id }) => {
  const l = await one<any>(sql, "SELECT * FROM leagues WHERE id=$1", [num(id)]);
  if (!l) throw new HttpError(404, "League not found");
  const [seasons, u] = await Promise.all([
    seasonsWithData(sql, l.id),
    A.userFromRequest(req).catch(() => null),
  ]);
  const qs = new URL(req.url).searchParams.get("season");
  const gamesAll = new URL(req.url).searchParams.get("games") === "all";
  // The newest season that has games or imports, unless the caller picks one.
  // currentSeason is only needed when this league has nothing on the board yet.
  let sid: number | null;
  let season: any;
  if (qs) {
    sid = num(qs);
    season = seasonRow(seasons.find((s) => s.id === sid)) ?? (await one(sql, "SELECT * FROM seasons WHERE id=$1", [sid])) ?? (await currentSeason(sql, l.rink_id));
  } else if (seasons[0]) {
    sid = seasons[0].id;
    season = seasonRow(seasons[0]);
  } else {
    season = await currentSeason(sql, l.rink_id);
    sid = season?.id ?? null;
  }
  const scope = { leagueId: l.id, rinkId: l.rink_id };
  const canP = (async () => ({
    addTeam: await P.can(sql, u, "team.create", scope),
    edit: await P.can(sql, u, "league.edit", scope),
    remove: await P.can(sql, u, "league.create", scope),
  }))();
  const [gameRows, imports, stand, lead, can] = await Promise.all([
    q(sql, `SELECT * FROM games WHERE league_id=$1 AND ($2::int IS NULL OR season_id=$2) ORDER BY played_on DESC NULLS LAST, id DESC${gamesAll ? "" : " LIMIT 10"}`, [l.id, sid]),
    one<any>(sql, "SELECT MAX(as_of) as_of, MAX(source) source, SUM(gp) gp FROM team_imports ti JOIN teams t ON t.id=ti.team_id WHERE t.league_id=$1 AND ti.season_id=$2", [l.id, sid]),
    standings(sql, l.id, sid),
    leaders(sql, l.id, 10, sid, null, u?.id ?? null),
    canP,
  ]);
  const games = await gameCards(sql, gameRows);
  return { league: l, season, seasons, standings: stand, leaders: lead, games, imported: imports?.gp ? imports : null, can, signedIn: !!u };
});

/** Rename a league or change its one-line description. */
export const PATCH = handle<{ id: string }>(async (req, { id }) => {
  const u = await A.requireUser(req);
  const l = await one<any>(sql, "SELECT * FROM leagues WHERE id=$1", [num(id)]);
  if (!l) throw new HttpError(404, "League not found");
  await P.require_(sql, u, "league.edit", { leagueId: l.id, rinkId: l.rink_id });
  const b = await body(req);
  const name = b.name !== undefined ? clean(b.name, 60) || l.name : l.name;
  const blurb = b.blurb !== undefined ? clean(b.blurb, 140) || null : l.blurb;
  if (b.level !== undefined && !LEVELS.includes(String(b.level))) throw new HttpError(400, "Skill level is A, B, C or D.");
  const level = b.level !== undefined ? String(b.level) : l.level;
  const tag = b.tag !== undefined ? (TAGS.includes(String(b.tag)) ? String(b.tag) : null) : l.tag;
  const lim = (v: unknown, cur: number, lo: number, hi: number, what: string) => { if (v === undefined) return cur; const n = Number(v); if (!Number.isInteger(n) || n < lo || n > hi) throw new HttpError(400, `${what} is ${lo} to ${hi}.`); return n; };
  const rosterMax = lim(b.rosterMax, l.roster_max, 5, 40, "Skater spots");
  const goalieMax = lim(b.goalieMax, l.goalie_max, 1, 6, "Goalie spots");
  await sql.begin(async (tx) => {
    await q(tx, "UPDATE leagues SET name=$1, blurb=$2, level=$3, tag=$4, sort=$5, roster_max=$7, goalie_max=$8 WHERE id=$6", [name, blurb, level, tag, { A: 0, B: 1, C: 2, D: 3 }[level as "A"] ?? l.sort, l.id, rosterMax, goalieMax]);
    await P.audit(tx, u.id, "league.edit", { type: "league", id: l.id, rinkId: l.rink_id }, { name: l.name, blurb: l.blurb, level: l.level, tag: l.tag }, { name, blurb, level, tag });
  });
  return { ok: true };
});

/** Remove a league, only while it has no teams. */
export const DELETE = handle<{ id: string }>(async (req, { id }) => {
  const u = await A.requireUser(req);
  const l = await one<any>(sql, "SELECT * FROM leagues WHERE id=$1", [num(id)]);
  if (!l) throw new HttpError(404, "League not found");
  await P.require_(sql, u, "league.create", { leagueId: l.id, rinkId: l.rink_id });
  if (await one(sql, "SELECT 1 FROM teams WHERE league_id=$1", [l.id]) || await one(sql, "SELECT 1 FROM games WHERE league_id=$1", [l.id])) throw new HttpError(409, "Remove its teams first.");
  await sql.begin(async (tx) => {
    await q(tx, "DELETE FROM leagues WHERE id=$1", [l.id]);
    await P.audit(tx, u.id, "league.remove", { type: "league", id: l.id, rinkId: l.rink_id }, { name: l.name }, undefined);
  });
  return { ok: true };
});
