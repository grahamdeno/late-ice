import "server-only";
/**
 * Season rollover for one rink, in two parts.
 *
 * 1. Set up the next season: close the current one on a date and add the next one after it.
 *    Allowed any time. Standings, the desk and imports switch over by date on their own.
 * 2. Wrap up, once the current season's end date has passed: archive teams that folded, drop
 *    subs (they were added for this season only), and optionally empty a roster down to its
 *    captain and assistants for teams that are re-forming.
 *
 * Nothing touches ratings, games or stats: teams keep their ids, so history stays attached and
 * every number is still split by season date.
 */
import { one, q, type Tx } from "./db";
import { HttpError } from "./services";
import * as P from "./permissions";

const today = () => new Date().toISOString().slice(0, 10);
const isDate = (s: unknown) => typeof s === "string" && /^\d{4}-\d{2}-\d{2}$/.test(s);
const addDays = (d: string, n: number) => new Date(new Date(`${d}T12:00:00Z`).getTime() + n * 864e5).toISOString().slice(0, 10);

/** A name for the season after this one: "Fall 2026" becomes "Winter 2027", and so on. */
export function nextSeasonName(current: string | null, startsOn: string) {
  const year = Number(startsOn.slice(0, 4));
  const month = Number(startsOn.slice(5, 7));
  const label = month <= 2 || month === 12 ? "Winter" : month <= 5 ? "Spring" : month <= 8 ? "Summer" : "Fall";
  const y = month === 12 ? year + 1 : year;
  const name = `${label} ${y}`;
  return name === current ? `${name} (2)` : name;
}

async function seasonsAt(db: Tx, rinkId: number) {
  const all = await q<any>(db, "SELECT id, name, starts_on, ends_on FROM seasons WHERE rink_id=$1 ORDER BY starts_on", [rinkId]);
  const t = today();
  const current = all.find((s) => s.starts_on <= t && s.ends_on >= t) ?? [...all].reverse().find((s) => s.starts_on <= t) ?? null;
  const next = current ? all.find((s) => s.starts_on > current.ends_on) ?? null : all.find((s) => s.starts_on > t) ?? null;
  return { current, next };
}

export async function rolloverPlan(db: Tx, user: any, rinkId: number) {
  const rink = await one<{ id: number; name: string }>(db, "SELECT id, name FROM rinks WHERE id=$1", [rinkId]);
  if (!rink) throw new HttpError(404, "Rink not found.");
  await P.require_(db, user, "season.manage", { rinkId });
  const { current, next } = await seasonsAt(db, rinkId);
  const teams = await q<any>(db,
    `SELECT t.id, t.name, t.color, l.id AS league_id, l.level,
       (SELECT COUNT(*) FROM roster_entries re WHERE re.team_id=t.id AND NOT re.is_sub)::int AS roster,
       (SELECT COUNT(*) FROM roster_entries re WHERE re.team_id=t.id AND re.is_sub)::int AS subs,
       (SELECT COUNT(*) FROM games g WHERE (g.home_team_id=t.id OR g.away_team_id=t.id) AND g.season_id=$2)::int AS games,
       (SELECT u.name FROM role_grants g JOIN users u ON u.id=g.user_id WHERE g.scope_type='team' AND g.scope_id=t.id AND g.role='captain' AND g.revoked_at IS NULL LIMIT 1) AS captain
     FROM teams t JOIN leagues l ON l.id=t.league_id
     WHERE l.rink_id=$1 AND l.archived_at IS NULL AND l.level NOT IN ('DEMO','TOURN') AND t.archived_at IS NULL AND COALESCE(t.is_sample,0)=0
     ORDER BY l.sort, t.name`, [rinkId, current?.id ?? null]);
  const suggestStart = current ? addDays(current.ends_on, 1) : today();
  return {
    rink, current, next, teams, today: today(),
    ended: !!current && current.ends_on < today(),
    suggestion: next ? null : { name: nextSeasonName(current?.name ?? null, suggestStart), startsOn: suggestStart, endsOn: addDays(suggestStart, 90) },
  };
}

type Apply = {
  endsOn?: string;
  next?: { name?: string; startsOn?: string; endsOn?: string };
  archive?: number[];
  clearRosters?: number[];
  dropSubs?: boolean;
};

