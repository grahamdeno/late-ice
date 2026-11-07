import { handle, body, num } from "@/server/http";
import { sql, q, one } from "@/server/db";
import { HttpError } from "@/server/services";
import { requireApproved } from "@/server/accounts";

export const dynamic = "force-dynamic";
/** Tournament MVP: everyone who played votes once (changeable); not for yourself. 3 votes to win. */
export const PUT = handle<{ id: string }>(async (req, { id }) => {
  const u = await requireApproved(req);
  const b = await body(req);
  const eventId = num(id);
  const played = await q<any>(sql, "SELECT DISTINCT s.player_id, p.user_id FROM player_game_stats s JOIN games g ON g.id=s.game_id JOIN players p ON p.id=s.player_id WHERE g.event_id=$1", [eventId]);
  if (!played.some((p) => p.user_id === u.id)) throw new HttpError(403, "Only players who played in this tournament vote.");
  if (b.playerId == null) { await q(sql, "DELETE FROM event_mvp_votes WHERE event_id=$1 AND voter_user_id=$2", [eventId, u.id]); return { ok: true }; }
  const target = played.find((p) => p.player_id === num(b.playerId));
  if (!target) throw new HttpError(400, "Pick someone who played in it.");
  if (target.user_id === u.id) throw new HttpError(400, "Not yourself.");
  await q(sql, `INSERT INTO event_mvp_votes (event_id, voter_user_id, player_id) VALUES ($1,$2,$3)
    ON CONFLICT (event_id, voter_user_id) DO UPDATE SET player_id=EXCLUDED.player_id, updated_at=now()`, [eventId, u.id, target.player_id]);
  return { ok: true };
});
