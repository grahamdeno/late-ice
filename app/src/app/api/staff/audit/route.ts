import { handle, body, num } from "@/server/http";
import { sql, q, one } from "@/server/db";
import { HttpError } from "@/server/services";
import * as A from "@/server/accounts";
import * as P from "@/server/permissions";
import * as S from "@/server/staff";

export const dynamic = "force-dynamic";

export const GET = handle(async (req) => {
  const u = await A.requireUser(req);
  const rinkId = Number(new URL(req.url).searchParams.get("rink")) || null;
  if (await P.can(sql, u, "support.view")) {
    return q(sql, `SELECT a.*, u.name actor FROM audit_log a LEFT JOIN users u ON u.id=a.actor_user_id ${rinkId ? "WHERE a.rink_id=$1" : ""} ORDER BY a.id DESC LIMIT 100`, rinkId ? [rinkId] : []);
  }
  if (!rinkId) throw new HttpError(400, "Pick a rink.");
  await P.require_(sql, u, "audit.view", { rinkId });
  return q(sql, "SELECT a.*, u.name actor FROM audit_log a LEFT JOIN users u ON u.id=a.actor_user_id WHERE a.rink_id=$1 ORDER BY a.id DESC LIMIT 100", [rinkId]);
});
