import { useState } from "react";
import { API_BASE, SNAPSHOT, setServerBase } from "@/lib/queryClient";
import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import { FaceoffDot, LevelPill, Loading, Section, TeamBadge, fmtRating } from "@/lib/ui";

export default function Rink() {
  const [serverInput, setServerInput] = useState<string>(() => { try { return localStorage.getItem("lateice.server") || ""; } catch { return ""; } });
  const { data } = useQuery<any>({ queryKey: ["/api/rink"] });
  if (!data) return <Loading />;
  const { rink, region, leagues, top, season, seasons } = data;

  const totalGames = leagues.reduce((s: number, l: any) => s + l.games, 0);
  const totalTeams = leagues.reduce((s: number, l: any) => s + l.teams, 0);
  return (
    <div>
      <div className="label">{region.name}, {region.state} · Home rink</div>
      <h1 className="font-display text-[40px] leading-none font-black uppercase mt-1" data-testid="text-rink-name">{rink.name}</h1>
      <div className="text-sm text-[var(--mute)] mt-2">Formerly {rink.former_name}</div>

      <div className="card-hi mt-5 overflow-hidden">
        {/* Top-down sheet of ice: red center line, blue lines, faceoff dots. */}
        <svg viewBox="0 0 400 170" className="w-full block" aria-label="Rink diagram">
          <rect x="6" y="6" width="388" height="158" rx="60" fill="#0e141e" stroke="#2a3446" strokeWidth="2" />
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

      <Section title="Server" action={<span className="label">{SNAPSHOT ? "Read-only mirror" : "Connected"}</span>}>
        <div className="card p-4 text-sm">
          <p className="text-[var(--mute)]">
            {SNAPSHOT
              ? "This copy shows a snapshot of the data. To scan sheets and sign in, enter the address of a running Late Ice server."
              : API_BASE
                ? `Talking to ${API_BASE}.`
                : "Talking to the server this page was loaded from."}
          </p>
          <form className="flex gap-2 mt-3" onSubmit={(e) => { e.preventDefault(); setServerBase(serverInput); }}>
            <input className="input flex-1" placeholder="https://late-ice.onrender.com" value={serverInput} onChange={(e) => setServerInput(e.target.value)} data-testid="input-server" />
            <button className="btn btn-ghost" type="submit" data-testid="button-server-save">Save</button>
          </form>
        </div>
      </Section>

      <Section title="Seasons" action={<span className="label">{seasons.filter((s: any) => season && s.starts_on.slice(0, 4) === season.starts_on.slice(0, 4)).length} a year</span>}>
        <div className="flex gap-2 overflow-x-auto scrollbar-none">
          {seasons.map((s: any) => (
            <span key={s.id} className="chip" data-active={season?.id === s.id}>{s.name}</span>
          ))}
        </div>
        <p className="text-[11px] text-[var(--mute)] mt-2 px-1">Every rink sets its own calendar, from one season a year to four. A scanned sheet's date puts the game in the right one.</p>
      </Section>

      <Section title="Leagues at this rink">
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

      <Section title="Region">
        <div className="card p-4 flex items-center gap-3">
          <FaceoffDot size={36} />
          <div className="flex-1">
            <div className="font-bold">Wilmington, NC</div>
            <div className="text-xs text-[var(--mute)]">1 rink live. Next up: rinks within a couple hours' drive, as their players start scanning.</div>
          </div>
        </div>
      </Section>
    </div>
  );
}
