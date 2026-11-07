import "server-only";
import { one, q, type Tx } from "./db";
import { HttpError, gameCards } from "./services";
import { can } from "./permissions";

/** Event creator, rink staff at the host rink, or an admin. */
export async function canManageEvent(db: Tx, user: any, ev: any) {
  if (!user) return false;
  if (ev.created_by === user.id) return true;
  return can(db, user, "team.create", ev.host_rink_id ? { rinkId: ev.host_rink_id } : {});
}

/** Players who played a game in this event. Only they vote MVP, and only they can win it. */
async function eventPlayers(db: Tx, eventId: number) {
  return q<any>(db,
    `SELECT DISTINCT p.id, p.display_name AS name, p.user_id, s.team_id, t.name team FROM player_game_stats s JOIN games g ON g.id=s.game_id
     JOIN players p ON p.id=s.player_id JOIN teams t ON t.id=s.team_id WHERE g.event_id=$1`, [eventId]);
}

export async function eventMvp(db: Tx, eventId: number) {
  const r = await one<any>(db, "SELECT player_id, COUNT(*)::int n FROM event_mvp_votes WHERE event_id=$1 GROUP BY player_id ORDER BY n DESC, MAX(updated_at) LIMIT 1", [eventId]);
  return r && r.n >= 3 ? { playerId: r.player_id as number, votes: r.n as number } : null;
}

export async function eventView(db: Tx, eventId: number, viewer: any) {
  const ev = await one<any>(db, "SELECT e.*, r.name host_rink FROM events e LEFT JOIN rinks r ON r.id=e.host_rink_id WHERE e.id=$1", [eventId]);
  if (!ev) throw new HttpError(404, "Tournament not found.");
  const teams = await q<any>(db, "SELECT t.id, t.name, t.color, t.logo, et.place, l.name league FROM event_teams et JOIN teams t ON t.id=et.team_id JOIN leagues l ON l.id=t.league_id WHERE et.event_id=$1", [eventId]);
  const games = await q<any>(db, "SELECT * FROM games WHERE event_id=$1 ORDER BY played_on, id", [eventId]);
  for (const t of teams) {
    let w = 0, l = 0, ti = 0, gf = 0, ga = 0;
    for (const g of games) {
      if (g.home_team_id !== t.id && g.away_team_id !== t.id) continue;
      const m = g.home_team_id === t.id ? g.home_score : g.away_score, o = g.home_team_id === t.id ? g.away_score : g.home_score;
      gf += m; ga += o; if (m > o) w++; else if (m < o) l++; else ti++;
    }
    Object.assign(t, { gp: w + l + ti, w, l, t: ti, gf, ga, diff: gf - ga, pts: w * 2 + ti });
  }
  teams.sort((a, b) => (a.place ?? 9) - (b.place ?? 9) || b.pts - a.pts || b.diff - a.diff);
  const players = await eventPlayers(db, eventId);
  const votes = await q<any>(db, "SELECT player_id, COUNT(*)::int n FROM event_mvp_votes WHERE event_id=$1 GROUP BY player_id", [eventId]);
  const mine = viewer ? (await one<any>(db, "SELECT player_id FROM event_mvp_votes WHERE event_id=$1 AND voter_user_id=$2", [eventId, viewer.id]))?.player_id ?? null : null;
  const played = !!viewer && players.some((p) => p.user_id === viewer.id);
  const myTeams = viewer ? (await q<any>(db, "SELECT scope_id FROM role_grants WHERE user_id=$1 AND scope_type='team' AND role IN ('captain','assistant_captain') AND revoked_at IS NULL", [viewer.id])).map((r) => r.scope_id) : [];
  return {
    event: ev, teams, games: await gameCards(db, games), mvp: await eventMvp(db, eventId),
    players: players.map((p) => ({ id: p.id, name: p.name, team: p.team, votes: votes.find((v) => v.player_id === p.id)?.n ?? 0 })),
    me: { canVote: played, vote: mine, canManage: await canManageEvent(db, viewer, ev), canEnter: myTeams.filter((id: number) => !teams.some((t) => t.id === id)) },
  };
}
