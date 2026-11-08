"use client";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link, canGoBack, useBack } from "@/lib/router";
import { useMe, act, STATUS_LABEL, POSITION_LABEL } from "@/lib/auth";
import { apiRequest } from "@/lib/queryClient";
import { Loading, More, Section, TeamBadge, fmtRating } from "@/lib/ui";

const COLORS = ["#EF4444", "#F97316", "#F5B301", "#22C55E", "#14B8A6", "#3B82F6", "#8B5CF6", "#EC4899", "#A3A3A3", "#F8FAFC"];
const ACTION_TEXT: Record<string, string> = {
  mark_sub: "marked as a sub:", unmark_sub: "put back on the roster:", invite_link: "made an invite link", invite_revoked: "turned off the invite link",
  claim: "claimed", match: "matched", draft: "drafted", release: "released", remove: "removed", merge: "merged", add_spot: "added", edit_spot: "edited",
  captain: "became captain", step_down: "stepped down as captain", decline: "declined", contest: "contested the captain", edit_team: "edited the team",
  assistant: "named an assistant captain:", assistant_removed: "removed an assistant captain:", captain_assigned: "set the captain:",
};
const today = () => new Date().toISOString().slice(0, 10);
const isOut = (s: any) => s.registered && ["ir", "away"].includes(s.status) && (!s.status_until || s.status_until >= today());

