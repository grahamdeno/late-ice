"use client";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "@/lib/router";
import { apiRequest, invalidatePrefixes } from "@/lib/queryClient";
import { day } from "@/views/Desk";

const KIND: Record<string, string> = { score: "Score", points: "Goal or assist", lineup: "Who played", other: "Other" };

/** Mistakes players reported on games at this rink. Fix the game, then close the report with a note. */
export function ReportedMistakes({ rinkId }: { rinkId: number }) {
  const key = `/api/desk/reports?rink=${rinkId}`;
  const { data, error } = useQuery<any[]>({ queryKey: [key], retry: false });
  const [notes, setNotes] = useState<Record<number, string>>({});
  const [err, setErr] = useState<string | null>(null);
  if (error || !data) return null;
  const open = data.filter((r) => r.status === "open");
  if (!open.length) return null;
  const close = async (id: number, fixed: boolean) => {
    setErr(null);
    try { await apiRequest("POST", `/api/desk/reports/${id}`, { fixed, note: notes[id] ?? "" }); await invalidatePrefixes([key, "/api/desk"]); }
    catch (e: any) { setErr(e?.message ?? "Couldn't close it."); }
  };
  return (
    <section className="mt-7" data-testid="section-reports">
      <h2 className="font-black text-lg">Reported mistakes <span className="text-[var(--red)]">{open.length}</span></h2>
      <p className="text-sm text-[var(--mute)] mt-1">Open the game, fix it, then close the report. The player gets your note.</p>
      {err && <p className="text-sm down mt-2">{err}</p>}
      <div className="card mt-3 divide-y divide-[var(--line)]">
        {open.map((r) => (
          <div key={r.id} className="p-4" data-testid={`row-report-${r.id}`}>
            <div className="flex items-baseline gap-2 flex-wrap">
              <Link href={`/game/${r.game_id}`} className="font-bold hover:underline">{r.home} {r.home_score}-{r.away_score} {r.away}</Link>
              <span className="text-xs text-[var(--mute)]">{r.level} · {day(r.played_on)}</span>
              <span className="chip h-6 text-[11px] ml-auto">{KIND[r.kind] ?? r.kind}</span>
            </div>
            <p className="text-sm mt-1.5">“{r.body}”</p>
            <p className="text-xs text-[var(--mute)] mt-1">{r.reporter} · {day(r.created_at)}</p>
            <div className="flex gap-2 mt-3 flex-wrap">
              <input className="input h-9 text-sm flex-1 min-w-[180px]" placeholder="Note for the player (optional)" value={notes[r.id] ?? ""}
                onChange={(e) => setNotes({ ...notes, [r.id]: e.target.value })} data-testid={`input-report-note-${r.id}`} />
              <button className="btn btn-red h-9 px-3 text-sm" onClick={() => close(r.id, true)} data-testid={`button-report-fixed-${r.id}`}>Fixed</button>
              <button className="btn btn-ghost h-9 px-3 text-sm" onClick={() => close(r.id, false)} data-testid={`button-report-nochange-${r.id}`}>No change</button>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
