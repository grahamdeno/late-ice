import { handle, body, num } from "@/server/http";
import { sql, q, one } from "@/server/db";
import { HttpError } from "@/server/services";
import { requireUser } from "@/server/accounts";

export const dynamic = "force-dynamic";

/** In, Out or Late for one game. Only players on that team's roster can answer. Null clears it. */
export const PUT = handle<{ gid: string }>(async (req, { gid }) => {
  const u = await requireUser(req);
  const b = await body(req);
  const answer = b?.answer ?? null;
  if (answer !== null && !["in", "out", "late"].includes(answer)) throw new HttpError(400, "Pick in, out or late.");
  const g = await one<any>(sql, "SELECT * FROM scheduled_games WHERE id=$1", [num(gid)]);
  if (!g) throw new HttpError(404, "Game not found.");
  if (new Date(g.starts_at).getTime() < Date.now() - 3 * 3600 * 1000) throw new HttpError(400, "That game is over.");
  const onTeam = await one(sql, "SELECT 1 FROM players p JOIN roster_entries re ON re.player_id=p.id WHERE p.user_id=$1 AND re.team_id=$2", [u.id, g.team_id]);
  if (!onTeam) throw new HttpError(403, "Only players on this team's roster can answer.");
  if (answer === null) await q(sql, "DELETE FROM rsvps WHERE scheduled_game_id=$1 AND user_id=$2", [g.id, u.id]);
  else await q(sql,
    `INSERT INTO rsvps (scheduled_game_id, user_id, answer) VALUES ($1,$2,$3)
     ON CONFLICT (scheduled_game_id, user_id) DO UPDATE SET answer=EXCLUDED.answer, updated_at=now()`, [g.id, u.id, answer]);
  return { ok: true, answer };
});
