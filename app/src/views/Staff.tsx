"use client";
import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link, useLocation } from "@/lib/router";
import { useMe, act, ROLE_LABEL } from "@/lib/auth";
import { apiRequest, invalidatePrefixes } from "@/lib/queryClient";
import { BackBar, Empty, LevelPill, Loading, Section, TeamBadge } from "@/lib/ui";
import { AddButton, AddLeagueForm, AddSeasonForm, AddTeamForm, EditRinkForm, RinkRequestForm, RINK_ROLE_LABEL } from "@/components/ManageForms";

const when = (s: string) => new Date(s).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });

/**
 * Staff tools, one level at a time: home (what's waiting, help desk, every rink, admin),
 * then a rink (details, seasons, leagues, staff, import), then a league (settings and teams).
 */
export default function Staff({ rinkId, leagueId }: { rinkId?: string; leagueId?: string } = {}) {
  const [, , swap] = useLocation();
  const { me, loading } = useMe();
  const { data, error } = useQuery<any>({ queryKey: ["/api/staff/overview"], enabled: !!me });
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => { if (!loading && !me) swap("/join"); }, [loading, me, swap]);
  if (loading || !me) return <Loading />;
  if (error) return <div><BackBar href="/me" to="Profile" /><Empty title="Staff only" body={(error as any).message} /></div>;
  if (!data) return <Loading />;
  const run = async (method: string, url: string, body?: unknown) => { const e = await act(method, url, body, ["/api/staff", "/api/me", "/api/players", "/api/teams", "/api/rinks", "/api/rink", "/api/leagues", "/api/standings", "/api/bootstrap"]); setErr(e); return !e; };
  const errLine = err && <p className="text-sm down mt-3" data-testid="text-error">{err}</p>;

  if (leagueId) {
    const rink = data.rinks.find((r: any) => r.leagues.some((l: any) => String(l.id) === leagueId));
    const league = rink?.leagues.find((l: any) => String(l.id) === leagueId);
    if (!rink || !league) return <div><BackBar href="/staff" to="Manage" /><Empty title="League not found" body="It may have been removed, or it's outside what you manage." /></div>;
    return <div><BackBar href={`/staff/rink/${rink.id}`} to={rink.name} />{errLine}<LeagueLevel rink={rink} league={league} run={run} onGone={() => swap(`/staff/rink/${rink.id}`)} /></div>;
  }
  if (rinkId) {
    const rink = data.rinks.find((r: any) => String(r.id) === rinkId);
    if (!rink) return <div><BackBar href="/staff" to="Manage" /><Empty title="Rink not found" body="It may have been removed, or it's outside what you manage." /></div>;
    return <div><BackBar href="/staff" to="Manage" />{errLine}<RinkLevel rink={rink} run={run} onGone={() => swap("/staff")} /></div>;
  }

  const live = data.rinks.filter((r: any) => !r.archived_at);
  const archived = data.rinks.filter((r: any) => r.archived_at);
  return (
    <div>
      <BackBar href="/me" to="Profile" />
      <h1 className="font-black text-2xl">Manage</h1>
      <div className="flex flex-wrap gap-1.5 mt-2">
        {data.roles.filter((r: any) => !["captain", "assistant_captain"].includes(r.role)).map((r: any) => (
          <span key={r.id} className="chip h-7 text-[11px]">{ROLE_LABEL[r.role]}{r.where ? ` · ${r.where}` : ""}</span>
        ))}
      </div>
      {errLine}

      <Requests run={run} />
      <Signups run={run} />
      <GoalieDisputes run={run} />
      {(data.isAdmin || data.isSupport) && <RinkLeads run={run} />}
      {data.isSupport || data.isAdmin ? <SupportDesk run={run} isAdmin={data.isAdmin} /> : null}
      <Section title={data.isAdmin ? "Rinks" : live.length === 1 ? "Your rink" : "Your rinks"} action={<span className="label">{live.length}</span>}>
        <div className="card divide-y divide-[var(--line)]">
          {live.length === 0 && <p className="p-4 text-xs text-[var(--mute)]">No rinks yet.</p>}
          {live.map((r: any) => <DrillRow key={r.id} href={`/staff/rink/${r.id}`} title={r.name} hint={[[r.city, r.state].filter(Boolean).join(", "), `${r.leagues.filter((l: any) => !l.archived_at).length} leagues`].filter(Boolean).join(" · ")} testid={`row-staff-rink-${r.id}`} />)}
        </div>
        {data.isAdmin && <AddRink />}
        {archived.length > 0 && <Archived count={archived.length} what="rink">{archived.map((r: any) => <DrillRow key={r.id} href={`/staff/rink/${r.id}`} title={r.name} hint="Archived" testid={`row-staff-rink-${r.id}`} />)}</Archived>}
      </Section>
      {data.isAdmin && <AdminSection data={data} run={run} />}
      <Audit rinks={data.rinks} broad={data.isSupport || data.isAdmin} />
    </div>
  );
}

type Run = (method: string, url: string, body?: unknown) => Promise<boolean>;

function DrillRow({ href, title, hint, left, testid }: { href: string; title: string; hint?: string; left?: React.ReactNode; testid?: string }) {
  return (
    <Link href={href} className="flex items-center gap-3 px-4 py-3 min-h-[56px]" data-testid={testid}>
      {left}
      <span className="flex-1 min-w-0"><span className="block font-bold text-sm truncate">{title}</span>{hint && <span className="block text-xs text-[var(--mute)] truncate">{hint}</span>}</span>
      <span className="text-[var(--mute)]">›</span>
    </Link>
  );
}

function Archived({ count, what, children }: { count: number; what: string; children: React.ReactNode }) {
  return (
    <details className="mt-3">
      <summary className="text-xs text-[var(--mute)] font-bold px-1 cursor-pointer">Archived · {count} {what}{count === 1 ? "" : "s"}</summary>
      <div className="card mt-2 divide-y divide-[var(--line)] opacity-80">{children}</div>
    </details>
  );
}

function AddRink() {
  const [open, setOpen] = useState(false);
  return <div className="mt-3">{open ? <RinkRequestForm admin onDone={() => setOpen(false)} /> : <AddButton label="Rink" onClick={() => setOpen(true)} testid="button-add-rink" />}</div>;
}

