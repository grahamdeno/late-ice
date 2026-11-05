import { handle, body, num } from "@/server/http";
import { sql, q, one } from "@/server/db";
import { HttpError, similarity } from "@/server/services";
import * as A from "@/server/accounts";
import * as P from "@/server/permissions";
import { clean, createTeam } from "@/server/manage";

export const dynamic = "force-dynamic";

/** "Start a team." Rink staff add it straight away; anyone else asks, and rink staff (or an admin) decide. */
export const POST = handle(async (req) => {
  const u = await A.requireUser(req);
  const b = await body(req);
  const l = await one<any>(sql, "SELECT * FROM leagues WHERE id=$1", [num(b.leagueId)]);
  if (!l) throw new HttpError(400, "Pick a league.");
  const name = clean(b.name, 50);
  if (!name) throw new HttpError(400, "Give the team a name.");
  const captain = !!b.captain;
  if (await P.can(sql, u, "team.create", { leagueId: l.id, rinkId: l.rink_id })) {
    const t = await sql.begin(async (tx) => {
      const t = await createTeam(tx, l.id, { name, color: b.color });
      await P.audit(tx, u.id, "team.create", { type: "team", id: t.id, rinkId: l.rink_id }, undefined, { name: t.name, league: l.name });
      return t;
    });
    return { created: true, teamId: t.id };
  }
  const existing = await q<any>(sql, "SELECT name FROM teams WHERE league_id=$1", [l.id]);
  const dupe = existing.find((t) => similarity(t.name, name) >= 0.85);
  if (dupe) throw new HttpError(409, `${dupe.name} is already in the ${l.name}. Open it and claim your spot instead.`);
  return sql.begin(async (tx) => {
    const r = await one<any>(tx, "INSERT INTO role_requests (kind, user_id, scope_type, scope_id, message, details) VALUES ('new_team',$1,'league',$2,$3,$4) RETURNING id",
      [u.id, l.id, clean(b.note, 300) || null, JSON.stringify({ name, color: b.color ?? null, captain })]);
    const staff = await q<{ user_id: number }>(tx,
      `SELECT DISTINCT user_id FROM role_grants WHERE revoked_at IS NULL AND ((role='rink_manager' AND scope_id=$1) OR (role='commissioner' AND scope_id=$2))`, [l.rink_id, l.id]);
    const to = staff.length ? staff : await q<{ user_id: number }>(tx, "SELECT DISTINCT user_id FROM role_grants WHERE role='admin' AND revoked_at IS NULL");
    for (const s of to) await A.notify(tx, s.user_id, { kind: "request", link: "/staff", title: `${u.name ?? u.email} wants to add ${name} to the ${l.name}` });
    return { requested: true, id: r.id };
  });
});
