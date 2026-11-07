"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link, useLocation } from "@/lib/router";
import { useMe, act, ROLE_LABEL } from "@/lib/auth";
import { apiRequest, invalidatePrefixes } from "@/lib/queryClient";
import { FaceoffDot, useFilter } from "@/lib/ui";
import { GoalieDisputes, Requests, RinkLeads, Signups } from "@/views/Staff";

/**
 * Rink Desk: the computer view for rink staff. A sidebar frame, a home page with what's waiting,
 * and lineups for imported games. Everything else still opens the phone screens under /staff.
 */

export const STAFF_KEYS = ["/api/staff", "/api/me", "/api/players", "/api/teams", "/api/rinks", "/api/rink", "/api/leagues", "/api/standings", "/api/bootstrap", "/api/desk"];

export const day = (s: string | null) => {
  if (!s) return "No date";
  const d = new Date(String(s).length === 10 ? `${s}T12:00:00` : s);
  return Number.isNaN(d.getTime()) ? String(s) : d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
};

type Gap = { team_id: number; name: string; color: string | null; league_id: number; league: string; level: string; games: number; with_lineup: number };

/** Which rink the desk is showing: the one picked in the app if staff can see it, else the first. */
export function useDeskRink(overview: any) {
  const { rinkId, setRinkId } = useFilter();
  const live = (overview?.rinks ?? []).filter((r: any) => !r.archived_at);
  const rink = live.find((r: any) => r.id === rinkId) ?? live[0] ?? null;
  return { rink, rinks: live, pick: (id: number) => setRinkId(id) };
}

function NavItem({ href, label, active, badge }: { href: string; label: string; active: boolean; badge?: number }) {
  return (
    <Link href={href} aria-current={active ? "page" : undefined}
      className={`flex items-center gap-2.5 px-3 h-10 rounded-xl font-bold text-sm ${active ? "bg-[var(--surface)] text-[var(--white)]" : "text-[var(--mute)] hover:text-[var(--white)] hover:bg-[var(--surface)]"}`}
      data-testid={`desk-nav-${label.toLowerCase().replace(/\W+/g, "-")}`}>
      <span className="flex-1">{label}</span>
      {!!badge && <span className="rounded-full bg-[var(--red-btn)] text-white text-xs px-2 leading-5">{badge}</span>}
    </Link>
  );
}

export function DeskFrame({ children, waiting }: { children: React.ReactNode; waiting?: number }) {
  const [path] = useLocation();
  const { me } = useMe();
  const { data: overview } = useQuery<any>({ queryKey: ["/api/staff/overview"], enabled: !!me });
  const top = (overview?.roles ?? []).find((r: any) => ["admin", "support", "rink_manager", "commissioner"].includes(r.role));
  const canImport = (overview?.rinks ?? []).some((r: any) => r.can?.edit);
  const { rink } = useDeskRink(overview);
  const { data: queue } = useQuery<any>({ queryKey: [`/api/desk/sheets?rink=${rink?.id}`], enabled: !!rink, retry: false });
  const sheets = queue?.open?.filter((r: any) => r.status !== "processing").length || undefined;
  return (
    <div className="min-h-[100dvh] bg-[var(--ice)] text-[var(--white)] flex flex-wrap" data-testid="desk">
      <nav aria-label="Rink Desk" className="flex-[1_1_240px] lg:max-w-[260px] bg-[var(--ice-2)] px-3 py-5 flex flex-col gap-1 lg:min-h-[100dvh] lg:sticky lg:top-0 lg:self-start">
        <Link href="/desk" className="flex items-center gap-2.5 px-3 pb-4">
          <FaceoffDot size={22} />
          <span className="font-black text-lg">Rink Desk</span>
        </Link>
        <NavItem href="/desk" label="Home" active={path === "/desk"} badge={waiting} />
        <NavItem href="/desk/sheets" label="Scoresheets" active={path.startsWith("/desk/sheets")} badge={sheets} />
        <NavItem href="/desk/roster" label="Players and rosters" active={path.startsWith("/desk/roster")} />
        <NavItem href="/desk/lineups" label="Games and lineups" active={path.startsWith("/desk/lineups")} />
        <NavItem href="/desk/ratings" label="Ratings" active={path.startsWith("/desk/ratings")} />
        {canImport && <NavItem href="/desk/imports" label="Imports" active={path.startsWith("/desk/imports")} />}
        <div className="label px-3 pt-5 pb-1">Phone screens</div>
        <NavItem href="/staff" label="Leagues, teams and staff" active={false} />
        <NavItem href="/" label="Open the app" active={false} />
        <div className="mt-auto px-3 pt-6 text-xs text-[var(--mute)]">{me?.user.name ?? ""}{top ? ` · ${ROLE_LABEL[top.role]}` : ""}</div>
      </nav>
      <main className="flex-[999_1_640px] min-w-0 px-5 sm:px-9 py-7">{children}</main>
    </div>
  );
}

