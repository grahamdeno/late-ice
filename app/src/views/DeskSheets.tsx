"use client";
import { useEffect, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link, useLocation } from "@/lib/router";
import { apiRequest, authHeaders, invalidatePrefixes } from "@/lib/queryClient";
import { TeamBadge, img, useFilter } from "@/lib/ui";
import { DeskFrame, Gate, RinkSwitch, day, useDeskRink } from "@/views/Desk";
import { useSheetImage } from "@/lib/auth";

/**
 * Scoresheets on the desk: a queue of scans waiting for a check, and a wide review screen with the
 * photo beside the reading, so staff can compare line by line. Confirm puts the game in the books
 * and opens the next scan in the queue.
 */

const RELOAD = ["/api/sheets", "/api/games", "/api/feed", "/api/standings", "/api/leagues", "/api/players", "/api/me", "/api/teams", "/api/desk"];

type Row = {
  id: number; status: string; createdAt: string; scannedBy: string | null; submittedBy: string | null; gameId: number | null;
  level: string | null; leagueId: number | null; home: string | null; away: string | null;
  homeScore: number | null; awayScore: number | null; date: string | null; confidence: number | null; warnings: number; duplicate: number | null;
};
type Queue = { rink: { id: number; name: string }; leagues: { id: number; level: string; name: string }[]; open: Row[]; done: Row[] };

const STATUS: Record<string, { label: string; tone: string }> = {
  processing: { label: "Reading", tone: "var(--mute)" },
  review: { label: "To check", tone: "var(--amber)" },
  awaiting: { label: "Sent by a player", tone: "var(--amber)" },
  failed: { label: "Couldn't read", tone: "var(--down)" },
  confirmed: { label: "In the books", tone: "var(--up)" },
  discarded: { label: "Discarded", tone: "var(--mute)" },
};

const ago = (s: string) => {
  const m = Math.round((Date.now() - new Date(s).getTime()) / 60000);
  if (m < 60) return `${Math.max(1, m)} min ago`;
  if (m < 60 * 24) return `${Math.round(m / 60)} h ago`;
  return day(s);
};

/* ---------- queue ---------- */

export function DeskSheetQueue() {
  return <Gate>{(overview) => <QueueBody overview={overview} />}</Gate>;
}

function QueueBody({ overview }: { overview: any }) {
  const { rink, rinks, pick } = useDeskRink(overview);
  const { data, error } = useQuery<Queue>({
    queryKey: [`/api/desk/sheets?rink=${rink?.id}`], enabled: !!rink,
    refetchInterval: (q) => ((q.state.data as Queue | undefined)?.open.some((r) => r.status === "processing") ? 3000 : 30000),
  });
  const [show, setShow] = useState<"open" | "done">("open");
  const rows = show === "open" ? data?.open : data?.done;

  return (
    <DeskFrame>
      <div className="flex items-center gap-3 flex-wrap">
        <h1 className="font-black text-[28px] flex-1 min-w-0">Scoresheets</h1>
        <RinkSwitch rink={rink} rinks={rinks} pick={pick} />
        {data?.open.some((r) => r.status !== "processing") && (
          <Link href={`/desk/sheets/${data.open.find((r) => r.status !== "processing")!.id}`} className="btn btn-red h-11 px-5" data-testid="button-sheets-start">Check the oldest</Link>
        )}
      </div>
      <p className="text-[var(--mute)] mt-1">Scans from players and captains at {rink?.name ?? "this rink"}. Check each against its photo, then confirm.</p>

      <div className="flex gap-2 mt-6">
        <button className="chip" data-active={show === "open"} onClick={() => setShow("open")} data-testid="tab-sheets-open">Waiting <span className="opacity-70">{data?.open.length ?? ""}</span></button>
        <button className="chip" data-active={show === "done"} onClick={() => setShow("done")} data-testid="tab-sheets-done">Last 30 days <span className="opacity-70">{data?.done.length ?? ""}</span></button>
      </div>

      {error && <p className="text-sm down mt-4" data-testid="text-error">{(error as any).message}</p>}
      <div className="card mt-4 overflow-x-auto">
        <table className="w-full text-sm" data-testid="table-sheets">
          <thead>
            <tr className="text-left text-[var(--mute)] border-b border-[var(--line)]">
              <th className="label px-4 py-3 w-20">Photo</th>
              <th className="label px-3 py-3">Game as read</th>
              <th className="label px-3 py-3 w-20">League</th>
              <th className="label px-3 py-3 w-24">Played</th>
              <th className="label px-3 py-3 w-40">Status</th>
              <th className="label px-3 py-3 w-40">From</th>
              <th className="px-3 py-3 w-8" />
            </tr>
          </thead>
          <tbody className="divide-y divide-[var(--line)]">
            {!data && !error && <tr><td colSpan={7} className="p-5 text-[var(--mute)]">Loading…</td></tr>}
            {rows?.length === 0 && (
              <tr><td colSpan={7} className="p-5 text-[var(--mute)]" data-testid="text-sheets-empty">
                {show === "open" ? "Nothing to check. New scans land here as soon as they're read." : "No scans in the last 30 days."}
              </td></tr>
            )}
            {rows?.map((r) => <QueueRow key={r.id} r={r} />)}
          </tbody>
        </table>
      </div>
    </DeskFrame>
  );
}

