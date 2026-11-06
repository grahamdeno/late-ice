"use client";
import { createContext, useContext, useState } from "react";
import { Link } from "@/lib/router";

export const img = (p: string) => p;

export interface Team { id: number; name: string; color: string; is_sample?: number; logo?: string | null }
export interface League { id: number; level: string; name: string; blurb: string; season: string; teams: Team[] }
export interface Boot {
  region: { id: number; name: string; state: string };
  rink: any;
  rinkCount?: number;
  leagues: League[];
  counts: { games: number; players: number; sheets: number };
  season: { id: number; name: string; starts_on: string; ends_on: string } | null;
  seasons: { id: number; name: string; starts_on: string; ends_on: string }[];
}
export interface GameCard {
  id: number; playedOn: string | null; startTime: string | null; home: Team; away: Team;
  homeScore: number; awayScore: number; league: { id: number; level: string; name: string }; sheetId: number;
}

export const FilterCtx = createContext<{ leagueId: number | null; setLeagueId: (id: number | null) => void; rinkId: number | null; setRinkId: (id: number) => void; boot?: Boot }>({
  leagueId: null, setLeagueId: () => {}, rinkId: null, setRinkId: () => {},
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
    <section className="mt-8">
      <div className="flex items-end justify-between gap-3 mb-3 px-1">
        <h2 className="min-w-0 text-[18px] font-black tracking-tight">{title}</h2>
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

function Bone({ className = "" }: { className?: string }) {
  return <div className={`rounded-lg bg-[var(--ice-3)] ${className}`} />;
}

/** Shared status marker so a loading screen is findable the same way the dot was. */
function Skeleton({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return <div className={className} role="status" aria-busy="true" aria-label="Loading" data-testid="status-loading">{children}</div>;
}

/** Latest-finals block under the home card. */
export function HomeFeedSkeleton() {
  return (
    <Skeleton className="mt-7">
      <Bone className="h-5 w-28 mb-3" />
      <div className="space-y-3">
        {[0, 1, 2].map((i) => (
          <div key={i} className="card p-4">
            <Bone className="h-3 w-24 mb-3" />
            <Bone className="h-7 w-full mb-2" />
            <Bone className="h-7 w-3/4" />
          </div>
        ))}
      </div>
    </Skeleton>
  );
}

/** Standings first screen: title and one open league table. */
export function StandingsSkeleton() {
  return (
    <Skeleton>
      <Bone className="h-3 w-40" />
      <Bone className="h-8 w-36 mt-2" />
      <div className="card mt-3 overflow-hidden p-4 space-y-3">
        <Bone className="h-4 w-32" />
        {[0, 1, 2, 3, 4, 5].map((i) => <Bone key={i} className="h-8 w-full" />)}
      </div>
    </Skeleton>
  );
}

/** Player rows under the position chips. */
export function PlayersSkeleton() {
  return (
    <Skeleton className="card mt-4 divide-y divide-[var(--line)]">
      {[0, 1, 2, 3, 4, 5, 6, 7].map((i) => (
        <div key={i} className="flex items-center gap-3 px-4 py-3 min-h-[56px]">
          <Bone className="h-5 w-6" />
          <div className="flex-1"><Bone className="h-4 w-40" /><Bone className="h-3 w-28 mt-2" /></div>
          <Bone className="h-6 w-12" />
        </div>
      ))}
    </Skeleton>
  );
}

/** Me first screen: player card, team card, and the rows under it. */
export function MeSkeleton() {
  return (
    <Skeleton>
      <div className="card-hi p-4">
        <div className="flex items-start gap-3">
          <Bone className="h-[60px] w-[60px] rounded-full" />
          <div className="flex-1"><Bone className="h-6 w-36" /><Bone className="h-3 w-24 mt-2" /><Bone className="h-9 w-28 mt-3 rounded-full" /></div>
        </div>
        <Bone className="h-3 w-28 mt-4" />
        <Bone className="h-12 w-24 mt-2" />
      </div>
      <Bone className="h-5 w-24 mt-7 mb-3" />
      <div className="card p-4"><Bone className="h-10 w-full" /></div>
      <div className="card mt-3 h-14" />
      <div className="card mt-3 h-14" />
    </Skeleton>
  );
}

/** Scan first screen: title, viewfinder, and the three steps. */
export function ScanSkeleton() {
  return (
    <Skeleton>
      <Bone className="h-3 w-32" />
      <Bone className="h-10 w-48 mt-2" />
      <Bone className="h-4 w-full mt-3" />
      <div className="card-hi mt-5 p-4">
        <Bone className="aspect-[4/3] w-full rounded-2xl" />
        <div className="grid grid-cols-[1fr_auto] gap-2 mt-4">
          <Bone className="h-12 rounded-[14px]" />
          <Bone className="h-12 w-24 rounded-[14px]" />
        </div>
      </div>
      <div className="mt-6 grid grid-cols-3 gap-2">
        {[0, 1, 2].map((i) => <div key={i} className="card p-3"><Bone className="h-7 w-6 mx-auto" /><Bone className="h-3 w-12 mx-auto mt-2" /></div>)}
      </div>
    </Skeleton>
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

/** Where a Late Ice Rating sits, in league words. The scale runs 1 to 7. */
export function tierOf(r: number | null | undefined) {
  if (r === null || r === undefined) return null;
  if (r >= 5.5) return "A level";
  if (r >= 4.5) return "B level";
  if (r >= 3.5) return "C level";
  if (r >= 2.5) return "D level";
  return "Learning";
}

/**
 * The one "see more" pattern: a row that opens in place. Use it for anything below the first screen
 * that a player sometimes wants. For a whole page of detail, use a chevron row that links instead.
 */
export function More({ title, hint, count, children, defaultOpen = false, testid }: { title: string; hint?: string; count?: number | string; children: React.ReactNode; defaultOpen?: boolean; testid?: string }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="card mt-3 overflow-hidden">
      <button type="button" onClick={() => setOpen((o) => !o)} aria-expanded={open} className="w-full min-h-[52px] px-4 py-3 flex items-center gap-3 text-left" data-testid={testid}>
        <span className="flex-1 min-w-0">
          <span className="block font-bold text-[15px]">{title}</span>
          {hint && <span className="block text-xs text-[var(--mute)] truncate">{hint}</span>}
        </span>
        {count !== undefined && <span className="text-sm text-[var(--mute)] tnum">{count}</span>}
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" aria-hidden="true" style={{ transform: open ? "rotate(180deg)" : "", transition: "transform .2s", color: "var(--mute)" }}><path d="M6 9l6 6 6-6" /></svg>
      </button>
      {open && <div className="border-t border-[var(--line)]">{children}</div>}
    </div>
  );
}

/** A row that opens another page. */
export function RowLink({ href, title, hint, right, testid }: { href: string; title: string; hint?: string; right?: React.ReactNode; testid?: string }) {
  return (
    <Link href={href} className="card mt-3 min-h-[52px] px-4 py-3 flex items-center gap-3" data-testid={testid}>
      <span className="flex-1 min-w-0">
        <span className="block font-bold text-[15px]">{title}</span>
        {hint && <span className="block text-xs text-[var(--mute)] truncate">{hint}</span>}
      </span>
      {right}
      <span className="text-[var(--mute)]" aria-hidden="true">›</span>
    </Link>
  );
}
