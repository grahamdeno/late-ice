import { useRef, useState } from "react";
import { Link, useLocation } from "wouter";
import { FaceoffDot, LevelPill, useFilter } from "@/lib/ui";
import { useMe } from "@/lib/auth";
import { SNAPSHOT } from "@/lib/queryClient";

function Icon({ d, active }: { d: string; active: boolean }) {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke={active ? "#EEF3F8" : "#6B7686"} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d={d} />
    </svg>
  );
}

const NAV = [
  { href: "/", label: "Home", d: "M3 10.5L12 3l9 7.5V20a1 1 0 0 1-1 1h-5v-6h-6v6H4a1 1 0 0 1-1-1z" },
  { href: "/leagues", label: "Leagues", d: "M4 20V10M10 20V4M16 20v-7M22 20H2" },
  { href: "/scan", label: "Scan", d: "" },
  { href: "/players", label: "Players", d: "M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8M22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75" },
  { href: "/rink", label: "Rink", d: "M3 7a4 4 0 0 1 4-4h10a4 4 0 0 1 4 4v10a4 4 0 0 1-4 4H7a4 4 0 0 1-4-4zM3 12h18M12 3v18" },
];

export function Shell({ children }: { children: React.ReactNode }) {
  const [loc] = useLocation();
  const { leagueId, setLeagueId, boot } = useFilter();
  const { me } = useMe();
  const [open, setOpen] = useState(false);
  const startY = useRef<number | null>(null);
  const current = boot?.leagues.find((l) => l.id === leagueId);
  const isActive = (href: string) => (href === "/" ? loc === "/" : loc.startsWith(href) || (href === "/leagues" && loc.startsWith("/league")));

  return (
    <div className="min-h-[100dvh] rink-bg">
      <header
        className="fixed top-0 inset-x-0 z-40"
        style={{ paddingTop: "env(safe-area-inset-top)" }}
        onTouchStart={(e) => (startY.current = e.touches[0].clientY)}
        onTouchMove={(e) => {
          if (startY.current !== null && e.touches[0].clientY - startY.current > 36) { setOpen(true); startY.current = null; }
        }}
      >
        <div className="mx-auto max-w-[560px] px-4">
          <div className="mt-2 h-14 rounded-2xl flex items-center justify-between px-3 border border-[var(--line)]" style={{ background: "rgba(11,15,22,.86)", backdropFilter: "blur(14px)" }}>
            <Link href="/" className="flex items-center gap-2" data-testid="link-home-logo" aria-label="late ice home">
              <FaceoffDot size={26} />
              <span style={{ fontWeight: 900, letterSpacing: "-0.03em", fontSize: 19 }}>late ice</span>
            </Link>
            <div className="flex items-center gap-2">
            <button
              onClick={() => setOpen((o) => !o)}
              className="flex items-center gap-2 h-9 pl-3 pr-2 rounded-full bg-[var(--ice-3)] border border-[var(--line)] text-sm font-bold"
              data-testid="button-league-switcher"
              aria-expanded={open}
            >
              {current ? <><LevelPill level={current.level === "DEMO" ? "Demo" : current.level} /> <span className="max-w-[110px] truncate">{current.name}</span></> : <>All Wilmington</>}
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" style={{ transform: open ? "rotate(180deg)" : "", transition: "transform .2s" }}><path d="M6 9l6 6 6-6" /></svg>
            </button>
            {!SNAPSHOT && (
              <Link href={me ? "/me" : "/join"} className="relative h-9 min-w-9 px-2.5 rounded-full bg-[var(--ice-3)] border border-[var(--line)] flex items-center justify-center text-xs font-black" data-testid="link-me" aria-label={me ? "My profile" : "Join"}>
                {me?.user.name ? (me.user.number ? `#${me.user.number}` : me.user.name.split(" ").map((w) => w[0]).join("").slice(0, 2)) : "Join"}
                {me?.unread ? <span className="absolute -top-0.5 -right-0.5 h-2.5 w-2.5 rounded-full bg-[var(--red)] border-2 border-[var(--ice)]" /> : null}
              </Link>
            )}
            </div>
          </div>
          <div className="flex justify-center"><div className="mt-1 h-1 w-10 rounded-full bg-[#263042]" /></div>
        </div>
      </header>

      {open && (
        <div className="fixed inset-0 z-50" onClick={() => setOpen(false)} data-testid="overlay-switcher">
          <div className="absolute inset-0 bg-black/60" />
          <div className="relative mx-auto max-w-[560px] px-4" style={{ paddingTop: "calc(env(safe-area-inset-top) + 8px)" }} onClick={(e) => e.stopPropagation()}>
            <div className="card-hi p-4 drop-in">
              <div className="flex items-center justify-between">
                <div>
                  <div className="label">Region · Rink</div>
                  <div className="font-black text-lg mt-0.5">Wilmington, NC</div>
                  <div className="text-sm text-[var(--mute)]">{boot?.rink?.name}{boot?.season ? ` · ${boot.season.name}` : ""}</div>
                </div>
                <button onClick={() => setOpen(false)} className="h-9 w-9 rounded-full bg-[var(--ice-3)] flex items-center justify-center" aria-label="Close" data-testid="button-close-switcher">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round"><path d="M18 6L6 18M6 6l12 12" /></svg>
                </button>
              </div>
              <div className="grid grid-cols-3 gap-2 mt-4">
                <button
                  className={`rounded-xl p-3 text-left border ${leagueId === null ? "border-[var(--red)] bg-[var(--red-dim)]" : "border-[var(--line)] bg-[var(--ice-3)]"}`}
                  onClick={() => { setLeagueId(null); setOpen(false); }}
                  data-testid="button-filter-all"
                >
                  <div className="font-black">All</div>
                  <div className="text-xs text-[var(--mute)]">Every league</div>
                </button>
                {boot?.leagues.map((l) => (
                  <button
                    key={l.id}
                    className={`rounded-xl p-3 text-left border ${leagueId === l.id ? "border-[var(--red)] bg-[var(--red-dim)]" : "border-[var(--line)] bg-[var(--ice-3)]"}`}
                    onClick={() => { setLeagueId(l.id); setOpen(false); }}
                    data-testid={`button-filter-${l.level}`}
                  >
                    <div className="font-black">{l.level === "40+" ? "40+" : l.level === "DEMO" ? "Demo" : `${l.level} League`}</div>
                    <div className="text-xs text-[var(--mute)]">{l.teams.length} teams</div>
                  </button>
                ))}
              </div>
              <div className="mt-4 rounded-xl border border-dashed border-[var(--line)] p-3 text-xs text-[var(--mute)]">
                More rinks unlock as players scan sheets. Wilmington is rink #1.
              </div>
            </div>
          </div>
        </div>
      )}

      <main className="mx-auto max-w-[560px] px-4 pb-32" style={{ paddingTop: "calc(env(safe-area-inset-top) + 84px)" }}>{children}</main>

      <nav className="fixed bottom-0 inset-x-0 z-40" style={{ paddingBottom: "env(safe-area-inset-bottom)" }}>
        <div className="absolute inset-x-0 bottom-0 h-28 pointer-events-none" style={{ background: "linear-gradient(transparent, var(--ice) 55%)" }} />
        <div className="relative mx-auto max-w-[560px] px-4 pb-3">
          <div className="h-16 rounded-2xl grid grid-cols-5 items-center border border-[var(--line)]" style={{ background: "rgba(11,15,22,.92)", backdropFilter: "blur(14px)" }}>
            {NAV.map((n) =>
              n.href === "/scan" ? (
                <Link key={n.href} href="/scan" className="flex justify-center" data-testid="nav-scan" aria-label="Scan scoresheet">
                  <span className="-mt-7 h-16 w-16 rounded-full flex items-center justify-center border-4 border-[var(--ice)]" style={{ background: "var(--red)", boxShadow: "0 8px 24px rgba(255,59,59,.4)" }}>
                    <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 7V5a2 2 0 0 1 2-2h2M17 3h2a2 2 0 0 1 2 2v2M21 17v2a2 2 0 0 1-2 2h-2M7 21H5a2 2 0 0 1-2-2v-2" /><circle cx="12" cy="12" r="3.2" fill="#fff" stroke="none" /></svg>
                  </span>
                </Link>
              ) : (
                <Link key={n.href} href={n.href} className="flex flex-col items-center gap-1" data-testid={`nav-${n.label.toLowerCase()}`}>
                  <Icon d={n.d} active={isActive(n.href)} />
                  <span className={`text-[10px] font-bold ${isActive(n.href) ? "text-[var(--white)]" : "text-[#6B7686]"}`}>{n.label}</span>
                </Link>
              ),
            )}
          </div>
        </div>
      </nav>
    </div>
  );
}