function QueueRow({ r }: { r: Row }) {
  const sheetImg = useSheetImage();
  const [, nav] = useLocation();
  const st = STATUS[r.status] ?? STATUS.review;
  const href = r.status === "confirmed" && r.gameId ? `/game/${r.gameId}` : `/desk/sheets/${r.id}`;
  return (
    <tr className="hover:bg-[var(--surface-2)] cursor-pointer" onClick={() => nav(href)} data-testid={`row-sheet-${r.id}`}>
      <td className="px-4 py-2.5">
        <img src={sheetImg(r.id)} alt="" loading="lazy" className="h-12 w-12 object-cover rounded-lg border border-[var(--line)] bg-[var(--ice-3)]" />
      </td>
      <td className="px-3 py-2.5 min-w-[220px]">
        {r.home || r.away ? (
          <div className="grid grid-cols-[minmax(0,1fr)_auto] gap-x-3 font-bold">
            <span className="truncate">{r.home ?? "Home"}</span><span className="tnum">{r.homeScore ?? "–"}</span>
            <span className="truncate">{r.away ?? "Visitor"}</span><span className="tnum">{r.awayScore ?? "–"}</span>
          </div>
        ) : <span className="text-[var(--mute)]">{r.status === "processing" ? "Reading the handwriting…" : "Nothing read"}</span>}
      </td>
      <td className="px-3 py-2.5">{r.level ? <span className="font-black text-[var(--red)]">{r.level}</span> : <span className="text-xs text-[var(--mute)]">Unsorted</span>}</td>
      <td className="px-3 py-2.5 tnum">{r.date ? day(r.date) : <span className="text-[var(--mute)]">–</span>}</td>
      <td className="px-3 py-2.5">
        <span className="inline-flex items-center gap-2 font-bold" style={{ color: st.tone }}>
          <span className="h-2 w-2 rounded-full" style={{ background: st.tone }} />{st.label}
        </span>
        {r.duplicate ? <div className="text-xs text-[var(--blue)]">Already in the books</div>
          : r.warnings > 0 && ["review", "awaiting"].includes(r.status) ? <div className="text-xs text-[var(--mute)]">{r.warnings} to look at</div> : null}
      </td>
      <td className="px-3 py-2.5 text-xs text-[var(--mute)]">
        <div className="truncate">{r.submittedBy ?? r.scannedBy ?? "Someone"}</div>
        <div>{ago(r.createdAt)}</div>
      </td>
      <td className="px-3 py-2.5 text-[var(--mute)]">›</td>
    </tr>
  );
}

/* ---------- one sheet ---------- */

export function DeskSheet({ id }: { id: string }) {
  return <Gate>{(overview) => <SheetBody id={id} overview={overview} />}</Gate>;
}

type Side = "home" | "away";

function Cell({ v, onChange, w = "w-12", testid, label }: { v: any; onChange: (x: string) => void; w?: string; testid?: string; label: string }) {
  return <input className={`field tnum text-center ${w}`} value={v ?? ""} aria-label={label} onChange={(e) => onChange(e.target.value)} data-testid={testid} />;
}

