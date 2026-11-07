import "server-only";
import { one, q, type Tx } from "./db";
import { HttpError } from "./services";

export const VOTE_HOURS = 48;
/** Fewest voters before voted stars replace the numbers. */
export const MIN_VOTERS = 3;

export interface StarCandidate { player_id: number; name: string; team_id: number; goals: number; assists: number; delta: number | null }

/** Game points (goals plus assists), then the bigger rating move, then the lower id so the order never wobbles. */
function byNumbers(a: StarCandidate, b: StarCandidate) {
  return (b.goals + b.assists) - (a.goals + a.assists) || (b.delta ?? 0) - (a.delta ?? 0) || a.player_id - b.player_id;
}

/** By the numbers: the three with the most game points. Nobody with zero points is a star. */
export function numbersStars(cands: StarCandidate[]) {
  return [...cands].filter((c) => c.goals + c.assists > 0).sort(byNumbers).slice(0, 3);
}

/**
 * Voted stars: each ballot is up to three distinct players in order, worth 3, 2 and 1 points.
 * Ties go to game points, then the rating move. Fewer than MIN_VOTERS ballots names nobody.
 */
export function votedStars(cands: StarCandidate[], ballots: { voter: number; picks: number[] }[]) {
  if (ballots.length < MIN_VOTERS) return null;
  const pts = new Map<number, number>();
  for (const b of ballots) b.picks.slice(0, 3).forEach((id, i) => pts.set(id, (pts.get(id) ?? 0) + (3 - i)));
  const byId = new Map(cands.map((c) => [c.player_id, c]));
  return [...pts.entries()]
    .filter(([id]) => byId.has(id))
    .sort((a, b) => b[1] - a[1] || byNumbers(byId.get(a[0])!, byId.get(b[0])!))
    .slice(0, 3)
    .map(([id, points]) => ({ ...byId.get(id)!, votes: points }));
}

export const voteClosesAt = (createdAt: Date | string) => new Date(new Date(createdAt).getTime() + VOTE_HOURS * 3600_000);

/** What the game page shows: the stars, whether voting is on, and the viewer's own ballot. */
export async function gameStars(db: Tx, gameId: number, viewerId: number | null) {
  const g = await one<any>(db, `SELECT g.id, g.created_at, g.source, l.star_voting FROM games g JOIN leagues l ON l.id=g.league_id WHERE g.id=$1`, [gameId]);
  if (!g) throw new HttpError(404, "Game not found.");
  const cands = await q<StarCandidate>(db,
    `SELECT x.player_id, p.display_name AS name, x.team_id, x.goals::int, x.assists::int,
       (SELECT after-before FROM rating_history rh WHERE rh.player_id=x.player_id AND rh.game_id=$1 LIMIT 1) AS delta
     FROM (
       SELECT player_id, team_id, goals, assists FROM player_game_stats WHERE game_id=$1
       UNION ALL
       SELECT a.player_id, a.team_id, COALESCE(il.goals,0), COALESCE(il.assists,0)
         FROM imported_game_attendance a LEFT JOIN imported_game_lines il ON il.game_id=a.game_id AND il.player_id=a.player_id WHERE a.game_id=$1
       UNION ALL
       SELECT il.player_id, il.team_id, il.goals, il.assists FROM imported_game_lines il
         WHERE il.game_id=$1 AND NOT EXISTS (SELECT 1 FROM imported_game_attendance a WHERE a.game_id=$1 AND a.player_id=il.player_id)
     ) x JOIN players p ON p.id=x.player_id`, [gameId]);
  const numbers = numbersStars(cands);
  const voting = !!g.star_voting && cands.length >= 4;
  const closes = voteClosesAt(g.created_at);
  const open = voting && closes.getTime() > Date.now();
  const ballots = voting ? await ballotsFor(db, gameId) : [];
  const voted = voting && !open ? votedStars(cands, ballots) : null;

  // The viewer may vote if they are a claimed player in this game.
  let canVote = false, mine: number[] = [];
  if (viewerId && voting) {
    const me = await q<{ id: number }>(db, "SELECT id FROM players WHERE user_id=$1", [viewerId]);
    const myIds = me.map((m) => m.id);
    canVote = open && cands.some((c) => myIds.includes(c.player_id));
    mine = ballots.find((b) => b.voter === viewerId)?.picks ?? [];
  }
  return {
    mode: voted ? "voted" : "numbers",
    stars: (voted ?? numbers).map((s) => ({ player_id: s.player_id, name: s.name, goals: s.goals, assists: s.assists, delta: s.delta })),
    voting: voting ? { open, closesAt: closes.toISOString(), voters: ballots.length, minVoters: MIN_VOTERS, canVote, mine } : null,
    candidates: canVote ? cands.map((c) => ({ player_id: c.player_id, name: c.name, team_id: c.team_id })) : [],
  };
}

async function ballotsFor(db: Tx, gameId: number) {
  const rows = await q<{ voter_user_id: number; rank: number; player_id: number }>(db,
    "SELECT voter_user_id, rank, player_id FROM star_votes WHERE game_id=$1 ORDER BY voter_user_id, rank", [gameId]);
  const by = new Map<number, number[]>();
  for (const r of rows) by.set(r.voter_user_id, [...(by.get(r.voter_user_id) ?? []), r.player_id]);
  return [...by.entries()].map(([voter, picks]) => ({ voter, picks }));
}

/** Save the viewer's three picks (1 to 3 distinct players, best first). No voting for yourself. Replaces an earlier ballot. */
export async function castVotes(db: Tx, userId: number, gameId: number, picks: unknown) {
  const ids = Array.isArray(picks) ? picks.map((x) => Math.trunc(Number(x))) : [];
  if (!ids.length || ids.length > 3 || ids.some((x) => !Number.isFinite(x) || x <= 0) || new Set(ids).size !== ids.length) throw new HttpError(400, "Pick one to three different players.");
  const s = await gameStars(db, gameId, userId);
  if (!s.voting) throw new HttpError(400, "Voting isn't on for this game.");
  if (!s.voting.open) throw new HttpError(400, "Voting for this game has closed.");
  if (!s.voting.canVote) throw new HttpError(403, "Only people who played in this game can vote.");
  const mine = new Set((await q<{ id: number }>(db, "SELECT id FROM players WHERE user_id=$1", [userId])).map((r) => r.id));
  if (ids.some((id) => mine.has(id))) throw new HttpError(400, "You can't vote for yourself.");
  const allowed = new Set(s.candidates.map((c) => c.player_id));
  if (ids.some((id) => !allowed.has(id))) throw new HttpError(400, "Pick players who were in this game.");
  await q(db, "DELETE FROM star_votes WHERE game_id=$1 AND voter_user_id=$2", [gameId, userId]);
  for (let i = 0; i < ids.length; i++) await q(db, "INSERT INTO star_votes (game_id, voter_user_id, rank, player_id) VALUES ($1,$2,$3,$4)", [gameId, userId, i + 1, ids[i]]);
}

/** The leagues at a rink with their voting switch. Rink managers only. */
export async function setStarVoting(db: Tx, leagueId: number, on: boolean) {
  await q(db, "UPDATE leagues SET star_voting=$1 WHERE id=$2", [!!on, leagueId]);
}
