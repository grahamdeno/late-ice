import "server-only";
import { one, q, sql, type Tx } from "./db";
import { HttpError } from "./services";
import * as A from "./accounts";
import * as P from "./permissions";

/** Optional email through Resend. Without RESEND_API_KEY the notice is in-app only. */
export async function sendEmail(to: string, subject: string, text: string) {
  const key = process.env.RESEND_API_KEY;
  if (!key || !to) return false;
  const from = process.env.MAIL_FROM || "Late Ice <late-ice@tangomike.app>";
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({ from, to, subject, text }),
  }).catch(() => null);
  return !!res?.ok;
}

/** Which rink a scope belongs to, for permission checks and the audit log. */
export async function rinkOf(db: Tx, scopeType: P.ScopeType, scopeId: number | null) {
  if (scopeType === "rink") return scopeId;
  if (scopeType === "league") return (await one<{ rink_id: number }>(db, "SELECT rink_id FROM leagues WHERE id=$1", [scopeId]))?.rink_id ?? null;
  if (scopeType === "team") return (await one<{ rink_id: number }>(db, "SELECT l.rink_id FROM teams t JOIN leagues l ON l.id=t.league_id WHERE t.id=$1", [scopeId]))?.rink_id ?? null;
  return null;
}

/** Who may grant which staff role. Team roles are granted from the team page, never here. */
export async function requireCanGrant(db: Tx, actor: any, role: P.Role, scopeId: number | null) {
  if (role === "captain" || role === "assistant_captain") throw new HttpError(400, "Captains and assistants are set from the team page.");
  if (role === "scorekeeper" || role === "commissioner") {
    const rinkId = await rinkOf(db, P.ROLE_SCOPE[role], scopeId);
    if (!rinkId) throw new HttpError(400, role === "commissioner" ? "Pick a league." : "Pick a rink.");
    await P.require_(db, actor, "rink.staff", { rinkId });
    return rinkId;
  }
  if (role === "rink_manager" && !scopeId) throw new HttpError(400, "Pick a rink.");
  await P.require_(db, actor, "system.grant");
  return role === "rink_manager" ? scopeId : null;
}

export async function findUser(db: Tx, ref: { userId?: unknown; email?: unknown }) {
  if (ref.userId) {
    const u = await one<any>(db, "SELECT * FROM users WHERE id=$1 AND merged_into IS NULL", [Number(ref.userId) || 0]);
    if (u) return u;
  }
  const e = A.normEmail(String(ref.email || ""));
  if (e) {
    const u = await one<any>(db, "SELECT * FROM users WHERE email=$1 AND merged_into IS NULL", [e]);
    if (u) return u;
    throw new HttpError(404, `Nobody has signed up with ${e} yet. Ask them to join first.`);
  }
  throw new HttpError(404, "Player not found.");
}

/* ---------- account merges ---------- */

export const MERGE_HOLD_MS = 24 * 60 * 60 * 1000;

/** Move everything from one account to another. The old account stays as a tombstone. */
export async function runMerge(tx: Tx, m: any, actor: number | null) {
  const from = await one<any>(tx, "SELECT * FROM users WHERE id=$1 FOR UPDATE", [m.from_user_id]);
  const to = await one<any>(tx, "SELECT * FROM users WHERE id=$1 FOR UPDATE", [m.to_user_id]);
  if (!from || !to || from.merged_into || to.merged_into) {
    await q(tx, "UPDATE account_merges SET status='cancelled' WHERE id=$1", [m.id]);
    return false;
  }
  // Roster spots and their stats.
  await q(tx, "UPDATE players SET user_id=$1 WHERE user_id=$2", [to.id, from.id]);
  // Roles: keep the new account's when both hold the same one.
  for (const g of await q<any>(tx, "SELECT * FROM role_grants WHERE user_id=$1 AND revoked_at IS NULL", [from.id])) {
    const dup = await one(tx, "SELECT 1 FROM role_grants WHERE user_id=$1 AND role=$2 AND COALESCE(scope_id,0)=COALESCE($3::int,0) AND revoked_at IS NULL", [to.id, g.role, g.scope_id]);
    if (dup) await P.revoke(tx, g.id, actor, "merged");
    else await q(tx, "UPDATE role_grants SET user_id=$1, note=COALESCE(note,'') || ' (merged)' WHERE id=$2", [to.id, g.id]);
  }
  await q(tx, "UPDATE notifications SET user_id=$1 WHERE user_id=$2", [to.id, from.id]);
  await q(tx, "UPDATE rsvps r SET user_id=$1 WHERE user_id=$2 AND NOT EXISTS (SELECT 1 FROM rsvps x WHERE x.user_id=$1 AND x.scheduled_game_id=r.scheduled_game_id)", [to.id, from.id]);
  await q(tx, "DELETE FROM rsvps WHERE user_id=$1", [from.id]);
  // Profile fields the new account doesn't have yet.
  await q(tx,
    `UPDATE users SET name=COALESCE(name,$2), number=COALESCE(number,$3), position=COALESCE(position,$4), home_rink_id=COALESCE(home_rink_id,$5), phone=COALESCE(phone,$6)
     WHERE id=$1`, [to.id, from.name, from.number, from.position, from.home_rink_id, from.phone]);
  await q(tx, "UPDATE users SET merged_into=$1, auth_id=NULL, phone=NULL WHERE id=$2", [to.id, from.id]);
  await q(tx, "UPDATE account_merges SET status='done', done_at=now() WHERE id=$1", [m.id]);
  for (const p of await q<{ id: number }>(tx, "SELECT id FROM players WHERE user_id=$1", [to.id])) await A.refreshDisplay(tx, p.id);
  await P.audit(tx, actor, "account.merge", { type: "user", id: to.id }, { from: from.id }, { into: to.id });
  await A.notify(tx, to.id, { kind: "merge", link: "/me", title: "Your old Late Ice account was moved to this one", body: "Your roster spots, stats and roles are here now." });
  return true;
}

/** Run merges whose hold has passed. Called by the nightly job and by admins. */
export async function runDueMerges() {
  const due = await q<any>(sql, "SELECT * FROM account_merges WHERE status='pending' AND run_after<=now() ORDER BY id");
  let n = 0;
  for (const m of due) if (await sql.begin((tx) => runMerge(tx, m, null))) n++;
  return n;
}
