"use client";
import { createContext, useContext } from "react";
import { Link } from "@/lib/router";

export const img = (p: string) => p;

export interface Team { id: number; name: string; color: string; is_sample?: number; logo?: string | null }
export interface League { id: number; level: string; name: string; blurb: string; season: string; teams: Team[] }
export interface Boot {
  region: { id: number; name: string; state: string };
  rink: any;
  leagues: League[];
  counts: { games: number; players: number; sheets: number };
  season: { id: number; name: string; starts_on: string; ends_on: string } | null;
  seasons: { id: number; name: string; starts_on: string; ends_on: string }[];
}
export interface GameCard {
  id: number; playedOn: string | null; startTime: string | null; home: Team; away: Team;
  homeScore: number; awayScore: number; league: { id: number; level: string; name: string }; sheetId: number;
}

export const FilterCtx = createContext<{ leagueId: number | null; setLeagueId: (id: number | null) => void; boot?: Boot }>({
  leagueId: null, setLeagueId: () => {},
});
export const useFilter = () => useContext(FilterCtx);

export const fmtRating = (r: number | null | undefined) => (r === null || r === undefined ? "–" : r.toFixed(2));
export const fmtDelta = (d: number | null | undefined) =>
  d === null || d === undefined ? "" : `${d >= 0 ? "+" : "−"}${Math.abs(d).toFixed(3)}`;

export function fmtDate(d: string | null) {
  if (!d) return "Date unread";
  const dt = new Date(d + "T12:00:00");
  return dt.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
}

export function FaceoffDot({ size = 28, className = "", pulse = false }: { size?: number; className?: string; pulse?: boolean }) {
  return (
    <svg viewBox="0 0 64 64" width={size} height={size} className={className} aria-hidden="true">
      <circle cx="32" cy="32" r="20" fill="none" stroke="#FF3B3B" strokeWidth="3.5" />
      <g stroke="#FF3B3B" strokeWidth="3.5" strokeLinecap="round"><path d="M12 27H5M12 37H5M52 27h7M52 37h7" /></g>
      <g style={{ stroke: "var(--white)" }} strokeWidth="2.5" strokeLinecap="round" fill="none"><path d="M24 24v4h-5M40 24v4h5M24 40v-4h-5M40 40v-4h5" /></g>
      <circle cx="32" cy="32" r="5" fill="#FF3B3B" className={pulse ? "pulse-dot" : ""} />
    </svg>
  );
}

export function Wordmark({ className = "" }: { className?: string }) {
  return (
    <span className={`inline-flex items-center gap-2 ${className}`} aria-label="Late Ice">
      <FaceoffDot size={26} />
      <span style={{ fontWeight: 900, letterSpacing: "-0.03em", fontSize: 20 }}>Late Ice</span>
    </span>
  );
}

export function TeamBadge({ team, size = 32 }: { team: Team; size?: number }) {
  if (team.logo) {
    return (
      <img
        src={team.logo}
        alt={team.name}
        className="rounded-full shrink-0 object-cover"
        style={{ width: size, height: size, border: `1.5px solid ${team.color}`, background: "#000" }}
      />
    );
  }
  const initials = team.name.split(/\s+/).filter((w) => /[A-Za-z]/.test(w[0])).slice(0, 2).map((w) => w[0]).join("").toUpperCase();
  return (
    <span
      className="inline-flex items-center justify-center rounded-full shrink-0 font-black"
      style={{ width: size, height: size, background: team.color + "26", color: team.color, border: `1.5px solid ${team.color}`, fontSize: size * 0.36 }}
    >
      {initials}
    </span>
  );
}

export function LevelPill({ level }: { level: string }) {
  return (
    <span className="inline-flex items-center justify-center h-5 min-w-[28px] px-1.5 rounded-md text-[11px] font-black" style={{ background: "var(--red-dim)", color: "var(--red)" }}>
      {level}
    </span>
  );
}

export function Delta({ d, className = "" }: { d: number | null | undefined; className?: string }) {
  if (d === null || d === undefined) return null;
  return <span className={`tnum font-bold ${d >= 0 ? "up" : "down"} ${className}`}>{fmtDelta(d)}</span>;
}

export function GameRow({ g }: { g: GameCard }) {
  const homeWon = g.homeScore >= g.awayScore, awayWon = g.awayScore >= g.homeScore;
  return (
    <Link href={`/game/${g.id}`} className="card block p-4 hover:border-[var(--line-2)] transition-colors" data-testid={`card-game-${g.id}`}>
      <div className="flex items-center justify-between gap-2 mb-3">
        <div className="flex items-center gap-2 min-w-0 text-xs text-[var(--mute)] whitespace-nowrap overflow-hidden">
          <LevelPill level={g.league.level === "DEMO" ? "Demo" : g.league.level} /> <span>{fmtDate(g.playedOn)}</span>{g.startTime && <span>· {g.startTime}</span>}
        </div>
        <span className="label shrink-0">{(g as any).event ? "Final · Tournament" : (g as any).source === "daysmart" ? "Final · DaySmart" : "Final"}</span>
      </div>
      {[[g.home, g.homeScore, homeWon], [g.away, g.awayScore, awayWon]].map(([t, s, w]: any, i) => (
        <div key={i} className="flex items-center gap-3 py-1">
          <TeamBadge team={t} size={28} />
          <span className={`flex-1 truncate ${w ? "font-bold" : "text-[var(--mute)]"}`}>{t.name}</span>
          <span className={`font-display text-2xl tnum ${w ? "" : "text-[var(--mute)]"}`}>{s}</span>
        </div>
      ))}
    </Link>
  );
}

export function Section({ title, action, children }: { title: string; action?: React.ReactNode; children: React.ReactNode }) {
  return (
    <section className="mt-7">
      <div className="flex items-end justify-between gap-3 mb-3 px-1">
        <h2 className="min-w-0 text-[17px] font-black tracking-tight">{title}</h2>
        {action}
      </div>
      {children}
    </section>
  );
}

export function Empty({ title, body, action }: { title: string; body: string; action?: React.ReactNode }) {
  return (
    <div className="card p-6 text-center">
      <div className="flex justify-center mb-3"><FaceoffDot size={40} /></div>
      <div className="font-bold">{title}</div>
      <p className="text-sm text-[var(--mute)] mt-1 max-w-xs mx-auto">{body}</p>
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

export function Loading() {
  return (
    <div className="flex justify-center py-16" data-testid="status-loading"><FaceoffDot size={44} pulse /></div>
  );
}

export function BackBar({ title, href }: { title?: string; href: string }) {
  return (
    <div className="flex items-center gap-2 mb-4">
      <Link href={href} className="h-9 w-9 rounded-full card flex items-center justify-center" data-testid="button-back" aria-label="Back">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round"><path d="M15 18l-6-6 6-6" /></svg>
      </Link>
      {title && <span className="label">{title}</span>}
    </div>
  );
}
