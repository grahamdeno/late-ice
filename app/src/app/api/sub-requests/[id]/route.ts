import { handle, body, num } from "@/server/http";
import { sql, q, one } from "@/server/db";
import { HttpError } from "@/server/services";
import { requireApproved, notify } from "@/server/accounts";
import { fmtGame } from "@/server/subs";

export const dynamic = "force-dynamic";

/** The asked player answers. Yes puts them in that game's head count as a sub. */
export const PUT = handle<{ id: string }>(async (req, { id }) => {
  const u = await requireApproved(req);
  const b = await body(req);
  const yes = b.answer === "yes";
  if (!yes && b.answer !== "no") throw new HttpError(400, "Yes or no.");
  return sql.begin(async (tx) => {
    const r = await one<any>(tx, "SELECT sr.*, sg.local_date, sg.local_time, sg.starts_at FROM sub_requests sr JOIN scheduled_games sg ON sg.id=sr.scheduled_game_id WHERE sr.id=$1 AND sr.user_id=$2 FOR UPDATE OF sr", [num(id), u.id]);
    if (!r || r.status === "canceled") throw new HttpError(404, "That ask is no longer open.");
    await q(tx, "UPDATE sub_requests SET status=$1, answered_at=now() WHERE id=$2", [yes ? "accepted" : "declined", r.id]);
    // The ask itself is the push. This reply stays in the app.
    if (r.asked_by) await notify(tx, r.asked_by, { kind: "sub", push: false, teamId: r.team_id, link: `/team/${r.team_id}`, title: `${u.name ?? "Your sub"} ${yes ? "can sub" : "can't sub"} ${fmtGame(r)}` });
    return { ok: true, status: yes ? "accepted" : "declined" };
  });
});