/** Archive, restore and delete, kept together at the bottom of each level and spelled out. */
function Lifecycle({ what, name, archived, canArchive, canDelete, deleteBlocked, onArchive, onDelete }: {
  what: string; name: string; archived: boolean; canArchive: boolean; canDelete: boolean; deleteBlocked: string;
  onArchive: (on: boolean) => void; onDelete: () => void;
}) {
  if (!canArchive && !canDelete) return null;
  return (
    <Section title={archived ? "Archived" : "Archive or delete"}>
      <div className="card p-4 space-y-3">
        {canArchive && (
          <div className="flex items-center gap-3">
            <span className="flex-1 text-xs text-[var(--mute)]">{archived
              ? `Hidden from players. Restoring puts ${name} back in lists and standings.`
              : `Hides ${name} from pickers, lists and standings. Games, stats and ratings stay, and you can restore it.`}</span>
            <button className="btn btn-ghost h-10 shrink-0" onClick={() => (archived || confirm(`Archive ${name}?`)) && onArchive(!archived)} data-testid={`button-${archived ? "restore" : "archive"}-${what}`}>{archived ? "Restore" : "Archive"}</button>
          </div>
        )}
        <div className="flex items-center gap-3 border-t border-[var(--line)] pt-3">
          <span className="flex-1 text-xs text-[var(--mute)]">{canDelete ? `Nothing is attached to this ${what}, so it can be deleted for good.` : deleteBlocked}</span>
          <button className="btn btn-ghost h-10 shrink-0 down" disabled={!canDelete} onClick={() => prompt(`Type ${name} to delete it for good.`)?.trim() === name && onDelete()} data-testid={`button-delete-${what}`}>Delete</button>
        </div>
      </div>
    </Section>
  );
}

function RinkLevel({ rink, run, onGone }: { rink: any; run: Run; onGone: () => void }) {
  const [open, setOpen] = useState<string | null>(null);
  const close = () => setOpen(null);
  const live = rink.leagues.filter((l: any) => !l.archived_at);
  const archived = rink.leagues.filter((l: any) => l.archived_at);
  return (
    <div>
      <div className="label">Rink{rink.archived_at ? " · archived" : ""}</div>
      <div className="flex items-start gap-2">
        <h1 className="font-black text-2xl flex-1">{rink.name}</h1>
        {rink.can?.edit && open !== "rink" && <button className="text-sm text-[var(--blue)] font-bold mt-1.5" onClick={() => setOpen("rink")} data-testid={`button-edit-rink-${rink.id}`}>Edit</button>}
      </div>
      {open === "rink" ? <div className="mt-2"><EditRinkForm rink={rink} onDone={close} /></div> : (rink.address || rink.phone) ? <p className="text-xs text-[var(--mute)] mt-1">{[rink.address, rink.phone].filter(Boolean).join(" · ")}</p> : null}

      <Section title="Leagues" action={<span className="label">{live.length}</span>}>
        <div className="card divide-y divide-[var(--line)]">
          {live.length === 0 && <p className="p-4 text-xs text-[var(--mute)]">No leagues yet.</p>}
          {live.map((l: any) => <DrillRow key={l.id} href={`/staff/league/${l.id}`} left={<LevelPill level={l.level === "DEMO" ? "Demo" : l.level} />} title={`${l.name}${l.tag ? ` · ${l.tag}` : ""}`} hint={`${l.teams.filter((t: any) => !t.archived_at).length} teams`} testid={`row-staff-league-${l.id}`} />)}
        </div>
        {rink.can?.addLeague && (open === "league" ? <div className="mt-3"><AddLeagueForm rinkId={rink.id} onDone={close} /></div> : <div className="mt-3"><AddButton label="League" onClick={() => setOpen("league")} testid={`button-add-league-${rink.id}`} /></div>)}
        {archived.length > 0 && <Archived count={archived.length} what="league">{archived.map((l: any) => <DrillRow key={l.id} href={`/staff/league/${l.id}`} left={<LevelPill level={l.level} />} title={l.name} hint="Archived" testid={`row-staff-league-${l.id}`} />)}</Archived>}
      </Section>

      {rink.can?.seasons && (
        <Section title="Seasons" action={open !== "season" ? <AddButton label="Season" onClick={() => setOpen("season")} testid={`button-add-season-${rink.id}`} /> : undefined}>
          {open === "season" && <div className="mb-3"><AddSeasonForm rinkId={rink.id} onDone={close} /></div>}
          <div className="card divide-y divide-[var(--line)]">
            {rink.seasons.length ? rink.seasons.map((s: any) => <SeasonRow key={s.id} season={s} run={run} />) : <p className="p-4 text-xs text-[var(--mute)]">No seasons yet.</p>}
          </div>
        </Section>
      )}

      {rink.manage && <RinkStaff rink={rink} run={run} />}
      {rink.manage && !rink.archived_at && <ImportSection rinks={[rink]} />}

      <Lifecycle what="rink" name={rink.name} archived={!!rink.archived_at} canArchive={!!rink.can?.archive} canDelete={!!rink.can?.remove}
        deleteBlocked="This rink has leagues or players who call it home. Archive it instead."
        onArchive={(on) => run("PATCH", `/api/rinks/${rink.id}`, { archived: on })}
        onDelete={async () => { if (await run("DELETE", `/api/rinks/${rink.id}`)) onGone(); }} />
    </div>
  );
}

