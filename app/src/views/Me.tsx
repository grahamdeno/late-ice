"use client";
import { authHeaders, apiUrl } from "@/lib/queryClient";
import { useEffect, useState } from "react";
import { Link, useLocation } from "@/lib/router";
import { useMe, act, ROLE_LABEL } from "@/lib/auth";
import { Empty, LevelPill, MeSkeleton, More, RowLink, Section, TeamBadge } from "@/lib/ui";
import { GameLine } from "@/components/Schedule";
import { useQuery } from "@tanstack/react-query";
import { AvatarBuilder } from "@/components/AvatarBuilder";
import { PlayerCard } from "@/components/PlayerCard";

function timeAgo(s: string) {
  const t = new Date(s).getTime();
  const m = Math.round((Date.now() - t) / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.round(m / 60);
  return h < 24 ? `${h}h ago` : `${Math.round(h / 24)}d ago`;
}

/** Me: your card, your team, and rows for the rest. Settings live behind the gear. */
export default function MePage() {
  const [, nav] = useLocation();
  const { me, loading } = useMe();
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => { if (!loading && !me) nav("/join"); }, [loading, me, nav]);
  useEffect(() => { if (me && !me.user.profileComplete) nav("/join"); }, [me, nav]);

  if (loading || !me) return <MeSkeleton />;
  const u = me.user;
  const run = async (method: string, url: string, body?: unknown) => setErr(await act(method, url, body, ["/api/me", "/api/players", "/api/teams", "/api/pool", "/api/feed"]));
  const main = me.slots[0];
  const archetype = u.archetypeSelf ?? main?.archetype?.archetype ?? null;
  const gear = (
    <Link href="/settings" className="h-11 w-11 -mr-2 -mt-2 rounded-full flex items-center justify-center shrink-0" aria-label="Settings" data-testid="link-settings">
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" /></svg>
    </Link>
  );

  return (
    <div>
      {/* Things waiting on you come first, and only when there are any. */}
      {me.subRequests?.length > 0 && (
        <div className="card mb-3 p-4" data-testid="card-sub-requests">
          <div className="label mb-2">Sub requests</div>
          {me.subRequests.map((r: any) => (
            <div key={r.id} className="flex items-center gap-3 py-1.5 text-sm">
              <span className="flex-1 min-w-0"><span className="block font-bold truncate">{r.team_name}</span><span className="block text-xs text-[var(--mute)] truncate">{r.local_date}{r.local_time ? ` · ${r.local_time}` : ""}{r.opponent ? ` · ${r.is_home === false ? "@" : "vs"} ${r.opponent}` : ""}</span></span>
              {r.status === "accepted" ? <span className="text-xs font-bold up">You're in</span> : (
                <>
                  <button className="btn btn-ghost h-10 text-xs" onClick={() => run("PUT", `/api/sub-requests/${r.id}`, { answer: "no" })} data-testid={`button-sub-no-${r.id}`}>No</button>
                  <button className="btn btn-red h-10 text-xs" onClick={() => run("PUT", `/api/sub-requests/${r.id}`, { answer: "yes" })} data-testid={`button-sub-yes-${r.id}`}>Yes</button>
                </>
              )}
            </div>
          ))}
        </div>
      )}
      {u.access === "waiting" && (
        <div className="card mb-3 p-4 border-[var(--amber)]/50" data-testid="card-waitlist">
          <div className="font-bold text-sm">You're on the waitlist</div>
          <p className="text-xs text-[var(--mute)] mt-0.5">You can look around. To claim your spot, open your captain's invite link, or wait for staff to let you in.</p>
        </div>
      )}
      {me.handoffs.map((h) => (
        <div key={h.id} className="card mb-3 p-4" data-testid={`card-handoff-${h.id}`}>
          <div className="font-bold text-sm">{h.from_name} wants you to captain {h.team_name}</div>
          <p className="text-xs text-[var(--mute)] mt-0.5">You'd run the roster, assistants and schedule. {h.from_name} stays on the team as a player.</p>
          <div className="grid grid-cols-2 gap-2 mt-3">
            <button className="btn btn-ghost h-11" onClick={() => run("POST", `/api/requests/${h.id}`, { decision: "decline" })} data-testid={`button-decline-handoff-${h.id}`}>Decline</button>
            <button className="btn btn-red h-11" onClick={() => run("POST", `/api/requests/${h.id}`, { decision: "accept" })} data-testid={`button-accept-handoff-${h.id}`}>Accept</button>
          </div>
        </div>
      ))}
      {me.suggestions.length > 0 && (
        <div className="card mb-3" data-testid="card-is-this-you">
          <div className="px-4 pt-3 font-bold text-sm">Is this you?</div>
          <div className="divide-y divide-[var(--line)]">
            {me.suggestions.map((s) => (
              <div key={s.id} className="flex items-center gap-3 px-4 py-3" data-testid={`row-suggestion-${s.id}`}>
                <TeamBadge team={{ id: s.team_id, name: s.team_name, color: s.color, logo: s.logo }} size={32} />
                <span className="flex-1 min-w-0">
                  <span className="block font-bold truncate">{s.number ? `#${s.number} ` : ""}{s.name}</span>
                  <span className="block text-xs text-[var(--mute)] truncate">{s.team_name} · {s.level} League</span>
                </span>
                <button className="btn btn-red h-10 text-sm" onClick={() => run("POST", `/api/players/${s.id}/claim`)} data-testid={`button-claim-${s.id}`}>That's me</button>
              </div>
            ))}
          </div>
          <p className="text-[11px] text-[var(--mute)] px-4 pb-3">Claiming moves that spot's goals, assists and rating onto your profile. Your captain sees it and can undo it.</p>
        </div>
      )}

      <PlayerCard
        name={u.name ?? "You"}
        avatar={u.avatar}
        position={u.position}
        archetype={archetype}
        teams={me.slots.map((s) => ({ id: s.team_id, name: s.team_name, color: s.color, logo: s.logo, number: s.number }))}
        rating={main?.rating ?? null}
        trend5={main?.last?.trend5 ?? null}
        gamesRated={main?.games_rated}
        ratingHref={main ? `/player/${main.id}` : undefined}
        action={gear}
      />
      <span className="sr-only" data-testid="text-me-name">{u.name}</span>
      {me.roles.length > 0 && (
        <div className="flex flex-wrap gap-1.5 mt-2" data-testid="list-roles">
          {me.roles.map((r) => STAFF_ROLES.includes(r.role)
            ? <Link key={r.id} href="/staff" className="chip h-7 text-[11px]" data-testid={`link-role-${r.role}`}>{ROLE_LABEL[r.role] ?? r.role}{r.where ? ` · ${r.where}` : ""} ›</Link>
            : <span key={r.id} className="chip h-7 text-[11px]">{ROLE_LABEL[r.role] ?? r.role}{r.where ? ` · ${r.where}` : ""}</span>)}
        </div>
      )}
      {me.staff && <StaffCard roles={me.roles} />}
      {err && <p className="text-sm down mt-3 px-1" data-testid="text-error">{err}</p>}

      <Section title={me.slots.length > 1 ? "My teams" : "My team"}>
        {me.slots.length ? (
          <div className="space-y-2">
            {me.slots.map((s) => (
              <div key={`${s.team_id}-${s.id}`} className="card p-4" data-testid={`card-my-team-${s.team_id}`}>
                <Link href={`/team/${s.team_id}`} className="flex items-center gap-3">
                  <TeamBadge team={{ id: s.team_id, name: s.team_name, color: s.color, logo: s.logo }} size={36} />
                  <span className="flex-1 min-w-0">
                    <span className="flex items-center gap-2"><LevelPill level={s.level === "DEMO" ? "Demo" : s.level} /><span className="font-bold truncate">{s.team_name}</span></span>
                    <span className="block text-xs text-[var(--mute)] mt-0.5">{s.number ? `#${s.number}` : "No number"}{s.isCaptain ? " · Captain" : s.teamRole === "assistant_captain" ? " · Assistant captain" : s.captain ? ` · Captain: ${s.captain.name}` : " · No captain yet"}</span>
                  </span>
                  <span className="text-[var(--mute)]" aria-hidden="true">›</span>
                </Link>
                {s.next && <div className="mt-3 pt-3 border-t border-[var(--line)]" data-testid={`next-game-${s.team_id}`}><GameLine g={s.next} /></div>}
                {(s.teamRole || !s.captain || (s.source === "draft" && !s.isCaptain)) && (
                  <div className="flex flex-wrap gap-2 mt-3">
                    {s.teamRole && <Link href={`/team/${s.team_id}/manage`} className="btn btn-red h-10 text-sm" data-testid={`button-manage-${s.team_id}`}>Manage team</Link>}
                    {!s.captain && <button className="btn btn-ghost h-10 text-sm" onClick={() => run("POST", `/api/teams/${s.team_id}/captain`)} data-testid={`button-become-captain-${s.team_id}`}>I'm the captain</button>}
                    {s.source === "draft" && !s.isCaptain && <button className="btn btn-ghost h-10 text-sm" onClick={() => confirm(`Leave ${s.team_name}?`) && run("POST", `/api/me/decline/${s.team_id}`)} data-testid={`button-decline-${s.team_id}`}>Not my team</button>}
                  </div>
                )}
              </div>
            ))}
          </div>
        ) : (
          <Empty title="You're in the draft pool" body={`Captains at ${u.homeRink?.name ?? "your rink"} can see you and pull you onto their team. If a scoresheet already has you, it shows up above as "Is this you?"`} />
        )}
      </Section>

      <Notifications me={me} />
      {main && <RowLink href={`/player/${main.id}`} title="Rating history" hint="Every game, and why your rating moved" testid="link-rating-history" />}
      {me.slots.length > 0 && (
        <More title="Your bobblehead" hint="Skin, hair, helmet and gear" testid="row-avatar">
          <AvatarBuilder bare saved={u.avatar} jersey={main.color} number={main.number} archetype={u.archetypeSelf ? { archetype: u.archetypeSelf, votes: 0 } : main.archetype ?? null} goalie={u.position === "G"} />
        </More>
      )}
      {me.slots.length > 0 && (
        <More title="On another team too?" hint="Find your spot on a second team or as a sub" testid="button-find-spot">
          <FindSpot run={run} />
        </More>
      )}
      {me.captainTeams.length > 0 && <RowLink href="/pool" title="Draft pool" hint="Registered players at your rink" testid="link-pool" />}
    </div>
  );
}

