"use client";
import { useEffect, useState } from "react";
import { Link, useLocation } from "@/lib/router";
import { useMe, act, signOut, POSITION_LABEL, STATUS_LABEL, ROLE_LABEL } from "@/lib/auth";
import { Empty, LevelPill, Loading, Section, TeamBadge, fmtRating } from "@/lib/ui";
import { ProfileForm } from "./Join";
import { useTheme, type Theme } from "@/lib/theme";
import { GameLine, Rsvp } from "@/components/Schedule";
import { AvatarBuilder } from "@/components/AvatarBuilder";

function Appearance() {
  const [theme, setTheme] = useTheme();
  return (
    <Section title="Appearance">
      <div className="card p-1.5 grid grid-cols-3 gap-1.5" role="radiogroup" aria-label="Appearance">
        {([["auto", "Match phone"], ["light", "Light"], ["dark", "Dark"]] as [Theme, string][]).map(([k, label]) => (
          <button key={k} role="radio" aria-checked={theme === k} onClick={() => setTheme(k)} className={`h-10 rounded-xl text-sm font-bold ${theme === k ? "bg-[var(--red-btn)] text-white" : "text-[var(--mute)]"}`} data-testid={`button-theme-${k}`}>{label}</button>
        ))}
      </div>
      <p className="text-[11px] text-[var(--mute)] mt-2 px-1">Saved on this phone.</p>
    </Section>
  );
}

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
        {me.roles.length > 0 && (
          <div className="flex flex-wrap gap-1.5 mt-3" data-testid="list-roles">
            {me.roles.map((r) => (
              <span key={r.id} className="chip h-7 text-[11px]">{ROLE_LABEL[r.role] ?? r.role}{r.where ? ` · ${r.where}` : ""}</span>
            ))}
          </div>
        )}
        {u.hidden && <div className="mt-3 text-xs text-[var(--mute)]">Your name is hidden. Teammates and the public see your number only.</div>}
      </div>
      {editing && <ProfileForm submitLabel="Save" onDone={() => setEditing(false)} />}
      {err && <p className="text-sm down mt-3 px-1" data-testid="text-error">{err}</p>}

      {me.staff && (
        <Link href="/staff" className="card-hi mt-3 p-4 flex items-center gap-3" data-testid="link-staff">
          <span className="flex-1"><span className="block font-bold">Manage</span><span className="block text-xs text-[var(--mute)]">Requests, rinks, leagues, teams and staff.</span></span>
          <span>›</span>
        </Link>
      )}

      {me.handoffs.length > 0 && (
        <Section title="Captaincy offered">
          <div className="space-y-2">
            {me.handoffs.map((h) => (
              <div key={h.id} className="card p-4" data-testid={`card-handoff-${h.id}`}>
                <div className="font-bold text-sm">{h.from_name} wants you to captain {h.team_name}</div>
                <p className="text-xs text-[var(--mute)] mt-0.5">You'd run the roster, assistants and schedule. {h.from_name} stays on the team as a player.</p>
                <div className="grid grid-cols-2 gap-2 mt-3">
                  <button className="btn btn-ghost h-10" onClick={() => run("POST", `/api/requests/${h.id}`, { decision: "decline" })} data-testid={`button-decline-handoff-${h.id}`}>Decline</button>
                  <button className="btn btn-red h-10" onClick={() => run("POST", `/api/requests/${h.id}`, { decision: "accept" })} data-testid={`button-accept-handoff-${h.id}`}>Accept</button>
                </div>
              </div>
            ))}
          </div>
        </Section>
      )}

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
                      {s.number ? `#${s.number}` : "No number"}{s.isCaptain ? " · Captain" : s.teamRole === "assistant_captain" ? " · Assistant captain" : s.captain ? ` · Captain: ${s.captain.name}` : " · No captain yet"}
                    </span>
                  </span>
                  <span className="text-right">
                    <span className="block font-display text-2xl tnum">{fmtRating(s.rating)}</span>
                    <span className="block text-[10px] label">LIR</span>
                  </span>
                </Link>
                {s.next && (
                  <Link href={`/team/${s.team_id}`} className="block mt-3 rounded-xl border border-[var(--line)] p-2.5" data-testid={`next-game-${s.team_id}`}>
                    <span className="block label mb-1.5">Next game</span>
                    <GameLine g={s.next} />
                  </Link>
                )}
                {s.next && s.next.rsvp?.member && (
                  <div className="mt-2"><Rsvp g={s.next} /></div>
                )}
                <div className="flex flex-wrap gap-2 mt-3">
                  <Link href={`/player/${s.id}`} className="btn btn-ghost h-9 text-sm">Rating history</Link>
                  {s.teamRole && <Link href={`/team/${s.team_id}`} className="btn btn-red h-9 text-sm" data-testid={`button-manage-${s.team_id}`}>Manage roster</Link>}
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

      {me.slots.length > 0 && (
        <AvatarBuilder saved={u.avatar} jersey={me.slots[0].color} number={me.slots[0].number} archetype={me.slots[0].archetype ?? null} goalie={u.position === "G"} />
      )}

      <Section title="Availability">
        <div className="card p-4">
          <div className="grid grid-cols-3 gap-2">
            {(["active", "ir", "away"] as const).map((s) => (
              <button key={s} className={`h-11 rounded-xl border text-sm font-bold ${u.status === s ? "border-[var(--red)] bg-[var(--red-dim)]" : "border-[var(--line)] bg-[var(--ice-3)]"}`} onClick={() => run("PATCH", "/api/me", { status: s, statusUntil: until || null })} data-testid={`button-status-${s}`}>
                {STATUS_LABEL[s]}
              </button>
            ))}
          </div>
          {(u.status === "ir" || u.status === "away") && (
            <label className="block mt-3">
              <span className="label">Back on</span>
              <input type="date" className="input w-full mt-1.5" value={until} onChange={(e) => setUntil(e.target.value)} onBlur={() => run("PATCH", "/api/me", { status: u.status, statusUntil: until || null })} data-testid="input-status-until" />
            </label>
          )}
          <p className="text-[11px] text-[var(--mute)] mt-3">{u.status === "active" ? "Answer In, Out or Late on each game. Injured reserve and Away keep your roster spot and mark you out until the date you set, then switch back on their own." : `You're marked out of games${u.statusUntil ? ` until ${u.statusUntil}` : ""}. Your roster spot stays, and your rating doesn't move while you're out.`}</p>
          <div className="mt-4 divide-y divide-[var(--line)] border-t border-[var(--line)]">
            {([["lookingForTeam", "Looking for a team", "Captains at your rink see you in their draft pool."], ["willSub", "Will sub", "Other teams can ask you to fill in."]] as const).map(([k, label, hint]) => (
              <div key={k} className="flex items-center gap-3 pt-3 pb-1">
                <span className="flex-1"><span className="block font-bold text-sm">{label}</span><span className="block text-xs text-[var(--mute)]">{hint}</span></span>
                <button role="switch" aria-checked={u[k]} aria-label={label} onClick={() => run("PATCH", "/api/me", { [k]: !u[k] })} className={`h-7 w-12 shrink-0 rounded-full relative transition-colors ${u[k] ? "bg-[var(--red-btn)]" : "bg-[var(--ice-3)] border border-[var(--line)]"}`} data-testid={`switch-${k}`}>
                  <span className={`absolute top-0.5 h-6 w-6 rounded-full bg-white shadow transition-all ${u[k] ? "left-[22px]" : "left-0.5"}`} />
                </button>
              </div>
            ))}
          </div>
        </div>
      </Section>

      <Appearance />

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

      <a href={`mailto:support@tangomike.app?subject=${encodeURIComponent("Late Ice help")}&body=${encodeURIComponent(`\n\n---\nApp: Late Ice\nAccount: ${u.id}`)}`} className="card mt-6 p-4 flex items-center gap-3" data-testid="link-help">
        <span className="flex-1"><span className="block font-bold text-sm">Get help</span><span className="block text-xs text-[var(--mute)]">Questions or problems? Email us.</span></span>
        <span>›</span>
      </a>
      <Link href="/privacy" className="block text-center text-xs text-[var(--mute)] mt-3 underline" data-testid="link-privacy">Terms and privacy</Link>

      <div className="mt-8 flex justify-between items-center px-1">
        <span className="text-xs text-[var(--mute)]">Signed in as {u.email ?? u.phone}</span>
        <button className="btn btn-ghost h-9 text-sm" onClick={async () => { await signOut(); nav("/"); }} data-testid="button-sign-out">Sign out</button>
      </div>
    </div>
  );
}
