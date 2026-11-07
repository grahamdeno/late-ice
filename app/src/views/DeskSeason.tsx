"use client";
import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { apiRequest, invalidatePrefixes } from "@/lib/queryClient";
import { DeskFrame, Gate, RinkSwitch, day, useDeskRink } from "@/views/Desk";

/**
 * Season: close the current season, set up the next one, and once the season is over, wrap up
 * teams and rosters. Ratings, games and stats are never touched.
 */

type Team = { id: number; name: string; color: string | null; league_id: number; level: string; roster: number; subs: number; games: number; captain: string | null };
type Season = { id: number; name: string; starts_on: string; ends_on: string };
type Plan = {
  rink: { id: number; name: string }; current: Season | null; next: Season | null; teams: Team[]; today: string; ended: boolean;
  suggestion: { name: string; startsOn: string; endsOn: string } | null;
};

const RELOAD = ["/api/desk", "/api/staff", "/api/standings", "/api/teams", "/api/leagues", "/api/bootstrap", "/api/rink", "/api/players"];

export function DeskSeason() {
  return <Gate>{(overview) => <SeasonBody overview={overview} />}</Gate>;
}

function SeasonBody({ overview }: { overview: any }) {
  const { rink, rinks, pick } = useDeskRink(overview);
  const key = `/api/desk/season?rink=${rink?.id}`;
  const { data, error, refetch } = useQuery<Plan>({ queryKey: [key], enabled: !!rink });
  const [endsOn, setEndsOn] = useState("");
  const [next, setNext] = useState({ name: "", startsOn: "", endsOn: "" });
  const [archive, setArchive] = useState<Set<number>>(new Set());
  const [clear, setClear] = useState<Set<number>>(new Set());
  const [dropSubs, setDropSubs] = useState(true);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  useEffect(() => {
    if (!data) return;
    setEndsOn(data.current?.ends_on ?? "");
    if (data.suggestion) setNext(data.suggestion);
    setArchive(new Set()); setClear(new Set());
  }, [data]);

  const run = async (payload: any, label: string) => {
    setBusy(true); setMsg(null);
    try {
      const r = await (await apiRequest("POST", key, payload)).json();
      await invalidatePrefixes(RELOAD); await refetch();
      const parts = [r.closedOn && `closed on ${day(r.closedOn)}`, r.created && `${r.created} added`, r.archived && `${r.archived} teams archived`, r.cleared != null && `${r.cleared} roster spots cleared`, r.subsDropped != null && `${r.subsDropped} subs dropped`].filter(Boolean);
      setMsg({ ok: true, text: parts.length ? `Done: ${parts.join(", ")}.` : `${label}: nothing to change.` });
    } catch (e: any) { setMsg({ ok: false, text: e?.message ?? "That didn't save." }); }
    setBusy(false);
  };

  const toggle = (set: Set<number>, put: (s: Set<number>) => void, id: number) => { const n = new Set(set); if (n.has(id)) n.delete(id); else n.add(id); put(n); };
  const subs = data?.teams.reduce((n, t) => n + t.subs, 0) ?? 0;

  return (
    <DeskFrame>
      <div className="flex items-center gap-3 flex-wrap">
        <h1 className="font-black text-[28px] flex-1 min-w-0">Season</h1>
        <RinkSwitch rink={rink} rinks={rinks} pick={pick} />
      </div>
      <p className="text-[var(--mute)] mt-1 max-w-3xl">Close this season and set up the next. Teams, ratings and history carry over; standings and stats split by season on their own.</p>
      {error && <p className="text-sm down mt-4" data-testid="text-error">{(error as any).message}</p>}
      {msg && <p className={`text-sm mt-4 ${msg.ok ? "up" : "down"}`} data-testid="text-season-result">{msg.text}</p>}

      {data && (
        <div className="grid gap-5 mt-6 xl:grid-cols-2 items-start">
          <section className="card p-5" data-testid="section-season-dates">
            <div className="label">Step 1</div>
            <h2 className="font-black text-lg mt-0.5">Set up the next season</h2>
            {data.current ? (
              <label className="block text-sm mt-4"><span className="label">{data.current.name} ends</span>
                <input type="date" className="input h-10 mt-1 w-full" value={endsOn} min={data.current.starts_on} onChange={(e) => setEndsOn(e.target.value)} data-testid="input-season-end" />
                <span className="block text-xs text-[var(--mute)] mt-1">Started {day(data.current.starts_on)}. Move the end to the night of the last game.</span>
              </label>
            ) : <p className="text-sm text-[var(--mute)] mt-3">No season yet at this rink.</p>}
            {data.next ? (
              <div className="rounded-xl bg-[var(--ice-3)] p-4 mt-4 text-sm" data-testid="text-next-season">
                <span className="font-bold">{data.next.name}</span> is set: {day(data.next.starts_on)} to {day(data.next.ends_on)}. Change its dates from the rink's Manage page.
              </div>
            ) : (
              <div className="grid sm:grid-cols-3 gap-3 mt-4">
                <label className="text-sm sm:col-span-3"><span className="label">Next season</span>
                  <input className="input h-10 mt-1 w-full" value={next.name} onChange={(e) => setNext({ ...next, name: e.target.value })} data-testid="input-next-name" />
                </label>
                <label className="text-sm"><span className="label">Starts</span>
                  <input type="date" className="input h-10 mt-1 w-full" value={next.startsOn} onChange={(e) => setNext({ ...next, startsOn: e.target.value })} data-testid="input-next-start" />
                </label>
                <label className="text-sm"><span className="label">Ends</span>
                  <input type="date" className="input h-10 mt-1 w-full" value={next.endsOn} onChange={(e) => setNext({ ...next, endsOn: e.target.value })} data-testid="input-next-end" />
                </label>
              </div>
            )}
            <button className="btn btn-red h-11 px-5 mt-5" disabled={busy}
              onClick={() => run({ endsOn: endsOn || undefined, next: data.next ? undefined : next }, "Dates")} data-testid="button-season-save">
              {busy ? "Saving…" : data.next ? "Save the end date" : "Save dates and add the season"}
            </button>
          </section>

          <section className="card p-5" data-testid="section-season-wrapup">
            <div className="label">Step 2</div>
            <h2 className="font-black text-lg mt-0.5">Wrap up teams</h2>
            {!data.ended ? (
              <p className="text-sm text-[var(--mute)] mt-3" data-testid="text-wrapup-locked">
                Opens after {data.current ? day(data.current.ends_on) : "the season ends"}, so no team or player disappears before its last game.
              </p>
            ) : (
              <>
                <p className="text-sm text-[var(--mute)] mt-2">Archive teams that folded: they leave the lists, their games and stats stay. "Fresh roster" keeps only the captain and assistants, for teams re-forming.</p>
                <label className="flex items-center gap-2.5 mt-4 text-sm">
                  <input type="checkbox" className="h-4 w-4 accent-[var(--up)]" checked={dropSubs} onChange={(e) => setDropSubs(e.target.checked)} data-testid="toggle-drop-subs" />
                  <span>Drop this season's subs from every roster ({subs})</span>
                </label>
                <div className="mt-4 divide-y divide-[var(--line)] border-t border-[var(--line)]">
                  {data.teams.map((t) => (
                    <div key={t.id} className="flex items-center gap-3 py-2.5 text-sm" data-testid={`row-season-team-${t.id}`}>
                      <span className="h-2.5 w-2.5 rounded-full shrink-0" style={{ background: t.color || "var(--mute)" }} />
                      <span className="flex-1 min-w-0">
                        <span className="block font-bold truncate">{t.name}</span>
                        <span className="block text-xs text-[var(--mute)]">{t.level} · {t.roster} players · {t.games} games{t.captain ? ` · ${t.captain}` : " · no captain"}</span>
                      </span>
                      <label className="flex items-center gap-1.5 text-xs"><input type="checkbox" checked={clear.has(t.id)} disabled={archive.has(t.id)} onChange={() => toggle(clear, setClear, t.id)} data-testid={`toggle-clear-${t.id}`} />Fresh roster</label>
                      <label className="flex items-center gap-1.5 text-xs"><input type="checkbox" checked={archive.has(t.id)} onChange={() => { toggle(archive, setArchive, t.id); setClear((s) => { const n = new Set(s); n.delete(t.id); return n; }); }} data-testid={`toggle-archive-${t.id}`} />Folded</label>
                    </div>
                  ))}
                </div>
                <button className="btn btn-red h-11 px-5 mt-5" disabled={busy || (!archive.size && !clear.size && !dropSubs)}
                  onClick={() => { if (confirm(`Archive ${archive.size} teams, clear ${clear.size} rosters${dropSubs ? ", and drop subs" : ""}? Ratings and history stay.`)) run({ archive: [...archive], clearRosters: [...clear], dropSubs }, "Wrap-up"); }}
                  data-testid="button-wrapup">
                  {busy ? "Saving…" : "Wrap up the season"}
                </button>
              </>
            )}
          </section>
        </div>
      )}
      <p className="text-xs text-[var(--mute)] mt-6 max-w-3xl">Ratings never reset. A player's rating follows them into the next season and onto a new team.</p>
    </DeskFrame>
  );
}
