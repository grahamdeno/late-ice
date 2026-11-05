import { handle, body, num } from "@/server/http";
import { sql, q, one } from "@/server/db";
import { HttpError } from "@/server/services";
import * as A from "@/server/accounts";
import { teamRoleOf } from "@/server/permissions";
import { attendance, nextGame } from "@/server/schedule";
import { cleanAvatar } from "@/lib/avatar";
import { teamArchetypes, setOwnArchetype } from "@/server/archetypes";
import { subRequestsFor } from "@/server/subs";

export const dynamic = "force-dynamic";

export const GET = handle(async (req) => {
  const u = await A.userFromRequest(req);
  if (!u) return Response.json({ message: "Not signed in" }, { status: 401 });
  const slots = [];
  for (const s of await q<any>(sql,
    `SELECT p.id, p.display_name AS name, p.rating, p.games_rated, p.position, re.number, re.source, t.id team_id, t.name team_name, t.color, t.logo, l.id league_id, l.level, l.name league_name
     FROM players p JOIN roster_entries re ON re.player_id=p.id JOIN teams t ON t.id=re.team_id JOIN leagues l ON l.id=t.league_id
     WHERE p.user_id=$1 ORDER BY l.sort`, [u.id])) {
    const teamRole = await teamRoleOf(sql, u.id, s.team_id);
    const ng = await nextGame(sql, s.team_id);
    if (ng) await attendance(sql, s.team_id, [ng], u.id, false);
    const arch = (await teamArchetypes(sql, s.team_id, u.id)).won[s.id] ?? null;
    slots.push({ ...s, archetype: arch, next: ng, captain: await A.captainOf(sql, s.team_id), isCaptain: teamRole === "captain", teamRole, assistants: await A.assistantsOf(sql, s.team_id) });
  }
  // Teams this person runs: captain or assistant captain.
  const captainTeams = await q(sql,
    `SELECT t.id, t.name, t.color, t.logo, l.level, l.rink_id, r.role FROM role_grants r JOIN teams t ON t.id=r.scope_id JOIN leagues l ON l.id=t.league_id
     WHERE r.user_id=$1 AND r.scope_type='team' AND r.role IN ('captain','assistant_captain') AND r.revoked_at IS NULL`, [u.id]);
  const handoffs = await q(sql,
    `SELECT rq.id, rq.scope_id team_id, t.name team_name, fu.name from_name FROM role_requests rq JOIN teams t ON t.id=rq.scope_id JOIN users fu ON fu.id=rq.user_id
     WHERE rq.kind='captain_handoff' AND rq.status='open' AND rq.target_user_id=$1`, [u.id]);
  const roles = await A.rolesSummary(sql, u);
  const staff = roles.some((r) => ["scorekeeper", "commissioner", "rink_manager", "support", "admin"].includes(r.role));
  const notifications = await q(sql, "SELECT * FROM notifications WHERE user_id=$1 ORDER BY id DESC LIMIT 30", [u.id]);
  const unread = (await one<any>(sql, "SELECT COUNT(*) c FROM notifications WHERE user_id=$1 AND read_at IS NULL", [u.id]))!.c;
  return { subRequests: await subRequestsFor(sql, u.id), user: await A.publicUser(sql, u), slots, captainTeams, notifications, unread, suggestions: await A.suggestionsFor(sql, u), roles, staff, handoffs };
});

export const PATCH = handle(async (req) => {
  const u = await A.requireUser(req);
  const b = await body(req);
  const next = { ...u };
  if (b.name !== undefined) {
    const n = String(b.name).trim().replace(/\s+/g, " ").slice(0, 60);
    if (n.split(" ").length < 2) throw new HttpError(400, "First and last name, so your captain knows it's you.");
    next.name = n;
  }
  if (b.number !== undefined) next.number = A.cleanNumber(b.number);
  if (b.position !== undefined) { if (!A.POSITIONS.has(b.position)) throw new HttpError(400, "Pick center, wing, defense or goalie."); next.position = b.position; }
  if (b.homeRinkId !== undefined) {
    if (!(await one(sql, "SELECT 1 FROM rinks WHERE id=$1", [Number(b.homeRinkId) || 0]))) throw new HttpError(400, "Pick your home rink.");
    next.home_rink_id = Number(b.homeRinkId);
  }
  if (b.archetypeSelf !== undefined) await setOwnArchetype(sql, u.id, b.archetypeSelf || null);
  if (b.status === "available") b.status = "active";
  if (b.status !== undefined) {
    if (!A.STATUSES.has(b.status)) throw new HttpError(400, "Unknown status.");
    next.status = b.status;
    next.status_until = b.status === "ir" || b.status === "away" ? (b.statusUntil || null) : null;
  }
  if (b.hidden !== undefined) next.hidden = b.hidden ? 1 : 0;
  if (b.lookingForTeam !== undefined) next.looking_for_team = !!b.lookingForTeam;
  if (b.willSub !== undefined) next.will_sub = !!b.willSub;
  const avatar = b.avatar !== undefined ? cleanAvatar(b.avatar) : undefined;
  const saved = await sql.begin(async (tx) => {
    await q(tx, "UPDATE users SET name=$1, number=$2, position=$3, home_rink_id=$4, status=$5, status_until=$6, hidden=$7, looking_for_team=$8, will_sub=$9 WHERE id=$10",
      [next.name, next.number, next.position, next.home_rink_id, next.status, next.status_until, next.hidden, !!next.looking_for_team, !!next.will_sub, u.id]);
    if (avatar !== undefined) await q(tx, "UPDATE users SET avatar=$1::text::jsonb WHERE id=$2", [avatar ? JSON.stringify(avatar) : null, u.id]);
    if (next.position && next.position !== u.position) await q(tx, "UPDATE players SET position=$1 WHERE user_id=$2", [next.position, u.id]);
    for (const p of await q<{ id: number }>(tx, "SELECT id FROM players WHERE user_id=$1", [u.id])) await A.refreshDisplay(tx, p.id);
    return one(tx, "SELECT * FROM users WHERE id=$1", [u.id]);
  });
  return { user: await A.publicUser(sql, saved) };
});
