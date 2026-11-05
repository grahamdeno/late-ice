import "server-only";
import { q, one, type Tx } from "./db";

/**
 * How full a roster is. Subs never count. A registered player on injured reserve or away stops counting
 * while they're out (their spot is open for a draft or a sub), and counts again when they're back.
 */
export async function rosterCounts(db: Tx, teamId: number) {
  const lim = await one<any>(db, "SELECT l.roster_max, l.goalie_max FROM teams t JOIN leagues l ON l.id=t.league_id WHERE t.id=$1", [teamId]);
  const rows = await q<any>(db,
    `SELECT p.position, re.is_sub, u.status, u.status_until FROM roster_entries re JOIN players p ON p.id=re.player_id LEFT JOIN users u ON u.id=p.user_id WHERE re.team_id=$1`, [teamId]);
  const today = new Date().toISOString().slice(0, 10);
  const out = (s: any) => s.status && ["ir", "away"].includes(s.status) && (!s.status_until || s.status_until >= today);
  const active = rows.filter((r) => !r.is_sub && !out(r));
  return {
    rosterMax: lim?.roster_max ?? 15, goalieMax: lim?.goalie_max ?? 2,
    skaters: active.filter((r) => r.position !== "G").length,
    goalies: active.filter((r) => r.position === "G").length,
    out: rows.filter((r) => !r.is_sub && out(r)).length,
    subs: rows.filter((r) => r.is_sub).length,
  };
}
