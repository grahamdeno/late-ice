import "server-only";
import { one, q, type Tx } from "./db";
import { HttpError, currentSeason, standings, leaders } from "./services";
import { userCan } from "./accounts";

/** Details a captain fills in for one game. Blank clears the field. */
export function cleanDetail(v: unknown, max = 40) {
  if (v === undefined) return undefined;
  const s = String(v ?? "").replace(/\s+/g, " ").trim().slice(0, max);
  return s || null;
}

export async function setDetails(tx: Tx, teamId: number, gid: number, b: any) {
  const sheet = cleanDetail(b.sheet), jersey = cleanDetail(b.jersey), room = cleanDetail(b.lockerRoom);
  await q(tx,
    `UPDATE scheduled_games SET sheet=CASE WHEN $1::boolean THEN $2 ELSE sheet END, jersey=CASE WHEN $3::boolean THEN $4 ELSE jersey END,
       locker_room=CASE WHEN $5::boolean THEN $6 ELSE locker_room END, updated_at=now() WHERE id=$7 AND team_id=$8`,
    [sheet !== undefined, sheet ?? null, jersey !== undefined, jersey ?? null, room !== undefined, room ?? null, gid, teamId]);
}

/**
 * Who should carry the cooler: players not marked out, fewest turns first, then the longest wait.
 * Pure so the rule can be tested.
 */
export function pickCooler(cands: { id: number; turns: number; last: string | null }[]) {
  const sorted = [...cands].sort((a, b) => a.turns - b.turns || String(a.last ?? "").localeCompare(String(b.last ?? "")) || a.id - b.id);
  return sorted[0]?.id ?? null;
}

export async function assignCooler(tx: Tx, teamId: number, gid: number, userId: number | null, auto: boolean) {
  const g = await one<any>(tx, "SELECT * FROM scheduled_games WHERE id=$1 AND team_id=$2", [gid, teamId]);
  if (!g) throw new HttpError(404, "That game isn't on this team's schedule.");
  const members = await q<any>(tx,
    `SELECT DISTINCT ON (u.id) u.id, u.status, u.status_until,
       (SELECT COUNT(*)::int FROM scheduled_games x WHERE x.team_id=$1 AND x.cooler_user_id=u.id AND x.starts_at < now() + interval '1 day') turns,
       (SELECT MAX(x.local_date) FROM scheduled_games x WHERE x.team_id=$1 AND x.cooler_user_id=u.id) last,
       (SELECT r.answer FROM rsvps r WHERE r.scheduled_game_id=$2 AND r.user_id=u.id) answer
     FROM players p JOIN roster_entries re ON re.player_id=p.id JOIN users u ON u.id=p.user_id
     WHERE re.team_id=$1 AND NOT re.is_sub AND u.merged_into IS NULL ORDER BY u.id`, [teamId, gid]);
  let pick = userId;
  if (auto) {
    const ok = members.filter((m) => m.answer !== "out" && !((m.status === "ir" || m.status === "away") && (!m.status_until || m.status_until >= g.local_date)));
    pick = pickCooler(ok);
    if (pick == null) throw new HttpError(400, "Nobody on the roster has an account to ask yet.");
  } else if (pick != null && !members.some((m) => m.id === pick)) {
    throw new HttpError(400, "Pick someone on this team's roster.");
  }
  await q(tx, "UPDATE scheduled_games SET cooler_user_id=$1, updated_at=now() WHERE id=$2", [pick, gid]);
  return pick;
}

/** Marks games where no goalie has said In or Late. Goalies are players whose position is G, plus accepted goalie subs. */
export async function goalieCheck(db: Tx, teamId: number, games: any[]) {
  if (!games.length) return games;
  const ids = games.map((g) => g.id);
  const goalies = await q<any>(db,
    `SELECT DISTINCT u.id FROM players p JOIN roster_entries re ON re.player_id=p.id JOIN users u ON u.id=p.user_id
     WHERE re.team_id=$1 AND NOT re.is_sub AND u.position='G' AND u.merged_into IS NULL`, [teamId]);
  const yes = await q<any>(db,
    `SELECT r.scheduled_game_id gid, r.user_id FROM rsvps r WHERE r.answer IN ('in','late') AND r.scheduled_game_id IN (SELECT jsonb_array_elements_text($1::text::jsonb)::int)`, [JSON.stringify(ids)]);
  const subs = await q<any>(db,
    `SELECT sr.scheduled_game_id gid FROM sub_requests sr JOIN users u ON u.id=sr.user_id
     WHERE sr.status='accepted' AND u.position='G' AND sr.scheduled_game_id IN (SELECT jsonb_array_elements_text($1::text::jsonb)::int)`, [JSON.stringify(ids)]);
  const gset = new Set(goalies.map((x) => x.id));
  const now = Date.now();
  for (const g of games) {
    const days = (new Date(g.starts_at).getTime() - now) / 86400000;
    const has = yes.some((y) => y.gid === g.id && gset.has(y.user_id)) || subs.some((s) => s.gid === g.id);
    g.needsGoalie = g.status === "scheduled" && days <= 4 && days > -0.1 && !has;
    g.goaliesOnRoster = gset.size;
  }
  return games;
}