function SheetBody({ id, overview }: { id: string; overview: any }) {
  const [, nav] = useLocation();
  const { boot } = useFilter();
  const { rink } = useDeskRink(overview);
  const { data: s, refetch } = useQuery<any>({
    queryKey: [`/api/sheets/${id}`], staleTime: 0,
    refetchInterval: (q) => ((q.state.data as any)?.status === "processing" ? 1500 : false),
  });
  const { data: queue } = useQuery<Queue>({ queryKey: [`/api/desk/sheets?rink=${rink?.id}`], enabled: !!rink });
  const { data: events } = useQuery<any[]>({ queryKey: ["/api/events"] });
  const [d, setD] = useState<any>(null);
  const [leagueId, setLeagueId] = useState<number | null>(null);
  const [teamIds, setTeamIds] = useState<{ home: number | null; away: number | null }>({ home: null, away: null });
  const [eventId, setEventId] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<{ message: string; gameId?: number } | null>(null);

  // Load the reading once per sheet, so a background refresh never wipes corrections.
  const loaded = useRef<string | null>(null);
  useEffect(() => {
    if (loaded.current === id) return;
    if ((s?.status === "review" || s?.status === "awaiting") && s.data?.is_scoresheet) {
      loaded.current = id;
      setD(structuredClone(s.data));
      setLeagueId(s.suggestion?.leagueId ?? null);
      setEventId(s.suggestion?.eventId ?? null);
      setTeamIds({ home: s.suggestion?.home?.teamId ?? null, away: s.suggestion?.away?.teamId ?? null });
      setErr(null);
    }
  }, [s, id]);

  const open = queue?.open.filter((r) => r.status !== "processing") ?? [];
  const at = open.findIndex((r) => String(r.id) === id);
  const next = open.find((r, i) => i > at && String(r.id) !== id) ?? open.find((r) => String(r.id) !== id) ?? null;
  const goNext = () => nav(next ? `/desk/sheets/${next.id}` : "/desk/sheets");

  const header = (
    <div className="flex items-center gap-3 flex-wrap mb-5">
      <Link href="/desk/sheets" className="text-sm font-bold text-[var(--blue)]">‹ Scoresheets</Link>
      <span className="flex-1" />
      {open.length > 0 && at >= 0 && <span className="text-sm text-[var(--mute)]" data-testid="text-sheet-position">{at + 1} of {open.length} waiting</span>}
      {next && <button className="btn btn-ghost h-9 px-3 text-sm" onClick={goNext} data-testid="button-sheet-skip">Skip</button>}
    </div>
  );

  if (!s) return <DeskFrame><p className="text-[var(--mute)]">Loading…</p></DeskFrame>;

  if (s.status === "confirmed" || s.gameId) {
    return (
      <DeskFrame>
        {header}
        <div className="card p-6 max-w-xl">
          <div className="font-black text-lg">This sheet is in the books.</div>
          <div className="flex gap-2 mt-4">
            <Link href={`/game/${s.gameId}`} className="btn btn-red h-10 px-4">See the game</Link>
            {next && <button className="btn btn-ghost h-10 px-4" onClick={goNext}>Next scan</button>}
          </div>
        </div>
      </DeskFrame>
    );
  }
  if (s.status === "discarded") {
    return (
      <DeskFrame>
        {header}
        <div className="card p-6 max-w-xl"><div className="font-black text-lg">This scan was discarded.</div></div>
      </DeskFrame>
    );
  }

  const discard = async () => {
    if (!window.confirm("Discard this scan? The game won't be counted from it.")) return;
    setBusy(true);
    try { await apiRequest("POST", `/api/sheets/${id}/discard`); await invalidatePrefixes(RELOAD); goNext(); }
    catch (e: any) { setErr({ message: e.message }); }
    setBusy(false);
  };

  const stuck = s.status === "failed" || s.data?.is_scoresheet === false;
  const reading = s.status === "processing";

  return (
    <DeskFrame>
      {header}
      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] items-start">
        <Photo id={id} dim={reading} />
        <div className="min-w-0">
          {reading && (
            <div className="card p-5" data-testid="text-processing">
              <div className="font-black">Reading the handwriting…</div>
              <p className="text-sm text-[var(--mute)] mt-1">Usually about 10 seconds. This page updates by itself.</p>
            </div>
          )}
          {stuck && <HandEntry id={id} reason={s.status === "failed" ? "The reader couldn't make this one out." : "The reader doesn't think this is a scoresheet."} onDone={async () => { loaded.current = null; await refetch(); }} onDiscard={discard} busy={busy} />}
          {!reading && !stuck && d && (
            <Review s={s} d={d} setD={setD} leagueId={leagueId} setLeagueId={setLeagueId} teamIds={teamIds} setTeamIds={setTeamIds}
              eventId={eventId} setEventId={setEventId} events={events ?? []} boot={boot} busy={busy} setBusy={setBusy}
              err={err} setErr={setErr} onDiscard={discard} onConfirmed={async (gameId: number) => {
                await invalidatePrefixes(RELOAD);
                if (next) nav(`/desk/sheets/${next.id}`); else nav(`/game/${gameId}`);
              }} hasNext={!!next} />
          )}
        </div>
      </div>
    </DeskFrame>
  );
}

