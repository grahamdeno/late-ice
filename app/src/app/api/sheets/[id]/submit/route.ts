import { handle, body, num } from "@/server/http";
import { sql, q, one } from "@/server/db";
import { HttpError } from "@/server/services";
import { requireApproved } from "@/server/accounts";
import { notifyConfirmers } from "@/server/sheetconfirm";

export const dynamic = "force-dynamic";

/** A player checked the sheet but can't confirm it: save their version and ask the captains. */
export const POST = handle<{ id: string }>(async (req, { id }) => {
  const u = await requireApproved(req);
  const input = await body(req);
  return sql.begin(async (tx) => {
    const s = await one<any>(tx, "SELECT * FROM sheets WHERE id=$1 FOR UPDATE", [num(id)]);
    if (!s) throw new HttpError(404, "Sheet not found");
    if (s.game_id) throw new HttpError(409, "This sheet is already in the books.", { gameId: s.game_id });
    if (!["review", "awaiting"].includes(s.status)) throw new HttpError(400, "This sheet isn't ready to send.");
    if (!input?.leagueId || !input?.data) throw new HttpError(400, "Pick the league and teams first.");
    await q(tx, "UPDATE sheets SET status='awaiting', proposed_json=$1, submitted_by=$2, submitted_at=now(), escalated_at=NULL WHERE id=$3",
      [JSON.stringify({ leagueId: input.leagueId, homeTeamId: input.homeTeamId ?? null, awayTeamId: input.awayTeamId ?? null, data: input.data, eventId: input.eventId ?? null }), u.id, s.id]);
    const told = await notifyConfirmers(tx, s.id, input, u.id);
    return { ok: true, told };
  });
});
