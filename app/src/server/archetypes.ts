import "server-only";
import { one, q, type Tx } from "./db";
import { HttpError, currentSeason } from "./services";

export const ARCHETYPES = ["goon", "pest", "grinder", "sniper", "playmaker", "beauty", "duster", "cherry_picker", "bender", "energy"] as const;
/** Fewest votes before an archetype shows, so one teammate can't brand someone alone. */
export const MIN_VOTES = 2;

async function seasonOf(db: Tx, teamId: number) {
  const t = await one<any>(db, "SELECT l.rink_id FROM teams t JOIN leagues l ON l.id=t.league_id WHERE t.id=$1", [teamId]);
  return t ? (await currentSeason(db, t.rink_id))?.id ?? null : null;
}

/** Each player's voted archetype this season (plurality, ties broken by the latest vote), plus the viewer's own votes. */
export async function teamArchetypes(db: Tx, teamId: number, viewerId: number | null) {
  const sid = await seasonOf(db, teamId);
  const rows = await q<any>(db,
    `SELECT player_id, archetype, COUNT(*)::int n, MAX(updated_at) last FROM archetype_votes
     WHERE team_id=$1 AND season_id IS NOT DISTINCT FROM $2 GROUP BY player_id, archetype`, [teamId, sid]);
  const won: Record<number, { archetype: string; votes: number }> = {};
  for (const r of rows.sort((a, b) => b.n - a.n || +new Date(b.last) - +new Date(a.last))) {
    if (!won[r.player_id] && r.n >= MIN_VOTES) won[r.player_id] = { archetype: r.archetype, votes: r.n };
  }
  const mine: Record<number, string> = {};
  if (viewerId) for (const r of await q<any>(db, "SELECT player_id, archetype FROM archetype_votes WHERE team_id=$1 AND season_id IS NOT DISTINCT FROM $2 AND voter_user_id=$3", [teamId, sid, viewerId])) mine[r.player_id] = r.archetype;
  const own = viewerId ? (await q<any>(db, "SELECT p.id FROM players p JOIN roster_entries re ON re.player_id=p.id WHERE p.user_id=$1 AND re.team_id=$2", [viewerId, teamId])).map((r) => r.id as number) : [];
  return { won, mine, voter: own.length > 0, own, minVotes: MIN_VOTES };
}

export async function castVote(db: Tx, teamId: number, voterId: number, playerId: number, archetype: string | null) {
  if (archetype !== null && !(ARCHETYPES as readonly string[]).includes(archetype)) throw new HttpError(400, "Pick one of the archetypes.");
  if (!(await one(db, "SELECT 1 FROM players p JOIN roster_entries re ON re.player_id=p.id WHERE p.user_id=$1 AND re.team_id=$2", [voterId, teamId]))) throw new HttpError(403, "Only players on this team vote.");
  const target = await one<any>(db, "SELECT p.user_id FROM players p JOIN roster_entries re ON re.player_id=p.id WHERE p.id=$1 AND re.team_id=$2", [playerId, teamId]);
  if (!target) throw new HttpError(404, "That player isn't on this team.");
  if (target.user_id === voterId) throw new HttpError(400, "Your teammates pick yours.");
  const sid = await seasonOf(db, teamId);
  await q(db, "DELETE FROM archetype_votes WHERE team_id=$1 AND season_id IS NOT DISTINCT FROM $2 AND voter_user_id=$3 AND player_id=$4", [teamId, sid, voterId, playerId]);
  if (archetype) await q(db, "INSERT INTO archetype_votes (team_id, season_id, voter_user_id, player_id, archetype) VALUES ($1,$2,$3,$4,$5)", [teamId, sid, voterId, playerId, archetype]);
}