/** Signed in, staff, and the overview loaded; otherwise the right message. */
export function Gate({ children }: { children: (overview: any) => React.ReactNode }) {
  const { me, loading } = useMe();
  const { data, error } = useQuery<any>({ queryKey: ["/api/staff/overview"], enabled: !!me });
  if (loading) return <DeskFrame><p className="text-[var(--mute)]">Loading…</p></DeskFrame>;
  if (!me) return (
    <DeskFrame>
      <h1 className="font-black text-2xl">Rink Desk</h1>
      <p className="text-[var(--mute)] mt-2">Sign in with the email you use in Late Ice.</p>
      <Link href="/join" className="btn btn-red h-11 px-5 mt-5 inline-flex">Sign in</Link>
    </DeskFrame>
  );
  if (error) return <DeskFrame><h1 className="font-black text-2xl">Rink Desk</h1><p className="text-[var(--mute)] mt-2">{(error as any).message}</p></DeskFrame>;
  if (!data) return <DeskFrame><p className="text-[var(--mute)]">Loading…</p></DeskFrame>;
  return <>{children(data)}</>;
}

/** Rink picker for pages that read a whole rink; hidden when there's only one. */
export function RinkSwitch({ rink, rinks, pick }: { rink: any; rinks: any[]; pick: (id: number) => void }) {
  if (rinks.length < 2) return null;
  return (
    <select className="input h-11 w-auto font-bold" value={rink?.id ?? ""} onChange={(e) => pick(Number(e.target.value))} aria-label="Rink" data-testid="select-desk-rink">
      {rinks.map((r: any) => <option key={r.id} value={r.id}>{r.name}</option>)}
    </select>
  );
}

/* ---------- home ---------- */

export function DeskHome() {
  return <Gate>{(overview) => <HomeBody overview={overview} />}</Gate>;
}

function Tile({ n, label, tone, href }: { n: number | undefined; label: string; tone?: "red"; href?: string }) {
  const inner = (
    <>
      <div className={`font-display font-black text-[40px] leading-none ${tone === "red" && n ? "text-[var(--red)]" : ""}`}>{n ?? "–"}</div>
      <div className="text-sm text-[var(--mute)] mt-2">{label}</div>
    </>
  );
  return href ? <Link href={href} className="card p-5 block hover:bg-[var(--surface-2)]">{inner}</Link> : <div className="card p-5">{inner}</div>;
}

