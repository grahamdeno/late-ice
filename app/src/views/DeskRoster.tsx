"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "@/lib/router";
import { act, POSITION_LABEL } from "@/lib/auth";
import { DeskFrame, Gate, RinkSwitch, STAFF_KEYS, useDeskRink } from "@/views/Desk";

/**
 * Players and rosters: every roster spot at the rink in one table. Search, filter and sort;
 * fix a number or a position in place; add or remove a player; download it as a spreadsheet.
 */

type Row = {
  id: number; name: string; position: string | null; number: string | null; sub: boolean; teamId: number; team: string; color: string | null;
  leagueId: number; level: string; league: string; registered: boolean; status: string; teamRole: string | null;
  rating: number | null; gamesRated: number; gp: number; g: number; a: number; pts: number;
};
type Data = {
  rink: { id: number; name: string }; season: { id: number; name: string } | null;
  leagues: { id: number; name: string; level: string }[];
  teams: { id: number; name: string; color: string | null; league_id: number; canEdit: boolean }[];
  rows: Row[];
};
type SortKey = "name" | "number" | "position" | "team" | "gp" | "g" | "a" | "pts" | "rating";

const POS = ["C", "W", "F", "D", "G"];
const posGroup = (p: string | null) => (p === "G" ? "G" : p === "D" ? "D" : "F");

export function DeskRoster() {
  return <Gate>{(overview) => <RosterBody overview={overview} />}</Gate>;
}

