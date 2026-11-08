"use client";
import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "@/lib/router";
import { act } from "@/lib/auth";
import { fmtDate } from "@/lib/ui";

/** Sheet, jersey, locker room and cooler for one game. Shows nothing until a captain fills something in. */
export function GameDetails({ g }: { g: any }) {
  const bits = [g.sheet ? `Sheet ${g.sheet}` : null, g.jersey ? `Wear ${g.jersey}` : null, g.locker_room ? `Locker room ${g.locker_room}` : null, g.cooler ? `Cooler: ${g.cooler}` : null].filter(Boolean);
  if (!bits.length) return null;
  return (
    <div className="flex flex-wrap gap-1.5 mt-3" data-testid={`details-game-${g.id}`}>
      {bits.map((b) => <span key={b as string} className="text-xs font-bold rounded-full bg-[var(--ice-3)] px-2.5 py-1">{b}</span>)}
    </div>
  );
}

/** Captains see this when no goalie has said In. */
export function GoalieNudge({ g, teamId }: { g: any; teamId: number }) {
  if (!g.needsGoalie) return null;
  return (
    <div className="mt-3 rounded-xl border border-[var(--amber)]/50 bg-[var(--ice-3)] p-3 text-sm" data-testid={`nudge-goalie-${g.id}`}>
      <b>No goalie yet.</b> {g.goaliesOnRoster ? "Your goalies haven't said In." : "Nobody on the roster is listed as a goalie."}{" "}
      <Link href={`/team/${teamId}?sub=${g.id}#game-${g.id}`} className="inline-flex items-center min-h-[44px] text-[var(--blue)] font-bold" data-testid={`link-goalie-sub-${g.id}`}>Find a goalie sub</Link>
    </div>
  );
}