function HomeBody({ overview }: { overview: any }) {
  const { rink, rinks, pick } = useDeskRink(overview);
  const [err, setErr] = useState<string | null>(null);
  const signups = useQuery<any[]>({ queryKey: ["/api/staff/signups"] }).data;
  const requests = useQuery<any[]>({ queryKey: ["/api/staff/requests"] }).data;
  const goalies = useQuery<any[]>({ queryKey: ["/api/staff/goalie-disputes"] }).data;
  const leads = useQuery<any[]>({ queryKey: ["/api/staff/leads"], enabled: !!(overview.isAdmin || overview.isSupport) }).data;
  const gaps = useQuery<Gap[]>({ queryKey: [`/api/desk/gaps?rink=${rink?.id}`], enabled: !!rink }).data;
  const sheetsOpen = useQuery<any>({ queryKey: [`/api/desk/sheets?rink=${rink?.id}`], enabled: !!rink, retry: false }).data?.open?.filter((r: any) => r.status !== "processing").length ?? 0;
  const run = async (method: string, url: string, body?: unknown) => { const e = await act(method, url, body, STAFF_KEYS); setErr(e); return !e; };

  const missing = gaps?.reduce((n, g) => n + (g.games - g.with_lineup), 0);
  const openLeads = leads?.filter((l) => !["won", "lost"].includes(l.status)).length ?? 0;
  const waiting = (signups?.length ?? 0) + (requests?.length ?? 0) + (goalies?.length ?? 0);
  const nothing = signups && requests && goalies && !waiting && !openLeads;
  const today = new Date().toISOString().slice(0, 10);
  const season = rink?.seasons?.find((s: any) => s.starts_on <= today && (!s.ends_on || s.ends_on >= today)) ?? rink?.seasons?.[0];
  const leagues = (rink?.leagues ?? []).filter((l: any) => !l.archived_at);
  const teams = leagues.reduce((n: number, l: any) => n + l.teams.filter((t: any) => !t.archived_at && !t.is_sample).length, 0);

  return (
    <DeskFrame waiting={waiting || undefined}>
      <div className="flex items-center gap-3 flex-wrap">
        <h1 className="font-black text-[28px] flex-1 min-w-0 truncate" data-testid="text-desk-rink">{rink?.name ?? "No rink yet"}</h1>
        {rinks.length > 1 && (
          <select className="input h-11 w-auto font-bold" value={rink?.id ?? ""} onChange={(e) => pick(Number(e.target.value))} aria-label="Rink" data-testid="select-desk-rink">
            {rinks.map((r: any) => <option key={r.id} value={r.id}>{r.name}</option>)}
          </select>
        )}
        <Link href="/desk/lineups" className="btn btn-red h-11 px-5" data-testid="link-desk-lineups">Add lineups</Link>
      </div>
      {rink && <p className="text-[var(--mute)] mt-1">{[season?.name, `${leagues.length} leagues`, `${teams} teams`].filter(Boolean).join(" · ")}</p>}
      {err && <p className="text-sm down mt-3" data-testid="text-error">{err}</p>}

      <div className="grid grid-cols-2 xl:grid-cols-4 gap-3.5 mt-6">
        <Tile n={signups?.length} label="Sign-ups to let in" tone="red" />
        <Tile n={requests?.length} label="Requests to answer" tone="red" />
        <Tile n={goalies?.length} label="Goalie numbers to settle" tone="red" />
        <Tile n={missing} label="Games with no lineup" href="/desk/lineups" />
      </div>
      {!!sheetsOpen && (
        <Link href="/desk/sheets" className="card mt-3.5 px-5 py-4 flex items-center gap-3 hover:bg-[var(--surface-2)]" data-testid="link-desk-sheets">
          <span className="font-display font-black text-2xl text-[var(--red)]">{sheetsOpen}</span>
          <span className="flex-1 font-bold">{sheetsOpen === 1 ? "Scoresheet to check" : "Scoresheets to check"}</span>
          <span className="text-sm font-bold text-[var(--blue)]">Check them ›</span>
        </Link>
      )}

      <div className="grid gap-5 mt-2 xl:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
        <div className="min-w-0">
          {nothing && (
            <section className="mt-7">
              <h2 className="font-black text-lg">Waiting on you</h2>
              <div className="card p-5 mt-3 text-[var(--mute)]">Nothing waiting. New sign-ups, requests and goalie numbers show up here.</div>
            </section>
          )}
          <Requests run={run} />
          <Signups run={run} />
          <GoalieDisputes run={run} />
          {(overview.isAdmin || overview.isSupport) && <RinkLeads run={run} />}
        </div>
        <div className="min-w-0">
          <section className="mt-7">
            <div className="flex items-baseline gap-3"><h2 className="font-black text-lg flex-1">Lineups for imported games</h2><Link href="/desk/lineups" className="text-sm font-bold text-[var(--blue)]">All teams</Link></div>
            <p className="text-sm text-[var(--mute)] mt-1">DaySmart sends scores, not who played. A game rates players once its lineup is in.</p>
            <div className="card mt-3 divide-y divide-[var(--line)]">
              {!gaps && <p className="p-4 text-sm text-[var(--mute)]">Loading…</p>}
              {gaps && gaps.length === 0 && <p className="p-4 text-sm text-[var(--mute)]">No imported games at this rink yet.</p>}
              {gaps?.slice().sort((a, b) => (b.games - b.with_lineup) - (a.games - a.with_lineup)).slice(0, 8).map((g) => <GapRow key={g.team_id} g={g} />)}
            </div>
          </section>
          <section className="mt-7">
            <div className="flex items-baseline gap-3"><h2 className="font-black text-lg flex-1">Leagues</h2>{rink && <Link href={`/staff/rink/${rink.id}`} className="text-sm font-bold text-[var(--blue)]">Manage</Link>}</div>
            <div className="card mt-3 divide-y divide-[var(--line)]">
              {leagues.length === 0 && <p className="p-4 text-sm text-[var(--mute)]">No leagues yet.</p>}
              {leagues.map((l: any) => (
                <Link key={l.id} href={`/staff/league/${l.id}`} className="grid grid-cols-[36px_minmax(0,1fr)_auto_auto] gap-2.5 items-center px-5 py-3 hover:bg-[var(--surface-2)]">
                  <span className="font-black text-[var(--red)]">{l.level}</span>
                  <span className="font-bold truncate">{l.name}</span>
                  <span className="text-xs text-[var(--mute)]">{l.teams.filter((t: any) => !t.archived_at && !t.is_sample).length} teams</span>
                  <span className="text-[var(--mute)]">›</span>
                </Link>
              ))}
            </div>
          </section>
        </div>
      </div>
    </DeskFrame>
  );
}

