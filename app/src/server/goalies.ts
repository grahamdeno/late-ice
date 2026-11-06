import "server-only";
import { one, q, type Tx } from "./db";
import { HttpError } from "./services";

/** How long the other captain has to answer before a report counts as unverified. */
export const ANSWER_HOURS = 48;

/** pending past the answer window reads as unverified. Disputed waits for staff. */
export function effectiveStatus(status: string, createdAt: Date | string, now = Date.now()) {
  if (status === "pending" && now - new Date(createdAt).getTime() > ANSWER_HOURS * 3600_000) return "unverified";
  return status;
}

/** Counted reports: verified in full, unverified at half. Pending inside the window and disputed don't count. */
export function weightOf(status: string) {
  return status === "verified" ? 1 : status === "unverified" ? 0.5 : 0;
}

async function gameSides(db: Tx, gameId: number) {
  const g = await one<any>(db, "SELECT g.*, l.rink_id FROM games g JOIN leagues l ON l.id=g.league_id WHERE g.id=$1", [gameId]);
  if (!g) throw new HttpError(404, "Game not found.");
  return g;
}

/** The viewer's goalie spot in this game: a roster spot on either team that is theirs and marked G. */
export async function goalieSlot(db: Tx, userId: number, g: any) {
  return one<{ player_id: number; team_id: number }>(db,
    `SELECT p.id AS player_id, re.team_id FROM players p JOIN roster_entries re ON re.player_id=p.id
     WHERE p.user_id=$1 AND re.team_id IN ($2,$3) AND p.position='G' ORDER BY re.id LIMIT 1`,
    [userId, g.home_team_id, g.away_team_id]);
}

export async function submitReport(db: Tx, u: any, gameId: number, shots: number) {
  const g = await gameSides(db, gameId);
  if (g.home_score == null || g.away_score == null) throw new HttpError(400, "This game has no final score yet.");
  const slot = await goalieSlot(db, u.id, g);
  if (!slot) throw new HttpError(403, "Only a goalie on one of these teams can enter goalie numbers. Set your position to Goalie on your profile.");
  if (!Number.isInteger(shots) || shots < 0 || shots > 150) throw new HttpError(400, "Shots against is a whole number, 0 to 150.");
  const ga = slot.team_id === g.home_team_id ? g.away_score : g.home_score;
  if (shots < ga) throw new HttpError(400, `Shots against can't be fewer than the ${ga} goals scored on you.`);
  const prev = await one<any>(db, "SELECT * FROM goalie_reports WHERE game_id=$1 AND player_id=$2", [gameId, slot.player_id]);
  if (prev && prev.status !== "pending") throw new HttpError(409, "The other captain already answered. Ask staff to change it.");
  await q(db,
    `INSERT INTO goalie_reports (game_id, player_id, team_id, shots_against, goals_against, submitted_by)
     VALUES ($1,$2,$3,$4,$5,$6)
     ON CONFLICT (game_id, player_id) DO UPDATE SET shots_against=EXCLUDED.shots_against, goals_against=EXCLUDED.goals_against, created_at=now()`,
    [gameId, slot.player_id, slot.team_id, shots, ga, u.id]);
  const oppTeam = slot.team_id === g.home_team_id ? g.away_team_id : g.home_team_id;
  const team = await one<{ name: string }>(db, "SELECT name FROM teams WHERE id=$1", [slot.team_id]);
  const confirmers = await q<{ user_id: number }>(db,
    "SELECT DISTINCT user_id FROM role_grants WHERE scope_type='team' AND scope_id=$1 AND role IN ('captain','assistant_captain') AND revoked_at IS NULL", [oppTeam]);
  const { notify } = await import("./accounts");
  for (const c of confirmers) {
    await notify(db, c.user_id, { kind: "goalie", title: `${team?.name ?? "The other team"}'s goalie says you put ${shots} shots on goal`, body: `Agree, give your number, or say you're not sure. No answer in ${ANSWER_HOURS} hours counts it at half weight.`, link: `/game/${gameId}`, teamId: oppTeam });
  }
  return { ok: true };
}

