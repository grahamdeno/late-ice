"use client";
import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link, useLocation } from "@/lib/router";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { BackBar, FaceoffDot, Loading, TeamBadge, img, useFilter } from "@/lib/ui";

type Side = "home" | "away";

function Cell({ v, onChange, w = "w-12", testid }: { v: any; onChange: (x: string) => void; w?: string; testid?: string }) {
  return (
    <input className={`field tnum text-center ${w}`} value={v ?? ""} onChange={(e) => onChange(e.target.value)} data-testid={testid} />
  );
}


export default function Sheet({ id }: { id: string }) {
  const [, nav] = useLocation();
  const { boot } = useFilter();
  const { data: s, refetch } = useQuery<any>({
    queryKey: [`/api/sheets/${id}`],
    refetchInterval: (q) => ((q.state.data as any)?.status === "processing" ? 1500 : false),
    staleTime: 0,
  });
  const [d, setD] = useState<any>(null);
  const [leagueId, setLeagueId] = useState<number | null>(null);
  const [teamIds, setTeamIds] = useState<{ home: number | null; away: number | null }>({ home: null, away: null });
  const [tab, setTab] = useState<"goals" | "rosters" | "penalties">("goals");
  const [zoom, setZoom] = useState(false);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<{ message: string; gameId?: number } | null>(null);

  useEffect(() => {
    if (s?.status === "review" && !d) {
      setD(structuredClone(s.data));
      setLeagueId(s.suggestion?.leagueId ?? null);
      setTeamIds({ home: s.suggestion?.home.teamId ?? null, away: s.suggestion?.away.teamId ?? null });
    }
    if (s?.status === "confirmed" && s.gameId) nav(`/game/${s.gameId}`);
  }, [s]);

  const league = boot?.leagues.find((l) => l.id === leagueId);
  const totals = useMemo(() => (d ? { home: d.home.total ?? d.home.goals.length, away: d.away.total ?? d.away.goals.length } : null), [d]);

  if (!s) return <Loading />;

  if (s.status === "processing") {
    return (
      <div>
        <BackBar href="/scan" title="Reading sheet" />
        <div className="card-hi p-4">
          <div className="relative rounded-2xl overflow-hidden border border-[var(--line)]">
            <img src={img(`/api/sheets/${id}/image`)} alt="Scoresheet being read" className="w-full opacity-70" />
            <div className="scanline" />
          </div>
          <div className="flex items-center gap-3 mt-4">
            <FaceoffDot size={34} pulse />
            <div>
              <div className="font-black" data-testid="text-processing">Reading the handwriting…</div>
              <div className="text-sm text-[var(--mute)]">Rosters, goals, assists, penalties. Usually about 10 seconds.</div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (s.status === "failed") {
    return (
      <div>
        <BackBar href="/scan" title="Scan" />
        <div className="card p-6 text-center">
          <div className="font-black text-lg">Couldn't read that one</div>
          <p className="text-sm text-[var(--mute)] mt-1">Try again, or retake the photo flat and in good light.</p>
          <div className="flex gap-2 justify-center mt-4">
            <button className="btn btn-red" onClick={async () => { await apiRequest("POST", `/api/sheets/${id}/retry`); refetch(); }} data-testid="button-retry">Try again</button>
            <Link href="/scan" className="btn btn-ghost" data-testid="button-retake">Retake</Link>
          </div>
        </div>
      </div>
    );
  }

  if (s.status === "discarded") {
    return (
      <div>
        <BackBar href="/scan" title="Scan" />
        <div className="card p-6 text-center">
          <div className="font-black text-lg">Scan discarded</div>
          <Link href="/scan" className="btn btn-red mt-4" data-testid="button-scan-another">Scan another</Link>
        </div>
      </div>
    );
  }

  if (!d) return <Loading />;

  if (!d.is_scoresheet) {
    return (
      <div>
        <BackBar href="/scan" title="Scan" />
        <div className="card p-6 text-center">
          <div className="font-black text-lg">That doesn't look like a scoresheet</div>
          <p className="text-sm text-[var(--mute)] mt-1">Snap the official sheet from the scorer's box.</p>
          <Link href="/scan" className="btn btn-red mt-4" data-testid="button-retake">Retake photo</Link>
        </div>
      </div>
    );
  }

  const set = (fn: (x: any) => void) => setD((prev: any) => { const n = structuredClone(prev); fn(n); return n; });
  const leagueTeams = league?.teams ?? [];

  const teamPicker = (side: Side) => {
    const sug = s.suggestion?.[side];
    const ocrName = d[side].name;
    const chosen = boot?.leagues.flatMap((l) => l.teams).find((t) => t.id === teamIds[side]);
    const options = [...leagueTeams];
    for (const c of sug?.candidates ?? []) if (!options.find((o) => o.id === c.id) && c.score > 0.5) options.push(c);
    return (
      <div className="flex items-center gap-3">
        {chosen ? <TeamBadge team={chosen} size={40} /> : <span className="h-10 w-10 rounded-full border-2 border-dashed border-[var(--amber)] shrink-0" />}
        <div className="flex-1 min-w-0">
          <div className="label">{side === "home" ? "Home" : "Visitor"}{ocrName && <span className="normal-case tracking-normal font-medium"> · sheet says “{ocrName}”</span>}</div>
          <select
            value={teamIds[side] ?? "new"}
            onChange={(e) => setTeamIds((t) => ({ ...t, [side]: e.target.value === "new" ? null : Number(e.target.value) }))}
            className="mt-1 w-full bg-[var(--ice-3)] border border-[var(--line)] rounded-lg h-10 px-2 font-bold"
            data-testid={`select-team-${side}`}
          >
            {options.map((t: any) => <option key={t.id} value={t.id}>{t.name}</option>)}
            {ocrName && <option value="new">New team: {ocrName}</option>}
          </select>
        </div>
        <div className="font-display text-5xl tnum w-12 text-right" data-testid={`text-score-${side}`}>{totals![side]}</div>
      </div>
    );
  };

  const confirm = async () => {
    if (!leagueId) return setErr({ message: "Pick the league this game was in." });
    setSaving(true); setErr(null);
    const res = await fetch(img(`/api/sheets/${id}/confirm`), {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ leagueId, homeTeamId: teamIds.home, awayTeamId: teamIds.away, data: d }),
    });
    const j = await res.json();
    if (!res.ok) { setErr(j); setSaving(false); return; }
    await queryClient.invalidateQueries();
    nav(`/game/${j.gameId}/new`);
  };

  const discard = async () => {
    await apiRequest("POST", `/api/sheets/${id}/discard`);
    await queryClient.invalidateQueries();
    nav("/");
  };

  const conf = Math.round((d.confidence ?? 0) * 100);

  return (
    <div className="pb-40">
      <BackBar href="/scan" title="Check it, then drop the puck" />

      <div className="card-hi p-4">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2 text-xs text-[var(--mute)]">
            <span className="h-2 w-2 rounded-full" style={{ background: conf >= 85 ? "var(--up)" : "var(--amber)" }} />
            <span data-testid="text-confidence">Read with {conf}% confidence{ s.ms ? ` in ${(s.ms / 1000).toFixed(1)}s` : ""}</span>
          </div>
          <button className="text-xs font-bold text-[var(--blue)]" onClick={() => setZoom(true)} data-testid="button-view-photo">View photo</button>
        </div>
        <div className="space-y-4">{teamPicker("home")}{teamPicker("away")}</div>
        <div className="mt-4 flex items-center gap-2 overflow-x-auto scrollbar-none">
          <span className="label mr-1">League</span>
          {boot?.leagues.map((l) => (
            <button key={l.id} className="chip" data-active={leagueId === l.id} onClick={() => setLeagueId(l.id)} data-testid={`chip-league-${l.level}`}>{l.level}</button>
          ))}
        </div>
        <div className="mt-3 text-xs text-[var(--mute)]">
          {d.date ? new Date(d.date + "T12:00:00").toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" }) : "Date unread"}{d.time ? ` · ${d.time}` : ""}{d.rink_text ? ` · ${d.rink_text}` : ""}
        </div>
      </div>

      {s.suggestion?.duplicateGameId && (
        <div className="card mt-3 p-4 border-[var(--blue)]/40" data-testid="banner-duplicate">
          <div className="font-bold">Someone already scanned this game.</div>
          <p className="text-sm text-[var(--mute)] mt-1">Same teams, same date. No need to count it twice.</p>
          <div className="flex gap-2 mt-3">
            <Link href={`/game/${s.suggestion.duplicateGameId}`} className="btn btn-red h-10" data-testid="link-duplicate-game">See the game</Link>
            <button className="btn btn-ghost h-10" onClick={discard} data-testid="button-discard-dup">Discard this scan</button>
          </div>
        </div>
      )}

      {s.warnings?.length > 0 && (
        <div className="card mt-3 p-3 border-[var(--amber)]/40" data-testid="list-warnings">
          <div className="label text-[var(--amber)] mb-1">Worth a glance</div>
          <ul className="text-sm space-y-1">{s.warnings.map((w: string) => <li key={w}>· {w}</li>)}</ul>
        </div>
      )}
      {s.warnings?.length === 0 && (
        <div className="mt-3 text-sm flex items-center gap-2 text-[var(--up)] px-1" data-testid="text-checks-passed">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round"><path d="M20 6L9 17l-5-5" /></svg>
          Scoring list, period box and rosters all agree.
        </div>
      )}

      <div className="flex gap-2 mt-5">
        {(["goals", "rosters", "penalties"] as const).map((t) => (
          <button key={t} className="chip capitalize" data-active={tab === t} onClick={() => setTab(t)} data-testid={`tab-${t}`}>
            {t} <span className="opacity-70">{t === "goals" ? d.home.goals.length + d.away.goals.length : t === "rosters" ? d.home.roster.length + d.away.roster.length : d.home.penalties.length + d.away.penalties.length}</span>
          </button>
        ))}
      </div>
      <p className="text-xs text-[var(--mute)] mt-2 px-1">Tap any value to fix a misread. Everything here came off the photo.</p>

      {(["home", "away"] as Side[]).map((side) => {
        const t = d[side];
        const byNum = (n: string | null) => t.roster.find((p: any) => p.number === n)?.name;
        return (
          <div key={side} className="card mt-3 overflow-hidden">
            <div className="px-4 py-2.5 border-b border-[var(--line)] flex items-center justify-between">
              <span className="font-bold truncate">{t.name || (side === "home" ? "Home" : "Visitor")}</span>
              <span className="label">{side === "home" ? "Home" : "Visitor"}</span>
            </div>
            {tab === "goals" && (
              <div className="divide-y divide-[var(--line)]">
                {t.goals.length === 0 && <div className="p-4 text-sm text-[var(--mute)]">No goals on the sheet.</div>}
                {t.goals.map((g: any, i: number) => (
                  <div key={i} className="flex items-center gap-1 px-2 py-2 text-sm">
                    <span className="label w-8 text-center">P{g.period}</span>
                    <Cell v={g.time} w="w-16" onChange={(v) => set((x) => (x[side].goals[i].time = v))} testid={`input-goal-time-${side}-${i}`} />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1">
                        <span className="text-[var(--mute)]">#</span>
                        <Cell v={g.scorer} w="w-10" onChange={(v) => set((x) => (x[side].goals[i].scorer = v))} testid={`input-goal-scorer-${side}-${i}`} />
                        <span className="font-bold truncate">{byNum(g.scorer) ?? <span className="text-[var(--amber)]">not on roster</span>}</span>
                      </div>
                      <div className="flex items-center gap-1 text-xs text-[var(--mute)]">
                        <span>A</span>
                        <Cell v={g.assist1} w="w-10" onChange={(v) => set((x) => (x[side].goals[i].assist1 = v || null))} testid={`input-goal-a1-${side}-${i}`} />
                        <Cell v={g.assist2} w="w-10" onChange={(v) => set((x) => (x[side].goals[i].assist2 = v || null))} testid={`input-goal-a2-${side}-${i}`} />
                        <span className="truncate">{[byNum(g.assist1), byNum(g.assist2)].filter(Boolean).join(", ") || "Unassisted"}</span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
            {tab === "rosters" && (
              <div className="divide-y divide-[var(--line)]">
                {t.roster.map((p: any, i: number) => (
                  <div key={i} className="flex items-center gap-1 px-2 py-1.5 text-sm">
                    <span className="text-[var(--mute)] w-3">#</span>
                    <Cell v={p.number} w="w-11" onChange={(v) => set((x) => (x[side].roster[i].number = v))} testid={`input-roster-num-${side}-${i}`} />
                    <input className="field flex-1 w-full font-bold" value={p.name ?? ""} onChange={(e) => set((x) => (x[side].roster[i].name = e.target.value))} data-testid={`input-roster-name-${side}-${i}`} />
                    {(p.position || "").toUpperCase().startsWith("G") && <span className="chip h-6 text-[11px]">G</span>}
                    <button className="h-8 w-8 text-[var(--mute)] hover:text-[var(--down)]" onClick={() => set((x) => x[side].roster.splice(i, 1))} aria-label="Remove misread row" data-testid={`button-remove-roster-${side}-${i}`}>×</button>
                  </div>
                ))}
              </div>
            )}
            {tab === "penalties" && (
              <div className="divide-y divide-[var(--line)]">
                {t.penalties.length === 0 && <div className="p-4 text-sm text-[var(--mute)]">Clean game.</div>}
                {t.penalties.map((p: any, i: number) => (
                  <div key={i} className="flex items-center gap-2 px-3 py-2 text-sm">
                    <span className="label w-8">P{p.period}</span>
                    <span className="tnum">#{p.number}</span>
                    <span className="flex-1 truncate">{byNum(p.number)} · {p.offense}</span>
                    <span className="tnum text-[var(--mute)]">{p.minutes} min</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        );
      })}

      <button className="mt-4 text-sm text-[var(--mute)] underline underline-offset-4 px-1" onClick={discard} data-testid="button-discard">Wrong photo? Discard this scan</button>

      {d.notes?.length > 0 && (
        <div className="mt-3 text-xs text-[var(--mute)] px-1">Reader notes: {d.notes.join(" ")}</div>
      )}

      <div className="fixed bottom-24 inset-x-0 z-30 px-4" style={{ marginBottom: "env(safe-area-inset-bottom)" }}>
        <div className="mx-auto max-w-[560px]">
          {err && (
            <div className="card p-3 mb-2 text-sm border-[var(--down)]/50" data-testid="text-confirm-error">
              {err.message} {err.gameId && <Link href={`/game/${err.gameId}`} className="font-bold text-[var(--blue)]">See the game</Link>}
            </div>
          )}
          <button className="btn btn-red w-full h-14 text-base shadow-[0_10px_30px_rgba(255,59,59,.35)]" onClick={confirm} disabled={saving || !!s.suggestion?.duplicateGameId} data-testid="button-confirm-final">
            {saving ? "Putting it in the books…" : <>Confirm final · {league ? `${league.level} · ` : ""}{totals!.home}–{totals!.away}</>}
          </button>
        </div>
      </div>

      {zoom && (
        <div className="fixed inset-0 z-[60] bg-black/90 overflow-auto" onClick={() => setZoom(false)} data-testid="overlay-photo">
          <img src={img(`/api/sheets/${id}/image`)} alt="Scoresheet photo" className="min-w-[900px] w-full" />
        </div>
      )}
    </div>
  );
}