function SeasonRow({ season, run }: { season: any; run: Run }) {
  const [edit, setEdit] = useState(false);
  const [name, setName] = useState(season.name);
  const [starts, setStarts] = useState(season.starts_on);
  const [ends, setEnds] = useState(season.ends_on);
  if (!edit) return (
    <div className="flex items-center gap-3 px-4 py-3" data-testid={`row-season-${season.id}`}>
      <span className="flex-1 min-w-0"><span className="block font-bold text-sm">{season.name}</span><span className="block text-xs text-[var(--mute)] tnum">{season.starts_on} to {season.ends_on}{season.games ? ` · ${season.games} games` : ""}</span></span>
      <button className="text-sm text-[var(--blue)] font-bold" onClick={() => setEdit(true)} data-testid={`button-edit-season-${season.id}`}>Edit</button>
    </div>
  );
  return (
    <form className="p-4 space-y-2" onSubmit={async (e) => { e.preventDefault(); if (await run("PATCH", `/api/seasons/${season.id}`, { name, startsOn: starts, endsOn: ends })) setEdit(false); }}>
      <input className="input w-full" value={name} onChange={(e) => setName(e.target.value)} aria-label="Season name" />
      <div className="grid grid-cols-2 gap-2">
        <label className="text-xs text-[var(--mute)]">Starts<input type="date" className="input w-full mt-1" value={starts} onChange={(e) => setStarts(e.target.value)} /></label>
        <label className="text-xs text-[var(--mute)]">Ends<input type="date" className="input w-full mt-1" value={ends} onChange={(e) => setEnds(e.target.value)} /></label>
      </div>
      <div className="flex gap-2">
        <button type="button" className="btn btn-ghost h-10 down" disabled={season.games > 0}
          onClick={() => confirm(`Delete ${season.name}?`) && run("DELETE", `/api/seasons/${season.id}`)} data-testid={`button-delete-season-${season.id}`}>Delete</button>
        <span className="flex-1" />
        <button type="button" className="btn btn-ghost h-10" onClick={() => setEdit(false)}>Cancel</button>
        <button className="btn btn-red h-10" data-testid={`button-save-season-${season.id}`}>Save</button>
      </div>
      {season.games > 0 && <p className="text-[11px] text-[var(--mute)]">{season.games} games belong to this season, so it can't be deleted. You can still rename it or change its dates.</p>}
    </form>
  );
}

const TAG_OPTIONS = ["40+", "50+", "Women's", "Coed"];

function LeagueLevel({ rink, league: l, run, onGone }: { rink: any; league: any; run: Run; onGone: () => void }) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState(l.name);
  const live = l.teams.filter((t: any) => !t.archived_at);
  const archived = l.teams.filter((t: any) => t.archived_at);
  const others = rink.leagues.filter((x: any) => x.id !== l.id && !x.archived_at && x.level !== "DEMO" && x.level !== "TOURN");
  return (
    <div>
      <div className="label">League · {rink.name}{l.archived_at ? " · archived" : ""}</div>
      <div className="flex items-center gap-2 mt-1"><LevelPill level={l.level === "DEMO" ? "Demo" : l.level} /><h1 className="font-black text-2xl flex-1 min-w-0 truncate">{l.name}</h1></div>
      <Link href={`/league/${l.id}`} className="text-sm text-[var(--blue)] font-bold">Open the public page ›</Link>

      {l.addTeam && l.level !== "DEMO" && (
        <Section title="Settings">
          <div className="card divide-y divide-[var(--line)]">
            <form className="p-4 flex gap-2" onSubmit={(e) => { e.preventDefault(); if (name.trim() && name !== l.name) run("PATCH", `/api/leagues/${l.id}`, { name }); }}>
              <input className="input flex-1" value={name} onChange={(e) => setName(e.target.value)} aria-label="League name" data-testid="input-league-name" />
              <button className="btn btn-ghost h-11" disabled={!name.trim() || name === l.name} data-testid="button-save-league-name">Rename</button>
            </form>
            <div className="p-4 grid grid-cols-2 gap-3">
              <label className="text-xs text-[var(--mute)]">Skill level
                <select className="input w-full mt-1" value={["A", "B", "C", "D"].includes(l.level) ? l.level : ""} onChange={(e) => run("PATCH", `/api/leagues/${l.id}`, { level: e.target.value })} data-testid={`select-level-${l.id}`}>
                  {!["A", "B", "C", "D"].includes(l.level) && <option value="">Pick</option>}
                  {["A", "B", "C", "D"].map((v) => <option key={v} value={v}>{v}</option>)}
                </select>
              </label>
              <label className="text-xs text-[var(--mute)]">Division
                <select className="input w-full mt-1" value={l.tag ?? ""} onChange={(e) => run("PATCH", `/api/leagues/${l.id}`, { tag: e.target.value || null })} data-testid={`select-tag-${l.id}`}>
                  <option value="">None</option>
                  {TAG_OPTIONS.map((v) => <option key={v} value={v}>{v}</option>)}
                </select>
              </label>
              <label className="text-xs text-[var(--mute)]">Skater spots
                <input className="input w-full mt-1 tnum" inputMode="numeric" defaultValue={l.roster_max ?? 25} onBlur={(e) => Number(e.target.value) !== (l.roster_max ?? 25) && run("PATCH", `/api/leagues/${l.id}`, { rosterMax: Number(e.target.value) })} data-testid={`input-roster-max-${l.id}`} />
              </label>
              <label className="text-xs text-[var(--mute)]">Goalie spots
                <input className="input w-full mt-1 tnum" inputMode="numeric" defaultValue={l.goalie_max ?? 2} onBlur={(e) => Number(e.target.value) !== (l.goalie_max ?? 2) && run("PATCH", `/api/leagues/${l.id}`, { goalieMax: Number(e.target.value) })} data-testid={`input-goalie-max-${l.id}`} />
              </label>
            </div>
          </div>
        </Section>
      )}

      <Section title="Teams" action={<span className="label">{live.length}</span>}>
        <div className="card divide-y divide-[var(--line)]">
          {live.length === 0 && <p className="p-4 text-xs text-[var(--mute)]">No teams yet.</p>}
          {live.map((t: any) => <TeamRow key={t.id} team={t} others={others} canEdit={l.addTeam} run={run} />)}
        </div>
        {l.addTeam && (open ? <div className="mt-3"><AddTeamForm leagueId={l.id} leagueName={l.name} onDone={() => setOpen(false)} /></div> : <div className="mt-3"><AddButton label="Team" onClick={() => setOpen(true)} testid={`button-add-team-${l.id}`} /></div>)}
        {archived.length > 0 && <Archived count={archived.length} what="team">{archived.map((t: any) => <TeamRow key={t.id} team={t} others={others} canEdit={l.addTeam} run={run} />)}</Archived>}
      </Section>

      <Lifecycle what="league" name={l.name} archived={!!l.archived_at} canArchive={!!l.addTeam && !!rink.can?.addLeague} canDelete={!!l.removable}
        deleteBlocked="This league has teams or games. Archive it instead."
        onArchive={(on) => run("PATCH", `/api/leagues/${l.id}`, { archived: on })}
        onDelete={async () => { if (await run("DELETE", `/api/leagues/${l.id}`)) onGone(); }} />
    </div>
  );
}

