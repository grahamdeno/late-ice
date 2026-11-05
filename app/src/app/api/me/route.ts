import { handle, body, num } from "@/server/http";
import { sql, q, one } from "@/server/db";
import { HttpError } from "@/server/services";
import * as A from "@/server/accounts";

export const dynamic = "force-dynamic";

export const GET = handle(async (req) => {
  const u = await A.userFromRequest(req);
  if (!u) return Response.json({ message: "Not signed in" }, { status: 401 });
  const slots = [];
  for (const s of await q<any>(sql,
    `SELECT p.id, p.display_name AS name, p.rating, p.games_rated, p.position, re.number, re.source, t.id team_id, t.name team_name, t.color, t.logo, l.id league_id, l.level, l.name league_name
     FROM players p JOIN roster_entries re ON re.player_id=p.id JOIN teams t ON t.id=re.team_id JOIN leagues l ON l.id=t.league_id
     WHERE p.user_id=$1 ORDER BY l.sort`, [u.id])) {
    slots.push({ ...s, captain: await A.captainOf(sql, s.team_id), isCaptain: await A.isCaptain(sql, u.id, s.team_id) });
  }
  const captainTeams = await q(sql,
    "SELECT t.id, t.name, t.color, t.logo, l.level, l.rink_id FROM team_roles r JOIN teams t ON t.id=r.team_id JOIN leagues l ON l.id=t.league_id WHERE r.user_id=$1 AND r.role='captain'", [u.id]);
  const notifications = await q(sql, "SELECT * FROM notifications WHERE user_id=$1 ORDER BY id DESC LIMIT 30", [u.id]);
  const unread = (await one<any>(sql, "SELECT COUNT(*) c FROM notifications WHERE user_id=$1 AND read_at IS NULL", [u.id]))!.c;
  return { user: await A.publicUser(sql, u), slots, captainTeams, notifications, unread, suggestions: await A.suggestionsFor(sql, u) };
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
  if (b.position !== undefined) { if (!A.POSITIONS.has(b.position)) throw new HttpError(400, "Pick forward, defense or goalie."); next.position = b.position; }
  if (b.homeRinkId !== undefined) {
    if (!(await one(sql, "SELECT 1 FROM rinks WHERE id=$1", [Number(b.homeRinkId) || 0]))) throw new HttpError(400, "Pick your home rink.");
    next.home_rink_id = Number(b.homeRinkId);
  }
  if (b.status !== undefined) {
    if (!A.STATUSES.has(b.status)) throw new HttpError(400, "Unknown status.");
    next.status = b.status;
    next.status_until = b.status === "ir" || b.status === "away" ? (b.statusUntil || null) : null;
  }
  if (b.hidden !== undefined) next.hidden = b.hidden ? 1 : 0;
  const saved = await sql.begin(async (tx) => {
    await q(tx, "UPDATE users SET name=$1, number=$2, position=$3, home_rink_id=$4, status=$5, status_until=$6, hidden=$7 WHERE id=$8",
      [next.name, next.number, next.position, next.home_rink_id, next.status, next.status_until, next.hidden, u.id]);
    for (const p of await q<{ id: number }>(tx, "SELECT id FROM players WHERE user_id=$1", [u.id])) await A.refreshDisplay(tx, p.id);
    return one(tx, "SELECT * FROM users WHERE id=$1", [u.id]);
  });
  return { user: await A.publicUser(sql, saved) };
});
