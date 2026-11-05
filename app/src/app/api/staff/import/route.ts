import { handle, body } from "@/server/http";
import { sql } from "@/server/db";
import { HttpError } from "@/server/services";
import * as A from "@/server/accounts";
import * as P from "@/server/permissions";
import { loadReport, parseReport, type ImportSummary } from "@/server/importer";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

class Preview extends Error { constructor(public summary: ImportSummary) { super("preview"); } }

// Upload a league report. Without apply it runs the whole import and rolls it back, so the
// preview shows exactly what would change. Rink managers and admins only.
export const POST = handle(async (req) => {
  const u = await A.requireUser(req);
  const b = await body<{ text?: string; rinkId?: number; apply?: boolean }>(req);
  const rinkId = Number(b.rinkId) || 0;
  await P.require_(sql, u, "rink.manage", { rinkId });
  const text = String(b.text || "");
  if (text.length < 50) throw new HttpError(400, "Paste or upload the whole report.");
  if (text.length > 500_000) throw new HttpError(413, "That file is too big for one import.");
  const parsed = parseReport(text);
  if (!parsed.games.length && !Object.keys(parsed.rosters).length) throw new HttpError(400, "No games or rosters found. Is this the DaySmart report?");
  try {
    const summary = await sql.begin(async (tx) => {
      const s = await loadReport(tx, rinkId, parsed);
      if (!b.apply) throw new Preview(s);
      await P.audit(tx, u.id, "import.daysmart", { type: "league", rinkId }, undefined, { games: s.gamesAdded + s.gamesUpdated, roster: s.rosterAdded, lines: s.lines });
      return s;
    });
    return { applied: true, summary };
  } catch (e) {
    if (e instanceof Preview) return { applied: false, summary: e.summary };
    throw e;
  }
});
