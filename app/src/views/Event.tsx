"use client";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "@/lib/router";
import { act } from "@/lib/auth";
import { BackBar, Empty, GameRow, Loading, Section, TeamBadge, fmtDate } from "@/lib/ui";

const PLACE = ["", "Champion", "Finalist", "Third"];

/** A tournament: its own standings, games, finish and MVP. Nothing here touches league standings. */
export default function EventPage({ id }: { id: string }) {
  const { data } = useQuery<any>({ queryKey: [`/api/events/${id}`] });
  const [err, setErr] = useState<string | null>(null);
  if (!data) return <Loading />;
  const { event: ev, teams, games, players, mvp, me } = data;
  const mvpName = mvp ? players.find((p: any) => p.id === mvp.playerId)?.name : null;
  return (
    <div>
      <BackBar href="/leagues" title="Tournament" />
      <div className="label">{fmtDate(ev.starts_on)}{ev.ends_on !== ev.starts_on ? ` to ${fmtDate(ev.ends_on)}` : ""}{ev.host_rink || ev.location ? ` · ${ev.host_rink ?? ev.location}` : ""}</div>
      <h1 className="font-display text-[40px] leading-none font-black uppercase mt-1" data-testid="text-event-name">{ev.name}</h1>
      <p className="text-xs text-[var(--mute)] mt-2">Tournament games don't count in league standings or season leaders. They move ratings at half weight.</p>
      {err && <p className="text-sm down mt-2">{err}</p>}

      <Section title="Teams">
        {teams.length ? (
          <div className="card divide-y divide-[var(--line)]">
            {teams.map((t: any) => (
              <div key={t.id} className="flex items-center gap-3 px-4 py-3 text-sm" data-testid={`row-event-team-${t.id}`}>
                <TeamBadge team={t} size={26} />
                <Link href={`/team/${t.id}`} className="flex-1 min-w-0"><span className="block font-bold truncate">{t.name}</span><span className="block text-xs text-[var(--mute)] tnum">{t.w}-{t.l}-{t.t} · {t.gf}-{t.ga}{t.place ? ` · ${PLACE[t.place]}` : ""}</span></Link>
                {me.canManage && (
                  <select className="input h-9 text-sm w-[120px]" aria-label={`Finish for ${t.name}`} value={t.place ?? ""} onChange={async (e) => setErr(await act("PATCH", `/api/events/${ev.id}/teams/${t.id}`, { place: e.target.value ? Number(e.target.value) : null }, ["/api/events"]))} data-testid={`select-place-${t.id}`}>
                    <option value="">No finish</option><option value="1">Champion</option><option value="2">Finalist</option><option value="3">Third</option>
                  </select>
                )}
              </div>
            ))}
          </div>
        ) : <Empty title="No teams yet" body="Captains enter their team from this page or their team page." />}
        {me.canEnter?.length > 0 && <div className="mt-2 flex flex-wrap gap-2">{me.canEnter.map((tid: number) => <button key={tid} className="btn btn-ghost h-9 text-sm" onClick={async () => setErr(await act("POST", `/api/events/${ev.id}/teams`, { teamId: tid }, ["/api/events", "/api/me", "/api/teams"]))} data-testid={`button-enter-${tid}`}>Enter my team</button>)}</div>}
      </Section>

      <Section title="MVP" action={mvpName ? <span className="label">{mvp.votes} votes</span> : undefined}>
        {mvpName ? <div className="card-hi p-4 font-black text-lg" data-testid="text-event-mvp">{mvpName}</div> : <p className="text-xs text-[var(--mute)] px-1">Everyone who played votes once. Three votes picks the MVP.</p>}
        {me.canVote && players.length > 1 && (
          <select className="input w-full mt-2" aria-label="Your MVP vote" value={me.vote ?? ""} onChange={async (e) => setErr(await act("PUT", `/api/events/${ev.id}/mvp`, { playerId: e.target.value ? Number(e.target.value) : null }, ["/api/events"]))} data-testid="select-mvp">
            <option value="">Your MVP vote</option>
            {players.map((p: any) => <option key={p.id} value={p.id}>{p.name} · {p.team}</option>)}
          </select>
        )}
      </Section>

      <Section title="Games">
        {games.length ? <div className="space-y-3">{games.map((g: any) => <GameRow key={g.id} g={g} />)}</div> : <Empty title="No games yet" body="Scan each tournament game's sheet and pick this tournament on the review screen." />}
      </Section>
    </div>
  );
}

