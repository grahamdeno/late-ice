import { teamArchetypes } from "@/server/archetypes";
import { eventMvp } from "@/server/events";
import { handle, body, num } from "@/server/http";
import { sql, q, one } from "@/server/db";
import { gameCard, HttpError } from "@/server/services";
import { applyViewerNames, userFromRequest } from "@/server/accounts";
import { assertPlayerVisible } from "@/server/visibility";

export const dynamic = "force-dynamic";
export const GET = handle<{ id: string }>(async (req, { id }) => {
  const raw = await one<any>(sql, "SELECT * FROM players WHERE id=$1", [num(id)]);
  if (!raw) throw new HttpError(404, "Player not found");
  const me = await userFromRequest(req);
  await assertPlayerVisible(sql, me, raw.id);
  const { name_key: _k, name: _n, user_id: uid, display_name, start_rating: _s, ...rest } = raw;
  const owner = uid ? await one<any>(sql, "SELECT avatar FROM users WHERE id=$1", [uid]) : null;
  const p = { ...rest, name: display_name, registered: !!uid, mine: !!me && me.id === uid, avatar: owner?.avatar ?? raw.avatar ?? null };
  const teams = await q<any>(sql, "SELECT t.id, t.name, t.color, t.logo, re.number, l.level, l.id league_id FROM roster_entries re JOIN teams t ON t.id=re.team_id JOIN leagues l ON l.id=t.league_id WHERE re.player_id=$1", [raw.id]);
  const history = [];
  for (const h of await q<any>(sql, "SELECT rh.*, g.played_on FROM rating_history rh JOIN games g ON g.id=rh.game_id WHERE rh.player_id=$1 ORDER BY rh.id", [raw.id])) {
    history.push({ ...h, reasons: JSON.parse(h.reasons_json), game: await gameCard(sql, await one(sql, "SELECT * FROM games WHERE id=$1", [h.game_id])) });
  }
  const scanned = (await one<any>(sql, "SELECT COUNT(*) gp, COALESCE(SUM(goals),0) g, COALESCE(SUM(assists),0) a, COALESCE(SUM(pim),0) pim FROM player_game_stats WHERE player_id=$1", [raw.id]))!;
  const imp = (await one<any>(sql, "SELECT COALESCE(SUM(gp),0) gp, COALESCE(SUM(g),0) g, COALESCE(SUM(a),0) a, COALESCE(SUM(pim),0) pim, MAX(as_of) as_of, MAX(source) source FROM player_imports WHERE player_id=$1", [raw.id]))!;
  const lines = await q(sql, "SELECT * FROM player_game_stats WHERE player_id=$1", [raw.id]);
  const ranks = [];
  for (const t of teams) {
    const ids = await q<any>(sql, "SELECT DISTINCT p.id, p.rating FROM players p JOIN roster_entries re ON re.player_id=p.id JOIN teams t ON t.id=re.team_id WHERE t.league_id=$1", [t.league_id]);
    ranks.push({ level: t.level, rank: ids.filter((x: any) => x.rating > raw.rating).length + 1, of: ids.length, tied: ids.filter((x: any) => x.rating === raw.rating).length > 1 });
  }
  const importedGames = [];
  // Imported games this player is on: credited with a point by the rink, or in a recorded lineup (team poll).
  for (const l of await q<any>(sql, `SELECT x.game_id, COALESCE(il.goals,0)::int goals, COALESCE(il.assists,0)::int assists
      FROM (SELECT game_id FROM imported_game_lines WHERE player_id=$1 UNION SELECT game_id FROM imported_game_attendance WHERE player_id=$1) x
      JOIN games g ON g.id=x.game_id LEFT JOIN imported_game_lines il ON il.game_id=x.game_id AND il.player_id=$1
      ORDER BY g.played_on DESC`, [raw.id])) {
    importedGames.push({ goals: l.goals, assists: l.assists, game: await gameCard(sql, await one(sql, "SELECT * FROM games WHERE id=$1", [l.game_id])) });
  }
  // The rink's games-played count misses games where a player scored nothing; a recorded lineup can only add to it.
  imp.gp = Math.max(Number(imp.gp), importedGames.length);
  const totals = { gp: Number(scanned.gp) + imp.gp, g: Number(scanned.g) + Number(imp.g), a: Number(scanned.a) + Number(imp.a), pim: Number(scanned.pim) + Number(imp.pim) };
  const archetypes = [];
  for (const t of teams) {
    const ta = await teamArchetypes(sql, t.id, me?.id ?? null);
    archetypes.push({ teamId: t.id, teamName: t.name, won: ta.won[raw.id] ?? null, mine: ta.mine[raw.id] ?? null, canVote: ta.voter && !ta.own.includes(raw.id), minVotes: ta.minVotes });
  }
  // Badges: Passport (games at 3+ rinks), Road Trip (a tournament away from home), Tournament MVP.
  const rinks = (await one<any>(sql, `SELECT COUNT(DISTINCT l.rink_id)::int n FROM (
      SELECT game_id FROM player_game_stats WHERE player_id=$1 UNION SELECT game_id FROM imported_game_lines WHERE player_id=$1) x
      JOIN games g ON g.id=x.game_id JOIN leagues l ON l.id=g.league_id WHERE l.level NOT IN ('DEMO')`, [raw.id]))!.n;
  const home = uid ? (await one<any>(sql, "SELECT home_rink_id FROM users WHERE id=$1", [uid]))?.home_rink_id ?? null : null;
  const road = await q<any>(sql, `SELECT DISTINCT e.id, e.name FROM player_game_stats s JOIN games g ON g.id=s.game_id JOIN events e ON e.id=g.event_id
      JOIN leagues l ON l.id=g.league_id WHERE s.player_id=$1 AND COALESCE(e.host_rink_id, -1) <> COALESCE($2, -2)`, [raw.id, home]);
  const mvps = [];
  for (const e of await q<any>(sql, "SELECT DISTINCT e.id, e.name FROM event_mvp_votes v JOIN events e ON e.id=v.event_id WHERE v.player_id=$1", [raw.id])) {
    const w = await eventMvp(sql, e.id);
    if (w?.playerId === raw.id) mvps.push(e);
  }
  const badges = [
    ...(rinks >= 3 ? [{ key: "passport", label: "Passport", detail: `Played at ${rinks} rinks` }] : []),
    ...(road.length ? [{ key: "road_trip", label: "Road Trip", detail: road.map((e: any) => e.name).join(", ") }] : []),
    ...mvps.map((e: any) => ({ key: "mvp", label: "Tournament MVP", detail: e.name, eventId: e.id })),
  ];
  // The one shown on the card: a player's own pick if they have one, else the team vote with the most agreement.
  const shown = archetypes.map((x: any) => x.won).filter(Boolean).sort((a: any, b: any) => Number(!!b.self) - Number(!!a.self) || b.votes - a.votes)[0] ?? null;
  const [player] = await applyViewerNames(sql, me, [p]);
  // A season rating: no rated game yet, but the rink's season totals set the starting point.
  const seasonRated = raw.games_rated === 0 && raw.position !== "G" && Number(imp.gp) > 0;
  return { player: { ...player, season_rated: seasonRated }, teams, archetypes, archetype: shown, badges, history, importedGames, totals, imported: imp.gp ? imp : null, lines, ranks, reliability: Math.min(100, raw.games_rated * 10) };
});
