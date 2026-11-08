import "server-only";
import { one, q, type Tx } from "./db";
import { HttpError } from "./services";
import { can } from "./permissions";
import { notify } from "./accounts";

/** A sheet only counts once a captain or assistant of either team, or league or rink staff, confirms it. */
export async function requireConfirm(db: Tx, user: any, sheet: any, input: { leagueId?: number; homeTeamId?: number | null; awayTeamId?: number | null }) {
  const league = input.leagueId ? await one<any>(db, "SELECT * FROM leagues WHERE id=$1", [input.leagueId]) : null;
  if (sheet.source === "sample" && league?.level === "DEMO") return;
  for (const t of [input.homeTeamId, input.awayTeamId]) if (t && (await can(db, user, "sheet.confirm", { teamId: t }))) return;
  if (league && (await can(db, user, "sheet.confirm", { leagueId: league.id, rinkId: league.rink_id }))) return;
  throw new HttpError(403, "A captain or assistant captain of one of these teams confirms the sheet. Send it to them.");
}

/** Tell the people who can confirm: both teams' captains and assistants, else rink staff, else admins. */
export async function notifyConfirmers(db: Tx, sheetId: number, input: any, exceptUser: number, staffOnly = false) {
  const teamIds = [input.homeTeamId, input.awayTeamId].filter(Boolean);
  const names = teamIds.length ? (await q<any>(db, "SELECT name FROM teams WHERE id IN (SELECT jsonb_array_elements_text($1::text::jsonb)::int)", [JSON.stringify(teamIds)])).map((t) => t.name).join(" vs ") : "a game";
  let to: number[] = [];
  if (!staffOnly && teamIds.length) to = (await q<any>(db, "SELECT DISTINCT user_id FROM role_grants WHERE scope_type='team' AND role IN ('captain','assistant_captain') AND revoked_at IS NULL AND scope_id IN (SELECT jsonb_array_elements_text($1::text::jsonb)::int)", [JSON.stringify(teamIds)])).map((r) => r.user_id);
  if (!to.length && input.leagueId) {
    const l = await one<any>(db, "SELECT * FROM leagues WHERE id=$1", [input.leagueId]);
    if (l) to = (await q<any>(db, "SELECT DISTINCT user_id FROM role_grants WHERE revoked_at IS NULL AND ((role IN ('rink_manager','scorekeeper') AND scope_id=$1) OR (role='commissioner' AND scope_id=$2))", [l.rink_id, l.id])).map((r) => r.user_id);
  }
  if (!to.length) to = (await q<any>(db, "SELECT DISTINCT user_id FROM role_grants WHERE role='admin' AND revoked_at IS NULL")).map((r) => r.user_id);
  for (const id of to) if (id !== exceptUser) await notify(db, id, { kind: "sheet", link: `/sheet/${sheetId}`, title: `A sheet for ${names} is ready to check`, body: staffOnly ? "Nobody confirmed it in 48 hours." : "Look it over and tap Confirm so it counts." });
  return to.length;
}

/** Nightly: sheets waiting more than 48 hours go to rink staff. */
export async function escalateWaitingSheets(db: Tx) {
  const late = await q<any>(db, "SELECT * FROM sheets WHERE status='awaiting' AND escalated_at IS NULL AND submitted_at < now() - interval '48 hours'");
  for (const s of late) {
    await notifyConfirmers(db, s.id, s.proposed_json ? JSON.parse(s.proposed_json) : {}, 0, true);
    await q(db, "UPDATE sheets SET escalated_at=now() WHERE id=$1", [s.id]);
  }
  return late.length;
}
