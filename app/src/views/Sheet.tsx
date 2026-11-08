"use client";
import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link, useLocation } from "@/lib/router";
import { apiRequest, authHeaders, invalidatePrefixes } from "@/lib/queryClient";
import { useSheetImage } from "@/lib/auth";
import { BackBar, FaceoffDot, Loading, TeamBadge, img, useFilter } from "@/lib/ui";

type Side = "home" | "away";

/** One editable value on the sheet. `label` is what a screen reader says ("Goal 2 scorer number, Home"). */
function Cell({ v, onChange, w = "w-12", testid, label, numeric }: { v: any; onChange: (x: string) => void; w?: string; testid?: string; label: string; numeric?: boolean }) {
  return (
    <input className={`field tnum text-center min-h-[44px] ${w}`} aria-label={label} inputMode={numeric ? "numeric" : undefined} value={v ?? ""} onChange={(e) => onChange(e.target.value)} data-testid={testid} />
  );
}


export default function Sheet({ id }: { id: string }) {
  const sheetImg = useSheetImage();
  const [, , swap] = useLocation();
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
  const [sent, setSent] = useState(false);
  const [eventId, setEventId] = useState<number | null>(null);
  const { data: events } = useQuery<any[]>({ queryKey: ["/api/events"] });
  const [err, setErr] = useState<{ message: string; gameId?: number } | null>(null);

  useEffect(() => {
    if ((s?.status === "review" || s?.status === "awaiting") && s.data?.is_scoresheet && !d) {
      setD(structuredClone(s.data));
      setLeagueId(s.suggestion?.leagueId ?? null);
      setEventId(s.suggestion?.eventId ?? null);
      setTeamIds({ home: s.suggestion?.home.teamId ?? null, away: s.suggestion?.away.teamId ?? null });
    }
    if (s?.status === "confirmed" && s.gameId) swap(`/game/${s.gameId}`);
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
            <img src={sheetImg(id)} alt="Scoresheet being read" className="w-full opacity-70" />
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

  if (s.status === "failed" || s.data?.is_scoresheet === false) {
    return (
      <StuckSheet
        id={id}
        title={s.status === "failed"
          ? (/authentication|x-api-key|credit balance|overloaded|rate.?limit|\b(401|403|429|5\d\d)\b/i.test(String((s as any).error ?? ""))
            ? "Scanning is down on our end. Your photo is saved, so try again later."
            : "Couldn't read that one")
          : "That doesn't look like a scoresheet"}
        leagues={boot?.leagues ?? []}
        onDone={() => refetch()}
      />
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
            aria-label={`${side === "home" ? "Home" : "Visitor"} team`}
            value={teamIds[side] ?? "new"}
            onChange={(e) => setTeamIds((t) => ({ ...t, [side]: e.target.value === "new" ? null : Number(e.target.value) }))}
            className="mt-1 w-full bg-[var(--ice-3)] border border-[var(--line)] rounded-lg h-11 px-2 font-bold"
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
      method: "POST", headers: { "Content-Type": "application/json", ...authHeaders() },
      body: JSON.stringify({ leagueId, homeTeamId: teamIds.home, awayTeamId: teamIds.away, data: d, eventId }),
    });
    const j = await res.json();
    if (!res.ok) { setErr(j); setSaving(false); return; }
    await invalidatePrefixes(["/api/sheets", "/api/games", "/api/feed", "/api/standings", "/api/leagues", "/api/players", "/api/me", "/api/teams"]);
    swap(`/game/${j.gameId}/new`);
  };

  const submit = async () => {
    if (!leagueId) return setErr({ message: "Pick the league this game was in." });
    setSaving(true); setErr(null);
    try {
      await apiRequest("POST", `/api/sheets/${id}/submit`, { leagueId, homeTeamId: teamIds.home, awayTeamId: teamIds.away, data: d, eventId });
      await invalidatePrefixes(["/api/sheets", "/api/games", "/api/feed", "/api/standings", "/api/leagues", "/api/players", "/api/me", "/api/teams"]);
      setSent(true);
    } catch (e: any) { setErr({ message: e.message }); }
    setSaving(false);
  };

  const discard = async () => {
    await apiRequest("POST", `/api/sheets/${id}/discard`);
    await invalidatePrefixes(["/api/sheets", "/api/games", "/api/feed", "/api/standings", "/api/leagues", "/api/players", "/api/me", "/api/teams"]);
    swap("/");
  };

  const conf = Math.round((d.confidence ?? 0) * 100);
  const r = s.rights ?? { leagues: [], teams: [], sample: false, approved: false };
  const canConfirm = r.approved && ((r.sample && league?.level === "DEMO") || (leagueId != null && r.leagues.includes(leagueId)) || [teamIds.home, teamIds.away].some((t) => t != null && r.teams.includes(t)));

  return (
    <div className="pb-40">
      <BackBar href="/scan" title="Check it, then drop the puck" />

      <div className="card-hi p-4">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2 text-xs text-[var(--mute)]">
            <span className="h-2 w-2 rounded-full" style={{ background: conf >= 85 ? "var(--up)" : "var(--amber)" }} />
            <span data-testid="text-confidence">Read with {conf}% confidence{ s.ms ? ` in ${(s.ms / 1000).toFixed(1)}s` : ""}</span>
          </div>
          <button className="text-xs font-bold text-[var(--blue)] min-h-[44px] px-2 -mx-2" onClick={() => setZoom(true)} data-testid="button-view-photo">View photo</button>
        </div>
        <div className="space-y-4">{teamPicker("home")}{teamPicker("away")}</div>
        <div className="mt-4 flex items-center gap-2 overflow-x-auto scrollbar-none">
          <span className="label mr-1">League</span>
          {boot?.leagues.map((l) => (
            <button key={l.id} className="chip" data-active={leagueId === l.id} onClick={() => setLeagueId(l.id)} data-testid={`chip-league-${l.level}`}>{l.level}</button>
          ))}
        </div>
        {events && events.length > 0 && (
          <label className="mt-3 flex items-center gap-2 text-sm">
            <span className="label">Game type</span>
            <select className="input h-9 text-sm flex-1 min-w-0" value={eventId ?? ""} onChange={(e) => setEventId(e.target.value ? Number(e.target.value) : null)} data-testid="select-sheet-event">
              <option value="">League game</option>
              {events.map((e: any) => <option key={e.id} value={e.id}>Tournament: {e.name}</option>)}
            </select>
          </label>
        )}
        <div className="mt-3 text-xs text-[var(--mute)]">
          {d.date ? new Date(d.date + "T12:00:00").toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" }) : "Date unread"}{d.time ? ` · ${d.time}` : ""}{d.rink_text ? ` · ${d.rink_text}` : ""}
        </div>
      </div>

      {s.suggestion?.duplicateGameId && (
        <div className="card mt-3 p-4 border-[var(--blue)]/40" data-testid="banner-duplicate">
          <div className="font-bold">Someone already scanned this game.</div>
          <p className="text-sm text-[var(--mute)] mt-1">Same teams, same date. No need to count it twice.</p>
          <div className="flex gap-2 mt-3">
            <Link href={`/game/${s.suggestion.duplicateGameId}`} className="btn btn-red h-11" data-testid="link-duplicate-game">See the game</Link>
            <button className="btn btn-ghost h-11" onClick={discard} data-testid="button-discard-dup">Discard this scan</button>
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
        const sideName = `${side === "home" ? "Home" : "Visitor"}${t.name ? ` (${t.name})` : ""}`;
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
                    <Cell v={g.time} w="w-16" label={`Goal ${i + 1} time, ${sideName}`} onChange={(v) => set((x) => (x[side].goals[i].time = v))} testid={`input-goal-time-${side}-${i}`} />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1">
                        <span className="text-[var(--mute)]">#</span>
                        <Cell v={g.scorer} w="w-10" numeric label={`Goal ${i + 1} scorer number, ${sideName}`} onChange={(v) => set((x) => (x[side].goals[i].scorer = v))} testid={`input-goal-scorer-${side}-${i}`} />
                        <span className="font-bold truncate">{byNum(g.scorer) ?? <span className="text-[var(--amber)]">not on roster</span>}</span>
                      </div>
                      <div className="flex items-center gap-1 text-xs text-[var(--mute)]">
                        <span>A</span>
                        <Cell v={g.assist1} w="w-10" numeric label={`Goal ${i + 1} first assist number, ${sideName}`} onChange={(v) => set((x) => (x[side].goals[i].assist1 = v || null))} testid={`input-goal-a1-${side}-${i}`} />
                        <Cell v={g.assist2} w="w-10" numeric label={`Goal ${i + 1} second assist number, ${sideName}`} onChange={(v) => set((x) => (x[side].goals[i].assist2 = v || null))} testid={`input-goal-a2-${side}-${i}`} />
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
                    <Cell v={p.number} w="w-11" numeric label={`Row ${i + 1} jersey number, ${sideName}`} onChange={(v) => set((x) => (x[side].roster[i].number = v))} testid={`input-roster-num-${side}-${i}`} />
                    <input className="field flex-1 w-full font-bold min-h-[44px]" aria-label={`Row ${i + 1} player name, ${sideName}`} value={p.name ?? ""} onChange={(e) => set((x) => (x[side].roster[i].name = e.target.value))} data-testid={`input-roster-name-${side}-${i}`} />
                    {(p.position || "").toUpperCase().startsWith("G") && <span className="chip h-6 text-xs">G</span>}
                    <button className="h-11 w-11 text-[var(--mute)] hover:text-[var(--down)]" onClick={() => set((x) => x[side].roster.splice(i, 1))} aria-label={`Remove row ${i + 1}, ${sideName}`} data-testid={`button-remove-roster-${side}-${i}`}>×</button>
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

      <button className="mt-4 text-sm text-[var(--mute)] underline underline-offset-4 px-1 min-h-[44px]" onClick={discard} data-testid="button-discard">Wrong photo? Discard this scan</button>

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
          {(sent || (s.status === "awaiting" && !canConfirm)) && (
            <div className="card p-3 mb-2 text-sm" data-testid="text-sent-to-captains">
              {sent ? "Sent. The captains have a notice to check it and tap Confirm." : `${s.submitted?.by ?? "A player"} sent this to the captains. It counts once one of them confirms.`}
            </div>
          )}
          {canConfirm ? (
            <button className="btn btn-red w-full h-14 text-base shadow-[0_10px_30px_rgba(255,59,59,.35)]" onClick={confirm} disabled={saving || !!s.suggestion?.duplicateGameId} data-testid="button-confirm-final">
              {saving ? "Putting it in the books…" : <>Confirm final · {league ? `${league.level} · ` : ""}{totals!.home}–{totals!.away}</>}
            </button>
          ) : !sent && (
            <button className="btn btn-red w-full h-14 text-base" onClick={submit} disabled={saving || !!s.suggestion?.duplicateGameId || !s.rights?.approved} data-testid="button-send-to-captains">
              {saving ? "Sending…" : !s.rights?.approved ? "On the waitlist: can't send yet" : s.status === "awaiting" ? "Send my corrections" : "Send to the captains to confirm"}
            </button>
          )}
        </div>
      </div>

      {zoom && (
        <div className="fixed inset-0 z-[60] bg-black/90 overflow-auto" onClick={() => setZoom(false)} data-testid="overlay-photo">
          <img src={sheetImg(id)} alt="Scoresheet photo" className="min-w-[900px] w-full" />
        </div>
      )}
    </div>
  );
}

function StuckSheet({ id, title, leagues, onDone }: { id: string; title: string; leagues: { id: number; level: string }[]; onDone: () => Promise<unknown> }) {
  const [mode, setMode] = useState<null | "hand" | "send">(null);
  const [homeName, setHomeName] = useState("");
  const [awayName, setAwayName] = useState("");
  const [homeScore, setHomeScore] = useState("");
  const [awayScore, setAwayScore] = useState("");
  const [homeNumbers, setHomeNumbers] = useState("");
  const [awayNumbers, setAwayNumbers] = useState("");
  const [leagueId, setLeagueId] = useState<number | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const save = async (send: boolean) => {
    if (send && !leagueId) { setErr("Pick the league this game was in."); return; }
    setBusy(true); setErr(null);
    try {
      const res = await apiRequest("POST", `/api/sheets/${id}/manual`, { homeName, awayName, homeScore, awayScore, homeNumbers, awayNumbers });
      const saved = await res.json();
      if (send) {
        await apiRequest("POST", `/api/sheets/${id}/submit`, { leagueId, homeTeamId: null, awayTeamId: null, data: saved.data, eventId: null });
      }
      await invalidatePrefixes(["/api/sheets", "/api/games", "/api/feed", "/api/standings", "/api/leagues", "/api/players", "/api/me", "/api/teams"]);
      await onDone();
    } catch (e: any) {
      setErr(e?.message || "That didn't save. Check the fields and try again.");
      setBusy(false);
    }
  };

  return (
    <div>
      <BackBar href="/scan" title="Scan" />
      <div className="card p-5">
        <div className="font-black text-lg text-center" data-testid="text-sheet-stuck">{title}</div>
        <p className="text-sm text-[var(--mute)] mt-1 text-center">You can take another photo, type the score, or send it to the captain.</p>
        <div className="grid gap-2 mt-4">
          <Link href="/scan" className="btn btn-red" data-testid="button-retry-photo">Retry with a new photo</Link>
          <button type="button" className="btn btn-ghost" onClick={() => { setMode("hand"); setErr(null); }} data-testid="button-enter-by-hand">Enter the score by hand</button>
          <button type="button" className="btn btn-ghost" onClick={() => { setMode("send"); setErr(null); }} data-testid="button-send-to-captain">Send to the captain</button>
        </div>
        {mode && (
          <div className="mt-4 grid gap-3">
            <label className="block text-sm">
              <span className="label">Home team</span>
              <input className="input w-full mt-1" value={homeName} onChange={(e) => setHomeName(e.target.value)} data-testid="input-manual-home-name" />
            </label>
            <label className="block text-sm">
              <span className="label">Visitor team</span>
              <input className="input w-full mt-1" value={awayName} onChange={(e) => setAwayName(e.target.value)} data-testid="input-manual-away-name" />
            </label>
            <div className="grid grid-cols-2 gap-2">
              <label className="block text-sm">
                <span className="label">Home score</span>
                <input className="input w-full mt-1" inputMode="numeric" value={homeScore} onChange={(e) => setHomeScore(e.target.value)} data-testid="input-manual-home-score" />
              </label>
              <label className="block text-sm">
                <span className="label">Visitor score</span>
                <input className="input w-full mt-1" inputMode="numeric" value={awayScore} onChange={(e) => setAwayScore(e.target.value)} data-testid="input-manual-away-score" />
              </label>
            </div>
            <label className="block text-sm">
              <span className="label">Home numbers</span>
              <input className="input w-full mt-1" value={homeNumbers} onChange={(e) => setHomeNumbers(e.target.value)} placeholder="12 14 31" data-testid="input-manual-home-numbers" />
            </label>
            <label className="block text-sm">
              <span className="label">Visitor numbers</span>
              <input className="input w-full mt-1" value={awayNumbers} onChange={(e) => setAwayNumbers(e.target.value)} placeholder="9 19 1" data-testid="input-manual-away-numbers" />
            </label>
            <p className="text-xs text-[var(--mute)]">Jersey numbers, separated by spaces. Who dressed, not who scored.</p>
            {mode === "send" && (
              <div>
                <div className="label mb-2">League</div>
                <div className="flex gap-2 overflow-x-auto scrollbar-none">
                  {leagues.map((l) => (
                    <button key={l.id} type="button" className="chip" data-active={leagueId === l.id} onClick={() => setLeagueId(l.id)} data-testid={`chip-manual-league-${l.level}`}>{l.level}</button>
                  ))}
                </div>
              </div>
            )}
            {err && <div className="text-sm text-[var(--down)]" data-testid="text-manual-error">{err}</div>}
            {mode === "hand" ? (
              <button type="button" className="btn btn-red" disabled={busy} onClick={() => save(false)} data-testid="button-manual-save">{busy ? "Saving…" : "Save and check it"}</button>
            ) : (
              <button type="button" className="btn btn-red" disabled={busy} onClick={() => save(true)} data-testid="button-manual-send">{busy ? "Sending…" : "Send to the captain"}</button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