/** One place for a captain to run the team: roster, adding players, invites, the draft pool, leadership and the team itself. */
export default function ManageTeam({ id }: { id: string }) {
  const teamId = Number(id);
  const back = useBack(`/team/${teamId}`);
  const { me } = useMe();
  const { data, error } = useQuery<any>({ queryKey: [`/api/teams/${teamId}/manage`], enabled: !!me });
  const team = useQuery<any>({ queryKey: [`/api/teams/${teamId}`] });
  const [err, setErr] = useState<string | null>(null);
  if (!me) return <div className="card p-4 text-sm">Sign in to manage a team. <Link href="/join" className="text-[var(--blue)] font-bold">Join</Link></div>;
  if (error) return <div className="card p-4 text-sm">{(error as any).message ?? "Only the captain, an assistant or rink staff can manage this team."}</div>;
  if (!data) return <Loading error={error} />;
  const myRole = me.captainTeams.find((t) => t.id === teamId)?.role ?? null;
  const isCaptain = myRole === "captain" || (!myRole && me.staff);
  const canMerge = myRole === "captain" || (me.roles ?? []).some((r: any) => ["commissioner", "rink_manager", "admin"].includes(r.role));
  const assistants: { id: number; name: string }[] = team.data?.assistants ?? [];
  const run = async (method: string, url: string, body?: unknown) => { const r = await act(method, url, body, ["/api/teams", "/api/me", "/api/players", "/api/standings", "/api/pool"]); setErr(r); return !r; };
  const c = data.counts;
  const skaters = data.slots.filter((s: any) => !s.is_sub && s.position !== "G" && !isOut(s));
  const goalies = data.slots.filter((s: any) => !s.is_sub && s.position === "G" && !isOut(s));
  const out = data.slots.filter((s: any) => !s.is_sub && isOut(s));
  const subs = data.slots.filter((s: any) => s.is_sub);

  return (
    <div>
      <a href={`/team/${teamId}`} onClick={(e) => { e.preventDefault(); back(); }} className="text-xs text-[var(--mute)] inline-flex items-center min-h-[44px]" data-testid="link-back-team">‹ {canGoBack() ? "Back" : data.team.name}</a>
      <div className="flex items-center gap-3 mt-1">
        <TeamBadge team={data.team} size={40} />
        <h1 className="font-display text-[34px] leading-none font-black uppercase">Manage team</h1>
      </div>
      <div className="card mt-4 p-3.5 grid grid-cols-3 gap-2 text-center" data-testid="card-roster-counts">
        <Count n={c.skaters} max={c.rosterMax} label="Skaters" />
        <Count n={c.goalies} max={c.goalieMax} label="Goalies" />
        <div><div className="font-display text-2xl font-black tnum">{c.out}</div><div className="text-xs text-[var(--mute)]">On IR or away</div></div>
      </div>
      <p className="text-xs text-[var(--mute)] mt-2 px-1">Subs never count. A player on injured reserve or away frees their spot until they're back. Rink staff set the sizes per league.</p>
      {err && <p className="text-sm down mt-2 px-1" data-testid="text-error">{err}</p>}

      <Section title="Roster">
        <Group title="Skaters" rows={skaters} teamId={teamId} me={me} isCaptain={isCaptain} canMerge={canMerge} run={run} />
        <Group title="Goalies" rows={goalies} teamId={teamId} me={me} isCaptain={isCaptain} canMerge={canMerge} run={run} />
        {out.length > 0 && <Group title="Injured reserve and away" rows={out} teamId={teamId} me={me} isCaptain={isCaptain} canMerge={canMerge} run={run} />}
        {subs.length > 0 && <Group title="Subs" rows={subs} teamId={teamId} me={me} isCaptain={isCaptain} canMerge={canMerge} run={run} />}
        {data.slots.length === 0 && <div className="card p-4 text-sm text-[var(--mute)]">Nobody on the roster yet. Add players below, or draft from the pool.</div>}
      </Section>

      <More title="Add a player" hint="For a teammate who isn't in the app yet" testid="button-more-add-player">
        <div className="p-3"><AddSpot teamId={teamId} full={{ skaters: c.skaters >= c.rosterMax, goalies: c.goalies >= c.goalieMax }} run={run} /></div>
      </More>

      <More title="Invites and the draft pool" hint="Share a link, or pull a registered player onto the roster" count={data.joined.length || undefined} testid="button-more-invites">
        <div className="p-3">
        <Link href={`/pool/${teamId}`} className="btn btn-red h-11 w-full mb-2" data-testid="link-draft">Open the draft pool</Link>
        <InviteLink teamId={teamId} teamName={data.team.name} invites={data.invites} />
        {data.joined.length > 0 && (
          <div className="card mt-2 p-3.5" data-testid="card-joined">
            <div className="label mb-1">Came in on your link, no spot yet</div>
            {data.joined.map((j: any) => (
              <div key={j.id} className="flex items-center gap-2 text-sm py-1">
                <span className="flex-1 truncate">{j.name}{j.number ? ` #${j.number}` : ""}{j.position ? ` · ${POSITION_LABEL[j.position] ?? j.position}` : ""}</span>
                <button className="btn btn-ghost h-11 text-xs" onClick={() => run("POST", `/api/teams/${teamId}/draft`, { userId: j.id })} data-testid={`button-draft-joined-${j.id}`}>Add to roster</button>
              </div>
            ))}
          </div>
        )}
        </div>
      </More>

      {isCaptain && (
        <More title="Leadership" hint="Assistant captains and handing off the captaincy" testid="button-more-leadership"><div className="p-3">
          <div className="card p-4" data-testid="card-assistant-picker">
            <div className="text-sm font-bold">Assistant captains <span className="text-[var(--mute)] font-medium">({assistants.length} of 2)</span></div>
            <p className="text-xs text-[var(--mute)] mt-0.5">They run the roster and schedule with you. Only the captain names assistants, hands off or edits the team.</p>
            <div className="mt-2 space-y-1.5">
              {assistants.map((a) => (
                <div key={a.id} className="flex items-center gap-2 text-sm">
                  <span className="h-5 w-5 rounded-full bg-[var(--ice-3)] border border-[var(--line)] text-[10px] font-black flex items-center justify-center">A</span>
                  <span className="flex-1 truncate">{a.name}</span>
                  <button className="btn btn-ghost h-11 text-xs" onClick={() => run("DELETE", `/api/teams/${teamId}/assistants?userId=${a.id}`)} data-testid={`button-remove-assistant-${a.id}`}>Remove</button>
                </div>
              ))}
            </div>
            {assistants.length < 2 && (
              <select className="input w-full mt-2 text-sm" value="" onChange={(e) => e.target.value && run("POST", `/api/teams/${teamId}/assistants`, { userId: Number(e.target.value) })} data-testid="select-add-assistant">
                <option value="">Add an assistant captain…</option>
                {data.slots.filter((s: any) => s.registered && s.user_id !== me.user.id && !assistants.some((a) => a.id === s.user_id)).map((s: any) => (
                  <option key={s.id} value={s.user_id}>{s.user_name ?? s.name}{s.number ? ` #${s.number}` : ""}</option>
                ))}
              </select>
            )}
            <select className="input w-full mt-2 text-sm" value="" onChange={(e) => e.target.value && confirm("Offer the captaincy? They accept from their profile, and you become a regular player.") && run("POST", `/api/teams/${teamId}/captain/handoff`, { userId: Number(e.target.value) })} data-testid="select-handoff">
              <option value="">Hand off captaincy to…</option>
              {data.slots.filter((s: any) => s.registered && s.user_id !== me.user.id).map((s: any) => (
                <option key={s.id} value={s.user_id}>{s.user_name ?? s.name}{s.number ? ` #${s.number}` : ""}</option>
              ))}
            </select>
          </div>
        </div></More>
      )}

      {isCaptain && (
        <More title="Team" hint="Name, colors and the calendar feed" testid="button-more-team"><div className="p-3">
          <TeamForm teamId={teamId} team={data.team} run={run} />
          <Link href={`/team/${teamId}#schedule`} className="card mt-2 p-3.5 flex items-center gap-3 text-sm" data-testid="link-team-schedule">
            <span className="flex-1"><span className="block font-bold">Schedule and calendar feed</span><span className="block text-xs text-[var(--mute)]">Connect the rink's calendar so games fill in on their own.</span></span><span>›</span>
          </Link>
        </div></More>
      )}

      {data.actions.length > 0 && (
        <details className="card mt-4 p-4 text-xs">
          <summary className="font-bold text-sm cursor-pointer">Roster history</summary>
          <div className="mt-2 space-y-1.5 text-[var(--mute)]">
            {data.actions.map((a: any) => (
              <div key={a.id}>{a.actor ?? "Someone"} {ACTION_TEXT[a.action] ?? a.action}{a.player ? ` ${a.player}` : ""}{a.target && a.target !== a.actor && a.action !== "release" ? ` (${a.target})` : ""} · {a.created_at.slice(0, 10)}</div>
            ))}
          </div>
        </details>
      )}
      {myRole === "captain" && <button className="text-xs text-[var(--mute)] mt-4 px-1 min-h-[44px]" onClick={() => confirm(assistants.length ? `Step down? ${assistants[0].name} becomes captain.` : "Step down as captain? Anyone on the roster can take the role.") && run("POST", `/api/teams/${teamId}/captain/step-down`)} data-testid="button-step-down">Step down as captain</button>}
    </div>
  );
}