export async function applyRollover(tx: Tx, user: any, rinkId: number, b: Apply) {
  await P.require_(tx, user, "season.manage", { rinkId });
  const { current, next } = await seasonsAt(tx, rinkId);
  const done: Record<string, unknown> = {};

  // Part 1: dates.
  let endsOn = current?.ends_on ?? null;
  if (current && b.endsOn && b.endsOn !== current.ends_on) {
    if (!isDate(b.endsOn) || b.endsOn < current.starts_on) throw new HttpError(400, "The end date has to be after the season started.");
    if (next && b.endsOn >= next.starts_on) throw new HttpError(409, `That runs into ${next.name}.`);
    const late = await one<{ n: number }>(tx, "SELECT COUNT(*)::int n FROM games WHERE season_id=$1 AND played_on > $2", [current.id, b.endsOn]);
    if (late && late.n > 0) throw new HttpError(409, `${late.n} games were played after that date. Pick a later end.`);
    await q(tx, "UPDATE seasons SET ends_on=$1 WHERE id=$2", [b.endsOn, current.id]);
    await P.audit(tx, user.id, "season.edit", { type: "season", id: current.id, rinkId }, { ends: current.ends_on }, { ends: b.endsOn });
    endsOn = b.endsOn;
    done.closedOn = b.endsOn;
  }
  if (b.next && !next) {
    const name = String(b.next.name ?? "").trim().slice(0, 40);
    const s = b.next.startsOn, e = b.next.endsOn;
    if (!name || !isDate(s) || !isDate(e) || e! < s!) throw new HttpError(400, "The next season needs a name, a start date and an end date after it.");
    if (endsOn && s! <= endsOn) throw new HttpError(400, "The next season has to start after this one ends.");
    const clash = await one<any>(tx, "SELECT name FROM seasons WHERE rink_id=$1 AND starts_on<=$3 AND ends_on>=$2", [rinkId, s, e]);
    if (clash) throw new HttpError(409, `Those dates overlap ${clash.name}.`);
    const row = await one<{ id: number }>(tx, "INSERT INTO seasons (rink_id, name, starts_on, ends_on) VALUES ($1,$2,$3,$4) RETURNING id", [rinkId, name, s, e]);
    await P.audit(tx, user.id, "season.create", { type: "season", id: row!.id, rinkId }, undefined, { name, starts: s, ends: e, via: "rollover" });
    done.created = name;
  }

  // Part 2: wrap-up, only once the season is over.
  const archive = [...new Set((b.archive ?? []).map(Number).filter(Number.isInteger))];
  const clear = [...new Set((b.clearRosters ?? []).map(Number).filter(Number.isInteger))];
  if (archive.length || clear.length || b.dropSubs) {
    if (!endsOn || endsOn >= today()) throw new HttpError(400, `Wrap-up opens after the season ends${endsOn ? ` on ${endsOn}` : ""}, so nothing disappears mid-season.`);
    const ids = [...new Set([...archive, ...clear])];
    const ok = ids.length ? await q<{ id: number }>(tx,
      `SELECT t.id FROM teams t JOIN leagues l ON l.id=t.league_id WHERE t.id = ANY($1::int[]) AND l.rink_id=$2`, [ids, rinkId]) : [];
    if (ok.length !== ids.length) throw new HttpError(400, "Some of those teams aren't at this rink.");
    if (archive.length) {
      await q(tx, "UPDATE teams SET archived_at=now() WHERE id = ANY($1::int[]) AND archived_at IS NULL", [archive]);
      await q(tx, "UPDATE team_invites SET revoked_at=now() WHERE team_id = ANY($1::int[]) AND revoked_at IS NULL", [archive]);
      done.archived = archive.length;
    }
    if (clear.length) {
      const gone = await q<any>(tx,
        `DELETE FROM roster_entries re WHERE re.team_id = ANY($1::int[])
           AND NOT EXISTS (SELECT 1 FROM players p JOIN role_grants g ON g.user_id=p.user_id
                           WHERE p.id=re.player_id AND g.scope_type='team' AND g.scope_id=re.team_id
                             AND g.role IN ('captain','assistant_captain') AND g.revoked_at IS NULL)
         RETURNING re.team_id`, [clear]);
      done.cleared = gone.length;
    }
    if (b.dropSubs) {
      const subs = await q<any>(tx,
        `DELETE FROM roster_entries re USING teams t, leagues l
         WHERE re.team_id=t.id AND t.league_id=l.id AND l.rink_id=$1 AND re.is_sub RETURNING re.id`, [rinkId]);
      done.subsDropped = subs.length;
    }
    await P.audit(tx, user.id, "season.rollover", { type: "rink", id: rinkId, rinkId }, undefined, { archive, clearRosters: clear, dropSubs: !!b.dropSubs, ...done });
  }
  return done;
}
