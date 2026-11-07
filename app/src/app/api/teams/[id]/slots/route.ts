import { handle, body, num } from "@/server/http";
import { sql, q, one } from "@/server/db";
import { HttpError, LEVEL_START } from "@/server/services";
import * as A from "@/server/accounts";
import { rosterCounts } from "@/server/roster";

export const dynamic = "force-dynamic";

/** Add a roster spot by hand: a player who isn't in the app yet. They claim it when they sign up. */
export const POST = handle<{ id: string }>(async (req, { id }) => {
  const u = await A.requireUser(req);
  const teamId = num(id);
  const b = await body(req);
  const playerId = await sql.begin(async (tx) => {
    const t = await A.requireCaptain(tx, u, teamId);
    const name = String(b?.name ?? "").trim().replace(/\s+/g, " ").slice(0, 60);
    if (name.split(" ").length < 2) throw new HttpError(400, "First and last name, so teammates know who it is.");
    const position = A.POSITIONS.has(b?.position) ? String(b.position) : "F";
    const number = A.cleanNumber(b?.number);
    const key = name.toLowerCase().replace(/[^a-z]/g, "");
    const dup = await one<any>(tx, "SELECT p.display_name FROM roster_entries re JOIN players p ON p.id=re.player_id WHERE re.team_id=$1 AND p.name_key=$2", [teamId, key]);
    if (dup) throw new HttpError(409, `${dup.display_name} is already on the roster.`);
    if (number) {
      const clash = await one<any>(tx, "SELECT p.display_name FROM roster_entries re JOIN players p ON p.id=re.player_id WHERE re.team_id=$1 AND re.number=$2", [teamId, number]);
      if (clash) throw new HttpError(409, `#${number} is taken by ${clash.display_name}.`);
    }
    const sub = !!b?.sub;
    if (!sub) {
      const c = await rosterCounts(tx, teamId);
      if (position === "G" ? c.goalies >= c.goalieMax : c.skaters >= c.rosterMax) {
        throw new HttpError(409, position === "G" ? `The roster already has ${c.goalieMax} goalies. Add them as a sub, or move someone to IR first.` : `The roster is full at ${c.rosterMax} skaters. Add them as a sub, or move someone to IR first.`);
      }
    }
    const start = LEVEL_START[t.level] ?? 3.8;
    const pid = (await one<{ id: number }>(tx, "INSERT INTO players (name,name_key,position,rating,start_rating,claimed) VALUES ($1,$2,$3,$4,$4,0) RETURNING id", [name, key, position, start]))!.id;
    await q(tx, "INSERT INTO roster_entries (team_id,player_id,number,source,added_at,is_sub) VALUES ($1,$2,$3,'captain',now(),$4)", [teamId, pid, number, sub]);
    await A.refreshDisplay(tx, pid);
    await A.logAction(tx, teamId, u.id, "add_spot", pid, null, { number, position });
    return pid;
  });
  return { ok: true, playerId };
});
