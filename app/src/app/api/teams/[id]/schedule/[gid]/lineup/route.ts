import { handle, body, num } from "@/server/http";
import { sql, q, one } from "@/server/db";
import { HttpError } from "@/server/services";
import { requireUser, requireTeam, userFromRequest, userCan, logAction, onTeam, applyViewerNames } from "@/server/accounts";
import { teamArchetypes } from "@/server/archetypes";
import { assertRinkVisible } from "@/server/visibility";

export const dynamic = "force-dynamic";

export type Lineup = { f: (number | null)[][]; d: (number | null)[][]; g: (number | null)[]; extras: number[] };
const EMPTY: Lineup = { f: [[null, null, null], [null, null, null]], d: [[null, null], [null, null]], g: [null], extras: [] };

async function load(teamId: number, gid: number) {
  const t = await one<any>(sql, "SELECT t.*, l.rink_id, l.level FROM teams t JOIN leagues l ON l.id=t.league_id WHERE t.id=$1", [teamId]);
  const g = await one<any>(sql, "SELECT * FROM scheduled_games WHERE id=$1 AND team_id=$2", [gid, teamId]);
  if (!t || !g) throw new HttpError(404, "That game isn't on this team's schedule.");
  return { t, g };
}

/** Who can dress for this game: the roster (with their answer for the night) plus subs who said yes. */
async function available(teamId: number, g: any) {
  const roster = await q<any>(sql,
    `SELECT p.id, p.display_name AS name, p.position, p.rating, re.number, re.id AS roster_id, re.is_sub, u.id user_id, COALESCE(u.avatar, p.avatar) avatar, u.status, u.status_until,
       (SELECT answer FROM rsvps r WHERE r.scheduled_game_id=$2 AND r.user_id=u.id) answer
     FROM roster_entries re JOIN players p ON p.id=re.player_id LEFT JOIN users u ON u.id=p.user_id WHERE re.team_id=$1`, [teamId, g.id]);
  const subs = await q<any>(sql,
    `SELECT p.id, p.display_name AS name, p.position, p.rating, NULL::text number, NULL::int roster_id, true is_sub, u.id user_id, COALESCE(u.avatar, p.avatar) avatar, 'in' answer
     FROM sub_requests sr JOIN users u ON u.id=sr.user_id JOIN players p ON p.user_id=u.id
     WHERE sr.scheduled_game_id=$1 AND sr.status='accepted'`, [g.id]);
  const arch = await teamArchetypes(sql, teamId, null);
  const seen = new Set<number>();
  return [...roster, ...subs].filter((p) => !seen.has(p.id) && seen.add(p.id)).map((p) => {
    const away = p.status && ["ir", "away"].includes(p.status) && (!p.status_until || p.status_until >= g.local_date);
    return { id: p.id, name: p.name, position: p.position, rating: p.rating, number: p.number, rosterId: p.roster_id ?? null, isSub: !!p.is_sub, avatar: p.avatar ?? null,
      archetype: (arch as any).won?.[p.id] ?? null, answer: p.answer ?? (away ? "out" : null), guest: !roster.some((r) => r.id === p.id) };
  });
}

/**
 * Fill by position, then RSVP, then roster order. Not by rating.
 * Out is excluded (including injured reserve and Away, which available() already marks out).
 * In comes before everyone else. Late and no answer share that second group. Late is not In.
 * Roster order is jersey number ascending, blank numbers last, then roster entry id, then player id.
 * Subs have no roster entry, so they sort after numbered players.
 * Default sheet is 2 forward lines and 2 defense pairs. A saved lineup can still have a third.
 */
function rosterRank(p: any) {
  const raw = String(p.number ?? "").replace(/\D/g, "");
  const n = raw ? parseInt(raw, 10) : NaN;
  return [p.answer === "in" ? 0 : 1, Number.isFinite(n) ? n : 1000, p.rosterId ?? 1_000_000_000, p.id ?? 0] as const;
}
function autoFill(players: any[]): Lineup {
  const pool = players.filter((p) => p.answer !== "out").sort((a, b) => {
    const ra = rosterRank(a), rb = rosterRank(b);
    for (let i = 0; i < ra.length; i++) if (ra[i] !== rb[i]) return ra[i] < rb[i] ? -1 : 1;
    return 0;
  });
  const take = (pred: (p: any) => boolean) => { const i = pool.findIndex(pred); return i < 0 ? null : pool.splice(i, 1)[0].id; };
  const L: Lineup = { f: [[null, null, null], [null, null, null]], d: [[null, null], [null, null]], g: [null], extras: [] };
  L.g[0] = take((p) => p.position === "G");
  for (const pair of L.d) for (let i = 0; i < 2; i++) pair[i] = take((p) => p.position === "D");
  for (const line of L.f) { line[1] = take((p) => p.position === "C"); line[0] = take((p) => p.position === "W" || p.position === "F"); line[2] = take((p) => p.position === "W" || p.position === "F"); }
  // Leftover skaters fill any open forward or defense spot, still in roster order. Goalies stay in net.
  const open = (): [any[], number] | null => { for (const line of [...L.f, ...L.d]) { const i = line.indexOf(null); if (i >= 0) return [line, i]; } return null; };
  let slot: [any[], number] | null;
  while (pool.length && (slot = open())) { const p = pool.find((x) => x.position !== "G") ?? pool[0]; pool.splice(pool.indexOf(p), 1); slot[0][slot[1]] = p.id; }
  L.extras = pool.filter((p) => p.answer === "in").map((p) => p.id);
  return L;
}