function TeamRow({ team: t, others, canEdit, run }: { team: any; others: any[]; canEdit: boolean; run: Run }) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState(t.name);
  const [color, setColor] = useState(t.color || "#3B82F6");
  return (
    <div data-testid={`row-staff-team-${t.id}`}>
      <button type="button" className="w-full flex items-center gap-3 px-4 py-3 min-h-[56px] text-left" onClick={() => setOpen((o) => !o)} aria-expanded={open}>
        <TeamBadge team={t} size={28} />
        <span className="flex-1 min-w-0"><span className="block font-bold text-sm truncate">{t.name}</span><span className="block text-xs text-[var(--mute)]">{t.captain ? `C: ${t.captain}` : "no captain"} · {t.registered}/{t.roster} signed up{t.archived_at ? " · archived" : ""}</span></span>
        <span className="text-[var(--mute)]">{open ? "▴" : "▾"}</span>
      </button>
      {open && (
        <div className="px-4 pb-4 space-y-3">
          <div className="flex gap-2">
            <Link href={`/team/${t.id}`} className="btn btn-ghost h-10 flex-1" data-testid={`link-team-page-${t.id}`}>Team page</Link>
            <Link href={`/team/${t.id}/manage`} className="btn btn-ghost h-10 flex-1" data-testid={`link-team-roster-${t.id}`}>Roster and captain</Link>
          </div>
          {canEdit && (
            <>
              <form className="flex gap-2" onSubmit={(e) => { e.preventDefault(); run("PATCH", `/api/teams/${t.id}`, { name, color }); }}>
                <input type="color" className="h-11 w-12 rounded-lg border border-[var(--line)] bg-transparent shrink-0" value={color} onChange={(e) => setColor(e.target.value)} aria-label="Team color" />
                <input className="input flex-1 min-w-0" value={name} onChange={(e) => setName(e.target.value)} aria-label="Team name" />
                <button className="btn btn-ghost h-11" disabled={!name.trim() || (name === t.name && color === t.color)} data-testid={`button-save-team-${t.id}`}>Save</button>
              </form>
              {others.length > 0 && (
                t.movable ? (
                  <label className="block text-xs text-[var(--mute)]">Move to another league
                    <select className="input w-full mt-1" value="" onChange={(e) => e.target.value && confirm(`Move ${t.name}?`) && run("PATCH", `/api/teams/${t.id}`, { leagueId: Number(e.target.value) })} data-testid={`select-move-team-${t.id}`}>
                      <option value="">Pick a league</option>
                      {others.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
                    </select>
                  </label>
                ) : <p className="text-[11px] text-[var(--mute)]">Teams with games stay in their league. To move one, archive it and add it to the other league.</p>
              )}
              <div className="flex gap-2">
                <button className="btn btn-ghost h-10 flex-1" onClick={() => (t.archived_at || confirm(`Archive ${t.name}? It leaves standings and lists; its history stays.`)) && run("PATCH", `/api/teams/${t.id}`, { archived: !t.archived_at })} data-testid={`button-${t.archived_at ? "restore" : "archive"}-team-${t.id}`}>{t.archived_at ? "Restore" : "Archive"}</button>
                <button className="btn btn-ghost h-10 flex-1 down" disabled={!t.removable} onClick={() => confirm(`Delete ${t.name} for good?`) && run("DELETE", `/api/teams/${t.id}`)} data-testid={`button-remove-team-${t.id}`}>Delete</button>
              </div>
              {!t.removable && <p className="text-[11px] text-[var(--mute)]">Delete is only for empty teams. This one has games or players, so archive it instead.</p>}
            </>
          )}
        </div>
      )}
    </div>
  );
}

function RinkStaff({ rink, run }: { rink: any; run: Run }) {
  const [email, setEmail] = useState("");
  const [role, setRole] = useState("scorekeeper");
  const [league, setLeague] = useState<number | null>(rink.leagues[0]?.id ?? null);
  return (
    <Section title="Rink staff">
      <div className="card p-4">
        {rink.staff.length ? rink.staff.map((s: any) => (
          <div key={s.id} className="flex items-center gap-2 text-sm py-1.5">
            <span className="flex-1 min-w-0 truncate">{s.name ?? s.email} · {ROLE_LABEL[s.role]}{s.league ? ` (${s.league})` : ""}</span>
            <button className="btn btn-ghost h-8 text-xs" onClick={() => confirm(`Remove ${s.name ?? s.email} as ${ROLE_LABEL[s.role].toLowerCase()}?`) && run("DELETE", `/api/staff/grants?id=${s.id}`)}>Remove</button>
          </div>
        )) : <p className="text-xs text-[var(--mute)]">No scorekeepers or commissioners yet.</p>}
        <div className="grid grid-cols-2 gap-2 mt-3">
          <select className="input text-sm" value={role} onChange={(e) => setRole(e.target.value)} data-testid="select-staff-role">
            <option value="scorekeeper">Scorekeeper</option>
            <option value="commissioner">Commissioner</option>
          </select>
          {role === "commissioner" ? (
            <select className="input text-sm" value={league ?? ""} onChange={(e) => setLeague(Number(e.target.value))}>
              {rink.leagues.map((l: any) => <option key={l.id} value={l.id}>{l.name}</option>)}
            </select>
          ) : <span />}
        </div>
        <form className="flex gap-2 mt-2" onSubmit={async (e) => { e.preventDefault(); if (await run("POST", "/api/staff/grants", { email, role, scopeId: role === "commissioner" ? league : rink.id })) setEmail(""); }}>
          <input className="input flex-1" placeholder="Their Late Ice email" value={email} onChange={(e) => setEmail(e.target.value)} data-testid="input-staff-email" />
          <button className="btn btn-red h-11" disabled={!email} data-testid="button-grant-staff">Add</button>
        </form>
      </div>
    </Section>
  );
}

function Requests({ run }: { run: Run }) {
  const { data } = useQuery<any[]>({ queryKey: ["/api/staff/requests"] });
  if (!data?.length) return null;
  return (
    <Section title="Waiting on you" action={<span className="label text-[var(--red)]">{data.length}</span>}>
      <div className="space-y-2">
        {data.map((r) => (
          r.kind === "new_rink" || r.kind === "rink_manager" ? <RinkRequestCard key={r.id} r={r} run={run} /> : (
          <div key={r.id} className="card p-4" data-testid={`card-request-${r.id}`}>
            <div className="font-bold text-sm">
              {r.kind === "new_team" ? `${r.requester ?? r.requester_email} wants to add ${r.details?.name} to the ${r.league_name}` : `${r.requester} says they're the captain of ${r.team_name}`}
            </div>
            <p className="text-xs text-[var(--mute)] mt-0.5">
              {r.kind === "new_team" ? (r.details?.captain ? `They'd be its captain. ` : "") + "Check the name is spelled the way the league spells it." : `Current captain: ${r.target ?? "none"}. Approving makes ${r.requester} captain.`}
              {r.message ? ` Note: "${r.message}"` : ""}
            </p>
            <div className="grid grid-cols-2 gap-2 mt-3">
              <button className="btn btn-ghost h-10" onClick={() => run("POST", `/api/staff/requests/${r.id}`, { decision: "decline" })} data-testid={`button-decline-request-${r.id}`}>Decline</button>
              <button className="btn btn-red h-10" onClick={() => run("POST", `/api/staff/requests/${r.id}`, { decision: "approve" })} data-testid={`button-approve-request-${r.id}`}>Approve</button>
            </div>
          </div>
          )
        ))}
      </div>
    </Section>
  );
}

/** New accounts waiting to be let in. */
const LEAD_STATUS = ["new", "contacted", "onboarding", "won", "lost"];