export async function answerReport(db: Tx, u: any, reportId: number, answer: string, counter?: number) {
  const r = await one<any>(db, "SELECT r.*, g.home_team_id, g.away_team_id FROM goalie_reports r JOIN games g ON g.id=r.game_id WHERE r.id=$1", [reportId]);
  if (!r) throw new HttpError(404, "Not found.");
  const oppTeam = r.team_id === r.home_team_id ? r.away_team_id : r.home_team_id;
  const { teamRoleOf } = await import("./permissions");
  if (!(await teamRoleOf(db, u.id, oppTeam))) throw new HttpError(403, "Only the other team's captain or assistant can answer this.");
  if (r.status !== "pending") throw new HttpError(409, "This was already answered.");
  if (answer === "agree") {
    await q(db, "UPDATE goalie_reports SET status='verified', decided_by=$1, decided_at=now() WHERE id=$2", [u.id, reportId]);
  } else if (answer === "unsure") {
    await q(db, "UPDATE goalie_reports SET status='unverified', decided_by=$1, decided_at=now() WHERE id=$2", [u.id, reportId]);
  } else if (answer === "differ") {
    const n = Number(counter);
    if (!Number.isInteger(n) || n < r.goals_against || n > 150) throw new HttpError(400, `Give a whole number from ${r.goals_against} to 150.`);
    if (n === r.shots_against) {
      await q(db, "UPDATE goalie_reports SET status='verified', decided_by=$1, decided_at=now() WHERE id=$2", [u.id, reportId]);
    } else {
      await q(db, "UPDATE goalie_reports SET status='disputed', counter_shots=$1, decided_by=$2, decided_at=now() WHERE id=$3", [n, u.id, reportId]);
    }
  } else throw new HttpError(400, "Answer agree, differ or unsure.");
  return { ok: true };
}

/** Staff settle a dispute by picking one of the two numbers. */
export async function settleReport(db: Tx, u: any, reportId: number, use: string) {
  const r = await one<any>(db, "SELECT r.*, g.league_id, l.rink_id FROM goalie_reports r JOIN games g ON g.id=r.game_id JOIN leagues l ON l.id=g.league_id WHERE r.id=$1", [reportId]);
  if (!r) throw new HttpError(404, "Not found.");
  const { require_ } = await import("./permissions");
  await require_(db, u, "game.resolve", { leagueId: r.league_id, rinkId: r.rink_id });
  if (r.status !== "disputed") throw new HttpError(409, "Only disputed numbers are settled here.");
  if (use !== "goalie" && use !== "captain") throw new HttpError(400, "Pick the goalie's number or the captain's.");
  const shots = use === "captain" ? r.counter_shots : r.shots_against;
  await q(db, "UPDATE goalie_reports SET status='verified', shots_against=$1, decided_by=$2, decided_at=now() WHERE id=$3", [shots, u.id, reportId]);
  return { ok: true };
}

/** Reports on a game, with what the viewer may do. */
export async function reportsForGame(db: Tx, gameId: number, viewer: any | null) {
  const g = await gameSides(db, gameId);
  const rows = await q<any>(db,
    `SELECT r.id, r.player_id, r.team_id, r.shots_against, r.goals_against, r.status, r.counter_shots, r.created_at, p.display_name AS name
     FROM goalie_reports r JOIN players p ON p.id=r.player_id WHERE r.game_id=$1 ORDER BY r.id`, [gameId]);
  const { teamRoleOf } = await import("./permissions");
  const out = [];
  for (const r of rows) {
    const status = effectiveStatus(r.status, r.created_at);
    const opp = r.team_id === g.home_team_id ? g.away_team_id : g.home_team_id;
    const canAnswer = !!viewer && r.status === "pending" && !!(await teamRoleOf(db, viewer.id, opp));
    out.push({ ...r, status, savePct: r.shots_against ? (r.shots_against - r.goals_against) / r.shots_against : null, canAnswer });
  }
  const mine = viewer && g.home_score != null ? await goalieSlot(db, viewer.id, g) : null;
  const myReport = mine ? out.find((r) => r.player_id === mine.player_id) : null;
  return { reports: out, canSubmit: !!mine && (!myReport || myReport.status === "pending"), myShots: myReport?.shots_against ?? null };
}
