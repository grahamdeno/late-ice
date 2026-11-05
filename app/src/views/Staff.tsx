"use client";
import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link, useLocation } from "@/lib/router";
import { useMe, act, ROLE_LABEL } from "@/lib/auth";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { BackBar, Empty, LevelPill, Loading, Section, TeamBadge } from "@/lib/ui";

const when = (s: string) => new Date(s).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });

/** Staff page: admin, support and rink staff each see their own sections. */
export default function Staff() {
  const [, nav] = useLocation();
  const { me, loading } = useMe();
  const { data, error } = useQuery<any>({ queryKey: ["/api/staff/overview"], enabled: !!me });
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => { if (!loading && !me) nav("/join"); }, [loading, me, nav]);
  if (loading || !me) return <Loading />;
  if (error) return <div><BackBar href="/me" title="Staff" /><Empty title="Staff only" body={(error as any).message} /></div>;
  if (!data) return <Loading />;
  const run = async (method: string, url: string, body?: unknown) => { const e = await act(method, url, body); setErr(e); return !e; };

  return (
    <div>
      <BackBar href="/me" title="Staff" />
      <h1 className="font-black text-2xl">Staff</h1>
      <div className="flex flex-wrap gap-1.5 mt-2">
        {data.roles.filter((r: any) => !["captain", "assistant_captain"].includes(r.role)).map((r: any) => (
          <span key={r.id} className="chip h-7 text-[11px]">{ROLE_LABEL[r.role]}{r.where ? ` · ${r.where}` : ""}</span>
        ))}
      </div>
      {err && <p className="text-sm down mt-3" data-testid="text-error">{err}</p>}

      <Requests run={run} />
      {data.isSupport || data.isAdmin ? <SupportDesk run={run} isAdmin={data.isAdmin} /> : null}
      {data.rinks.map((r: any) => <RinkSection key={r.id} rink={r} run={run} />)}
      {data.rinks.some((r: any) => r.manage) && <ImportSection rinks={data.rinks.filter((r: any) => r.manage)} />}
      {data.isAdmin && <AdminSection data={data} run={run} />}
      <Audit rinks={data.rinks} broad={data.isSupport || data.isAdmin} />
    </div>
  );
}

type Run = (method: string, url: string, body?: unknown) => Promise<boolean>;

function Requests({ run }: { run: Run }) {
  const { data } = useQuery<any[]>({ queryKey: ["/api/staff/requests"] });
  if (!data?.length) return null;
  return (
    <Section title="Waiting on you" action={<span className="label text-[var(--red)]">{data.length}</span>}>
      <div className="space-y-2">
        {data.map((r) => (
          <div key={r.id} className="card p-4" data-testid={`card-request-${r.id}`}>
            <div className="font-bold text-sm">
              {r.kind === "rink_manager" ? `${r.requester ?? r.requester_email} wants to manage ${r.rink_name}` : `${r.requester} says they're the captain of ${r.team_name}`}
            </div>
            <p className="text-xs text-[var(--mute)] mt-0.5">
              {r.kind === "rink_manager" ? `${r.requester_email}. Call the rink to confirm before approving.` : `Current captain: ${r.target ?? "none"}. Approving makes ${r.requester} captain.`}
              {r.message ? ` Note: "${r.message}"` : ""}
            </p>
            <div className="grid grid-cols-2 gap-2 mt-3">
              <button className="btn btn-ghost h-10" onClick={() => run("POST", `/api/staff/requests/${r.id}`, { decision: "decline" })} data-testid={`button-decline-request-${r.id}`}>Decline</button>
              <button className="btn btn-red h-10" onClick={() => run("POST", `/api/staff/requests/${r.id}`, { decision: "approve" })} data-testid={`button-approve-request-${r.id}`}>Approve</button>
            </div>
          </div>
        ))}
      </div>
    </Section>
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

function RinkSection({ rink, run }: { rink: any; run: Run }) {
  const [email, setEmail] = useState("");
  const [role, setRole] = useState("scorekeeper");
  const [league, setLeague] = useState<number | null>(rink.leagues[0]?.id ?? null);
  return (
    <Section title={rink.name}>
      {rink.leagues.map((l: any) => (
        <div key={l.id} className="card mt-2">
          <div className="p-3.5 flex items-center gap-2 border-b border-[var(--line)]"><LevelPill level={l.level === "DEMO" ? "Demo" : l.level} /><span className="font-bold text-sm">{l.name}</span></div>
          <div className="divide-y divide-[var(--line)]">
            {l.teams.map((t: any) => (
              <Link key={t.id} href={`/team/${t.id}`} className="flex items-center gap-3 p-3 text-sm" data-testid={`row-staff-team-${t.id}`}>
                <TeamBadge team={t} size={24} />
                <span className="flex-1 min-w-0 truncate font-bold">{t.name}</span>
                <span className="text-xs text-[var(--mute)]">{t.is_sample ? "placeholder" : t.captain ? `C: ${t.captain}` : "no captain"} · {t.registered}/{t.roster}</span>
              </Link>
            ))}
          </div>
        </div>
      ))}
      {rink.manage && (
        <div className="card mt-3 p-4">
          <div className="label mb-2">Rink staff</div>
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
  return (
    <Section title="Admin">
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
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const send = async (apply: boolean) => {
    setBusy(true); setErr(null);
    try {
      const r = await apiRequest("POST", "/api/staff/import", { text, rinkId, apply });
      setRes(await r.json());
      if (apply) await queryClient.invalidateQueries();
    } catch (e: any) { setErr(e.message); }
    setBusy(false);
  };
  const s = res?.summary;
  return (
    <Section title="Import from DaySmart">
      <div className="card p-4 space-y-3" data-testid="card-import">
        <p className="text-xs text-[var(--mute)]">Upload the report Grok collected, one league at a time. You'll see a preview before anything is saved. Leagues and teams that aren't here yet are added, rosters become unclaimed spots, and standings and season totals come from the league's own pages.</p>
        {rinks.length > 1 && (
          <select className="input w-full text-sm" value={rinkId} onChange={(e) => setRinkId(Number(e.target.value))}>
            {rinks.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
          </select>
        )}
        <label className="btn btn-ghost h-11 w-full cursor-pointer">
          {file ? `File: ${file}` : "Choose the report file"}
          <input type="file" accept=".txt,text/plain" className="hidden" data-testid="input-import-file"
            onChange={async (e) => { const f = e.target.files?.[0]; if (!f) return; setFile(f.name); setText(await f.text()); setRes(null); }} />
        </label>
        <textarea className="input w-full h-24 py-2 text-xs" placeholder="Or paste the report here" value={text} onChange={(e) => { setText(e.target.value); setFile(null); setRes(null); }} data-testid="input-import-text" />
        {err && <p className="text-sm down">{err}</p>}
        <button className="btn btn-ghost h-11 w-full" disabled={busy || text.length < 50} onClick={() => send(false)} data-testid="button-import-preview">{busy && !res ? "Reading…" : "Preview"}</button>
        {s && (
          <div className="rounded-xl border border-[var(--line)] p-3 text-xs space-y-1.5" data-testid="import-summary">
            <div className="font-bold text-sm">{res.applied ? "Imported" : "Preview"} · {s.league}{s.leagueCreated ? " (new league)" : ""}</div>
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
        {s && !res.applied && <button className="btn btn-red h-11 w-full" disabled={busy} onClick={() => send(true)} data-testid="button-import-apply">{busy ? "Importing…" : "Import it"}</button>}
      </div>
    </Section>
  );
}