/** A team's tournaments and trophy case, plus setting one up. */
export function TeamTournaments({ teamId, canManage }: { teamId: number; canManage: boolean }) {
  const { data } = useQuery<any[]>({ queryKey: [`/api/events?team=${teamId}`] });
  const [open, setOpen] = useState(false);
  const [v, setV] = useState({ name: "", startsOn: "", endsOn: "", location: "" });
  const [err, setErr] = useState<string | null>(null);
  if (!data) return null;
  if (!data.length && !canManage) return null;
  const trophies = data.filter((e) => e.place);
  return (
    <Section title="Tournaments" action={canManage && !open ? <button className="text-sm text-[var(--blue)] font-bold" onClick={() => setOpen(true)} data-testid="button-add-tournament">+ Tournament</button> : undefined}>
      {trophies.length > 0 && (
        <div className="flex flex-wrap gap-2 mb-2" data-testid="trophy-case">
          {trophies.map((e) => <Link key={e.id} href={`/event/${e.id}`} className="chip h-8 text-xs"><span className="font-black text-[var(--amber)]">{PLACE[e.place]}</span> {e.name}</Link>)}
        </div>
      )}
      {open && (
        <form className="card p-4 space-y-2.5 mb-2" data-testid="form-add-tournament" onSubmit={async (e) => {
          e.preventDefault();
          const r = await act("POST", "/api/events", { ...v, endsOn: v.endsOn || v.startsOn, teamId }, ["/api/events", "/api/teams"]);
          setErr(r); if (!r) { setOpen(false); setV({ name: "", startsOn: "", endsOn: "", location: "" }); }
        }}>
          <input className="input w-full" placeholder="Tournament name" value={v.name} onChange={(e) => setV({ ...v, name: e.target.value })} required data-testid="input-tournament-name" />
          <div className="grid grid-cols-2 gap-2">
            <label className="block min-w-0"><span className="label">Starts</span><input type="date" className="input w-full mt-1" value={v.startsOn} onChange={(e) => setV({ ...v, startsOn: e.target.value })} required data-testid="input-tournament-start" /></label>
            <label className="block min-w-0"><span className="label">Ends</span><input type="date" className="input w-full mt-1" value={v.endsOn} onChange={(e) => setV({ ...v, endsOn: e.target.value })} /></label>
          </div>
          <input className="input w-full" placeholder="Where (rink and city)" value={v.location} onChange={(e) => setV({ ...v, location: e.target.value })} />
          {err && <p className="text-sm down">{err}</p>}
          <div className="grid grid-cols-2 gap-2"><button type="button" className="btn btn-ghost h-11" onClick={() => setOpen(false)}>Cancel</button><button className="btn btn-red h-11" data-testid="button-save-tournament">Add</button></div>
        </form>
      )}
      {data.length ? (
        <div className="card divide-y divide-[var(--line)]">
          {data.map((e) => (
            <Link key={e.id} href={`/event/${e.id}`} className="flex items-center gap-3 px-4 py-3 text-sm" data-testid={`row-tournament-${e.id}`}>
              <span className="flex-1 min-w-0"><span className="block font-bold truncate">{e.name}</span><span className="block text-xs text-[var(--mute)]">{fmtDate(e.starts_on)}{e.location ? ` · ${e.location}` : ""}</span></span>
              {e.place ? <span className="text-xs font-black text-[var(--amber)]">{PLACE[e.place]}</span> : <span className="text-[var(--mute)]">›</span>}
            </Link>
          ))}
        </div>
      ) : !open && <p className="text-xs text-[var(--mute)] px-1">Playing a tournament? Add it, then scan its sheets. Those games stay out of league standings.</p>}
    </Section>
  );
}