function GapRow({ g }: { g: Gap }) {
  const left = g.games - g.with_lineup;
  const pct = g.games ? Math.round((g.with_lineup / g.games) * 100) : 0;
  return (
    <Link href={`/desk/lineups/${g.team_id}`} className="flex items-center gap-3 px-5 py-3 hover:bg-[var(--surface-2)]" data-testid={`row-gap-${g.team_id}`}>
      <span className="h-2.5 w-2.5 rounded-full shrink-0" style={{ background: g.color || "var(--mute)" }} />
      <span className="flex-1 min-w-0">
        <span className="block font-bold text-sm truncate">{g.name}</span>
        <span className="block text-xs text-[var(--mute)] truncate">{g.league}</span>
      </span>
      <span className="w-24 h-1.5 rounded-full bg-[var(--ice-3)] overflow-hidden shrink-0" aria-hidden="true"><span className="block h-full bg-[var(--up)]" style={{ width: `${pct}%` }} /></span>
      <span className={`text-xs font-bold w-20 text-right shrink-0 ${left ? "text-[var(--amber)]" : "text-[var(--up)]"}`}>{left ? `${left} to add` : "All in"}</span>
    </Link>
  );
}

/* ---------- games and lineups: every team ---------- */

export function DeskTeams() {
  return <Gate>{(overview) => <TeamsBody overview={overview} />}</Gate>;
}