/** The photo, zoomable and draggable, kept in view while the reading scrolls. */
function Photo({ id, dim }: { id: string; dim?: boolean }) {
  const sheetImg = useSheetImage();
  const [zoom, setZoom] = useState(1);
  const [turn, setTurn] = useState(0);
  const box = useRef<HTMLDivElement>(null);
  const drag = useRef<{ x: number; y: number; l: number; t: number } | null>(null);
  useEffect(() => { setZoom(1); setTurn(0); }, [id]);
  const sideways = turn % 180 !== 0;
  return (
    <div className="xl:sticky xl:top-6 min-w-0" data-testid="panel-sheet-photo">
      <div className="flex items-center gap-1.5 mb-2">
        <span className="label flex-1">Photo</span>
        <button className="btn btn-ghost h-8 w-8 p-0" onClick={() => setZoom((z) => Math.max(1, z - 0.5))} aria-label="Zoom out" data-testid="button-photo-out">−</button>
        <span className="text-xs tnum w-10 text-center text-[var(--mute)]">{Math.round(zoom * 100)}%</span>
        <button className="btn btn-ghost h-8 w-8 p-0" onClick={() => setZoom((z) => Math.min(4, z + 0.5))} aria-label="Zoom in" data-testid="button-photo-in">+</button>
        <button className="btn btn-ghost h-8 px-2 text-xs" onClick={() => setTurn((t) => (t + 90) % 360)} aria-label="Rotate" data-testid="button-photo-rotate">Rotate</button>
        <a className="btn btn-ghost h-8 px-2 text-xs" href={sheetImg(id)} target="_blank" rel="noreferrer">Open</a>
      </div>
      <div ref={box}
        className="rounded-2xl border border-[var(--line)] bg-black/40 overflow-auto xl:h-[calc(100dvh-140px)] h-[60vh] select-none"
        style={{ cursor: zoom > 1 ? "grab" : "default" }}
        onPointerDown={(e) => { if (!box.current || zoom === 1) return; drag.current = { x: e.clientX, y: e.clientY, l: box.current.scrollLeft, t: box.current.scrollTop }; (e.target as Element).setPointerCapture?.(e.pointerId); }}
        onPointerMove={(e) => { const g = drag.current; if (!g || !box.current) return; box.current.scrollLeft = g.l - (e.clientX - g.x); box.current.scrollTop = g.t - (e.clientY - g.y); }}
        onPointerUp={() => { drag.current = null; }}
        onDoubleClick={() => setZoom((z) => (z >= 2 ? 1 : 2))}>
        <div style={{ width: `${zoom * 100}%` }} className="mx-auto">
          <img src={sheetImg(id)} alt="Scoresheet photo" draggable={false}
            className={`w-full transition-transform ${dim ? "opacity-60" : ""}`}
            style={{ transform: `rotate(${turn}deg)${sideways ? " scale(0.75)" : ""}` }} />
        </div>
      </div>
      <p className="text-xs text-[var(--mute)] mt-1.5">Double-click to zoom. Drag to move around.</p>
    </div>
  );
}