function Notifications({ me }: { me: any }) {
  if (!me.notifications.length) return null;
  const markRead = () => { if (me.unread) act("POST", "/api/me/notifications/read", undefined, ["/api/me"]); };
  return (
    <div onClick={markRead}>
      <More title="Notifications" hint={me.unread ? `${me.unread} new` : "All caught up"} count={me.notifications.length} testid="row-notifications">
        <div className="divide-y divide-[var(--line)]">
          {me.notifications.slice(0, 15).map((n: any) => {
            const body = (
              <div className="flex gap-3 px-4 py-3">
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
      </More>
    </div>
  );
}

/** Second team, or a sub spot the app didn't suggest: search unclaimed spots by name or team, then claim. */
function FindSpot({ run }: { run: (m: string, u: string, b?: unknown) => Promise<unknown> }) {
  const [text, setText] = useState("");
  const [rows, setRows] = useState<any[] | null>(null);
  useEffect(() => {
    if (text.trim().length < 2) { setRows(null); return; }
    const t = setTimeout(async () => {
      try { const r = await fetch(apiUrl(`/api/me/spots?q=${encodeURIComponent(text)}`), { headers: authHeaders() }); setRows((await r.json()).spots ?? []); } catch { setRows([]); }
    }, 250);
    return () => clearTimeout(t);
  }, [text]);
  return (
    <>
      <div className="p-4 space-y-2" data-testid="card-find-spot">
        <input className="input w-full" autoFocus placeholder="Your name or the team's" value={text} onChange={(e) => setText(e.target.value)} data-testid="input-find-spot" />
        {rows && rows.length === 0 && <p className="text-xs text-[var(--mute)]">Nothing unclaimed matches. Ask that team's captain to add you.</p>}
        <div className="divide-y divide-[var(--line)]">
          {(rows ?? []).map((s) => (
            <div key={`${s.id}-${s.team_id}`} className="flex items-center gap-3 py-2.5" data-testid={`row-spot-${s.id}`}>
              <TeamBadge team={{ id: s.team_id, name: s.team_name, color: s.color, logo: s.logo }} size={28} />
              <span className="flex-1 min-w-0"><span className="block font-bold text-sm truncate">{s.number ? `#${s.number} ` : ""}{s.name}</span><span className="block text-[11px] text-[var(--mute)] truncate">{s.team_name} · {s.rink}</span></span>
              <button className="btn btn-red h-8 text-xs" onClick={() => confirm(`Claim ${s.name} on ${s.team_name}? Their captain sees it.`) && run("POST", `/api/players/${s.id}/claim`)} data-testid={`button-claim-spot-${s.id}`}>That's me</button>
            </div>
          ))}
        </div>
      </div>
    </>
  );
}

const STAFF_ROLES = ["scorekeeper", "commissioner", "rink_manager", "support", "admin"];

/** The way into staff tools: set apart from the player rows, near the top, with a count of what's waiting. */
function StaffCard({ roles }: { roles: { role: string }[] }) {
  const admin = roles.some((r) => r.role === "admin");
  const { data: requests } = useQuery<any[]>({ queryKey: ["/api/staff/requests"] });
  const { data: signups } = useQuery<any[]>({ queryKey: ["/api/staff/signups"], enabled: admin || roles.some((r) => r.role === "support") });
  const waiting = (requests?.length ?? 0) + (signups?.length ?? 0);
  const title = admin ? "Admin tools" : roles.some((r) => r.role === "support") ? "Support tools" : "Rink tools";
  return (
    <Link href="/staff" className="mt-3 flex items-center gap-3 rounded-[22px] p-4 bg-[var(--red-dim)]" data-testid="link-staff">
      <span className="flex-1 min-w-0">
        <span className="block font-black">{title}</span>
        <span className="block text-xs text-[var(--mute)]">{admin ? "Rinks, leagues, teams, seasons, staff and requests" : "Leagues, teams, seasons and requests"}</span>
      </span>
      {waiting > 0 && <span className="h-6 min-w-[24px] px-2 rounded-full bg-[var(--red-btn)] text-white text-xs font-bold grid place-items-center tnum" data-testid="badge-staff-waiting">{waiting}</span>}
      <span className="text-lg">›</span>
    </Link>
  );
}