function RosterBody({ overview }: { overview: any }) {
  const { rink, rinks, pick } = useDeskRink(overview);
  const key = `/api/desk/roster?rink=${rink?.id}`;
  const { data, error } = useQuery<Data>({ queryKey: [key], enabled: !!rink });
  const [search, setSearch] = useState("");
  const [league, setLeague] = useState<number | 0>(0);
  const [team, setTeam] = useState<number | 0>(0);
  const [pos, setPos] = useState<"all" | "F" | "D" | "G">("all");
  const [account, setAccount] = useState<"all" | "yes" | "no">("all");
  const [unrated, setUnrated] = useState(false);
  const [sort, setSort] = useState<{ key: SortKey; dir: 1 | -1 } | null>(null);
  const [adding, setAdding] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const searchRef = useRef<HTMLInputElement>(null);

  // "/" jumps to search, like most desktop tools.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      if (e.key === "/" && !["INPUT", "TEXTAREA", "SELECT"].includes(t.tagName)) { e.preventDefault(); searchRef.current?.focus(); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);
  useEffect(() => { setTeam(0); }, [league]);

  const rows = useMemo(() => {
    if (!data) return [];
    const s = search.trim().toLowerCase().replace(/^#/, "");
    let out = data.rows.filter((r) =>
      (!league || r.leagueId === league) && (!team || r.teamId === team) &&
      (pos === "all" || posGroup(r.position) === pos) &&
      (account === "all" || (account === "yes") === r.registered) &&
      (!unrated || !r.gamesRated) &&
      (!s || r.name.toLowerCase().includes(s) || r.team.toLowerCase().includes(s) || r.number === s));
    if (sort) {
      const v = (r: Row): string | number => {
        switch (sort.key) {
          case "name": return r.name.toLowerCase();
          case "team": return `${r.level} ${r.team}`.toLowerCase();
          case "number": return r.number ? Number(r.number) : 999;
          case "position": return POS.indexOf(r.position ?? "F");
          case "rating": return r.rating ?? -1;
          default: return r[sort.key];
        }
      };
      out = [...out].sort((a, b) => { const x = v(a), y = v(b); return (x < y ? -1 : x > y ? 1 : 0) * sort.dir; });
    }
    return out;
  }, [data, search, league, team, pos, account, unrated, sort]);

  const run = async (method: string, url: string, body?: unknown) => {
    const e = await act(method, url, body, [...STAFF_KEYS, key]);
    setErr(e); return !e;
  };
  const by = (k: SortKey) => setSort((s) => s?.key === k ? (s.dir === 1 ? { key: k, dir: -1 } : null) : { key: k, dir: ["gp", "g", "a", "pts", "rating"].includes(k) ? -1 : 1 });
  const editable = new Set((data?.teams ?? []).filter((t) => t.canEdit).map((t) => t.id));
  const signed = data?.rows.filter((r) => r.registered).length ?? 0;
  const teamCount = new Set(data?.rows.map((r) => r.teamId)).size;
  const filtered = !!(search || league || team || pos !== "all" || account !== "all" || unrated);

  const download = () => {
    const head = ["Name", "Team", "League", "Number", "Position", "Sub", "GP", "G", "A", "PTS", "Rating", "Rated games", "Signed up"];
    const cell = (v: unknown) => { const s = String(v ?? ""); return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
    const lines = [head, ...rows.map((r) => [r.name, r.team, r.league, r.number ?? "", r.position ?? "", r.sub ? "yes" : "", r.gp, r.g, r.a, r.pts, r.rating ?? "", r.gamesRated, r.registered ? "yes" : "no"])];
    const blob = new Blob([lines.map((l) => l.map(cell).join(",")).join("\n")], { type: "text/csv" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `${(data?.rink.name ?? "rink").replace(/\W+/g, "-").toLowerCase()}-rosters.csv`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  };

  return (
    <DeskFrame>
      <div className="text-sm text-[var(--mute)]"><Link href="/desk">Rink Desk</Link> › Players and rosters</div>
      <div className="flex items-center gap-3 flex-wrap mt-1">
        <h1 className="font-black text-[28px] flex-1 min-w-0">Players and rosters</h1>
        <RinkSwitch rink={rink} rinks={rinks} pick={pick} />
        <button className="btn btn-ghost h-11 px-4" onClick={download} disabled={!rows.length} data-testid="button-roster-csv">Download CSV</button>
        {editable.size > 0 && <button className="btn btn-red h-11 px-5" onClick={() => setAdding((v) => !v)} data-testid="button-roster-add">Add player</button>}
      </div>
      {data && <p className="text-[var(--mute)] mt-1">{data.season?.name ? `${data.season.name} · ` : ""}{data.rows.length} roster spots on {teamCount} teams · {signed} signed up</p>}
      {error && <p className="down mt-4">{(error as any).message}</p>}
      {err && <p className="text-sm down mt-3" data-testid="text-error">{err}</p>}
      {adding && data && <AddPlayer teams={data.teams.filter((t) => t.canEdit)} leagues={data.leagues} defaultTeam={team || undefined} onDone={() => setAdding(false)} run={run} />}

      <div className="flex items-center gap-2.5 flex-wrap mt-5" role="search">
        <input ref={searchRef} className="input h-11 w-64" placeholder="Search name, team or #   ( / )" value={search} onChange={(e) => setSearch(e.target.value)} aria-label="Search players" data-testid="input-roster-search" />
        <select className="input h-11 w-auto" value={league} onChange={(e) => setLeague(Number(e.target.value))} aria-label="League" data-testid="select-roster-league">
          <option value={0}>All leagues</option>
          {data?.leagues.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
        </select>
        <select className="input h-11 w-auto" value={team} onChange={(e) => setTeam(Number(e.target.value))} aria-label="Team" data-testid="select-roster-team">
          <option value={0}>All teams</option>
          {data?.teams.filter((t) => !league || t.league_id === league).map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
        </select>
        <div className="flex rounded-xl bg-[var(--ice-3)] p-1" role="group" aria-label="Position">
          {(["all", "F", "D", "G"] as const).map((p) => (
            <button key={p} className={`h-9 px-3 rounded-lg text-sm font-bold ${pos === p ? "bg-[var(--surface)] text-[var(--white)]" : "text-[var(--mute)]"}`} onClick={() => setPos(p)} aria-pressed={pos === p}>
              {p === "all" ? "All" : p === "F" ? "Forwards" : p === "D" ? "Defense" : "Goalies"}
            </button>
          ))}
        </div>
        <select className="input h-11 w-auto" value={account} onChange={(e) => setAccount(e.target.value as any)} aria-label="Signed up" data-testid="select-roster-account">
          <option value="all">Everyone</option><option value="yes">Signed up</option><option value="no">Not signed up</option>
        </select>
        <label className="flex items-center gap-2 text-sm font-bold text-[var(--mute)] px-1"><input type="checkbox" checked={unrated} onChange={(e) => setUnrated(e.target.checked)} /> No rated games</label>
        {filtered && <button className="text-sm font-bold text-[var(--blue)] px-1" onClick={() => { setSearch(""); setLeague(0); setTeam(0); setPos("all"); setAccount("all"); setUnrated(false); }}>Clear filters</button>}
      </div>

      <div className="card mt-4 overflow-x-auto">
        <table className="w-full text-sm border-collapse min-w-[880px]" data-testid="table-roster">
          <thead className="text-left text-[var(--mute)] text-xs">
            <tr className="border-b border-[var(--line)]">
              <Th k="name" sort={sort} by={by} className="pl-5">Player</Th>
              <Th k="number" sort={sort} by={by} className="w-16">#</Th>
              <Th k="position" sort={sort} by={by} className="w-28">Position</Th>
              <Th k="team" sort={sort} by={by}>Team</Th>
              <Th k="gp" sort={sort} by={by} num>GP</Th>
              <Th k="g" sort={sort} by={by} num>G</Th>
              <Th k="a" sort={sort} by={by} num>A</Th>
              <Th k="pts" sort={sort} by={by} num>PTS</Th>
              <Th k="rating" sort={sort} by={by} num>Rating</Th>
              <th className="px-3 py-3 font-bold">Account</th>
              <th className="px-3 py-3 pr-5" aria-label="Actions" />
            </tr>
          </thead>
          <tbody>
            {!data && !error && <tr><td colSpan={11} className="px-5 py-6 text-[var(--mute)]">Loading…</td></tr>}
            {data && !rows.length && <tr><td colSpan={11} className="px-5 py-6 text-[var(--mute)]">{filtered ? "No one matches those filters." : "No roster spots yet."}</td></tr>}
            {rows.map((r) => <RosterRow key={`${r.teamId}-${r.id}`} r={r} canEdit={editable.has(r.teamId)} run={run} />)}
          </tbody>
        </table>
      </div>
      {data && rows.length > 0 && <p className="text-xs text-[var(--mute)] mt-2">{filtered ? `${rows.length} of ${data.rows.length} shown. ` : ""}GP, G and A are this season: the rink&apos;s posted totals plus scanned sheets. Registered players set their own position.</p>}
    </DeskFrame>
  );
}

function Th({ k, sort, by, children, num, className = "" }: { k: SortKey; sort: { key: SortKey; dir: 1 | -1 } | null; by: (k: SortKey) => void; children: React.ReactNode; num?: boolean; className?: string }) {
  const on = sort?.key === k;
  return (
    <th className={`px-3 py-3 font-bold ${num ? "text-right" : ""} ${className}`} aria-sort={on ? (sort!.dir === 1 ? "ascending" : "descending") : "none"}>
      <button className={`inline-flex items-center gap-1 hover:text-[var(--white)] ${on ? "text-[var(--white)]" : ""}`} onClick={() => by(k)}>
        {children}<span aria-hidden="true" className="text-[10px]">{on ? (sort!.dir === 1 ? "▲" : "▼") : ""}</span>
      </button>
    </th>
  );
}

function RosterRow({ r, canEdit, run }: { r: Row; canEdit: boolean; run: (m: string, u: string, b?: unknown) => Promise<boolean> }) {
  const [num, setNum] = useState<string | null>(null);
  const saveNum = async () => {
    if (num === null) return;
    const v = num.replace(/\D/g, "").slice(0, 2);
    if (v !== (r.number ?? "")) await run("PATCH", `/api/teams/${r.teamId}/slots/${r.id}`, { number: v });
    setNum(null);
  };
  const tag = r.teamRole === "captain" ? "C" : r.teamRole === "assistant_captain" ? "A" : null;
  return (
    <tr className="border-b border-[var(--line)] last:border-0 hover:bg-[var(--surface-2)]" data-testid={`row-roster-${r.teamId}-${r.id}`}>
      <td className="pl-5 pr-3 py-2.5">
        <span className="font-bold">{r.name}</span>
        {tag && <span className="ml-1.5 text-xs font-black text-[var(--red)]" title={tag === "C" ? "Captain" : "Assistant captain"}>{tag}</span>}
        {r.sub && <span className="ml-1.5 chip h-5 text-[10px] px-1.5">Sub</span>}
        {r.status !== "active" && <span className="ml-1.5 chip h-5 text-[10px] px-1.5">{r.status === "ir" ? "IR" : "Away"}</span>}
      </td>
      <td className="px-3 py-1.5">
        {canEdit && num !== null ? (
          <input autoFocus className="input h-9 w-14 px-2" inputMode="numeric" value={num} onChange={(e) => setNum(e.target.value)} onBlur={saveNum}
            onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); if (e.key === "Escape") setNum(null); }} aria-label={`Number for ${r.name}`} />
        ) : canEdit ? (
          <button className="h-9 min-w-10 px-2 rounded-lg hover:bg-[var(--ice-3)] text-left" onClick={() => setNum(r.number ?? "")} title="Change number" data-testid={`button-number-${r.teamId}-${r.id}`}>{r.number ? `#${r.number}` : <span className="text-[var(--mute)]">add</span>}</button>
        ) : (r.number ? `#${r.number}` : "")}
      </td>
      <td className="px-3 py-1.5">
        {canEdit && !r.registered ? (
          <select className="input h-9 w-auto px-2 text-sm" value={r.position ?? "F"} onChange={(e) => run("PATCH", `/api/teams/${r.teamId}/slots/${r.id}`, { position: e.target.value })} aria-label={`Position for ${r.name}`}>
            {POS.map((p) => <option key={p} value={p}>{POSITION_LABEL[p]}</option>)}
          </select>
        ) : <span title={r.registered ? "Registered players set their own position" : undefined}>{POSITION_LABEL[r.position ?? ""] ?? "Not set"}</span>}
      </td>
      <td className="px-3 py-2.5">
        <span className="inline-flex items-center gap-2 min-w-0">
          <span className="h-2.5 w-2.5 rounded-full shrink-0" style={{ background: r.color || "var(--mute)" }} />
          <span className="truncate">{r.team}</span><span className="text-[var(--mute)] text-xs">{r.level}</span>
        </span>
      </td>
      <td className="px-3 py-2.5 text-right tabular-nums">{r.gp}</td>
      <td className="px-3 py-2.5 text-right tabular-nums">{r.g}</td>
      <td className="px-3 py-2.5 text-right tabular-nums">{r.a}</td>
      <td className="px-3 py-2.5 text-right tabular-nums font-bold">{r.pts}</td>
      <td className="px-3 py-2.5 text-right tabular-nums">{r.rating != null && r.gamesRated > 0 ? <><span className="font-bold">{r.rating.toFixed(2)}</span> <span className="text-[var(--mute)] text-xs">{r.gamesRated}</span></> : <span className="text-[var(--mute)]">Unrated</span>}</td>
      <td className="px-3 py-2.5">{r.registered ? <span className="up font-bold">Signed up</span> : <span className="text-[var(--mute)]">Not yet</span>}</td>
      <td className="px-3 pr-5 py-2.5 text-right whitespace-nowrap">
        <Link href={`/player/${r.id}`} className="text-[var(--blue)] font-bold text-xs">Open</Link>
        {canEdit && <button className="ml-3 text-xs font-bold text-[var(--mute)] hover:text-[var(--down)]" onClick={() => confirm(`Take ${r.name} off ${r.team}? Games already played keep their stats.`) && run("POST", `/api/teams/${r.teamId}/slots/${r.id}/remove`)} data-testid={`button-remove-${r.teamId}-${r.id}`}>Remove</button>}
      </td>
    </tr>
  );
}

function AddPlayer({ teams, leagues, defaultTeam, onDone, run }: {
  teams: Data["teams"]; leagues: Data["leagues"]; defaultTeam?: number; onDone: () => void; run: (m: string, u: string, b?: unknown) => Promise<boolean>;
}) {
  const [teamId, setTeamId] = useState<number>(defaultTeam && teams.some((t) => t.id === defaultTeam) ? defaultTeam : teams[0]?.id ?? 0);
  const [name, setName] = useState("");
  const [number, setNumber] = useState("");
  const [position, setPosition] = useState("F");
  const [sub, setSub] = useState(false);
  const [busy, setBusy] = useState(false);
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    const ok = await run("POST", `/api/teams/${teamId}/slots`, { name, number, position, sub });
    setBusy(false);
    if (ok) { setName(""); setNumber(""); }
  };
  const leagueName = (id: number) => leagues.find((l) => l.id === id)?.name ?? "";
  return (
    <form onSubmit={submit} className="card p-5 mt-4 flex flex-wrap items-end gap-3" data-testid="form-roster-add">
      <label className="text-sm font-bold text-[var(--mute)]">Team
        <select className="input h-11 mt-1 block w-60" value={teamId} onChange={(e) => setTeamId(Number(e.target.value))}>
          {teams.map((t) => <option key={t.id} value={t.id}>{t.name} · {leagueName(t.league_id)}</option>)}
        </select>
      </label>
      <label className="text-sm font-bold text-[var(--mute)]">First and last name
        <input className="input h-11 mt-1 block w-64" value={name} onChange={(e) => setName(e.target.value)} required autoFocus data-testid="input-add-name" />
      </label>
      <label className="text-sm font-bold text-[var(--mute)]">Number
        <input className="input h-11 mt-1 block w-20" inputMode="numeric" value={number} onChange={(e) => setNumber(e.target.value)} />
      </label>
      <label className="text-sm font-bold text-[var(--mute)]">Position
        <select className="input h-11 mt-1 block w-36" value={position} onChange={(e) => setPosition(e.target.value)}>
          {POS.map((p) => <option key={p} value={p}>{POSITION_LABEL[p]}</option>)}
        </select>
      </label>
      <label className="flex items-center gap-2 text-sm font-bold text-[var(--mute)] h-11"><input type="checkbox" checked={sub} onChange={(e) => setSub(e.target.checked)} /> Sub</label>
      <span className="flex-1" />
      <button type="button" className="btn btn-ghost h-11 px-4" onClick={onDone}>Done</button>
      <button className="btn btn-red h-11 px-5" disabled={busy || name.trim().split(/\s+/).length < 2} data-testid="button-add-save">{busy ? "Adding…" : "Add to roster"}</button>
      <p className="basis-full text-xs text-[var(--mute)]">They claim the spot when they sign up with Late Ice. The form stays open so you can add the next one.</p>
    </form>
  );
}