function Review({ s, d, setD, leagueId, setLeagueId, teamIds, setTeamIds, eventId, setEventId, events, boot, busy, setBusy, err, setErr, onDiscard, onConfirmed, hasNext }: any) {
  const set = (fn: (x: any) => void) => setD((prev: any) => { const n = structuredClone(prev); fn(n); return n; });
  const leagues: any[] = boot?.leagues ?? [];
  const league = leagues.find((l) => l.id === leagueId);
  const allTeams = leagues.flatMap((l: any) => l.teams);
  const total = (side: Side) => d[side].total ?? d[side].goals.length;
  const conf = Math.round((d.confidence ?? 0) * 100);
  const r = s.rights ?? { leagues: [], teams: [], approved: false };
  const canConfirm = r.approved && ((leagueId != null && r.leagues.includes(leagueId)) || [teamIds.home, teamIds.away].some((t: number | null) => t != null && r.teams.includes(t)));

  const confirm = async () => {
    if (!leagueId) return setErr({ message: "Pick the league this game was in." });
    setBusy(true); setErr(null);
    const res = await fetch(img(`/api/sheets/${s.id}/confirm`), {
      method: "POST", headers: { "Content-Type": "application/json", ...authHeaders() },
      body: JSON.stringify({ leagueId, homeTeamId: teamIds.home, awayTeamId: teamIds.away, data: d, eventId }),
    });
    const j = await res.json().catch(() => ({ message: "That didn't save. Try again." }));
    setBusy(false);
    if (!res.ok) return setErr(j);
    await onConfirmed(j.gameId);
  };

  const teamRow = (side: Side) => {
    const sug = s.suggestion?.[side];
    const options = [...(league?.teams ?? [])];
    for (const c of sug?.candidates ?? []) if (!options.find((o: any) => o.id === c.id) && c.score > 0.5) options.push(c);
    const chosen = allTeams.find((t: any) => t.id === teamIds[side]);
    const listed = d[side].goals.length;
    return (
      <div className="flex items-center gap-3">
        {chosen ? <TeamBadge team={chosen} size={40} /> : <span className="h-10 w-10 rounded-full border-2 border-dashed border-[var(--amber)] shrink-0" />}
        <div className="flex-1 min-w-0">
          <div className="label">{side === "home" ? "Home" : "Visitor"}{d[side].name && <span className="normal-case tracking-normal font-medium"> · sheet says “{d[side].name}”</span>}</div>
          <select className="input h-10 mt-1 w-full font-bold" value={teamIds[side] ?? "new"} data-testid={`select-team-${side}`}
            onChange={(e) => setTeamIds((t: any) => ({ ...t, [side]: e.target.value === "new" ? null : Number(e.target.value) }))}>
            {options.map((t: any) => <option key={t.id} value={t.id}>{t.name}</option>)}
            {d[side].name && <option value="new">New team: {d[side].name}</option>}
          </select>
        </div>
        <label className="text-center">
          <span className="label block">Final</span>
          <input className="field tnum text-center font-display text-3xl w-16 h-12" value={total(side)} aria-label={`${side} final score`} data-testid={`input-total-${side}`}
            onChange={(e) => set((x) => { const v = e.target.value.trim(); x[side].total = v === "" ? null : Number(v) || 0; })} />
          {d[side].total != null && d[side].total !== listed && <span className="block text-xs text-[var(--amber)] mt-0.5">{listed} goals listed</span>}
        </label>
      </div>
    );
  };

  return (
    <div className="pb-6">
      <div className="card-hi p-5">
        <div className="flex items-center gap-2 text-xs text-[var(--mute)] mb-4">
          <span className="h-2 w-2 rounded-full" style={{ background: conf >= 85 ? "var(--up)" : "var(--amber)" }} />
          <span data-testid="text-confidence">Read with {conf}% confidence</span>
          {s.submitted && <span>· sent by {s.submitted.by}</span>}
        </div>
        <div className="space-y-4">{teamRow("home")}{teamRow("away")}</div>
        <div className="grid sm:grid-cols-3 gap-3 mt-5">
          <label className="text-sm"><span className="label">League</span>
            <select className="input h-10 mt-1 w-full" value={leagueId ?? ""} onChange={(e) => setLeagueId(e.target.value ? Number(e.target.value) : null)} data-testid="select-sheet-league">
              <option value="">Pick one</option>
              {leagues.filter((l: any) => l.level !== "DEMO").map((l: any) => <option key={l.id} value={l.id}>{l.level} · {l.name}</option>)}
            </select>
          </label>
          <label className="text-sm"><span className="label">Played on</span>
            <input type="date" className="input h-10 mt-1 w-full" value={d.date ?? ""} onChange={(e) => set((x) => (x.date = e.target.value || null))} data-testid="input-sheet-date" />
          </label>
          <label className="text-sm"><span className="label">Game type</span>
            <select className="input h-10 mt-1 w-full" value={eventId ?? ""} onChange={(e) => setEventId(e.target.value ? Number(e.target.value) : null)} data-testid="select-sheet-event">
              <option value="">League game</option>
              {events.map((e: any) => <option key={e.id} value={e.id}>Tournament: {e.name}</option>)}
            </select>
          </label>
        </div>
      </div>

      {s.suggestion?.duplicateGameId && (
        <div className="card mt-3 p-4 border-[var(--blue)]/40" data-testid="banner-duplicate">
          <div className="font-bold">This game is already in the books.</div>
          <p className="text-sm text-[var(--mute)] mt-1">Same teams, same date. Discard this scan unless the date or teams were misread.</p>
          <div className="flex gap-2 mt-3">
            <Link href={`/game/${s.suggestion.duplicateGameId}`} className="btn btn-ghost h-10 px-4" data-testid="link-duplicate-game">See the game</Link>
            <button className="btn btn-red h-10 px-4" onClick={onDiscard} disabled={busy} data-testid="button-discard-dup">Discard this scan</button>
          </div>
        </div>
      )}
      {s.warnings?.length > 0 ? (
        <div className="card mt-3 p-4 border-[var(--amber)]/40" data-testid="list-warnings">
          <div className="label text-[var(--amber)] mb-1">Check these against the photo</div>
          <ul className="text-sm space-y-1">{s.warnings.map((w: string) => <li key={w}>{w}</li>)}</ul>
        </div>
      ) : (
        <p className="mt-3 text-sm text-[var(--up)] px-1" data-testid="text-checks-passed">Scoring list, period box and rosters all agree.</p>
      )}

      <Section title="Goals">
        {(["home", "away"] as Side[]).map((side) => <Goals key={side} side={side} t={d[side]} set={set} />)}
      </Section>
      <Section title="Rosters">
        {(["home", "away"] as Side[]).map((side) => <Roster key={side} side={side} t={d[side]} set={set} />)}
      </Section>
      <Section title="Penalties">
        {(["home", "away"] as Side[]).map((side) => <Penalties key={side} side={side} t={d[side]} />)}
      </Section>
      {d.notes?.length > 0 && <p className="mt-3 text-xs text-[var(--mute)] px-1">Reader notes: {d.notes.join(" ")}</p>}

      <div className="sticky bottom-0 mt-6 pt-3 pb-4 bg-[var(--ice)]">
        {err && (
          <div className="card p-3 mb-2 text-sm border-[var(--down)]/50" data-testid="text-confirm-error">
            {err.message} {err.gameId && <Link href={`/game/${err.gameId}`} className="font-bold text-[var(--blue)]">See the game</Link>}
          </div>
        )}
        {!canConfirm && <p className="text-sm text-[var(--mute)] mb-2">You can't confirm games in this league. Pick the right league, or leave it for that league's staff.</p>}
        <div className="flex gap-2">
          <button className="btn btn-ghost h-12 px-4" onClick={onDiscard} disabled={busy} data-testid="button-discard">Discard</button>
          <button className="btn btn-red h-12 flex-1 text-base" onClick={confirm} disabled={busy || !canConfirm || !!s.suggestion?.duplicateGameId} data-testid="button-confirm-final">
            {busy ? "Putting it in the books…" : <>Confirm{league ? ` · ${league.level}` : ""} · {total("home")}–{total("away")}{hasNext ? " and open the next" : ""}</>}
          </button>
        </div>
      </div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mt-6">
      <h2 className="font-black text-lg mb-2">{title}</h2>
      <div className="grid gap-3 2xl:grid-cols-2">{children}</div>
    </section>
  );
}