/** Captains and assistants: fill in the sheet, jersey and locker room, and hand out the cooler. */
export function DetailsEditor({ teamId, g, roster }: { teamId: number; g: any; roster: { id: number; name: string }[] }) {
  const [open, setOpen] = useState(false);
  const [sheet, setSheet] = useState(g.sheet ?? "");
  const [jersey, setJersey] = useState(g.jersey ?? "");
  const [room, setRoom] = useState(g.locker_room ?? "");
  const [err, setErr] = useState<string | null>(null);
  const keys = ["/api/teams", "/api/me", "/api/feed"];
  // Arriving from Home's "Set sheet & room" opens this game's details straight away.
  useEffect(() => {
    if (new URLSearchParams(window.location.search).get("details") !== String(g.id)) return;
    setOpen(true);
    setTimeout(() => document.getElementById(`game-${g.id}`)?.scrollIntoView({ block: "center" }), 300);
  }, [g.id]);
  if (!open) return <button className="text-sm text-[var(--blue)] font-bold min-h-[44px] ml-4" onClick={() => setOpen(true)} data-testid={`button-details-${g.id}`}>Tonight's details</button>;
  return (
    <div className="mt-2 rounded-xl border border-[var(--line)] p-3" data-testid={`panel-details-${g.id}`}>
      <div className="flex items-center justify-between"><span className="label">Tonight's details</span><button className="text-xs text-[var(--mute)] min-h-[44px] px-2" onClick={() => setOpen(false)}>Close</button></div>
      <div className="grid grid-cols-3 gap-2 mt-2">
        <label className="block min-w-0"><span className="label">Sheet</span><input className="input w-full mt-1" value={sheet} maxLength={40} onChange={(e) => setSheet(e.target.value)} placeholder="2" data-testid={`input-sheet-${g.id}`} /></label>
        <label className="block min-w-0"><span className="label">Jersey</span><input className="input w-full mt-1" value={jersey} maxLength={40} onChange={(e) => setJersey(e.target.value)} placeholder="White" data-testid={`input-jersey-${g.id}`} /></label>
        <label className="block min-w-0"><span className="label">Locker room</span><input className="input w-full mt-1" value={room} maxLength={40} onChange={(e) => setRoom(e.target.value)} placeholder="4" data-testid={`input-room-${g.id}`} /></label>
      </div>
      <button className="btn btn-red h-11 w-full mt-3 text-sm" onClick={async () => setErr(await act("PATCH", `/api/teams/${teamId}/schedule/${g.id}`, { sheet, jersey, lockerRoom: room }, keys))} data-testid={`button-save-details-${g.id}`}>Save details</button>
      <div className="mt-3 border-t border-[var(--line)] pt-3">
        <span className="label">Cooler</span>
        <div className="flex gap-2 mt-1.5">
          <select aria-label="Who brings the cooler" className="input flex-1 min-w-0" value={g.cooler_user_id ?? ""} data-testid={`select-cooler-${g.id}`}
            onChange={async (e) => setErr(await act("PUT", `/api/schedule/${g.id}/cooler`, { userId: e.target.value ? Number(e.target.value) : null }, keys))}>
            <option value="">Nobody yet</option>
            {roster.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
          </select>
          <button className="btn btn-ghost h-11 text-sm shrink-0" onClick={async () => setErr(await act("PUT", `/api/schedule/${g.id}/cooler`, { auto: true }, keys))} data-testid={`button-cooler-auto-${g.id}`}>Next in turn</button>
        </div>
        <p className="text-xs text-[var(--mute)] mt-1.5">Next in turn picks the player who has carried it the fewest times and isn't marked out.</p>
      </div>
      {err && <p className="text-xs down mt-2">{err}</p>}
    </div>
  );
}

/** The next opponent at a glance. Opens on tap so Home stays short. */
export function Scout({ g }: { g: any }) {
  const [open, setOpen] = useState(false);
  const { data } = useQuery<any>({ queryKey: [`/api/schedule/${g.id}/scout`], enabled: open });
  if (!g.opponent_team_id) return null;
  return (
    <div className="mt-3" data-testid={`scout-${g.id}`}>
      <button className="text-sm font-bold text-[var(--blue)] min-h-[44px]" onClick={() => setOpen((o) => !o)} data-testid="button-scout">{open ? "Hide scouting" : `Scout ${g.opponent}`}</button>
      {open && (!data ? <p className="text-xs text-[var(--mute)] mt-1">Loading…</p> : !data.known ? <p className="text-xs text-[var(--mute)] mt-1">Not enough on this team yet.</p> : (
        <div className="mt-2 space-y-1.5 text-sm" data-testid="panel-scout">
          {data.stakes && <p className="font-bold" data-testid="text-stakes">{data.stakes}</p>}
          <p><span className="label mr-1.5">Record</span><span className="tnum">{data.opponent.w}-{data.opponent.l}-{data.opponent.t}</span>, {data.opponent.rank}{ord(data.opponent.rank)} of {data.opponent.of}{data.opponent.gf != null ? `, ${data.opponent.gf} for and ${data.opponent.ga} against` : ""}</p>
          {data.lastMeeting && <p><span className="label mr-1.5">Last time</span><Link href={`/game/${data.lastMeeting.gameId}`} className="text-[var(--blue)] font-bold tnum">{data.lastMeeting.mine > data.lastMeeting.theirs ? "W" : data.lastMeeting.mine < data.lastMeeting.theirs ? "L" : "T"} {data.lastMeeting.mine}-{data.lastMeeting.theirs}</Link>{data.lastMeeting.playedOn ? `, ${fmtDate(data.lastMeeting.playedOn)}` : ""}</p>}
          {data.topScorer && <p><span className="label mr-1.5">Watch</span><Link href={`/player/${data.topScorer.id}`} className="text-[var(--blue)] font-bold">{data.topScorer.name}</Link> ({data.topScorer.g} G, {data.topScorer.a} A)</p>}
        </div>
      ))}
    </div>
  );
}

function ord(n: number) { const v = n % 100; if (v >= 11 && v <= 13) return "th"; return ({ 1: "st", 2: "nd", 3: "rd" } as Record<number, string>)[n % 10] ?? "th"; }

/** Skate sharpening: log the day, get a nudge after a set number of games. */
export function SharpenCard({ compact = false }: { compact?: boolean }) {
  const { data } = useQuery<any>({ queryKey: ["/api/me/gear"] });
  const [err, setErr] = useState<string | null>(null);
  const [every, setEvery] = useState<string>("");
  if (!data) return null;
  const today = new Date().toLocaleDateString("en-CA");
  const save = async (b: unknown) => setErr(await act("PUT", "/api/me/gear", b, ["/api/me/gear"]));
  if (compact) {
    if (!data.due) return null;
    return (
      <div className="card mt-3 p-3.5 flex items-center gap-3" data-testid="card-sharpen-due">
        <span className="flex-1 text-sm"><b>Time to sharpen.</b> {data.since} games since your last sharpening.</span>
        <button className="btn btn-ghost h-11 text-sm" onClick={() => save({ sharpenedOn: today })} data-testid="button-sharpened-today">Done today</button>
      </div>
    );
  }
  return (
    <div className="card p-4" data-testid="card-gear">
      <p className="text-sm">{data.sharpenedOn ? <>Last sharpened <b>{fmtDate(data.sharpenedOn)}</b>. {data.since} games since.{data.due ? " Time for another." : ""}</> : "Log the day you last had your skates sharpened and we'll remind you when it's time."}</p>
      <div className="grid grid-cols-2 gap-2 mt-3">
        <button className="btn btn-ghost h-11 text-sm" onClick={() => save({ sharpenedOn: today })} data-testid="button-sharpen-today">Sharpened today</button>
        <label className="flex items-center gap-2 text-sm"><span className="shrink-0">Remind me after</span>
          <input className="input w-16 h-11 text-center" inputMode="numeric" aria-label="Sharpen every how many games" value={every || String(data.every)} onChange={(e) => setEvery(e.target.value.replace(/\D/g, "").slice(0, 2))} onBlur={() => every && save({ every: Number(every) })} data-testid="input-sharpen-every" /></label>
      </div>
      <p className="text-xs text-[var(--mute)] mt-2">Counts games on Late Ice since the day you log. Games, not weeks.</p>
      {err && <p className="text-xs down mt-1">{err}</p>}
    </div>
  );
}