/** Rinks that asked to claim their page or join, from the website. */
function RinkLeads({ run }: { run: Run }) {
  const { data } = useQuery<any[]>({ queryKey: ["/api/staff/leads"] });
  const [showClosed, setShowClosed] = useState(false);
  if (!data?.length) return null;
  const open = data.filter((l) => !["won", "lost"].includes(l.status));
  const rows = showClosed ? data : open;
  return (
    <Section title="Rink leads" action={<span className="label">{open.length} open</span>}>
      <div className="card divide-y divide-[var(--line)]">
        {rows.map((l) => (
          <div key={l.id} className="p-4" data-testid={`row-lead-${l.id}`}>
            <div className="flex items-start gap-3">
              <span className="flex-1 min-w-0">
                <span className="block font-bold text-sm">{l.rink_name}{l.rink_id ? " · claim" : " · new rink"}{l.founding ? " · founding" : ""}</span>
                <span className="block text-xs text-[var(--mute)]">{l.contact_name}{l.role ? `, ${l.role}` : ""} · <a className="text-[var(--blue)]" href={`mailto:${l.email}`}>{l.email}</a>{l.phone ? ` · ${l.phone}` : ""}</span>
                <span className="block text-xs text-[var(--mute)]">{[l.city, l.league_count && `${l.league_count} leagues`, l.scheduler].filter(Boolean).join(" · ")} · {String(l.created_at).slice(0, 10)}</span>
                {l.notes && <span className="block text-xs mt-1">{l.notes}</span>}
              </span>
              <select className="input h-10 text-sm w-auto" value={l.status} onChange={(e) => run("PATCH", `/api/staff/leads/${l.id}`, { status: e.target.value })} aria-label={`Status for ${l.rink_name}`} data-testid={`select-lead-${l.id}`}>
                {LEAD_STATUS.map((s) => <option key={s} value={s}>{s[0].toUpperCase() + s.slice(1)}</option>)}
              </select>
            </div>
          </div>
        ))}
      </div>
      {data.length > open.length && <button className="text-xs text-[var(--mute)] font-bold mt-2 px-1" onClick={() => setShowClosed((v) => !v)}>{showClosed ? "Hide won and lost" : `Show won and lost (${data.length - open.length})`}</button>}
    </Section>
  );
}

/** Goalie shot counts the two teams disagree on. Staff pick one number. */
function GoalieDisputes({ run }: { run: Run }) {
  const { data } = useQuery<any[]>({ queryKey: ["/api/staff/goalie-disputes"] });
  if (!data?.length) return null;
  const settle = (id: number, use: string) => run("POST", `/api/goalie-reports/${id}/settle`, { use }).then(() => invalidatePrefixes(["/api/staff/goalie-disputes", "/api/games"]));
  return (
    <Section title="Goalie numbers to settle" action={<span className="label text-[var(--red)]">{data.length}</span>}>
      <div className="card divide-y divide-[var(--line)]">
        {data.map((r) => (
          <div key={r.id} className="p-4" data-testid={`row-goalie-dispute-${r.id}`}>
            <Link href={`/game/${r.game_id}`} className="block font-bold text-sm">{r.goalie} · {r.team} · {r.played_on}</Link>
            <p className="text-xs text-[var(--mute)] mt-0.5">Goalie says {r.shots_against} shots. The other captain says {r.counter_shots}. {r.goals_against} goals against.</p>
            <div className="grid grid-cols-2 gap-2 mt-3">
              <button className="btn btn-ghost h-11 text-sm" onClick={() => settle(r.id, "goalie")} data-testid={`button-settle-goalie-${r.id}`}>Use {r.shots_against}</button>
              <button className="btn btn-ghost h-11 text-sm" onClick={() => settle(r.id, "captain")} data-testid={`button-settle-captain-${r.id}`}>Use {r.counter_shots}</button>
            </div>
          </div>
        ))}
      </div>
    </Section>
  );
}

function Signups({ run }: { run: Run }) {
  const { data } = useQuery<any[]>({ queryKey: ["/api/staff/signups"] });
  if (!data?.length) return null;
  return (
    <Section title="New sign-ups" action={<span className="label text-[var(--red)]">{data.length}</span>}>
      <div className="card divide-y divide-[var(--line)]">
        {data.map((u) => (
          <div key={u.id} className="p-3.5 flex items-center gap-3" data-testid={`row-signup-${u.id}`}>
            <span className="flex-1 min-w-0">
              <span className="block font-bold text-sm truncate">{u.name ?? "No name yet"}{u.number ? ` #${u.number}` : ""}</span>
              <span className="block text-xs text-[var(--mute)] truncate">{u.email}{u.rink ? ` · ${u.rink}` : ""}{u.teams ? ` · ${u.teams}` : ""}</span>
            </span>
            <button className="btn btn-ghost h-9 text-xs" onClick={() => confirm(`Remove ${u.name ?? u.email}? They can't get in after this.`) && run("POST", `/api/staff/signups/${u.id}`, { decision: "remove" })} data-testid={`button-remove-signup-${u.id}`}>Remove</button>
            <button className="btn btn-red h-9 text-xs" onClick={() => run("POST", `/api/staff/signups/${u.id}`, { decision: "approve" })} data-testid={`button-approve-signup-${u.id}`}>Let in</button>
          </div>
        ))}
      </div>
    </Section>
  );
}

function Check({ ok, children }: { ok: boolean | null; children: React.ReactNode }) {
  return (
    <div className="flex items-start gap-2 text-xs">
      <span className={`mt-0.5 h-4 w-4 shrink-0 rounded-full flex items-center justify-center text-[10px] font-black ${ok ? "bg-[var(--up)] text-white" : ok === false ? "bg-[var(--ice-3)] text-[var(--mute)] border border-[var(--line)]" : "bg-[var(--ice-3)] text-[var(--amber)]"}`}>{ok ? "✓" : ok === false ? "–" : "?"}</span>
      <span className="min-w-0 break-words">{children}</span>
    </div>
  );
}

