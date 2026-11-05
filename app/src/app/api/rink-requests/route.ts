import { handle, body } from "@/server/http";
import { sql, q, one } from "@/server/db";
import { HttpError } from "@/server/services";
import * as A from "@/server/accounts";
import * as P from "@/server/permissions";
import { clean, createRink, emailOnRinkDomain, mapLookup, similarRinks } from "@/server/manage";

export const dynamic = "force-dynamic";
export const maxDuration = 20;

const ROLES = new Set(["owner", "hockey_director", "league_coordinator", "front_desk", "other"]);

/**
 * "My rink isn't listed." Any signed-in player can ask; a system admin approves after checking
 * the map lookup. Asking to manage it adds the official-capacity checks. Admins add rinks directly.
 */
export const POST = handle(async (req) => {
  const u = await A.requireUser(req);
  const b = await body(req);
  const d = { name: clean(b.name), city: clean(b.city, 60), state: clean(b.state, 2).toUpperCase(), address: clean(b.address, 120), website: clean(b.website, 120), phone: clean(b.phone, 30) };
  if (!d.name || !d.city || !/^[A-Z]{2}$/.test(d.state)) throw new HttpError(400, "Rink name, city and two-letter state, please.");
  const matches = await similarRinks(sql, d.name, d.city);
  if (matches.length && !b.confirmNew) throw new HttpError(409, "That looks like a rink that's already here.", { matches });
  const manage = !!b.manage;
  const role = manage ? (ROLES.has(b.role) ? b.role : "other") : null;
  const map = await mapLookup(d.name, d.city, d.state);
  const website = d.website || map.matches[0]?.website || null;
  const details = { ...d, website, manage, role, map, emailOnDomain: manage ? emailOnRinkDomain(u.email, website) : false, note: clean(b.note, 400) || null };
  if (await P.can(sql, u, "rink.create")) {
    const rink = await sql.begin(async (tx) => {
      const r = await createRink(tx, details, u.id);
      await P.audit(tx, u.id, "rink.create", { type: "rink", id: r.id, rinkId: r.id }, undefined, { name: r.name });
      return r;
    });
    return { created: true, rinkId: rink.id };
  }
  return sql.begin(async (tx) => {
    if (await one(tx, "SELECT 1 FROM role_requests WHERE kind='new_rink' AND status='open' AND user_id=$1 AND lower(details->>'name')=lower($2)", [u.id, d.name])) return { requested: true };
    const r = await one<any>(tx, "INSERT INTO role_requests (kind, user_id, scope_type, scope_id, message, details) VALUES ('new_rink',$1,'system',NULL,$2,$3::text::jsonb) RETURNING id", [u.id, details.note, JSON.stringify(details)]);
    for (const a of await q<{ user_id: number }>(tx, "SELECT DISTINCT user_id FROM role_grants WHERE role='admin' AND revoked_at IS NULL")) {
      await A.notify(tx, a.user_id, { kind: "request", link: "/staff", title: `${u.name ?? u.email} asked to add ${d.name} (${d.city}, ${d.state})`, body: manage ? "They also want to manage it." : undefined });
    }
    return { requested: true, id: r.id };
  });
});