function TeamsBody({ overview }: { overview: any }) {
  const { rink, rinks, pick } = useDeskRink(overview);
  const { data: gaps } = useQuery<Gap[]>({ queryKey: [`/api/desk/gaps?rink=${rink?.id}`], enabled: !!rink });
  const byLeague = useMemo(() => {
    const m = new Map<number, { league: string; level: string; teams: Gap[] }>();
    for (const g of gaps ?? []) {
      if (!m.has(g.league_id)) m.set(g.league_id, { league: g.league, level: g.level, teams: [] });
      m.get(g.league_id)!.teams.push(g);
    }
    return [...m.values()];
  }, [gaps]);
  const missing = gaps?.reduce((n, g) => n + (g.games - g.with_lineup), 0) ?? 0;
  return (
    <DeskFrame>
      <div className="text-sm text-[var(--mute)]"><Link href="/desk">Rink Desk</Link> › Games and lineups</div>
      <div className="flex items-center gap-3 flex-wrap mt-1">
        <h1 className="font-black text-[28px] flex-1">Lineups for imported games</h1>
        {rinks.length > 1 && (
          <select className="input h-11 w-auto font-bold" value={rink?.id ?? ""} onChange={(e) => pick(Number(e.target.value))} aria-label="Rink">
            {rinks.map((r: any) => <option key={r.id} value={r.id}>{r.name}</option>)}
          </select>
        )}
      </div>
      <p className="text-[var(--mute)] mt-1 max-w-3xl">DaySmart sends scores and who got points, not who dressed. Pick a team, tick who played each game, and those players are rated from it. {gaps ? (missing ? `${missing} games still need a lineup.` : "Every imported game has a lineup.") : ""}</p>
      {!gaps && <p className="text-[var(--mute)] mt-6">Loading…</p>}
      {gaps && gaps.length === 0 && <div className="card p-5 mt-6 text-[var(--mute)]">No imported games here yet, or none on teams you look after.</div>}
      <div className="grid gap-5 mt-6 lg:grid-cols-2">
        {byLeague.map((l) => (
          <section key={l.league} className="card">
            <div className="px-5 pt-4 pb-2 flex items-baseline gap-2"><span className="font-black text-[var(--red)]">{l.level}</span><h2 className="font-black">{l.league}</h2></div>
            <div className="divide-y divide-[var(--line)] border-t border-[var(--line)]">{l.teams.map((g) => <GapRow key={g.team_id} g={g} />)}</div>
          </section>
        ))}
      </div>
    </DeskFrame>
  );
}

/* ---------- one team's lineups ---------- */

type TeamData = {
  team: { id: number; name: string; color: string | null; league: string; level: string; rink_id: number; rink: string };
  players: { id: number; name: string; position: string | null; number: string | null }[];
  games: { id: number; playedOn: string | null; opponent: string; home: boolean; us: number | null; them: number | null; result: "W" | "L" | "T" | null; lineup: number[]; credited: { playerId: number; goals: number; assists: number }[] }[];
};

export function DeskLineups({ teamId }: { teamId: string }) {
  return <Gate>{(overview) => <LineupsBody teamId={teamId} isAdmin={!!overview.isAdmin} />}</Gate>;
}

/** Admins can replay ratings now instead of waiting for the nightly run. */
function Recalc() {
  const [state, setState] = useState<string>("idle");
  const go = async () => {
    setState("busy");
    try {
      const r = await (await apiRequest("POST", "/api/staff/recompute")).json();
      await invalidatePrefixes(["/api/players", "/api/teams", "/api/games", "/api/me"]);
      setState(`Rated ${r.games} games.`);
    } catch (e: any) { setState(e?.message ?? "Couldn't recalculate."); }
  };
  return (
    <span className="flex items-center gap-3">
      {state !== "idle" && state !== "busy" && <span className="text-sm text-[var(--mute)]" data-testid="text-recalc">{state}</span>}
      <button className="btn btn-ghost h-10 px-4 text-sm" onClick={go} disabled={state === "busy"} data-testid="button-recalc">{state === "busy" ? "Recalculating…" : "Recalculate ratings now"}</button>
    </span>
  );
}

