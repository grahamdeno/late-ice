import "server-only";
import { one, q, type Tx } from "./db";
import { HttpError, currentSeason } from "./services";

export const ARCHETYPES = ["goon", "pest", "grinder", "sniper", "playmaker", "beauty", "duster", "cherry_picker", "bender", "energy"] as const;
/** Fewest votes before an archetype shows, so one teammate can't brand someone alone: 3 on a roster of 12 or more, else 2. */
export const minVotes = (rosterSize: number) => (rosterSize >= 12 ? 3 : 2);

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
  const size = (await one<any>(db, "SELECT COUNT(*)::int n FROM roster_entries WHERE team_id=$1 AND NOT is_sub", [teamId]))?.n ?? 0;
  const MIN_VOTES = minVotes(size);
  const won: Record<number, { archetype: string; votes: number; self?: boolean; teamVote?: string | null }> = {};
  for (const r of rows.sort((a, b) => b.n - a.n || +new Date(b.last) - +new Date(a.last))) {
    if (!won[r.player_id] && r.n >= MIN_VOTES) won[r.player_id] = { archetype: r.archetype, votes: r.n };
  }
  // A player's own pick (system admin only) wins over the vote; the vote is kept alongside so it still shows.
  for (const o of await q<any>(db, "SELECT p.id, u.archetype_self FROM roster_entries re JOIN players p ON p.id=re.player_id JOIN users u ON u.id=p.user_id WHERE re.team_id=$1 AND u.archetype_self IS NOT NULL", [teamId])) {
    const voted = won[o.id];
    won[o.id] = { archetype: o.archetype_self, votes: voted?.votes ?? 0, self: true, teamVote: voted?.archetype ?? null };
  }
  const mine: Record<number, string> = {};
  if (viewerId) for (const r of await q<any>(db, "SELECT player_id, archetype FROM archetype_votes WHERE team_id=$1 AND season_id IS NOT DISTINCT FROM $2 AND voter_user_id=$3", [teamId, sid, viewerId])) mine[r.player_id] = r.archetype;
  const own = viewerId ? (await q<any>(db, "SELECT p.id FROM players p JOIN roster_entries re ON re.player_id=p.id WHERE p.user_id=$1 AND re.team_id=$2 AND NOT re.is_sub", [viewerId, teamId])).map((r) => r.id as number) : [];
  return { won, mine, voter: own.length > 0, own, minVotes: MIN_VOTES };
}

/** Set or clear your own archetype. System admin only. */
export async function setOwnArchetype(db: Tx, userId: number, archetype: string | null) {
  if (archetype !== null && !(ARCHETYPES as readonly string[]).includes(archetype)) throw new HttpError(400, "Pick one of the archetypes.");
  if (!(await one(db, "SELECT 1 FROM role_grants WHERE user_id=$1 AND role='admin' AND revoked_at IS NULL", [userId]))) throw new HttpError(403, "Your teammates pick yours.");
  await q(db, "UPDATE users SET archetype_self=$1 WHERE id=$2", [archetype, userId]);
}

export async function castVote(db: Tx, teamId: number, voterId: number, playerId: number, archetype: string | null) {
  if (archetype !== null && !(ARCHETYPES as readonly string[]).includes(archetype)) throw new HttpError(400, "Pick one of the archetypes.");
  if (!(await one(db, "SELECT 1 FROM players p JOIN roster_entries re ON re.player_id=p.id WHERE p.user_id=$1 AND re.team_id=$2 AND NOT re.is_sub", [voterId, teamId]))) throw new HttpError(403, "Only players on this team vote.");
  const target = await one<any>(db, "SELECT p.user_id FROM players p JOIN roster_entries re ON re.player_id=p.id WHERE p.id=$1 AND re.team_id=$2 AND NOT re.is_sub", [playerId, teamId]);
  if (!target) throw new HttpError(404, "That player isn't on this team.");
  if (target.user_id === voterId) throw new HttpError(400, "Your teammates pick yours.");
  const sid = await seasonOf(db, teamId);
  await q(db, "DELETE FROM archetype_votes WHERE team_id=$1 AND season_id IS NOT DISTINCT FROM $2 AND voter_user_id=$3 AND player_id=$4", [teamId, sid, voterId, playerId]);
  if (archetype) await q(db, "INSERT INTO archetype_votes (team_id, season_id, voter_user_id, player_id, archetype) VALUES ($1,$2,$3,$4,$5)", [teamId, sid, voterId, playerId, archetype]);
}
