import { handle, body, num } from "@/server/http";
import { sql, q, one } from "@/server/db";
import { HttpError } from "@/server/services";
import { requireUser, requireTeam, notify } from "@/server/accounts";
import { fmtGame } from "@/server/subs";

export const dynamic = "force-dynamic";

async function game(gid: number) {
  const g = await one<any>(sql, "SELECT sg.*, t.name team_name, t.league_id, l.rink_id FROM scheduled_games sg JOIN teams t ON t.id=sg.team_id JOIN leagues l ON l.id=t.league_id WHERE sg.id=$1", [gid]);
  if (!g) throw new HttpError(404, "Game not found.");
  return g;
}

/** Players who said Will sub, at this rink or in this league, not already on the team. Plus who's been asked. */
export const GET = handle<{ gid: string }>(async (req, { gid }) => {
  const u = await requireUser(req);
  const g = await game(num(gid));
  await requireTeam(sql, u, g.team_id, "roster.manage");
  const candidates = await q<any>(sql,
    `SELECT u.id, u.name, u.number, u.position,
       (SELECT MAX(p.rating) FROM players p WHERE p.user_id=u.id) rating,
       (SELECT string_agg(DISTINCT t.name, ', ') FROM players p JOIN roster_entries re ON re.player_id=p.id JOIN teams t ON t.id=re.team_id WHERE p.user_id=u.id AND NOT re.is_sub) teams
     FROM users u
     WHERE u.will_sub AND u.access='approved' AND u.merged_into IS NULL AND u.id<>$3
       AND (u.home_rink_id=$1 OR EXISTS (SELECT 1 FROM players p JOIN roster_entries re ON re.player_id=p.id JOIN teams t ON t.id=re.team_id WHERE p.user_id=u.id AND t.league_id=$2))
       AND NOT EXISTS (SELECT 1 FROM players p JOIN roster_entries re ON re.player_id=p.id WHERE p.user_id=u.id AND re.team_id=$4 AND NOT re.is_sub)
     ORDER BY rating DESC NULLS LAST, u.name LIMIT 60`, [g.rink_id, g.league_id, u.id, g.team_id]);
  const asked = await q<any>(sql, "SELECT sr.id, sr.user_id, sr.status, u.name FROM sub_requests sr JOIN users u ON u.id=sr.user_id WHERE sr.scheduled_game_id=$1 ORDER BY sr.id", [g.id]);
  return { candidates, asked };
});

/** Ask someone to sub. They get a notice and answer Yes or No. */
export const POST = handle<{ gid: string }>(async (req, { gid }) => {
  const u = await requireUser(req);
  const g = await game(num(gid));
  await requireTeam(sql, u, g.team_id, "roster.manage");
  if (new Date(g.starts_at).getTime() < Date.now()) throw new HttpError(400, "That game has started.");
  const b = await body(req);
  const who = await one<any>(sql, "SELECT id, will_sub FROM users WHERE id=$1 AND access='approved'", [num(b.userId)]);
  if (!who?.will_sub) throw new HttpError(400, "They haven't said they'll sub.");
  return sql.begin(async (tx) => {
    const r = await one<any>(tx,
      `INSERT INTO sub_requests (scheduled_game_id, team_id, user_id, asked_by) VALUES ($1,$2,$3,$4)
       ON CONFLICT (scheduled_game_id, user_id) DO UPDATE SET status='asked', asked_by=EXCLUDED.asked_by, created_at=now(), answered_at=NULL RETURNING id`,
      [g.id, g.team_id, who.id, u.id]);
    await notify(tx, who.id, { kind: "sub", link: "/me", teamId: g.team_id, title: `${g.team_name} needs a sub: ${fmtGame(g)}`, body: "Answer Yes or No on your profile." });
    return { id: r.id };
  });
});

/** Take an ask back. */
export const DELETE = handle<{ gid: string }>(async (req, { gid }) => {
  const u = await requireUser(req);
  const g = await game(num(gid));
  await requireTeam(sql, u, g.team_id, "roster.manage");
  const userId = num(new URL(req.url).searchParams.get("userId"));
  await q(sql, "UPDATE sub_requests SET status='canceled' WHERE scheduled_game_id=$1 AND user_id=$2", [g.id, userId]);
  return { ok: true };
});