function LineupsBody({ teamId, isAdmin }: { teamId: string; isAdmin: boolean }) {
  const key = `/api/desk/lineups/${teamId}`;
  const { data, error } = useQuery<TeamData>({ queryKey: [key] });
  const [gameId, setGameId] = useState<number | null>(null);
  const [ticked, setTicked] = useState<Set<number>>(new Set());
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [pasting, setPasting] = useState(false);
  const [paste, setPaste] = useState("");
  const [unmatched, setUnmatched] = useState<string[]>([]);

  const games = data?.games ?? [];
  const game = games.find((g) => g.id === gameId) ?? null;
  const credited = useMemo(() => new Map((game?.credited ?? []).map((c) => [c.playerId, c] as const)), [game]);

  // Open on the newest game without a lineup, or the newest game.
  useEffect(() => {
    if (!data || gameId != null) return;
    const first = data.games.find((g) => !g.lineup.length) ?? data.games[0];
    if (first) setGameId(first.id);
  }, [data, gameId]);
  // Load the selected game's saved lineup (credited players always ticked). A background
  // refresh never wipes ticks you haven't saved.
  const loaded = useRef<number | null>(null);
  useEffect(() => {
    if (!game) return;
    if (loaded.current === game.id && dirty) return;
    loaded.current = game.id;
    setTicked(new Set([...game.lineup, ...game.credited.map((c) => c.playerId)]));
    setDirty(false); setErr(null); setUnmatched([]);
  }, [game, dirty]);

  // Leaving with unsaved ticks asks first.
  useEffect(() => {
    if (!dirty) return;
    const warn = (e: BeforeUnloadEvent) => { e.preventDefault(); e.returnValue = ""; };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);

  if (error) return <DeskFrame><BackCrumb /><h1 className="font-black text-2xl mt-1">Lineups</h1><p className="text-[var(--mute)] mt-2">{(error as any).message}</p></DeskFrame>;
  if (!data) return <DeskFrame><BackCrumb /><p className="text-[var(--mute)] mt-4">Loading…</p></DeskFrame>;

  const choose = (id: number) => {
    if (id === gameId) return;
    if (dirty && !confirm("You have ticks you haven't saved. Leave this game anyway?")) return;
    setNote(null); setPasting(false); setGameId(id);
  };
  const toggle = (id: number) => {
    if (credited.has(id)) return;
    setTicked((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });
    setDirty(true); setNote(null);
  };
  const idx = games.findIndex((g) => g.id === gameId);
  // "Last game" is the closest earlier game with a lineup (the list is newest first).
  const previous = idx >= 0 ? games.slice(idx + 1).find((g) => g.lineup.length) : undefined;
  const copyLast = () => {
    if (!previous) return;
    const roster = new Set(data.players.map((p) => p.id));
    setTicked(new Set([...previous.lineup.filter((id) => roster.has(id)), ...credited.keys()]));
    setDirty(true); setNote(`Copied the lineup from ${day(previous.playedOn)}. Untick anyone who missed this one.`);
  };
  const clearAll = () => { setTicked(new Set(credited.keys())); setDirty(true); setNote(null); };
  const runMatch = async () => {
    setErr(null);
    try {
      const r = await (await apiRequest("POST", `${key}/match`, { text: paste })).json();
      setTicked((s) => new Set([...s, ...r.matched.map((m: any) => m.playerId)]));
      setUnmatched(r.unmatched);
      setDirty(true); setPasting(false); setPaste("");
      setNote(`Matched ${r.matched.length} name${r.matched.length === 1 ? "" : "s"}.${r.unmatched.length ? " Tick the rest by hand." : ""}`);
    } catch (e: any) { setErr(e?.message ?? "Couldn't match those names."); }
  };
  const save = async () => {
    if (!game) return;
    setSaving(true); setErr(null);
    try {
      // Only the locked (credited) players ticked means "no lineup": a partial lineup would rate just them.
      const ids = [...ticked].some((id) => !credited.has(id)) ? [...ticked] : [];
      await apiRequest("PUT", `${key}/${game.id}`, { playerIds: ids });
      await invalidatePrefixes([key, "/api/desk/gaps", "/api/players", "/api/games", "/api/teams"]);
      setDirty(false);
      const next = games.slice(idx + 1).find((g) => !g.lineup.length) ?? games.find((g) => !g.lineup.length && g.id !== game.id);
      setNote(ids.length ? `Saved ${ids.length} players. Ratings pick this up overnight.` : "Lineup cleared. This game is unrated for the team.");
      if (next) setTimeout(() => setGameId(next.id), 600);
    } catch (e: any) { setErr(e?.message ?? "Couldn't save the lineup."); }
    finally { setSaving(false); }
  };

  const withLineup = games.filter((g) => g.lineup.length).length;
  const skaters = data.players.filter((p) => p.position !== "G");
  const goalies = data.players.filter((p) => p.position === "G");

  return (
    <DeskFrame>
      <BackCrumb team={data.team.name} />
      <div className="flex items-center gap-3 flex-wrap mt-1">
        <h1 className="font-black text-[28px] flex-1 min-w-0">{data.team.name}</h1>
        {isAdmin && <Recalc />}
      </div>
      <p className="text-[var(--mute)] mt-1">{data.team.league} · {data.team.rink}. Tick who played. Players DaySmart credited with a point are ticked and locked: they played.</p>

      <div className="flex flex-wrap gap-5 mt-6 items-start">
        <section aria-label="Games" className="card flex-[1_1_320px] max-w-[400px] py-1.5">
          <div className="px-5 py-3 font-black">{games.length} games · {withLineup} with lineups</div>
          {games.length === 0 && <p className="px-5 pb-4 text-sm text-[var(--mute)]">No imported games for this team.</p>}
          {games.map((g) => (
            <button key={g.id} onClick={() => choose(g.id)} aria-current={g.id === gameId ? "true" : undefined}
              className={`w-full text-left flex items-center gap-3 px-5 py-3 border-t border-[var(--line)] ${g.id === gameId ? "bg-[var(--surface-2)]" : "hover:bg-[var(--surface-2)]"}`}
              data-testid={`button-desk-game-${g.id}`}>
              <span className={`font-black w-4 ${g.result === "W" ? "up" : g.result === "L" ? "down" : "text-[var(--mute)]"}`}>{g.result ?? "·"}</span>
              <span className={`flex-1 min-w-0 truncate ${g.id === gameId ? "font-bold" : ""}`}>{g.us ?? "–"}-{g.them ?? "–"} {g.home ? "vs" : "at"} {g.opponent} <span className="text-[var(--mute)] font-medium">{day(g.playedOn)}</span></span>
              <span className={`text-xs shrink-0 ${g.lineup.length ? "text-[var(--mute)]" : "text-[var(--amber)] font-bold"}`}>{g.lineup.length ? `${g.lineup.length} in` : "No lineup"}</span>
            </button>
          ))}
        </section>

        {game && (
          <section aria-label="Lineup" className="card flex-[999_1_520px] min-w-0 p-5">
            <div className="flex items-center gap-2.5 flex-wrap">
              <h2 className="font-black text-xl flex-1 min-w-0">{day(game.playedOn)} · {game.result ? `${game.result} ` : ""}{game.us ?? "–"}-{game.them ?? "–"} {game.home ? "vs" : "at"} {game.opponent}</h2>
              <button className="btn btn-ghost h-10 px-3.5 text-sm" onClick={copyLast} disabled={!previous} title={previous ? `From ${day(previous.playedOn)}` : "No earlier game has a lineup yet"} data-testid="button-copy-last">Copy last game</button>
              <button className="btn btn-ghost h-10 px-3.5 text-sm" onClick={() => setPasting((v) => !v)} data-testid="button-paste-names">Paste names</button>
              <button className="btn btn-ghost h-10 px-3.5 text-sm" onClick={clearAll} data-testid="button-clear-lineup">Clear</button>
            </div>

            {pasting && (
              <div className="mt-4">
                <label className="block text-sm font-bold text-[var(--mute)]" htmlFor="paste-names">Paste the poll or group text. One name per line, or separated by commas. Jersey numbers work too.</label>
                <textarea id="paste-names" className="input mt-2 w-full h-32 py-2.5" value={paste} onChange={(e) => setPaste(e.target.value)} placeholder={"Steve L\nAndy F\n#12"} data-testid="input-paste-names" />
                <div className="flex gap-2 mt-2">
                  <button className="btn btn-red h-10 px-4 text-sm" onClick={runMatch} disabled={!paste.trim()} data-testid="button-match-names">Tick these players</button>
                  <button className="btn btn-ghost h-10 px-4 text-sm" onClick={() => { setPasting(false); setPaste(""); }}>Cancel</button>
                </div>
              </div>
            )}
            {unmatched.length > 0 && <p className="text-sm text-[var(--amber)] mt-3" data-testid="text-unmatched">No match for: {unmatched.join(", ")}</p>}

            <div className="grid gap-2 mt-4 grid-cols-[repeat(auto-fill,minmax(190px,1fr))]">
              {skaters.map((p) => <PlayerTick key={p.id} p={p} on={ticked.has(p.id)} credit={credited.get(p.id)} onClick={() => toggle(p.id)} />)}
            </div>
            {goalies.length > 0 && (
              <>
                <div className="label mt-5">Goalies</div>
                <div className="grid gap-2 mt-2 grid-cols-[repeat(auto-fill,minmax(190px,1fr))]">
                  {goalies.map((p) => <PlayerTick key={p.id} p={p} on={ticked.has(p.id)} credit={credited.get(p.id)} onClick={() => toggle(p.id)} />)}
                </div>
              </>
            )}

            <div className="flex items-center gap-3.5 mt-5 flex-wrap">
              <span className="flex-1 text-sm text-[var(--mute)]" data-testid="text-ticked">{ticked.size} of {data.players.length} ticked{dirty ? " · not saved yet" : ""}</span>
              <button className="btn btn-red h-11 px-5" onClick={save} disabled={saving || !dirty} data-testid="button-save-lineup">{saving ? "Saving…" : "Save lineup"}</button>
            </div>
            {note && <p className="text-sm up mt-3" data-testid="text-lineup-note">{note}</p>}
            {err && <p className="text-sm down mt-3" data-testid="text-error">{err}</p>}
          </section>
        )}
      </div>
    </DeskFrame>
  );
}

function BackCrumb({ team }: { team?: string }) {
  return <div className="text-sm text-[var(--mute)]"><Link href="/desk">Rink Desk</Link> › <Link href="/desk/lineups">Games and lineups</Link>{team ? ` › ${team}` : ""}</div>;
}

function PlayerTick({ p, on, credit, onClick }: { p: TeamData["players"][number]; on: boolean; credit?: { goals: number; assists: number }; onClick: () => void }) {
  return (
    <label className={`flex items-center gap-2.5 min-h-12 px-3.5 rounded-xl cursor-pointer select-none ${on ? "bg-[rgba(56,217,150,.12)]" : "bg-[var(--ice-3)]"} ${credit ? "cursor-default" : ""}`} data-testid={`tick-player-${p.id}`}>
      <input type="checkbox" className="h-4 w-4 accent-[var(--up)]" checked={on} disabled={!!credit} onChange={onClick} />
      <span className={`flex-1 min-w-0 truncate ${on ? "font-bold" : "text-[var(--mute)]"}`}>{p.name}{p.number ? <span className="text-[var(--mute)] font-medium"> #{p.number}</span> : null}</span>
      {credit ? <span className="text-xs up shrink-0">{credit.goals}G {credit.assists}A</span> : p.position === "G" ? <span className="text-xs text-[var(--mute)] shrink-0">G</span> : null}
    </label>
  );
}
