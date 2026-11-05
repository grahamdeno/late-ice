"use client";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "@/lib/router";
import { FaceoffDot, LevelPill, Loading, Section, TeamBadge, fmtRating } from "@/lib/ui";
import { useMe, act } from "@/lib/auth";
import { AddButton, AddLeagueForm, AddSeasonForm, EditRinkForm, RinkRequestForm, RINK_ROLE_LABEL } from "@/components/ManageForms";

export default function Rink() {
  const { data } = useQuery<any>({ queryKey: ["/api/rink"] });
  const [open, setOpen] = useState<string | null>(null);
  const close = () => setOpen(null);
  if (!data) return <Loading />;
  const { rink, region, leagues, top, season, seasons } = data;
  const can = data.can ?? {};

  const totalGames = leagues.reduce((s: number, l: any) => s + l.games, 0);
  const totalTeams = leagues.reduce((s: number, l: any) => s + l.teams, 0);
  return (
    <div>
      <div className="label">{region.name}, {region.state} · Home rink</div>
      <h1 className="font-display text-[40px] leading-none font-black uppercase mt-1" data-testid="text-rink-name">{rink.name}</h1>
      {rink.former_name && <div className="text-sm text-[var(--mute)] mt-2">Formerly {rink.former_name}</div>}
      {can.edit && (open === "rink" ? <div className="mt-3"><EditRinkForm rink={rink} onDone={close} /></div> : <div className="mt-2"><button className="text-sm text-[var(--blue)] font-bold" onClick={() => setOpen("rink")} data-testid="button-edit-rink">Edit rink</button></div>)}

      <div className="card-hi mt-5 overflow-hidden">
        {/* Top-down sheet of ice: red center line, blue lines, faceoff dots. */}
        <svg viewBox="0 0 400 170" className="w-full block" aria-label="Rink diagram">
          <rect x="6" y="6" width="388" height="158" rx="60" style={{ fill: "var(--rink)", stroke: "var(--rink-line)" }} strokeWidth="2" />
          <line x1="200" y1="6" x2="200" y2="164" stroke="#FF3B3B" strokeWidth="3" />
          <line x1="140" y1="6" x2="140" y2="164" stroke="#5aa9ff" strokeWidth="4" />
          <line x1="260" y1="6" x2="260" y2="164" stroke="#5aa9ff" strokeWidth="4" />
          <line x1="40" y1="12" x2="40" y2="158" stroke="#FF3B3B" strokeWidth="1.5" opacity=".7" />
          <line x1="360" y1="12" x2="360" y2="158" stroke="#FF3B3B" strokeWidth="1.5" opacity=".7" />
          <circle cx="200" cy="85" r="22" fill="none" stroke="#5aa9ff" strokeWidth="1.5" />
          {[[90, 50], [90, 120], [310, 50], [310, 120]].map(([x, y]) => (
            <g key={`${x}-${y}`}><circle cx={x} cy={y} r="18" fill="none" stroke="#FF3B3B" strokeWidth="1.5" opacity=".8" /><circle cx={x} cy={y} r="3.5" fill="#FF3B3B" /></g>
          ))}
          <circle cx="200" cy="85" r="3" fill="#5aa9ff" />
        </svg>
        <div className="grid grid-cols-3 text-center border-t border-[var(--line)]">
          {[[rink.sheets === 1 ? "Sheet" : "Sheets", rink.sheets], ["Teams", totalTeams], ["Games", totalGames]].map(([k, v]) => (
            <div key={k} className="py-3"><div className="font-display text-2xl tnum">{v}</div><div className="label text-[10px]">{k}</div></div>
          ))}
        </div>
      </div>

      <div className="card mt-3 divide-y divide-[var(--line)] text-sm">
        <div className="p-3.5 flex gap-3"><span className="label w-16 pt-0.5">Address</span><span>{rink.address}</span></div>
        <div className="p-3.5 flex gap-3"><span className="label w-16 pt-0.5">Phone</span><a href={`tel:${rink.phone}`} className="text-[var(--blue)]">{rink.phone}</a></div>
        <div className="p-3.5 flex gap-3"><span className="label w-16 pt-0.5">Ice</span><span>One {rink.surface}</span></div>
        <a href={rink.website} target="_blank" rel="noreferrer" className="p-3.5 flex gap-3 items-center" data-testid="link-rink-website"><span className="label w-16">League</span><span className="text-[var(--blue)] flex-1">Adult hockey league page</span><span>›</span></a>
      </div>

      <Section title="Seasons" action={can.seasons && open !== "season" ? <AddButton label="Season" onClick={() => setOpen("season")} testid="button-rink-add-season" /> : <span className="label">{seasons.filter((s: any) => season && s.starts_on.slice(0, 4) === season.starts_on.slice(0, 4)).length} a year</span>}>
        {open === "season" && <div className="mb-3"><AddSeasonForm rinkId={rink.id} onDone={close} /></div>}
        <div className="flex gap-2 overflow-x-auto scrollbar-none">
          {seasons.map((s: any) => (
            <span key={s.id} className="chip" data-active={season?.id === s.id}>{s.name}</span>
          ))}
        </div>
        <p className="text-[11px] text-[var(--mute)] mt-2 px-1">Every rink sets its own calendar, from one season a year to four. A scanned sheet's date puts the game in the right one.</p>
      </Section>

      <Section title="Leagues at this rink" action={can.addLeague && open !== "league" ? <AddButton label="League" onClick={() => setOpen("league")} testid="button-rink-add-league" /> : undefined}>
        {open === "league" && <div className="mb-3"><AddLeagueForm rinkId={rink.id} onDone={close} /></div>}
        <div className="space-y-2">
          {leagues.map((l: any) => (
            <Link key={l.id} href={`/league/${l.id}`} className="card p-4 flex items-center gap-3" data-testid={`link-rink-league-${l.level}`}>
              <LevelPill level={l.level} />
              <div className="flex-1 min-w-0">
                <div className="font-bold">{l.name}</div>
                <div className="text-xs text-[var(--mute)] truncate">{l.teams} teams · {l.games} games{l.leader && l.leader.gp > 0 ? ` · 1st: ${l.leader.name}` : ""}</div>
              </div>
              <span className="text-[var(--mute)]">›</span>
            </Link>
          ))}
        </div>
      </Section>

      {top.length > 0 && (
        <Section title="Highest rated here">
          <div className="card divide-y divide-[var(--line)]">
            {top.map((p: any, i: number) => (
              <Link key={p.id} href={`/player/${p.id}`} className="flex items-center gap-3 px-4 py-3" data-testid={`row-rink-top-${p.id}`}>
                <span className="w-5 text-center font-display text-lg text-[var(--mute)]">{i + 1}</span>
                <span className="flex-1 font-bold truncate">{p.name}</span>
                <span className="font-display text-xl tnum">{fmtRating(p.rating)}</span>
              </Link>
            ))}
          </div>
        </Section>
      )}

      <RinkAccess rinkId={rink.id} rinkName={rink.name} />

      <Section title="Region">
        <div className="card p-4 flex items-center gap-3">
          <FaceoffDot size={36} />
          <div className="flex-1">
            <div className="font-bold">Wilmington, NC</div>
            <div className="text-xs text-[var(--mute)]">Is your rink missing? Add it and an admin checks it's real.</div>
          </div>
          {data.signedIn ? (open !== "newrink" && <button className="btn btn-ghost h-9 text-sm shrink-0" onClick={() => setOpen("newrink")} data-testid="button-add-missing-rink">Add a rink</button>) : <Link href="/join" className="btn btn-ghost h-9 text-sm shrink-0">Join to add</Link>}
        </div>
        {open === "newrink" && <div className="mt-3"><RinkRequestForm admin={!!can.addRink} onDone={close} /></div>}
      </Section>
    </div>
  );
}

