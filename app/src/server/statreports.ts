import "server-only";
// Players report a wrong score, goal, assist or lineup on a game; rink staff close it with a note.
import { one, q, type Tx } from "./db";
import { HttpError } from "./services";
import * as P from "./permissions";
import { notify } from "./accounts";

export const KINDS = { score: "The score", points: "A goal or assist", lineup: "Who played", other: "Something else" } as const;
const OPEN_PER_PERSON = 5;

export async function fileReport(db: Tx, user: any, gameId: number, kind: string, body: string) {
  const g = await one<any>(db, "SELECT g.id, g.league_id, l.rink_id FROM games g JOIN leagues l ON l.id=g.league_id WHERE g.id=$1", [gameId]);
  if (!g) throw new HttpError(404, "Game not found.");
  if (!(kind in KINDS)) throw new HttpError(400, "Pick what's wrong.");
  const text = String(body ?? "").trim().slice(0, 600);
  if (text.length < 5) throw new HttpError(400, "Say what's wrong, and what it should be.");
  const open = (await one<{ n: number }>(db, "SELECT COUNT(*)::int n FROM stat_reports WHERE user_id=$1 AND status='open'", [user.id]))!.n;
  if (open >= OPEN_PER_PERSON) throw new HttpError(429, `You have ${open} reports waiting. Staff will get to them; try again after.`);
  const row = await one<{ id: number }>(db, "INSERT INTO stat_reports (game_id,user_id,kind,body) VALUES ($1,$2,$3,$4) RETURNING id", [gameId, user.id, kind, text]);
  return { id: row!.id };
}

/** Open reports (and the last 30 days of closed ones) for the leagues at a rink this person can fix. */
export async function reportsForRink(db: Tx, user: any, rinkId: number) {
  const leagues = await q<{ id: number }>(db, "SELECT id FROM leagues WHERE rink_id=$1", [rinkId]);
  const ok: number[] = [];
  for (const l of leagues) if (await P.can(db, user, "game.resolve", { leagueId: l.id, rinkId })) ok.push(l.id);
  if (!ok.length) throw new HttpError(403, "Reported mistakes are for this rink's staff.");
  return q<any>(db,
    `SELECT r.id, r.game_id, r.kind, r.body, r.status, r.note, r.created_at, r.resolved_at,
       u.name AS reporter, g.played_on, g.home_score, g.away_score, h.name AS home, a.name AS away, l.level
     FROM stat_reports r JOIN games g ON g.id=r.game_id JOIN leagues l ON l.id=g.league_id
     JOIN teams h ON h.id=g.home_team_id JOIN teams a ON a.id=g.away_team_id JOIN users u ON u.id=r.user_id
     WHERE g.league_id = ANY($1::int[]) AND (r.status='open' OR r.resolved_at > now() - interval '30 days')
     ORDER BY r.status='open' DESC, r.created_at`, [ok]);
}

export async function closeReport(db: Tx, user: any, id: number, fixed: boolean, note: string) {
  const r = await one<any>(db, "SELECT r.*, g.league_id, l.rink_id FROM stat_reports r JOIN games g ON g.id=r.game_id JOIN leagues l ON l.id=g.league_id WHERE r.id=$1", [id]);
  if (!r) throw new HttpError(404, "Report not found.");
  await P.require_(db, user, "game.resolve", { leagueId: r.league_id, rinkId: r.rink_id });
  if (r.status !== "open") throw new HttpError(409, "That report is already closed.");
  const text = String(note ?? "").trim().slice(0, 400) || null;
  const status = fixed ? "fixed" : "no_change";
  await q(db, "UPDATE stat_reports SET status=$1, note=$2, resolved_by=$3, resolved_at=now() WHERE id=$4", [status, text, user.id, id]);
  await P.audit(db, user.id, "stat_report.close", { type: "game", id: r.game_id, rinkId: r.rink_id }, { status: "open" }, { status, note: text });
  await notify(db, r.user_id, {
    kind: "request", link: `/game/${r.game_id}`,
    title: fixed ? "Fixed: the mistake you reported" : "Checked: the game you reported stays as it is",
    body: text ?? (fixed ? "Thanks for flagging it." : "Staff checked it against the sheet."),
  });
  return { ok: true, status };
}
