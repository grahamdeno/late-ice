import { handle, body, num } from "@/server/http";
import { sql, q, one } from "@/server/db";
import { HttpError } from "@/server/services";
import * as A from "@/server/accounts";
import * as P from "@/server/permissions";
import * as S from "@/server/staff";

export const dynamic = "force-dynamic";

// Support fixes: release a stuck claim, hide or unhide a name. The person is told what changed.
export const POST = handle(async (req) => {
  const u = await A.requireUser(req);
  const b = await body(req);
  const action = String(b?.action || "");
  await sql.begin(async (tx) => {
    await P.require_(tx, u, "support.fix");
    const p = await one<any>(tx, "SELECT * FROM players WHERE id=$1", [Number(b?.playerId) || 0]);
    if (!p) throw new HttpError(404, "Player not found.");
    const rinkId = (await one<any>(tx, "SELECT l.rink_id FROM roster_entries re JOIN teams t ON t.id=re.team_id JOIN leagues l ON l.id=t.league_id WHERE re.player_id=$1 LIMIT 1", [p.id]))?.rink_id ?? null;
    if (action === "release") {
      if (!p.user_id) return;
      const was = p.user_id;
      await A.unlinkSlot(tx, p.id);
      await P.audit(tx, u.id, "support.release", { type: "player", id: p.id, rinkId }, { user: was }, { user: null });
      await A.notify(tx, was, { kind: "support", link: "/me", title: `Support released your claim on ${p.display_name}`, body: "If that was you, claim it again or reply to support." });
    } else if (action === "hide" || action === "unhide") {
      await q(tx, "UPDATE players SET hidden=$1 WHERE id=$2", [action === "hide" ? 1 : 0, p.id]);
      await A.refreshDisplay(tx, p.id);
      await P.audit(tx, u.id, `support.${action}`, { type: "player", id: p.id, rinkId }, { hidden: p.hidden }, { hidden: action === "hide" ? 1 : 0 });
      if (p.user_id) await A.notify(tx, p.user_id, { kind: "support", link: "/me", title: action === "hide" ? "Support hid your name at your request" : "Support made your name visible again" });
    } else throw new HttpError(400, "Unknown fix.");
  });
  return { ok: true };
});