/** A new rink, or someone asking to run one: everything an admin needs to check, on one card. */
function RinkRequestCard({ r, run }: { r: any; run: Run }) {
  const d = r.details ?? {};
  const isNew = r.kind === "new_rink";
  const wantsManager = isNew ? !!d.manage : true;
  const m = d.map?.matches?.[0];
  const site = isNew ? d.website : r.rink_website;
  const phone = isNew ? m?.phone ?? null : r.rink_phone;
  const onDomain = isNew ? d.emailOnDomain : r.email_on_domain;
  const phoneOk = !!r.phone_confirmed_at;
  return (
    <div className="card p-4" data-testid={`card-request-${r.id}`}>
      <div className="font-bold text-sm">{isNew ? `Add ${d.name} (${d.city}, ${d.state})` : `${r.requester ?? r.requester_email} wants to manage ${r.rink_name}`}</div>
      <p className="text-xs text-[var(--mute)] mt-0.5">
        From {r.requester ?? "someone"} · {r.requester_email}{wantsManager ? ` · ${RINK_ROLE_LABEL[d.role] ?? "role not given"}` : ""}{r.message ? ` · "${r.message}"` : ""}
      </p>
      <div className="mt-3 space-y-1.5">
        {isNew && (
          <Check ok={d.map?.checked ? !!m?.isRink : null}>
            {d.map?.checked ? (m ? <>Map: <a className="text-[var(--blue)]" href={m.osm} target="_blank" rel="noreferrer">{m.name}</a>, {m.address}{m.isRink ? "" : " (not tagged as a rink)"}</> : "Not found on the map. Check the website.") : "Map lookup didn't run. Check the website."}
          </Check>
        )}
        {site && <Check ok={null}>Website: <a className="text-[var(--blue)]" href={/^https?:/.test(site) ? site : `https://${site}`} target="_blank" rel="noreferrer">{site}</a></Check>}
        {wantsManager && <Check ok={!!onDomain}>{onDomain ? "Signed in with an email on the rink's own domain" : "Email isn't on the rink's domain"}</Check>}
        {wantsManager && (
          <Check ok={phoneOk}>
            {phoneOk ? `Confirmed by phone (${r.phone_confirmed_name ?? "admin"})` : <>Call the rink's public number{phone ? <>: <a className="text-[var(--blue)]" href={`tel:${phone}`}>{phone}</a></> : " (from its website)"}, not one they gave you.</>}
            {!phoneOk && <button className="ml-2 text-[var(--blue)] font-bold" onClick={() => run("POST", `/api/staff/requests/${r.id}/phone`)} data-testid={`button-phone-ok-${r.id}`}>Confirmed by phone</button>}
          </Check>
        )}
      </div>
      <div className={`grid gap-2 mt-3 ${isNew && wantsManager ? "grid-cols-3" : "grid-cols-2"}`}>
        <button className="btn btn-ghost h-10 text-sm" onClick={() => run("POST", `/api/staff/requests/${r.id}`, { decision: "decline" })} data-testid={`button-decline-request-${r.id}`}>Decline</button>
        {isNew && wantsManager && <button className="btn btn-ghost h-10 text-sm" onClick={() => run("POST", `/api/staff/requests/${r.id}`, { decision: "approve_rink" })} data-testid={`button-approve-rink-only-${r.id}`}>Rink only</button>}
        <button className="btn btn-red h-10 text-sm" disabled={wantsManager && !onDomain && !phoneOk} onClick={() => run("POST", `/api/staff/requests/${r.id}`, { decision: "approve" })} data-testid={`button-approve-request-${r.id}`}>{wantsManager ? "Approve manager" : "Add rink"}</button>
      </div>
      {wantsManager && !onDomain && !phoneOk && <p className="text-[11px] text-[var(--mute)] mt-2">Approving a manager needs one check: their email on the rink's domain, or your call to the rink.</p>}
    </div>
  );
}

function SupportDesk({ run, isAdmin }: { run: Run; isAdmin: boolean }) {
  const [term, setTerm] = useState("");
  const [q, setQ] = useState("");
  const [pick, setPick] = useState<number | null>(null);
  const { data: results } = useQuery<any[]>({ queryKey: [`/api/staff/users?q=${encodeURIComponent(q)}`], enabled: q.length >= 2 });
  const { data: acct } = useQuery<any>({ queryKey: [`/api/staff/users/${pick}`], enabled: !!pick });
  const { data: merges } = useQuery<any[]>({ queryKey: ["/api/staff/merges"] });
  const [mergeTo, setMergeTo] = useState("");

  return (
    <Section title="Help desk">
      <form className="flex gap-2" onSubmit={(e) => { e.preventDefault(); setQ(term.trim()); setPick(null); }}>
        <input className="input flex-1" placeholder="Email or name" value={term} onChange={(e) => setTerm(e.target.value)} data-testid="input-support-search" />
        <button className="btn btn-red h-11" data-testid="button-support-search">Find</button>
      </form>
      {q && results && !results.length && <p className="text-sm text-[var(--mute)] mt-2">No accounts match "{q}".</p>}
      {results && results.length > 0 && !pick && (
        <div className="card divide-y divide-[var(--line)] mt-2">
          {results.map((u) => (
            <button key={u.id} className="w-full text-left p-3.5" onClick={() => setPick(u.id)} data-testid={`row-account-${u.id}`}>
              <div className="font-bold text-sm">{u.name ?? "No name yet"} <span className="text-[var(--mute)] font-medium">#{u.id}</span></div>
              <div className="text-xs text-[var(--mute)]">{u.email ?? "no email"}{u.teams ? ` · ${u.teams}` : ""}</div>
            </button>
          ))}
        </div>
      )}
      {pick && acct && (
        <div className="card p-4 mt-2 space-y-3" data-testid="card-account">
          <div className="flex items-start justify-between gap-2">
            <div>
              <div className="font-bold">{acct.user.name ?? "No name yet"} <span className="text-[var(--mute)] font-medium">#{acct.user.id}</span></div>
              <div className="text-xs text-[var(--mute)]">{acct.user.email} · joined {when(acct.user.createdAt)}{acct.user.mergedInto ? ` · moved to #${acct.user.mergedInto}` : ""}</div>
              <div className="text-xs text-[var(--mute)]">{acct.user.homeRink?.name ?? "No home rink"}{acct.user.hidden ? " · name hidden" : ""}</div>
            </div>
            <button className="text-xs text-[var(--blue)]" onClick={() => setPick(null)}>Back</button>
          </div>
          {acct.roles.length > 0 && <div className="flex flex-wrap gap-1.5">{acct.roles.map((r: any) => <span key={r.id} className="chip h-7 text-[11px]">{ROLE_LABEL[r.role]}{r.where ? ` · ${r.where}` : ""}</span>)}</div>}
          <div>
            <div className="label mb-1">Roster spots</div>
            {acct.slots.length ? acct.slots.map((s: any) => (
              <div key={`${s.id}-${s.team_id}`} className="flex items-center gap-2 text-sm py-1.5">
                <span className="flex-1 min-w-0 truncate">{s.number ? `#${s.number} ` : ""}{s.name} · {s.team_name} <span className="text-[var(--mute)]">({s.source})</span></span>
                <button className="btn btn-ghost h-8 text-xs" onClick={() => confirm(`Release this claim? ${acct.user.name} is told.`) && run("POST", "/api/staff/fix", { action: "release", playerId: s.id })} data-testid={`button-support-release-${s.id}`}>Release</button>
                <button className="btn btn-ghost h-8 text-xs" onClick={() => run("POST", "/api/staff/fix", { action: s.hidden ? "unhide" : "hide", playerId: s.id })}>{s.hidden ? "Unhide" : "Hide"}</button>
              </div>
            )) : <p className="text-xs text-[var(--mute)]">None.</p>}
          </div>
          <div>
            <div className="label mb-1">Move this account to a new email</div>
            <p className="text-[11px] text-[var(--mute)]">Only after the captain confirms it's the same person. The person signs in with the new email first. This account's spots, stats and roles move after a 24-hour hold.</p>
            <div className="flex gap-2 mt-2">
              <input className="input flex-1" placeholder="New email they signed in with" value={mergeTo} onChange={(e) => setMergeTo(e.target.value)} data-testid="input-merge-to" />
              <button className="btn btn-red h-11" disabled={!mergeTo} onClick={async () => { if (await run("POST", "/api/staff/merges", { fromUserId: acct.user.id, toEmail: mergeTo })) setMergeTo(""); }} data-testid="button-merge">Start</button>
            </div>
          </div>
          {acct.activity.length > 0 && (
            <details className="text-xs">
              <summary className="font-bold cursor-pointer">Recent notices</summary>
              <div className="mt-1 space-y-1 text-[var(--mute)]">{acct.activity.map((a: any, i: number) => <div key={i}>{when(a.created_at)} · {a.title}</div>)}</div>
            </details>
          )}
        </div>
      )}
      {merges && merges.filter((m) => m.status === "pending").length > 0 && (
        <div className="card mt-3 p-4">
          <div className="label mb-2">Account moves waiting</div>
          {merges.filter((m) => m.status === "pending").map((m) => (
            <div key={m.id} className="flex items-center gap-2 text-sm py-1.5">
              <span className="flex-1 min-w-0 truncate">{m.from_email} → {m.to_email} <span className="text-[var(--mute)]">after {when(m.run_after)}</span></span>
              {isAdmin && <button className="btn btn-ghost h-8 text-xs" onClick={() => confirm("Move this account now, skipping the 24-hour hold?") && run("POST", "/api/staff/merges", { runId: m.id })}>Run now</button>}
              <button className="btn btn-ghost h-8 text-xs" onClick={() => run("DELETE", `/api/staff/merges?id=${m.id}`)}>Cancel</button>
            </div>
          ))}
        </div>
      )}
    </Section>
  );
}

function AdminSection({ data, run }: { data: any; run: Run }) {
  const [email, setEmail] = useState("");
  const [role, setRole] = useState("support");
  const [rink, setRink] = useState<number | null>(data.allRinks[0]?.id ?? null);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<string | null>(null);
  const { data: settings } = useQuery<{ signupsPaused: boolean }>({ queryKey: ["/api/staff/settings"] });
  return (
    <Section title="Admin">
      <div className="card p-4 mb-3 flex items-center gap-3" data-testid="card-signup-switch">
        <span className="flex-1"><span className="block font-bold text-sm">Pause new sign-ups</span><span className="block text-xs text-[var(--mute)]">{settings?.signupsPaused ? "Paused. Nobody new can make an account. Existing players still sign in." : "Open. New accounts wait for an invite or your OK."}</span></span>
        <button role="switch" aria-checked={!!settings?.signupsPaused} aria-label="Pause new sign-ups" onClick={() => run("PUT", "/api/staff/settings", { signupsPaused: !settings?.signupsPaused })} className={`h-7 w-12 shrink-0 rounded-full relative transition-colors ${settings?.signupsPaused ? "bg-[var(--red-btn)]" : "bg-[var(--ice-3)] border border-[var(--line)]"}`} data-testid="switch-pause-signups">
          <span className={`absolute top-0.5 h-6 w-6 rounded-full bg-white shadow transition-all ${settings?.signupsPaused ? "left-[22px]" : "left-0.5"}`} />
        </button>
      </div>
      <div className="card p-4">
        <div className="label mb-2">System staff</div>
        {data.systemStaff.map((s: any) => (
          <div key={s.id} className="flex items-center gap-2 text-sm py-1.5">
            <span className="flex-1 min-w-0 truncate">{s.name ?? s.email} · {ROLE_LABEL[s.role]}</span>
            {s.user_id !== data.me.id && <button className="btn btn-ghost h-8 text-xs" onClick={() => confirm(`Remove ${s.name ?? s.email} as ${ROLE_LABEL[s.role].toLowerCase()}?`) && run("DELETE", `/api/staff/grants?id=${s.id}`)}>Remove</button>}
          </div>
        ))}
        <div className="grid grid-cols-2 gap-2 mt-3">
          <select className="input text-sm" value={role} onChange={(e) => setRole(e.target.value)} data-testid="select-admin-role">
            <option value="support">Support</option>
            <option value="rink_manager">Rink manager</option>
            <option value="admin">Admin</option>
          </select>
          {role === "rink_manager" ? (
            <select className="input text-sm" value={rink ?? ""} onChange={(e) => setRink(Number(e.target.value))}>
              {data.allRinks.map((r: any) => <option key={r.id} value={r.id}>{r.name}</option>)}
            </select>
          ) : <span />}
        </div>
        <form className="flex gap-2 mt-2" onSubmit={async (e) => { e.preventDefault(); if (await run("POST", "/api/staff/grants", { email, role, scopeId: role === "rink_manager" ? rink : null })) setEmail(""); }}>
          <input className="input flex-1" placeholder="Their Late Ice email" value={email} onChange={(e) => setEmail(e.target.value)} data-testid="input-admin-email" />
          <button className="btn btn-red h-11" disabled={!email} data-testid="button-grant-admin">Add</button>
        </form>
        {role === "admin" && <p className="text-[11px] text-[var(--mute)] mt-2">Admins can do everything, including removing you. Grant sparingly.</p>}
      </div>
      <div className="card p-4 mt-3 flex items-center gap-3">
        <span className="flex-1"><span className="block font-bold text-sm">Recalculate ratings</span><span className="block text-xs text-[var(--mute)]">Replays every game. Runs nightly on its own.</span></span>
        <button className="btn btn-ghost h-10" disabled={busy} onClick={async () => { setBusy(true); const ok = await run("POST", "/api/staff/recompute"); setResult(ok ? "Done." : null); setBusy(false); }} data-testid="button-recompute">{busy ? "Running…" : "Run"}</button>
      </div>
      {result && <p className="text-xs text-[var(--mute)] mt-2 px-1">{result}</p>}
    </Section>
  );
}

function Audit({ rinks, broad }: { rinks: any[]; broad: boolean }) {
  const rink = broad ? null : rinks.find((r) => r.manage)?.id ?? null;
  const { data } = useQuery<any[]>({ queryKey: [rink ? `/api/staff/audit?rink=${rink}` : "/api/staff/audit"], enabled: broad || !!rink });
  if (!data?.length) return null;
  return (
    <Section title="Audit log">
      <details className="card p-4 text-xs">
        <summary className="font-bold text-sm cursor-pointer">Last {data.length} staff actions</summary>
        <div className="mt-2 space-y-1.5 text-[var(--mute)]">
          {data.map((a) => <div key={a.id}>{when(a.created_at)} · {a.actor ?? "system"} · {a.action.replace(/[._]/g, " ")}{a.target_id ? ` · ${a.target_type} #${a.target_id}` : ""}</div>)}
        </div>
      </details>
    </Section>
  );
}

/** Upload a league report (DaySmart, via Grok). Preview first, then load. */
function ImportSection({ rinks }: { rinks: any[] }) {
  const [rinkId, setRinkId] = useState<number>(rinks[0].id);
  const [text, setText] = useState("");
  const [file, setFile] = useState<string | null>(null);
  const [res, setRes] = useState<any>(null);
  const [busy, setBusy] = useState<null | "preview" | "apply">(null);
  const [err, setErr] = useState<string | null>(null);
  const [level, setLevel] = useState("");
  const [done, setDone] = useState<any[]>([]);
  const [pick, setPick] = useState(0); // remounts the file input so the same file can be chosen again
  const reset = () => { setText(""); setFile(null); setRes(null); setLevel(""); setErr(null); setPick((n) => n + 1); };
  const send = async (apply: boolean, lv: string = level) => {
    setBusy(apply ? "apply" : "preview"); setErr(null);
    try {
      const r = await apiRequest("POST", "/api/staff/import", { text, rinkId, apply, level: lv || null });
      const out = await r.json();
      if (apply) {
        if (!out.applied) throw new Error("Nothing was saved. Check the preview and try again.");
        await invalidatePrefixes(["/api/staff", "/api/standings", "/api/players", "/api/teams", "/api/leagues", "/api/feed", "/api/bootstrap", "/api/rink"]);
        setDone((d) => [out.summary, ...d]);
        reset();
      } else setRes(out);
    } catch (e: any) { setErr(e.message); }
    setBusy(null);
  };
  const s = res?.summary;
  const ready = !!s && !s.needsLevel;
  return (
    <Section title="Import from DaySmart">
      <div className="card p-4 space-y-3" data-testid="card-import">
        <p className="text-xs text-[var(--mute)]">One league per file. Choose the file, check the preview, then import. Nothing is saved until you press Import.</p>
        {done.length > 0 && (
          <div className="rounded-xl p-3 text-sm space-y-1" style={{ background: "rgba(56,217,150,.12)", border: "1px solid var(--up)" }} data-testid="import-done">
            {done.map((d, i) => (
              <div key={i} className={i ? "text-xs text-[var(--mute)]" : ""}>
                <span className="font-bold up">{i ? "Saved earlier" : "Saved"}: {d.league}</span>
                {i === 0 && <div className="text-xs mt-0.5">{d.gamesAdded} new games, {d.gamesUpdated} updated · {d.rosterAdded} new roster spots · {d.standingsRows ?? 0} standings rows. Ready for the next file.</div>}
              </div>
            ))}
          </div>
        )}
        {rinks.length > 1 && (
          <select className="input w-full text-sm" value={rinkId} onChange={(e) => setRinkId(Number(e.target.value))}>
            {rinks.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
          </select>
        )}
        <label className="btn btn-ghost h-11 w-full cursor-pointer">
          {file ? `File: ${file}` : done.length ? "Choose the next file" : "Choose the report file"}
          <input key={pick} type="file" accept=".txt,text/plain" className="hidden" data-testid="input-import-file"
            onChange={async (e) => { const f = e.target.files?.[0]; if (!f) return; setFile(f.name); setLevel(""); setRes(null); const t = await f.text(); setText(t); }} />
        </label>
        <textarea className="input w-full h-24 py-2 text-xs" placeholder="Or paste the report here" value={text} onChange={(e) => { setText(e.target.value); setFile(null); setRes(null); }} data-testid="input-import-text" />
        {err && <p className="text-sm down">{err}</p>}
        {!s && <button className="btn btn-ghost h-11 w-full" disabled={!!busy || text.length < 50} onClick={() => send(false)} data-testid="button-import-preview">{busy === "preview" ? "Reading…" : "Preview"}</button>}
        {s && (
          <div className="rounded-xl border border-[var(--line)] p-3 text-xs space-y-1.5" data-testid="import-summary">
            <div className="font-bold text-sm">Preview · {s.league}{s.leagueCreated ? " (new league)" : ""}</div>
            {s.teamsCreated?.length > 0 && <div className="text-[var(--amber)]">New teams: {s.teamsCreated.join(", ")}. Check the spelling before importing.</div>}
            {(s.standingsRows > 0 || s.playerTotals > 0) && <div>{s.standingsRows} standings rows · {s.playerTotals} player season totals</div>}
            <div>{s.gamesAdded} new games, {s.gamesUpdated} updated{s.gamesSkipped.length ? `, ${s.gamesSkipped.length} skipped` : ""} · {s.lines} player lines</div>
            <div>{s.rosterAdded} new roster spots, {s.rosterExisting} already here</div>
            <div className="text-[var(--mute)]">Teams: {s.teams.map((t: any) => t.source === t.team ? t.team : `${t.source} → ${t.team}`).join(", ")}</div>
            {s.unassigned.length > 0 && <div className="text-[var(--mute)]">No scorer recorded: {s.unassigned.map((u: any) => `${u.date} ${u.team} ${u.goals}`).join("; ")}</div>}
            {s.gamesSkipped.map((g: any, i: number) => <div key={i} className="text-[var(--amber)]">Skipped {g.date}: {g.why}</div>)}
            {s.warnings.map((w: string, i: number) => <div key={i} className="text-[var(--amber)]">{w}</div>)}
          </div>
        )}
        {s && (s.needsLevel || s.leagueCreated) && (
          <label className="block" data-testid="field-import-level">
            <span className="label">Step 2 · Skill level for {s.league}{s.tag ? ` (${s.tag})` : ""}</span>
            <select className="input w-full mt-1" value={level || (s.needsLevel ? "" : s.level ?? "")} disabled={!!busy} onChange={(e) => { setLevel(e.target.value); if (e.target.value) send(false, e.target.value); }} data-testid="select-import-level">
              <option value="">Pick one</option>
              <option value="A">A: top level</option><option value="B">B</option><option value="C">C</option><option value="D">D: newest players</option>
            </select>
            <span className="block text-[11px] text-[var(--mute)] mt-1">Picking a level only updates the preview. Nothing is saved yet.</span>
          </label>
        )}
        {s && (
          <div className="flex gap-2">
            <button className="btn btn-ghost h-11 px-4" disabled={!!busy} onClick={reset} data-testid="button-import-cancel">Cancel</button>
            <button className="btn btn-red h-11 flex-1" disabled={!!busy || !ready} onClick={() => send(true)} data-testid="button-import-apply">
              {busy === "apply" ? "Saving…" : busy === "preview" ? "Updating preview…" : !ready ? "Pick a level first" : `Import ${s.league}`}
            </button>
          </div>
        )}
      </div>
    </Section>
  );
}
