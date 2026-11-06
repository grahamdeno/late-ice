"use client";
import { useEffect, useRef, useState } from "react";
import { Link, useLocation, useNavTrail } from "@/lib/router";
import { FaceoffDot, LevelPill, useFilter } from "@/lib/ui";
import { useMe } from "@/lib/auth";
import { RinkPicker } from "@/components/RinkPicker";

function Icon({ d, active }: { d: string; active: boolean }) {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" style={{ stroke: active ? "var(--white)" : "var(--dim)" }} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d={d} />
    </svg>
  );
}

const NAV = [
  { href: "/", label: "Home", d: "M3 10.5L12 3l9 7.5V20a1 1 0 0 1-1 1h-5v-6h-6v6H4a1 1 0 0 1-1-1z" },
  { href: "/leagues", label: "Standings", d: "M4 20V10M10 20V4M16 20v-7M22 20H2" },
  { href: "/scan", label: "Scan", d: "" },
  { href: "/players", label: "Players", d: "M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8M22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75" },
  { href: "/me", label: "Me", d: "M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2M12 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8" },
];

// Appears while you scroll back up on a long page; hides when you scroll down or stop.
function BackToTop() {
  const [show, setShow] = useState(false);
  useEffect(() => {
    let last = window.scrollY, idle: ReturnType<typeof setTimeout> | undefined;
    const onScroll = () => {
      const y = window.scrollY;
      if (y < last - 4 && y > window.innerHeight * 1.5) setShow(true);
      else if (y > last + 4 || y < 200) setShow(false);
      last = y;
      clearTimeout(idle);
      idle = setTimeout(() => setShow(false), 1200);
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => { window.removeEventListener("scroll", onScroll); clearTimeout(idle); };
  }, []);
  const go = () => {
    const calm = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    window.scrollTo({ top: 0, behavior: calm ? "auto" : "smooth" });
    setShow(false);
  };
  return (
    <button
      onClick={go}
      aria-label="Back to top"
      tabIndex={show ? 0 : -1}
      data-testid="button-back-to-top"
      className="glass fixed left-1/2 z-40 h-10 px-4 rounded-full flex items-center gap-1.5 text-sm font-bold"
      style={{
        bottom: "calc(env(safe-area-inset-bottom) + 96px)",
        transform: `translate(-50%, ${show ? "0" : "12px"})`,
        opacity: show ? 1 : 0,
        pointerEvents: show ? "auto" : "none",
        transition: "opacity .2s, transform .2s",
      }}
    >
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M12 19V5M5 12l7-7 7 7" /></svg>
      Top
    </button>
  );
}

export function Shell({ children }: { children: React.ReactNode }) {
  useNavTrail();
  const [loc] = useLocation();
  const { leagueId, setLeagueId, rinkId, setRinkId, boot } = useFilter();
  const [, go] = useLocation();
  const [picking, setPicking] = useState(false);
  const { me } = useMe();
  const [open, setOpen] = useState(false);
  const startY = useRef<number | null>(null);
  const current = boot?.leagues.find((l) => l.id === leagueId);

  // While the top sheet is open the page underneath stays put (iPhone ignores overflow:hidden alone).
  useEffect(() => {
    if (!open) return;
    const y = window.scrollY, b = document.body.style;
    const prev = { position: b.position, top: b.top, left: b.left, right: b.right, overflow: b.overflow };
    Object.assign(b, { position: "fixed", top: `-${y}px`, left: "0", right: "0", overflow: "hidden" });
    return () => { Object.assign(b, prev); window.scrollTo(0, y); };
  }, [open]);
  const isActive = (href: string) => (href === "/" ? loc === "/" : loc.startsWith(href) || (href === "/leagues" && (loc.startsWith("/league") || loc.startsWith("/team"))) || (href === "/me" && (loc.startsWith("/settings") || loc.startsWith("/join"))));

  return (
    <div className="min-h-[100dvh] rink-bg w-full overflow-x-clip">
      <header
        className="fixed top-0 inset-x-0 z-40"
        // Pulling on the bar opens the sheet; it never drags the page with it.
        style={{ paddingTop: "env(safe-area-inset-top)", touchAction: "none" }}
        onTouchStart={(e) => (startY.current = e.touches[0].clientY)}
        onTouchMove={(e) => {
          if (startY.current !== null && e.touches[0].clientY - startY.current > 36) { setOpen(true); startY.current = null; }
        }}
      >
        <div className="mx-auto max-w-[560px] px-4">
          <div className="mt-2 h-14 rounded-2xl flex items-center justify-between gap-2 px-3 overflow-hidden glass">
            <Link href="/" className="flex items-center gap-2 shrink-0" data-testid="link-home-logo" aria-label="Late Ice home">
              <FaceoffDot size={26} />
              <span className="whitespace-nowrap" style={{ fontWeight: 900, letterSpacing: "-0.03em", fontSize: 19 }}>Late Ice</span>
            </Link>
            <div className="flex items-center gap-1.5 min-w-0">
            <button
              onClick={() => setOpen((o) => !o)}
              className="flex items-center gap-1.5 min-w-0 h-9 pl-3 pr-2 rounded-full bg-[var(--ice-3)] border border-[var(--line)] text-sm font-bold"
              data-testid="button-league-switcher"
              aria-expanded={open}
            >
              {current ? <><LevelPill level={current.level === "DEMO" ? "Demo" : current.level} /> <span className="min-w-0 max-w-[170px] truncate">{current.name}</span></> : <span className="min-w-0 max-w-[200px] truncate" data-testid="text-pill-rink">{boot?.rink?.name ?? "Late Ice"}</span>}
              <svg className="shrink-0" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" style={{ transform: open ? "rotate(180deg)" : "", transition: "transform .2s" }}><path d="M6 9l6 6 6-6" /></svg>
            </button>
            </div>
          </div>
          <div className="flex justify-center"><div className="mt-1 h-1 w-10 rounded-full bg-[var(--grip)]" /></div>
        </div>
      </header>

      {open && (
        <div className="fixed inset-0 z-50 overflow-y-auto overscroll-contain" style={{ touchAction: "pan-y" }} onClick={() => setOpen(false)} data-testid="overlay-switcher">
          <div className="fixed inset-0 bg-black/60" style={{ touchAction: "none" }} />
          <div className="relative mx-auto max-w-[560px] px-4" style={{ paddingTop: "calc(env(safe-area-inset-top) + 8px)" }} onClick={(e) => e.stopPropagation()}>
            <div className="glass-sheet rounded-[20px] p-4 drop-in">
              <div className="flex items-center justify-between">
                <div>
                  <div className="label">Rink</div>
                  <div className="font-black text-lg mt-0.5">{boot?.rink?.name}</div>
                  <div className="text-sm text-[var(--mute)]">{boot?.region ? `${boot.region.name}, ${boot.region.state}` : ""}{boot?.season ? ` · ${boot.season.name}` : ""}</div>
                  <div className="flex items-center gap-4 mt-1">
                    <button className="min-h-[36px] text-sm font-bold text-[var(--blue)]" onClick={() => setPicking((p) => !p)} data-testid="button-change-rink">{picking ? "Keep this rink" : "Change rink"}</button>
                    {!picking && <Link href="/rink" onClick={() => setOpen(false)} className="min-h-[36px] inline-flex items-center text-sm font-bold text-[var(--blue)]" data-testid="link-rink-details">Rink details</Link>}
                  </div>
                </div>
                <button onClick={() => { setOpen(false); setPicking(false); }} className="h-9 w-9 rounded-full bg-[var(--ice-3)] flex items-center justify-center" aria-label="Close" data-testid="button-close-switcher">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round"><path d="M18 6L6 18M6 6l12 12" /></svg>
                </button>
              </div>
              {picking ? (
                <div className="mt-4"><RinkPicker value={rinkId} onPick={(id) => { setRinkId(id); setPicking(false); setOpen(false); }} onAdd={() => { setPicking(false); setOpen(false); go("/rink?add=1"); }} /></div>
              ) : (
              <div className="grid grid-cols-3 gap-2 mt-4">
                <button
                  className={`rounded-xl p-3 text-left border ${leagueId === null ? "border-[var(--red)] bg-[var(--red-dim)]" : "border-[var(--line)] bg-[var(--ice-3)]"}`}
                  onClick={() => { setLeagueId(null); setOpen(false); }}
                  data-testid="button-filter-all"
                >
                  <div className="font-black">All</div>
                  <div className="text-xs text-[var(--mute)]">Every league</div>
                </button>
                {boot?.leagues.filter((l) => l.level !== "DEMO" && l.level !== "TOURN").map((l) => (
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
              )}
              {!picking && boot?.leagues && boot.leagues.filter((l) => l.level !== "DEMO" && l.level !== "TOURN").length === 0 && (
                <div className="mt-3 rounded-xl border border-dashed border-[var(--line)] p-3 text-xs text-[var(--mute)]">No leagues here yet. The rink's staff or a captain can add them from the Rink tab.</div>
              )}
            </div>
          </div>
        </div>
      )}

      <main className="mx-auto max-w-[560px] min-w-0 px-4 pb-36 break-words" style={{ paddingTop: "calc(env(safe-area-inset-top) + 84px)" }}>{children}</main>

      <BackToTop />

      <nav className="fixed bottom-0 inset-x-0 z-40" style={{ paddingBottom: "env(safe-area-inset-bottom)" }}>
        <div className="relative mx-auto max-w-[560px] px-4 pb-3">
          <div className="h-16 rounded-2xl grid grid-cols-5 items-center glass">
            {NAV.map((n) =>
              n.href === "/scan" ? (
                <Link key={n.href} href="/scan" className="flex justify-center" data-testid="nav-scan" aria-label="Scan scoresheet">
                  <span className="-mt-7 h-16 w-16 rounded-full flex items-center justify-center border-4 border-[var(--ice)]" style={{ background: "var(--red)", boxShadow: "inset 0 1px 0 rgba(255,255,255,.35), 0 8px 24px rgba(255,59,59,.35)" }}>
                    <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 7V5a2 2 0 0 1 2-2h2M17 3h2a2 2 0 0 1 2 2v2M21 17v2a2 2 0 0 1-2 2h-2M7 21H5a2 2 0 0 1-2-2v-2" /><circle cx="12" cy="12" r="3.2" fill="#fff" stroke="none" /></svg>
                  </span>
                </Link>
              ) : (
                <Link key={n.href} href={n.href === "/me" && !me ? "/join" : n.href} className="flex flex-col items-center justify-center gap-1 min-h-[48px]" data-testid={`nav-${n.href === "/" ? "home" : n.href.slice(1)}`} aria-current={isActive(n.href) ? "page" : undefined}>
                  <span className="relative"><Icon d={n.d} active={isActive(n.href)} />{n.href === "/me" && me?.unread ? <span className="absolute -top-0.5 -right-1 h-2.5 w-2.5 rounded-full bg-[var(--red)] border-2 border-[var(--ice)]" /> : null}</span>
                  <span className={`text-[11px] font-bold ${isActive(n.href) ? "text-[var(--white)]" : "text-[var(--dim)]"}`}>{n.href === "/me" && !me ? "Join" : n.label}</span>
                </Link>
              ),
            )}
          </div>
        </div>
      </nav>
    </div>
  );
}