function SideHead({ side, t, extra }: { side: Side; t: any; extra?: React.ReactNode }) {
  return (
    <div className="px-4 py-2.5 border-b border-[var(--line)] flex items-center gap-2">
      <span className="font-bold truncate flex-1">{t.name || (side === "home" ? "Home" : "Visitor")}</span>
      {extra}
      <span className="label">{side === "home" ? "Home" : "Visitor"}</span>
    </div>
  );
}

function Goals({ side, t, set }: { side: Side; t: any; set: (fn: (x: any) => void) => void }) {
  const byNum = (n: string | null) => t.roster.find((p: any) => p.number === n)?.name;
  return (
    <div className="card overflow-hidden">
      <SideHead side={side} t={t} extra={
        <button className="text-xs font-bold text-[var(--blue)]" data-testid={`button-add-goal-${side}`}
          onClick={() => set((x) => x[side].goals.push({ period: x[side].goals.at(-1)?.period ?? 1, time: "", scorer: "", assist1: null, assist2: null }))}>Add goal</button>
      } />
      <div className="divide-y divide-[var(--line)]">
        {t.goals.length === 0 && <div className="p-4 text-sm text-[var(--mute)]">No goals on the sheet.</div>}
        {t.goals.map((g: any, i: number) => (
          <div key={i} className="grid grid-cols-[auto_auto_auto_minmax(0,1fr)_auto] items-center gap-1.5 px-3 py-2 text-sm">
            <Cell v={g.period} w="w-9" label="Period" onChange={(v) => set((x) => (x[side].goals[i].period = Number(v) || v))} testid={`input-goal-period-${side}-${i}`} />
            <Cell v={g.time} w="w-16" label="Time" onChange={(v) => set((x) => (x[side].goals[i].time = v))} testid={`input-goal-time-${side}-${i}`} />
            <span className="flex items-center gap-1">
              <Cell v={g.scorer} w="w-11" label="Scorer number" onChange={(v) => set((x) => (x[side].goals[i].scorer = v))} testid={`input-goal-scorer-${side}-${i}`} />
              <Cell v={g.assist1} w="w-11" label="First assist number" onChange={(v) => set((x) => (x[side].goals[i].assist1 = v || null))} testid={`input-goal-a1-${side}-${i}`} />
              <Cell v={g.assist2} w="w-11" label="Second assist number" onChange={(v) => set((x) => (x[side].goals[i].assist2 = v || null))} testid={`input-goal-a2-${side}-${i}`} />
            </span>
            <span className="min-w-0 truncate">
              <span className="font-bold">{byNum(g.scorer) ?? <span className="text-[var(--amber)]">not on roster</span>}</span>
              <span className="text-xs text-[var(--mute)]"> {[byNum(g.assist1), byNum(g.assist2)].filter(Boolean).join(", ") || "unassisted"}</span>
            </span>
            <button className="h-8 w-8 text-[var(--mute)] hover:text-[var(--down)]" aria-label="Remove goal" data-testid={`button-remove-goal-${side}-${i}`}
              onClick={() => set((x) => x[side].goals.splice(i, 1))}>×</button>
          </div>
        ))}
      </div>
    </div>
  );
}