function Count({ n, max, label }: { n: number; max: number; label: string }) {
  const full = n >= max;
  return (
    <div>
      <div className={`font-display text-2xl font-black tnum ${full ? "text-[var(--amber)]" : ""}`}>{n}<span className="text-[var(--mute)] text-base font-bold"> / {max}</span></div>
      <div className="text-xs text-[var(--mute)]">{label}{full ? " · full" : ""}</div>
    </div>
  );
}

function Group({ title, rows, teamId, me, isCaptain, canMerge, run }: { title: string; rows: any[]; teamId: number; me: any; isCaptain: boolean; canMerge: boolean; run: (m: string, u: string, b?: unknown) => Promise<boolean> }) {
  const [openId, setOpenId] = useState<number | null>(null);
  const [mergeFrom, setMergeFrom] = useState<number | null>(null);
  const [preview, setPreview] = useState<null | { moving: { id: number; name: string; number: string | null }; kept: { id: number; name: string; number: string | null }; games: number; points: number }>(null);
  const [mergeErr, setMergeErr] = useState<string | null>(null);
  const [edit, setEdit] = useState<{ id: number; number: string; position: string } | null>(null);
  const askMerge = async (intoId: number) => {
    if (!mergeFrom) return;
    setMergeErr(null);
    try {
      const res = await apiRequest("GET", `/api/teams/${teamId}/merge?from=${mergeFrom}&into=${intoId}`);
      setPreview(await res.json());
    } catch (e: any) { setPreview(null); setMergeErr(e?.message || "Couldn't load that merge."); }
  };
  const who = (p: { name: string; number: string | null }) => `${p.name}${p.number ? ` #${p.number}` : ""}`;
  if (!rows.length) return null;
  return (
    <div className="mb-3">
      <div className="label px-1 mb-1">{title} · {rows.length}</div>
      {mergeFrom && <div className="text-xs text-[var(--white)] font-bold px-1 mb-1">Pick the spot that's the same person, or <button className="text-[var(--blue)]" onClick={() => { setMergeFrom(null); setPreview(null); setMergeErr(null); }}>cancel</button>.</div>}
      {mergeErr && <p className="text-sm down px-1 mb-1" data-testid="text-merge-error">{mergeErr}</p>}
      {preview && (
        <div className="card mb-2 p-3 text-sm" data-testid="card-merge-confirm">
          <p>Merge {who(preview.moving)} into {who(preview.kept)}. This moves {preview.games} games and {preview.points} points. It can&apos;t be undone.</p>
          <div className="flex gap-2 mt-2">
            <button className="btn btn-red h-11 text-xs" data-testid="button-merge-confirm" onClick={async () => { if (await run("POST", `/api/teams/${teamId}/merge`, { fromId: preview.moving.id, intoId: preview.kept.id })) { setPreview(null); setMergeFrom(null); } }}>Merge these players</button>
            <button type="button" className="btn btn-ghost h-11 text-xs" onClick={() => setPreview(null)} data-testid="button-merge-cancel">Cancel</button>
          </div>
        </div>
      )}
      <div className="card divide-y divide-[var(--line)]">
        {rows.map((s: any) => (
          <div key={s.id} className={`p-3 ${mergeFrom === s.id ? "bg-[var(--red-dim)]" : ""}`} data-testid={`row-slot-${s.id}`}>
            <button type="button" className="w-full min-h-[44px] flex items-center gap-3 text-sm text-left" onClick={() => { setOpenId(openId === s.id ? null : s.id); setEdit(null); }} aria-expanded={openId === s.id} data-testid={`button-slot-${s.id}`}>
              <span className="tnum text-[var(--mute)] w-8">{s.number ? `#${s.number}` : "–"}</span>
              <span className="flex-1 min-w-0">
                <span className="block font-bold truncate">{s.name}{s.badge ? <span className="ml-1.5 text-[10px] font-black text-[var(--mute)]">{s.badge}</span> : null}</span>
                <span className="block text-xs text-[var(--mute)]">
                  {POSITION_LABEL[s.position] ?? s.position} · {s.registered ? <span className="up">Registered</span> : "Not signed up yet"}
                  {s.registered && s.status && !["active", "available"].includes(s.status) ? ` · ${STATUS_LABEL[s.status]}${s.status_until ? ` until ${s.status_until}` : ""}` : ""}
                </span>
              </span>
              <span className="tnum font-display text-lg">{fmtRating(s.rating)}</span>
              {!mergeFrom && <span className="text-[var(--mute)] text-xs w-3">{openId === s.id ? "▾" : "›"}</span>}
            </button>
            {(openId === s.id || (mergeFrom && mergeFrom !== s.id)) && (
              <div className="mt-2 pl-11">
                {mergeFrom && mergeFrom !== s.id ? (
                  <button className="btn btn-red h-11 text-xs" onClick={() => askMerge(s.id)} data-testid={`button-merge-into-${s.id}`}>Same person</button>
                ) : edit && edit.id === s.id ? (
                  <form className="flex flex-wrap gap-1.5 items-center" onSubmit={async (e) => { e.preventDefault(); const cur = edit; if (!cur) return; if (await run("PATCH", `/api/teams/${teamId}/slots/${s.id}`, { number: cur.number, ...(s.registered ? {} : { position: cur.position }) })) setEdit(null); }}>
                    <input className="input h-9 w-16 text-center tnum" inputMode="numeric" maxLength={2} value={edit.number} onChange={(e) => setEdit({ ...edit, number: e.target.value.replace(/\D/g, "").slice(0, 2) })} aria-label="Number" data-testid={`input-edit-number-${s.id}`} />
                    {!s.registered && (
                      <select className="input h-9 text-sm" value={edit.position} onChange={(e) => setEdit({ ...edit, position: e.target.value })} aria-label="Position" data-testid={`select-edit-position-${s.id}`}>
                        {(["C", "W", "D", "G"] as const).map((p) => <option key={p} value={p}>{POSITION_LABEL[p]}</option>)}
                      </select>
                    )}
                    <button className="btn btn-red h-11 text-xs" data-testid={`button-save-edit-${s.id}`}>Save</button>
                    <button type="button" className="btn btn-ghost h-11 text-xs" onClick={() => setEdit(null)}>Cancel</button>
                  </form>
                ) : (
                  <div className="flex flex-wrap gap-1.5">
                    <button className="btn btn-ghost h-11 text-xs" onClick={() => setEdit({ id: s.id, number: s.number ?? "", position: ["C", "W", "D", "G"].includes(s.position) ? s.position : "W" })} data-testid={`button-edit-${s.id}`}>Edit</button>
                    {!s.registered && <Link href={`/pool/${teamId}/match/${s.id}`} className="btn btn-ghost h-11 text-xs" data-testid={`button-match-${s.id}`}>Match to a player</Link>}
                    {s.registered && s.user_id !== me.user.id && <button className="btn btn-ghost h-11 text-xs" onClick={() => confirm(`Release ${s.name}'s claim on this spot?`) && run("POST", `/api/teams/${teamId}/slots/${s.id}/release`)} data-testid={`button-release-${s.id}`}>Release</button>}
                    {canMerge && <button className="btn btn-ghost h-11 text-xs" onClick={() => { setMergeFrom(s.id); setPreview(null); setOpenId(null); }} data-testid={`button-merge-${s.id}`}>Same person as…</button>}
                    {s.user_id !== me.user.id && !s.badge && <button className="btn btn-ghost h-11 text-xs" onClick={() => run("PATCH", `/api/teams/${teamId}/slots/${s.id}/sub`, { sub: !s.is_sub })} data-testid={`button-sub-${s.id}`}>{s.is_sub ? "Full roster" : "Make a sub"}</button>}
                    {s.user_id !== me.user.id && (isCaptain || !s.badge) && <button className="btn btn-ghost h-11 text-xs down" onClick={() => confirm(`Take ${s.name} off the roster? Games already played keep their lines.`) && run("POST", `/api/teams/${teamId}/slots/${s.id}/remove`)} data-testid={`button-remove-${s.id}`}>Remove</button>}
                  </div>
                )}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

function AddSpot({ teamId, full, run }: { teamId: number; full: { skaters: boolean; goalies: boolean }; run: (m: string, u: string, b?: unknown) => Promise<boolean> }) {
  const [v, setV] = useState({ name: "", number: "", position: "W", sub: false });
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<string | null>(null);
  const isFull = v.position === "G" ? full.goalies : full.skaters;
  return (
    <form className="card p-4 space-y-2.5" onSubmit={async (e) => {
      e.preventDefault(); setBusy(true); setDone(null);
      if (await run("POST", `/api/teams/${teamId}/slots`, { ...v, sub: v.sub || isFull })) { setDone(`${v.name} is on the roster. They claim the spot when they sign up.`); setV({ name: "", number: "", position: v.position, sub: false }); }
      setBusy(false);
    }} data-testid="form-add-spot">
      <p className="text-xs text-[var(--mute)]">For a teammate who isn't in the app yet. Their stats start collecting now; they claim the spot when they join.</p>
      <input className="input w-full" placeholder="First and last name" value={v.name} onChange={(e) => setV({ ...v, name: e.target.value })} required data-testid="input-spot-name" />
      <div className="grid grid-cols-[80px_1fr] gap-2">
        <input className="input w-full tnum text-center" inputMode="numeric" maxLength={2} placeholder="#" value={v.number} onChange={(e) => setV({ ...v, number: e.target.value.replace(/\D/g, "").slice(0, 2) })} aria-label="Number" data-testid="input-spot-number" />
        <div className="grid grid-cols-4 gap-1.5">
          {(["C", "W", "D", "G"] as const).map((p) => (
            <button type="button" key={p} onClick={() => setV({ ...v, position: p })} className={`h-11 rounded-xl border text-sm font-bold ${v.position === p ? "border-[var(--red)] bg-[var(--red-dim)]" : "border-[var(--line)] bg-[var(--ice-3)]"}`} data-testid={`button-spot-position-${p}`}>{POSITION_LABEL[p]}</button>
          ))}
        </div>
      </div>
      <label className="flex items-center gap-3 text-sm min-h-[44px]"><input type="checkbox" className="h-6 w-6 shrink-0" checked={v.sub || isFull} onChange={(e) => setV({ ...v, sub: e.target.checked })} disabled={isFull} data-testid="checkbox-spot-sub" /> Sub (doesn't count toward the roster){isFull ? " · roster is full" : ""}</label>
      {done && <p className="text-sm up" data-testid="text-spot-added">{done}</p>}
      <button className="btn btn-red w-full h-11" disabled={busy || v.name.trim().split(/\s+/).length < 2} data-testid="button-add-spot">{busy ? "Adding…" : "Add to roster"}</button>
    </form>
  );
}

function TeamForm({ teamId, team, run }: { teamId: number; team: any; run: (m: string, u: string, b?: unknown) => Promise<boolean> }) {
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(team.name);
  const [color, setColor] = useState(team.color);
  return (
    <div className="card p-4">
      {!editing ? (
        <div className="flex items-center gap-3">
          <span className="h-6 w-6 rounded-full" style={{ background: team.color }} />
          <span className="flex-1 text-sm font-bold">{team.name}</span>
          <button className="btn btn-ghost h-11 text-xs" onClick={() => setEditing(true)} data-testid="button-edit-team">Edit</button>
        </div>
      ) : (
        <form className="space-y-3" onSubmit={async (e) => { e.preventDefault(); if (await run("PATCH", `/api/teams/${teamId}`, { name, color })) setEditing(false); }}>
          <input className="input w-full" value={name} onChange={(e) => setName(e.target.value)} data-testid="input-team-name" />
          <div className="flex flex-wrap gap-2">
            {COLORS.map((c) => (
              <button type="button" key={c} onClick={() => setColor(c)} className="h-8 w-8 rounded-full" style={{ background: c, outline: color.toUpperCase() === c ? "2px solid var(--white)" : "none", outlineOffset: 2 }} aria-label={c} />
            ))}
          </div>
          <div className="grid grid-cols-2 gap-2">
            <button type="button" className="btn btn-ghost h-11" onClick={() => setEditing(false)}>Cancel</button>
            <button className="btn btn-red h-11" data-testid="button-save-team">Save</button>
          </div>
        </form>
      )}
    </div>
  );
}

/** The team's invite link: whoever joins through it is let in and pointed at this roster. */
export function InviteLink({ teamId, teamName, invites }: { teamId: number; teamName: string; invites?: any[] }) {
  const q = useQuery<any>({ queryKey: [`/api/teams/${teamId}/invite`], enabled: !invites });
  const [err, setErr] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const inv = invites ? invites[0] ?? null : q.data?.invite;
  const path = inv ? (inv.path ?? `/join?invite=${inv.token}`) : "";
  const url = inv && typeof window !== "undefined" ? `${window.location.origin}${path}` : "";
  const share = async () => {
    try {
      if (navigator.share) await navigator.share({ title: `Join ${teamName} on Late Ice`, url });
      else { await navigator.clipboard.writeText(url); setCopied(true); setTimeout(() => setCopied(false), 2000); }
    } catch { /* closed the share sheet */ }
  };
  return (
    <div className="card p-4" data-testid="card-invite">
      <div className="label mb-1">Invite link</div>
      <p className="text-xs text-[var(--mute)]">Anyone who joins through it is let in and lands on this roster. Send it to teammates only.</p>
      {inv ? (
        <>
          <div className="mt-2 rounded-xl bg-[var(--ice-3)] px-3 py-2 text-xs break-all tnum" data-testid="text-invite-url">{url}</div>
          <div className="text-xs text-[var(--mute)] mt-1">{inv.uses} of {inv.maxUses ?? inv.max_uses} uses</div>
          <div className="grid grid-cols-2 gap-2 mt-2">
            <button className="btn btn-red h-11 text-sm" onClick={share} data-testid="button-share-invite">{copied ? "Copied" : "Share link"}</button>
            <button className="btn btn-ghost h-11 text-sm" onClick={async () => { if (!confirm("Turn this link off? Anyone who has it won't get in.")) return; setErr(await act("DELETE", `/api/teams/${teamId}/invite`, undefined, ["/api/teams"])); }} data-testid="button-revoke-invite">Turn off link</button>
          </div>
        </>
      ) : (
        <button className="btn btn-red h-11 text-sm mt-2" onClick={async () => setErr(await act("POST", `/api/teams/${teamId}/invite`, undefined, ["/api/teams"]))} data-testid="button-make-invite">Make an invite link</button>
      )}
      {err && <p className="text-xs down mt-2">{err}</p>}
      <Link href="/desk" className="hidden md:block text-xs font-bold text-[var(--blue)] mt-3" data-testid="link-desk-joined">On a computer? See who's joined on Rink Desk</Link>
    </div>
  );
}