/** Pure: the sentence about what this game does to the standings. Points are 2 for a win, 1 for a tie. */
export function stakesText(me: { pts: number; rank: number }, opp: { pts: number; rank: number; name: string }) {
  const gap = opp.pts - me.pts;
  if (gap > 0) {
    if (me.pts + 2 > opp.pts) return `A win moves you past ${opp.name} in the standings.`;
    if (me.pts + 2 === opp.pts) return `A win ties you with ${opp.name} on points.`;
    return `${opp.name} is ${gap} points ahead. A win cuts it to ${gap - 2}.`;
  }
  if (gap === 0) return `You and ${opp.name} are level on points. A win puts you ahead.`;
  const lead = -gap;
  if (lead <= 2) return `You lead ${opp.name} by ${lead}. A loss lets them catch you.`;
  return `You lead ${opp.name} by ${lead} points. A win keeps the gap wide.`;
}

/** What to know about the next opponent: record, last meeting, their top scorer, what's at stake. */
export async function scout(db: Tx, user: any, gid: number) {
  const g = await one<any>(db, "SELECT sg.*, t.league_id, t.name team_name, l.rink_id FROM scheduled_games sg JOIN teams t ON t.id=sg.team_id JOIN leagues l ON l.id=t.league_id WHERE sg.id=$1", [gid]);
  if (!g) throw new HttpError(404, "Game not found.");
  const onTeam = await one(db, "SELECT 1 FROM players p JOIN roster_entries re ON re.player_id=p.id WHERE p.user_id=$1 AND re.team_id=$2", [user.id, g.team_id]);
  if (!onTeam && !(await userCan(db, user, "schedule.manual", { teamId: g.team_id, leagueId: g.league_id, rinkId: g.rink_id }))) throw new HttpError(403, "Only people on this team can scout the opponent.");
  if (!g.opponent_team_id) return { known: false };
  const season = await currentSeason(db, g.rink_id);
  const table = await standings(db, g.league_id, season?.id ?? null);
  const rank = (id: number) => table.findIndex((r) => r.id === id) + 1;
  const me = table.find((r) => r.id === g.team_id), opp = table.find((r) => r.id === g.opponent_team_id);
  if (!opp) return { known: false };
  const last = await one<any>(db,
    `SELECT id, played_on, home_team_id, home_score, away_score FROM games
     WHERE ((home_team_id=$1 AND away_team_id=$2) OR (home_team_id=$2 AND away_team_id=$1))
     ORDER BY played_on DESC NULLS LAST, id DESC LIMIT 1`, [g.team_id, g.opponent_team_id]);
  let lastMeeting = null;
  if (last) {
    const home = last.home_team_id === g.team_id;
    lastMeeting = { gameId: last.id, playedOn: last.played_on, mine: home ? last.home_score : last.away_score, theirs: home ? last.away_score : last.home_score };
  }
  const top = (await leaders(db, g.league_id, 100, season?.id ?? null)).find((r: any) => r.team_id === g.opponent_team_id) ?? null;
  const stakes = me && me.gp >= 0 ? stakesText({ pts: me.pts, rank: rank(me.id) }, { pts: opp.pts, rank: rank(opp.id), name: opp.name }) : null;
  return {
    known: true,
    opponent: { id: opp.id, name: opp.name, rank: rank(opp.id), of: table.length, w: opp.w, l: opp.l, t: opp.t, pts: opp.pts, gf: opp.gf, ga: opp.ga },
    you: me ? { rank: rank(me.id), pts: me.pts } : null,
    lastMeeting,
    topScorer: top ? { id: top.id, name: top.name, g: top.g, a: top.a } : null,
    stakes,
  };
}

/** Skate sharpening: games since the last sharpening, and whether it's time. */
export async function gearFor(db: Tx, userId: number) {
  const row = await one<any>(db, "SELECT sharpened_on, sharpen_every FROM user_gear WHERE user_id=$1", [userId]);
  const every = row?.sharpen_every ?? 15;
  const sharpenedOn: string | null = row?.sharpened_on ?? null;
  let since: number | null = null;
  if (sharpenedOn) {
    since = (await one<any>(db,
      `SELECT COUNT(*)::int c FROM games g WHERE g.played_on > $2 AND (
         EXISTS (SELECT 1 FROM player_game_stats s JOIN players p ON p.id=s.player_id WHERE s.game_id=g.id AND p.user_id=$1)
         OR EXISTS (SELECT 1 FROM imported_game_attendance a JOIN players p ON p.id=a.player_id WHERE a.game_id=g.id AND p.user_id=$1))`,
      [userId, sharpenedOn]))!.c;
  }
  return { sharpenedOn, every, since, due: since != null && since >= every };
}

export async function saveGear(db: Tx, userId: number, b: any) {
  const cur = await one<any>(db, "SELECT sharpened_on, sharpen_every FROM user_gear WHERE user_id=$1", [userId]);
  let on = cur?.sharpened_on ?? null, every = cur?.sharpen_every ?? 15;
  if (b.sharpenedOn !== undefined) {
    if (b.sharpenedOn === null || b.sharpenedOn === "") on = null;
    else if (/^\d{4}-\d{2}-\d{2}$/.test(String(b.sharpenedOn)) && String(b.sharpenedOn) <= new Date().toLocaleDateString("en-CA")) on = String(b.sharpenedOn);
    else throw new HttpError(400, "Pick the day you had them sharpened, today or earlier.");
  }
  if (b.every !== undefined) {
    const n = Math.round(Number(b.every));
    if (!(n >= 3 && n <= 60)) throw new HttpError(400, "Pick between 3 and 60 games.");
    every = n;
  }
  await q(db,
    `INSERT INTO user_gear (user_id, sharpened_on, sharpen_every) VALUES ($1,$2,$3)
     ON CONFLICT (user_id) DO UPDATE SET sharpened_on=EXCLUDED.sharpened_on, sharpen_every=EXCLUDED.sharpen_every, updated_at=now()`, [userId, on, every]);
}