function Roster({ side, t, set }: { side: Side; t: any; set: (fn: (x: any) => void) => void }) {
  return (
    <div className="card overflow-hidden">
      <SideHead side={side} t={t} extra={
        <button className="text-xs font-bold text-[var(--blue)]" data-testid={`button-add-roster-${side}`}
          onClick={() => set((x) => x[side].roster.push({ number: "", name: "", position: null }))}>Add player</button>
      } />
      <div className="divide-y divide-[var(--line)]">
        {t.roster.map((p: any, i: number) => (
          <div key={i} className="flex items-center gap-1.5 px-3 py-1.5 text-sm">
            <Cell v={p.number} w="w-11" label="Number" onChange={(v) => set((x) => (x[side].roster[i].number = v))} testid={`input-roster-num-${side}-${i}`} />
            <input className="field flex-1 w-full font-bold" value={p.name ?? ""} aria-label="Name" onChange={(e) => set((x) => (x[side].roster[i].name = e.target.value))} data-testid={`input-roster-name-${side}-${i}`} />
            <button className="chip h-7 text-xs" data-active={(p.position || "").toUpperCase().startsWith("G")} aria-label="Goalie"
              onClick={() => set((x) => (x[side].roster[i].position = (p.position || "").toUpperCase().startsWith("G") ? null : "G"))} data-testid={`button-roster-goalie-${side}-${i}`}>G</button>
            <button className="h-8 w-8 text-[var(--mute)] hover:text-[var(--down)]" onClick={() => set((x) => x[side].roster.splice(i, 1))} aria-label="Remove row" data-testid={`button-remove-roster-${side}-${i}`}>×</button>
          </div>
        ))}
      </div>
    </div>
  );
}

