"use client";
import { useEffect, useState } from "react";
import { Link, useLocation } from "@/lib/router";
import { useMe, act, signOut, POSITION_LABEL, STATUS_LABEL } from "@/lib/auth";
import { Empty, LevelPill, Loading, Section, TeamBadge, fmtRating } from "@/lib/ui";
import { ProfileForm } from "./Join";

function timeAgo(s: string) {
  const t = new Date(s).getTime();
  const m = Math.round((Date.now() - t) / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.round(m / 60);
  return h < 24 ? `${h}h ago` : `${Math.round(h / 24)}d ago`;
}

export default function MePage() {
  const [, nav] = useLocation();
  const { me, loading } = useMe();
  const [editing, setEditing] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [until, setUntil] = useState("");

  useEffect(() => { if (!loading && !me) nav("/join"); }, [loading, me, nav]);
  useEffect(() => { if (me && !me.user.profileComplete) nav("/join"); }, [me, nav]);
  useEffect(() => { if (me?.unread) { const t = setTimeout(() => act("POST", "/api/me/notifications/read"), 2500); return () => clearTimeout(t); } }, [me?.unread]);
  useEffect(() => { setUntil(me?.user.statusUntil ?? ""); }, [me?.user.statusUntil]);

  if (loading || !me) return <Loading />;
  const u = me.user;
  const run = async (method: string, url: string, body?: unknown) => setErr(await act(method, url, body));

  return (
    <div>
      <div className="card-hi p-5">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="label">{u.homeRink?.name}</div>
            <h1 className="font-black text-[26px] leading-tight mt-1" data-testid="text-me-name">{u.name}</h1>
            <div className="text-sm text-[var(--mute)] mt-1">{u.number ? `#${u.number} · ` : ""}{u.position ? POSITION_LABEL[u.position] : ""}</div>
          </div>
          <button className="btn btn-ghost h-9 text-sm" onClick={() => setEditing((e) => !e)} data-testid="button-edit-profile">{editing ? "Close" : "Edit"}</button>
        </div>
        {u.hidden && <div className="mt-3 text-xs text-[var(--mute)]">Your name is hidden. Teammates and the public see your number only.</div>}
      </div>
      {editing && <ProfileForm submitLabel="Save" onDone={() => setEditing(false)} />}
      {err && <p className="text-sm down mt-3 px-1" data-testid="text-error">{err}</p>}

      {me.notifications.length > 0 && (
        <Section title="Notifications" action={me.unread ? <span className="label text-[var(--red)]">{me.unread} new</span> : undefined}>
          <div className="card divide-y divide-[var(--line)]">
            {me.notifications.slice(0, 8).map((n) => {
              const body = (
                <div className="flex gap-3 p-3.5">
                  <span className={`mt-1.5 h-2 w-2 rounded-full shrink-0 ${n.read_at ? "bg-transparent" : "bg-[var(--red)]"}`} />
                  <span className="flex-1 min-w-0">
                    <span className="block text-sm font-bold">{n.title}</span>
                    {n.body && <span className="block text-xs text-[var(--mute)] mt-0.5">{n.body}</span>}
                  </span>
                  <span className="text-[11px] text-[var(--mute)] shrink-0">{timeAgo(n.created_at)}</span>
                </div>
              );
              return n.link ? <Link key={n.id} href={n.link} data-testid={`row-notice-${n.id}`}>{body}</Link> : <div key={n.id}>{body}</div>;
            })}
          </div>
        </Section>
      )}

      {me.suggestions.length > 0 && (
        <Section title="Is this you?">
          <div className="card divide-y divide-[var(--line)]">
            {me.suggestions.map((s) => (
              <div key={s.id} className="flex items-center gap-3 p-3.5" data-testid={`row-suggestion-${s.id}`}>
                <TeamBadge team={{ id: s.team_id, name: s.team_name, color: s.color, logo: s.logo }} size={32} />
                <span className="flex-1 min-w-0">
                  <span className="block font-bold truncate">{s.number ? `#${s.number} ` : ""}{s.name}</span>
                  <span className="block text-xs text-[var(--mute)] truncate">{s.team_name} · {s.level} League</span>
                </span>
                <button className="btn btn-red h-9 text-sm" onClick={() => run("POST", `/api/players/${s.id}/claim`)} data-testid={`button-claim-${s.id}`}>That's me</button>
              </div>
            ))}
          </div>
          <p className="text-[11px] text-[var(--mute)] mt-2 px-1">Claiming moves that spot's goals, assists and rating onto your profile. Your captain sees the claim and can undo it.</p>
        </Section>
      )}

      <Section title="My teams">
        {me.slots.length ? (
          <div className="space-y-2">
            {me.slots.map((s) => (
              <div key={`${s.team_id}-${s.id}`} className="card p-4" data-testid={`card-my-team-${s.team_id}`}>
                <Link href={`/team/${s.team_id}`} className="flex items-center gap-3">
                  <TeamBadge team={{ id: s.team_id, name: s.team_name, color: s.color, logo: s.logo }} size={40} />
                  <span className="flex-1 min-w-0">
                    <span className="flex items-center gap-2"><LevelPill level={s.level === "DEMO" ? "Demo" : s.level} /><span className="font-bold truncate">{s.team_name}</span></span>
                    <span className="block text-xs text-[var(--mute)] mt-0.5">
                      {s.number ? `#${s.number}` : "No number"}{s.isCaptain ? " · Captain" : s.captain ? ` · Captain: ${s.captain.name}` : " · No captain yet"}
                    </span>
                  </span>
                  <span className="text-right">
                    <span className="block font-display text-2xl tnum">{fmtRating(s.rating)}</span>
                    <span className="block text-[10px] label">LIR</span>
                  </span>
                </Link>
                <div className="flex flex-wrap gap-2 mt-3">
                  <Link href={`/player/${s.id}`} className="btn btn-ghost h-9 text-sm">Rating history</Link>
                  {s.isCaptain && <Link href={`/team/${s.team_id}`} className="btn btn-red h-9 text-sm" data-testid={`button-manage-${s.team_id}`}>Manage roster</Link>}
                  {!s.captain && <button className="btn btn-ghost h-9 text-sm" onClick={() => run("POST", `/api/teams/${s.team_id}/captain`)} data-testid={`button-become-captain-${s.team_id}`}>I'm the captain</button>}
                  {s.source === "draft" && !s.isCaptain && <button className="btn btn-ghost h-9 text-sm" onClick={() => confirm(`Leave ${s.team_name}?`) && run("POST", `/api/me/decline/${s.team_id}`)} data-testid={`button-decline-${s.team_id}`}>Not my team</button>}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <Empty title="You're in the draft pool" body={`Captains at ${u.homeRink?.name ?? "your rink"} can see you and pull you onto their team. If the scoresheet already has you, it shows up above as "Is this you?"`} />
        )}
      </Section>

      {me.captainTeams.length > 0 && (
        <Section title="Captain">
          <Link href={`/pool`} className="card-hi p-4 flex items-center gap-3" data-testid="link-pool">
            <span className="flex-1"><span className="block font-bold">Draft pool</span><span className="block text-xs text-[var(--mute)]">Registered players at your rink. Pull them onto your roster.</span></span>
            <span>›</span>
          </Link>
        </Section>
      )}

      <Section title="Availability">
        <div className="card p-4">
          <div className="grid grid-cols-2 gap-2">
            {(["available", "ir", "away", "resting"] as const).map((s) => (
              <button key={s} className={`h-11 rounded-xl border text-sm font-bold ${u.status === s ? "border-[var(--red)] bg-[var(--red-dim)]" : "border-[var(--line)] bg-[var(--ice-3)]"}`} onClick={() => run("PATCH", "/api/me", { status: s, statusUntil: until || null })} data-testid={`button-status-${s}`}>
                {STATUS_LABEL[s]}
              </button>
            ))}
          </div>
          {(u.status === "ir" || u.status === "away") && (
            <label className="block mt-3">
              <span className="label">Expected back</span>
              <input type="date" className="input w-full mt-1.5" value={until} onChange={(e) => setUntil(e.target.value)} onBlur={() => run("PATCH", "/api/me", { status: u.status, statusUntil: until || null })} data-testid="input-status-until" />
            </label>
          )}
          <p className="text-[11px] text-[var(--mute)] mt-3">Your captains see this. It never touches your rating, and injured reserve freezes it.</p>
        </div>
      </Section>

      <Section title="Privacy">
        <div className="card p-4 flex items-center gap-3">
          <span className="flex-1">
            <span className="block font-bold text-sm">Hide my name</span>
            <span className="block text-xs text-[var(--mute)]">Show "Player #{u.number ?? "?"}" everywhere. Your games still count for your team.</span>
          </span>
          <button role="switch" aria-checked={u.hidden} onClick={() => run("PATCH", "/api/me", { hidden: !u.hidden })} className={`h-7 w-12 rounded-full relative transition-colors ${u.hidden ? "bg-[var(--red)]" : "bg-[var(--ice-3)] border border-[var(--line)]"}`} data-testid="switch-hidden">
            <span className={`absolute top-0.5 h-6 w-6 rounded-full bg-white transition-all ${u.hidden ? "left-[22px]" : "left-0.5"}`} />
          </button>
        </div>
      </Section>

      <div className="mt-8 flex justify-between items-center px-1">
        <span className="text-xs text-[var(--mute)]">Signed in as {u.phone}</span>
        <button className="btn btn-ghost h-9 text-sm" onClick={async () => { await signOut(); nav("/"); }} data-testid="button-sign-out">Sign out</button>
      </div>
    </div>
  );
}
