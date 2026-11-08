import "server-only";
import { q, type Tx } from "./db";

export const fmtGame = (g: { local_date: string; local_time: string | null; opponent_name?: string | null }) => {
  const d = new Date(`${g.local_date}T12:00:00`).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
  return `${d}${g.local_time ? ` at ${g.local_time}` : ""}`;
};

/** Open and recent sub asks for one person, for their profile. */
export async function subRequestsFor(db: Tx, userId: number) {
  return q<any>(db,
    `SELECT sr.id, sr.status, sg.id game_id, sg.local_date, sg.local_time, sg.location, t.id team_id, t.name team_name, t.color,
       COALESCE(ot.name, sg.opponent_name) opponent, sg.is_home
     FROM sub_requests sr JOIN scheduled_games sg ON sg.id=sr.scheduled_game_id JOIN teams t ON t.id=sr.team_id LEFT JOIN teams ot ON ot.id=sg.opponent_team_id
     WHERE sr.user_id=$1 AND sr.status IN ('asked','accepted') AND sg.starts_at > now() - interval '3 hours' ORDER BY sg.starts_at`, [userId]);
}