function Penalties({ side, t }: { side: Side; t: any }) {
  const byNum = (n: string | null) => t.roster.find((p: any) => p.number === n)?.name;
  return (
    <div className="card overflow-hidden">
      <SideHead side={side} t={t} />
      <div className="divide-y divide-[var(--line)]">
        {t.penalties.length === 0 && <div className="p-4 text-sm text-[var(--mute)]">Clean game.</div>}
        {t.penalties.map((p: any, i: number) => (
          <div key={i} className="flex items-center gap-2 px-4 py-2 text-sm">
            <span className="label w-8">P{p.period}</span>
            <span className="tnum">#{p.number}</span>
            <span className="flex-1 truncate">{byNum(p.number)} · {p.offense}</span>
            <span className="tnum text-[var(--mute)]">{p.minutes} min</span>
          </div>
        ))}
      </div>
    </div>
  );
}

/** For a scan the reader couldn't use: type the score and who dressed, then check it like any other. */
function HandEntry({ id, reason, onDone, onDiscard, busy }: { id: string; reason: string; onDone: () => Promise<void>; onDiscard: () => void; busy: boolean }) {
  const [f, setF] = useState({ homeName: "", awayName: "", homeScore: "", awayScore: "", homeNumbers: "", awayNumbers: "" });
  const [err, setErr] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const field = (k: keyof typeof f, label: string, extra?: any) => (
    <label className="text-sm block"><span className="label">{label}</span>
      <input className="input w-full mt-1" value={f[k]} onChange={(e) => setF({ ...f, [k]: e.target.value })} data-testid={`input-manual-${k}`} {...extra} />
    </label>
  );
  const save = async () => {
    setSaving(true); setErr(null);
    try { await apiRequest("POST", `/api/sheets/${id}/manual`, f); await onDone(); }
    catch (e: any) { setErr(e?.message || "That didn't save. Check the fields and try again."); }
    setSaving(false);
  };
  return (
    <div className="card p-5" data-testid="panel-hand-entry">
      <div className="font-black text-lg" data-testid="text-sheet-stuck">{reason}</div>
      <p className="text-sm text-[var(--mute)] mt-1">Read it off the photo and type it in. You'll check it on the next step before it counts.</p>
      <div className="grid grid-cols-[minmax(0,1fr)_96px] gap-3 mt-4">
        {field("homeName", "Home team")}{field("homeScore", "Score", { inputMode: "numeric" })}
        {field("awayName", "Visitor team")}{field("awayScore", "Score", { inputMode: "numeric" })}
      </div>
      <div className="grid gap-3 mt-3">
        {field("homeNumbers", "Home numbers", { placeholder: "12 14 31" })}
        {field("awayNumbers", "Visitor numbers", { placeholder: "9 19 1" })}
      </div>
      <p className="text-xs text-[var(--mute)] mt-2">Jersey numbers, separated by spaces. Who dressed, not who scored.</p>
      {err && <p className="text-sm down mt-3" data-testid="text-manual-error">{err}</p>}
      <div className="flex gap-2 mt-4">
        <button className="btn btn-ghost h-11 px-4" onClick={onDiscard} disabled={busy || saving} data-testid="button-discard">Discard</button>
        <button className="btn btn-red h-11 flex-1" onClick={save} disabled={saving} data-testid="button-manual-save">{saving ? "Saving…" : "Save and check it"}</button>
      </div>
    </div>
  );
}
