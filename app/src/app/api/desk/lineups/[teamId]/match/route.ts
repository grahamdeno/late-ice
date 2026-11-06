import { handle, body, num } from "@/server/http";
import { sql } from "@/server/db";
import { requireUser } from "@/server/accounts";
import { matchForTeam } from "@/server/lineups";

export const dynamic = "force-dynamic";

/** Match pasted names (a poll, a group text) to the team's roster. Saves nothing. */
export const POST = handle<{ teamId: string }>(async (req, { teamId }) => {
  const u = await requireUser(req);
  const b = await body<{ text?: string }>(req);
  return matchForTeam(sql, u, num(teamId), String(b.text ?? ""));
});