/** "Run this rink?" The request goes to an admin, who confirms with the rink by phone. */
function RinkAccess({ rinkId, rinkName }: { rinkId: number; rinkName: string }) {
  const { me } = useMe();
  const [open, setOpen] = useState(false);
  const [msg, setMsg] = useState("");
  const [role, setRole] = useState("hockey_director");
  const [done, setDone] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const runs = me?.roles?.some((r) => r.role === "rink_manager" && r.scopeId === rinkId);
  if (runs) {
    return <Link href="/staff" className="card mt-6 p-4 flex items-center gap-3" data-testid="link-rink-staff"><span className="flex-1 font-bold text-sm">Manage {rinkName}</span><span>›</span></Link>;
  }
  return (
    <div className="card mt-6 p-4" data-testid="card-rink-access">
      <div className="font-bold text-sm">Run this rink?</div>
      <p className="text-xs text-[var(--mute)] mt-0.5">Hockey directors and league staff can manage seasons, leagues, scorekeepers and disputes here.</p>
      {done ? (
        <p className="text-xs mt-3" data-testid="text-rink-access-sent">Request sent. If you signed in with your work email at the rink's web address, that confirms it. Otherwise we call the rink's listed number. Then Manage shows up on your profile.</p>
      ) : !me ? (
        <Link href="/join" className="btn btn-ghost h-10 mt-3 inline-flex">Join first</Link>
      ) : !open ? (
        <button className="btn btn-ghost h-10 mt-3" onClick={() => setOpen(true)} data-testid="button-rink-access">Request access</button>
      ) : (
        <form className="mt-3 space-y-2" onSubmit={async (e) => { e.preventDefault(); const r = await act("POST", "/api/rink-access", { rinkId, message: msg, role }); setErr(r); if (!r) setDone(true); }}>
          <select className="input w-full" value={role} onChange={(e) => setRole(e.target.value)} data-testid="select-rink-role">
            {Object.entries(RINK_ROLE_LABEL).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
          </select>
          <textarea className="input w-full h-20 py-2" placeholder="Anything that helps us confirm (optional)" value={msg} onChange={(e) => setMsg(e.target.value)} data-testid="input-rink-access" />
          {err && <p className="text-sm down">{err}</p>}
          <button className="btn btn-red h-10 w-full" data-testid="button-rink-access-send">Send request</button>
        </form>
      )}
    </div>
  );
}