export const GET = handle<{ id: string; gid: string }>(async (req, { id, gid }) => {
  const teamId = num(id);
  const { t, g } = await load(teamId, num(gid));
  const u = await userFromRequest(req).catch(() => null);
  await assertRinkVisible(sql, u, t.rink_id);
  const edit = await userCan(sql, u, "roster.manage", { teamId, leagueId: t.league_id, rinkId: t.rink_id });
  const member = edit || (!!u && (await onTeam(sql, u.id, teamId)));
  const saved = g.lineup_json ? (JSON.parse(g.lineup_json) as Lineup) : null;
  // Who said In or Out is the team's business. Outsiders see only a lineup the captain has set, with no answers.
  if (!member && !saved) throw new HttpError(403, "The lineup shows here once the captain sets it.");
  const all = await available(teamId, g);
  const placed = saved ? new Set([...saved.f.flat(), ...saved.d.flat(), ...saved.g, ...saved.extras].filter((v) => v !== null)) : null;
  const visible = member ? all : all.filter((p) => placed!.has(p.id)).map((p) => ({ ...p, answer: null }));
  const players = await applyViewerNames(sql, u, visible);
  const opponent = g.opponent_team_id ? await one<any>(sql, "SELECT name, color, logo FROM teams WHERE id=$1", [g.opponent_team_id]) : null;
  return {
    team: { id: t.id, name: t.name, color: t.color, logo: t.logo, level: t.level },
    game: { id: g.id, date: g.local_date, time: g.local_time, location: g.location, kind: g.kind, isHome: g.is_home, opponent: opponent?.name ?? g.opponent_name ?? null, opponentColor: opponent?.color ?? null },
    players, lineup: saved ?? autoFill(players), saved: !!saved, setAt: g.lineup_at,
    can: { edit },
  };
});

export const PUT = handle<{ id: string; gid: string }>(async (req, { id, gid }) => {
  const u = await requireUser(req);
  const teamId = num(id);
  const b = await body(req);
  const { g } = await load(teamId, num(gid));
  await requireTeam(sql, u, teamId, "roster.manage");
  const ok = new Set((await available(teamId, g)).map((p) => p.id));
  const cell = (v: unknown) => (v === null || v === undefined || v === "" ? null : Number(v));
  const L: Lineup = {
    f: (Array.isArray(b?.f) ? b.f : EMPTY.f).slice(0, 4).map((l: unknown[]) => [0, 1, 2].map((i) => cell(l?.[i]))),
    d: (Array.isArray(b?.d) ? b.d : EMPTY.d).slice(0, 4).map((l: unknown[]) => [0, 1].map((i) => cell(l?.[i]))),
    g: [cell(b?.g?.[0]), cell(b?.g?.[1])].filter((v, i) => i === 0 || v !== null),
    extras: (Array.isArray(b?.extras) ? b.extras : []).map(cell).filter((v: number | null): v is number => v !== null),
  };
  const used = new Set<number>();
  for (const pid of [...L.f.flat(), ...L.d.flat(), ...L.g, ...L.extras]) {
    if (pid === null) continue;
    if (!ok.has(pid)) throw new HttpError(400, "Someone in that lineup isn't on the roster for this game.");
    if (used.has(pid)) throw new HttpError(400, "A player is in two spots.");
    used.add(pid);
  }
  await q(sql, "UPDATE scheduled_games SET lineup_json=$1, lineup_by=$2, lineup_at=now(), updated_at=now() WHERE id=$3", [JSON.stringify(L), u.id, g.id]);
  await logAction(sql, teamId, u.id, "lineup", null, null, { gameId: g.id });
  return { ok: true };
});
