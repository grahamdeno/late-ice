import "server-only";
import { q, type Tx } from "./db";

/** Product loop log. Ids only: no sheet text, photos, or credentials. */
export async function logEvent(db: Tx, e: { userId: number; kind: "scan" | "confirm" | "rsvp" | "app_open"; teamId?: number | null; gameId?: number | null }) {
  if (!e.userId) return;
  // app_open is once per user per UTC day. The partial unique index makes concurrent calls safe.
  if (e.kind === "app_open") {
    await q(db, "INSERT INTO app_events (user_id, kind) VALUES ($1, 'app_open') ON CONFLICT DO NOTHING", [e.userId]);
    return;
  }
  await q(db, "INSERT INTO app_events (user_id, kind, team_id, game_id) VALUES ($1,$2,$3,$4)", [e.userId, e.kind, e.teamId ?? null, e.gameId ?? null]);
}
