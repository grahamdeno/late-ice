"use client";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { act } from "@/lib/auth";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Section, TeamBadge, fmtDate } from "@/lib/ui";

const KIND_LABEL: Record<string, string> = { league: "League", playoff: "Playoff", tournament: "Tournament", exhibition: "Exhibition" };

function ago(s: string | null) {
  if (!s) return "never";
  const m = Math.round((Date.now() - new Date(s).getTime()) / 60000);
  if (m < 2) return "just now";
  if (m < 60) return `${m} min ago`;
  if (m < 60 * 24) return `${Math.round(m / 60)} hr ago`;
  return new Date(s).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

export function GameLine({ g, teamId }: { g: any; teamId?: number }) {
  const where = g.is_home === false ? "@" : "vs";
  return (
    <span className={`flex items-center gap-3 min-w-0 ${g.status === "canceled" ? "opacity-50" : ""}`}>
      <span className="w-14 shrink-0 text-center rounded-xl bg-[var(--ice-3)] py-1.5">
        <span className="block text-[10px] label">{fmtDate(g.local_date).split(",")[0]}</span>
        <span className="block font-black text-sm leading-tight">{fmtDate(g.local_date).split(", ")[1]}</span>
      </span>
      <span className="flex-1 min-w-0">
        <span className={`flex items-center gap-1.5 font-bold text-sm min-w-0 ${g.status === "canceled" ? "line-through" : ""}`}>
          <span className="text-[var(--mute)] font-medium shrink-0">{where}</span>
          {g.opponent_team_id ? <TeamBadge team={{ id: g.opponent_team_id, name: g.opponent ?? "", color: g.opponent_color, logo: g.opponent_logo }} size={18} /> : null}
          <span className="truncate">{g.opponent ?? g.summary ?? "Opponent not listed"}</span>
        </span>
        <span className="block text-xs text-[var(--mute)] truncate">
          {g.status === "canceled" ? "Canceled · " : ""}{g.local_time ?? "Time not set"}{g.kind !== "league" ? ` · ${KIND_LABEL[g.kind]}` : ""}{g.location ? ` · ${g.location}` : ""}
        </span>
      </span>
    </span>
  );
}

const ANSWERS = [["in", "In"], ["late", "Late"], ["out", "Out"]] as const;

/** In / Late / Out for one game, for players on the roster. */
export function Rsvp({ g }: { g: any }) {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const mine = g.rsvp?.mine ?? null;
  const pick = async (a: string) => {
    setBusy(true);
    setErr(await act("PUT", `/api/schedule/${g.id}/rsvp`, { answer: mine === a && !g.rsvp?.mineAuto ? null : a }));
    setBusy(false);
  };
  return (
    <div>
      <div className="grid grid-cols-3 gap-1.5" role="radiogroup" aria-label="Are you playing?">
        {ANSWERS.map(([k, label]) => (
          <button key={k} role="radio" aria-checked={mine === k} disabled={busy} onClick={() => pick(k)} data-testid={`button-rsvp-${k}-${g.id}`}
            className={`h-9 rounded-xl text-sm font-bold border ${mine === k ? (k === "out" ? "border-[var(--line-2)] bg-[var(--ice-3)] text-[var(--white)]" : k === "late" ? "border-[var(--amber)] text-[var(--amber)] bg-[var(--ice-3)]" : "border-[var(--up)] text-[var(--up)] bg-[var(--ice-3)]") : "border-[var(--line)] text-[var(--mute)]"}`}>
            {label}
          </button>
        ))}
      </div>
      {g.rsvp?.mineAuto && <p className="text-[11px] text-[var(--mute)] mt-1">Marked out because of your availability. Tap In if you're playing anyway.</p>}
      {err && <p className="text-xs down mt-1">{err}</p>}
    </div>
  );
}

function Counts({ g }: { g: any }) {
  const [open, setOpen] = useState(false);
  const c = g.rsvp?.counts;
  if (!c) return null;
  const parts = [[c.in, "in"], [c.late, "late"], [c.out, "out"], [c.none, "no answer"]].filter(([n]) => (n as number) > 0);
  if (!parts.length) return null;
  const names = g.rsvp.names;
  return (
    <div className="mt-2">
      <button className="text-xs text-[var(--mute)] tnum" onClick={() => names && setOpen((o) => !o)} data-testid={`button-rsvp-counts-${g.id}`}>
        {parts.map(([n, l]) => `${n} ${l}`).join(" · ")}{names ? (open ? " ▴" : " ▾") : ""}
      </button>
      {open && names && (
        <div className="mt-1.5 grid grid-cols-2 gap-x-3 gap-y-1 text-xs">
          {([["in", "In"], ["late", "Late"], ["out", "Out"], ["none", "No answer"]] as const).filter(([k]) => names[k].length).map(([k, l]) => (
            <div key={k} className="min-w-0"><span className="label">{l}</span><div className="text-[var(--mute)] break-words">{names[k].join(", ")}</div></div>
          ))}
        </div>
      )}
    </div>
  );
}

export function Schedule({ teamId }: { teamId: number }) {
  const { data } = useQuery<any>({ queryKey: [`/api/teams/${teamId}/schedule`] });
  const [err, setErr] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  if (!data) return null;
  const { games, can, feed } = data;
  if (!games.length && !can.manual && !can.feed) return null;
  const run = async (m: string, u: string, b?: unknown) => { const e = await act(m, u, b); setErr(e); return !e; };

  return (
    <Section title="Schedule" action={can.manual && !adding ? <button className="text-sm text-[var(--blue)] font-bold" onClick={() => setAdding(true)} data-testid="button-add-game">Add a game</button> : undefined}>
      {err && <p className="text-sm down mb-2" data-testid="text-schedule-error">{err}</p>}
      {adding && <AddGame teamId={teamId} opponents={data.opponents} onDone={() => setAdding(false)} />}
      {games.length ? (
        <div className="card divide-y divide-[var(--line)]" data-testid="list-schedule">
          {games.map((g: any) => (
            <div key={g.id} className="p-3" data-testid={`row-scheduled-${g.id}`}>
              <div className="flex items-center gap-2">
              <GameLine g={g} teamId={teamId} />
              {can.manual && (g.source === "manual"
                ? <button className="text-xs text-[var(--mute)] shrink-0 px-1" onClick={() => confirm("Take this game off the schedule?") && run("DELETE", `/api/teams/${teamId}/schedule/${g.id}`)} data-testid={`button-remove-game-${g.id}`}>Remove</button>
                : <button className="text-xs text-[var(--mute)] shrink-0 px-1" onClick={() => run("PATCH", `/api/teams/${teamId}/schedule/${g.id}`, { status: g.status === "canceled" ? "scheduled" : "canceled" })} data-testid={`button-cancel-game-${g.id}`}>{g.status === "canceled" ? "Restore" : "Canceled?"}</button>)}
              </div>
              {g.status === "scheduled" && g.rsvp?.member && <div className="mt-2.5"><Rsvp g={g} /></div>}
              {g.status === "scheduled" && (g.rsvp?.member || can.manual) && <Counts g={g} />}
            </div>
          ))}
        </div>
      ) : (
        <div className="card p-4 text-sm text-[var(--mute)]">No games on the schedule yet.{can.feed && !feed?.connected ? " Connect your team calendar below and they'll fill in on their own." : ""}</div>
      )}
      {can.feed && <Feed teamId={teamId} feed={feed} onError={setErr} />}
    </Section>
  );
}

function Feed({ teamId, feed, onError }: { teamId: number; feed: any; onError: (e: string | null) => void }) {
  const [url, setUrl] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [replace, setReplace] = useState(false);
  const call = async (method: string, b?: unknown) => {
    setBusy(true); onError(null); setMsg(null);
    try {
      const r = await (await apiRequest(method, `/api/teams/${teamId}/feed`, b)).json();
      if (method === "DELETE") setMsg(`Disconnected. ${r.removed} upcoming games removed.`);
      else setMsg(`Read ${r.events} games: ${r.added} new, ${r.updated} already here${r.removed ? `, ${r.removed} dropped` : ""}.`);
      setUrl(""); setReplace(false);
      await queryClient.invalidateQueries();
    } catch (e: any) { onError(e.message); }
    setBusy(false);
  };
  return (
    <div className="card p-4 mt-3" data-testid="card-feed">
      <div className="label mb-1">Team calendar</div>
      {feed?.connected && !replace ? (
        <>
          <p className="text-sm">Connected to <b>{feed.host}</b>. Checked {ago(feed.lastSyncedAt)}{feed.lastCount != null ? `, ${feed.lastCount} games` : ""}. It updates every night.</p>
          {feed.lastError && <p className="text-xs down mt-1">Last check failed: {feed.lastError}</p>}
          <div className="grid grid-cols-3 gap-2 mt-3">
            <button className="btn btn-ghost h-10 text-sm" disabled={busy} onClick={() => call("POST")} data-testid="button-feed-sync">{busy ? "Reading…" : "Check now"}</button>
            <button className="btn btn-ghost h-10 text-sm" disabled={busy} onClick={() => setReplace(true)}>New link</button>
            <button className="btn btn-ghost h-10 text-sm" disabled={busy} onClick={() => confirm("Disconnect the calendar? Upcoming games from it come off the schedule.") && call("DELETE")} data-testid="button-feed-disconnect">Disconnect</button>
          </div>
        </>
      ) : (
        <>
          <p className="text-xs text-[var(--mute)]">In the Dash by DaySmart app or the league website, find your team's calendar subscribe link (it starts with webcal:// or https://), copy it, and paste it here. Late Ice reads it every night. The link stays private to you and the team's captains.</p>
          <form className="flex gap-2 mt-3" onSubmit={(e) => { e.preventDefault(); call("PUT", { url }); }}>
            <input className="input flex-1" placeholder="webcal://…" value={url} onChange={(e) => setUrl(e.target.value)} autoCapitalize="off" autoCorrect="off" spellCheck={false} data-testid="input-feed-url" />
            <button className="btn btn-red h-11" disabled={busy || url.length < 12} data-testid="button-feed-connect">{busy ? "Reading…" : "Connect"}</button>
          </form>
          {replace && <button className="text-xs text-[var(--mute)] mt-2" onClick={() => setReplace(false)}>Keep the current link</button>}
        </>
      )}
      {msg && <p className="text-xs text-[var(--mute)] mt-2" data-testid="text-feed-result">{msg}</p>}
    </div>
  );
}

function AddGame({ teamId, opponents, onDone }: { teamId: number; opponents: any[]; onDone: () => void }) {
  const [date, setDate] = useState("");
  const [time, setTime] = useState("");
  const [opp, setOpp] = useState<string>("");
  const [oppName, setOppName] = useState("");
  const [kind, setKind] = useState("tournament");
  const [location, setLocation] = useState("");
  const [side, setSide] = useState<"" | "home" | "away">("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const other = opp === "other";
  const submit = async (e: React.FormEvent) => {
    e.preventDefault(); setBusy(true); setErr(null);
    try {
      await apiRequest("POST", `/api/teams/${teamId}/schedule`, {
        date, time: time || null, kind, location, isHome: side === "home" ? true : side === "away" ? false : null,
        ...(other ? { opponentName: oppName } : { opponentTeamId: Number(opp) || null }),
      });
      await queryClient.invalidateQueries();
      onDone();
    } catch (e: any) { setErr(e.message); }
    setBusy(false);
  };
  return (
    <form className="card p-4 mb-3 space-y-2.5" onSubmit={submit} data-testid="form-add-game">
      <div className="grid grid-cols-2 gap-2">
        <label className="block min-w-0"><span className="label">Date</span><input type="date" className="input w-full mt-1" value={date} onChange={(e) => setDate(e.target.value)} required data-testid="input-game-date" /></label>
        <label className="block min-w-0"><span className="label">Start</span><input type="time" className="input w-full mt-1" value={time} onChange={(e) => setTime(e.target.value)} data-testid="input-game-time" /></label>
      </div>
      <label className="block"><span className="label">Opponent</span>
        <select className="input w-full mt-1" value={opp} onChange={(e) => setOpp(e.target.value)} required data-testid="select-game-opponent">
          <option value="">Pick a team</option>
          {opponents.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
          <option value="other">Another team (type it)</option>
        </select>
      </label>
      {other && <input className="input w-full" placeholder="Their team name" value={oppName} onChange={(e) => setOppName(e.target.value)} required data-testid="input-game-opponent-name" />}
      <div className="grid grid-cols-2 gap-2">
        <label className="block min-w-0"><span className="label">Type</span>
          <select className="input w-full mt-1" value={kind} onChange={(e) => setKind(e.target.value)} data-testid="select-game-kind">
            <option value="tournament">Tournament</option><option value="exhibition">Exhibition</option><option value="playoff">Playoff</option><option value="league">League</option>
          </select>
        </label>
        <label className="block min-w-0"><span className="label">Home or away</span>
          <select className="input w-full mt-1" value={side} onChange={(e) => setSide(e.target.value as any)}>
            <option value="">Not sure</option><option value="home">Home</option><option value="away">Away</option>
          </select>
        </label>
      </div>
      <input className="input w-full" placeholder="Rink or location (optional)" value={location} onChange={(e) => setLocation(e.target.value)} data-testid="input-game-location" />
      {err && <p className="text-sm down">{err}</p>}
      <div className="grid grid-cols-2 gap-2">
        <button type="button" className="btn btn-ghost h-11" onClick={onDone}>Cancel</button>
        <button className="btn btn-red h-11" disabled={busy || !date || !opp} data-testid="button-save-game">{busy ? "Saving…" : "Add game"}</button>
      </div>
    </form>
  );
}
