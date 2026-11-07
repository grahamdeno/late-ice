"use client";
import { useEffect, useState } from "react";
import { Link, useLocation } from "@/lib/router";
import { useMe, act, signOut, STATUS_LABEL } from "@/lib/auth";
import { ARCHETYPE_LABEL } from "@/components/Archetypes";
import { BackBar, Loading, Section } from "@/lib/ui";
import { ProfileForm } from "./Join";
import { useTheme, type Theme } from "@/lib/theme";
import { NotificationSettings } from "@/components/NotificationSettings";
import { apiUrl, authHeaders } from "@/lib/queryClient";
import { SUPPORT_EMAIL } from "@/lib/contact";

/** Every setting in one place, in the order people look for them. Reached from the gear on Me. */
export default function Settings() {
  const [, , swap] = useLocation();
  const { me, loading } = useMe();
  const [theme, setTheme] = useTheme();
  const [err, setErr] = useState<string | null>(null);
  const [until, setUntil] = useState("");
  useEffect(() => { if (!loading && !me) swap("/join"); }, [loading, me, swap]);
  useEffect(() => { setUntil(me?.user.statusUntil ?? ""); }, [me?.user.statusUntil]);
  if (loading || !me) return <Loading />;
  const u = me.user;
  const run = async (method: string, url: string, body?: unknown) => setErr(await act(method, url, body, ["/api/me", "/api/players", "/api/feed", "/api/teams"]));

  return (
    <div>
      <BackBar href="/me" to="Me" />
      <h1 className="text-[28px] leading-tight font-black">Settings</h1>
      {err && <p className="text-sm down mt-3 px-1" data-testid="text-error">{err}</p>}

      <Section title="Profile">
        <ProfileForm submitLabel="Save" onDone={() => setErr(null)} />
      </Section>

      <Section title="Availability">
        <div className="card p-4">
          <div className="grid grid-cols-3 gap-2">
            {(["active", "ir", "away"] as const).map((s) => (
              <button key={s} className={`h-12 px-1 rounded-xl border text-[13px] leading-tight font-bold ${u.status === s ? "border-[var(--red)] bg-[var(--red-dim)]" : "border-[var(--line)] bg-[var(--ice-3)]"}`} onClick={() => run("PATCH", "/api/me", { status: s, statusUntil: until || null })} data-testid={`button-status-${s}`}>
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
          <p className="text-[11px] text-[var(--mute)] mt-3">{u.status === "active" ? "Injured reserve and Away keep your roster spot and mark you out until the date you set, then switch back on their own." : `You're marked out of games${u.statusUntil ? ` until ${u.statusUntil}` : ""}. Your roster spot stays, and your rating doesn't move while you're out.`}</p>
          <div className="mt-4 divide-y divide-[var(--line)] border-t border-[var(--line)]">
            {([["lookingForTeam", "Looking for a team", "Captains at your rink see you in their draft pool."], ["willSub", "Will sub", "Other teams can ask you to fill in."]] as const).map(([k, label, hint]) => (
              <Toggle key={k} label={label} hint={hint} on={u[k]} onClick={() => run("PATCH", "/api/me", { [k]: !u[k] })} testid={`switch-${k}`} />
            ))}
          </div>
        </div>
      </Section>

      <Section title="Appearance">
        <div className="card p-1.5 grid grid-cols-3 gap-1.5" role="radiogroup" aria-label="Appearance">
          {([["auto", "Match phone"], ["light", "Light"], ["dark", "Dark"]] as [Theme, string][]).map(([k, label]) => (
            <button key={k} role="radio" aria-checked={theme === k} onClick={() => setTheme(k)} className={`h-11 rounded-xl text-sm font-bold ${theme === k ? "bg-[var(--red-btn)] text-white" : "text-[var(--mute)]"}`} data-testid={`button-theme-${k}`}>{label}</button>
          ))}
        </div>
        <p className="text-[11px] text-[var(--mute)] mt-2 px-1">Saved on this phone.</p>
      </Section>

      <Section title="Notifications">
        <NotificationSettings />
      </Section>

      <Section title="Privacy">
        <div className="card p-4">
          <Toggle label="Hide my name" hint={`Show "Player #${u.number ?? "?"}" everywhere. Your games still count for your team.`} on={u.hidden} onClick={() => run("PATCH", "/api/me", { hidden: !u.hidden })} testid="switch-hidden" />
          <Toggle label="Hide my player type" hint="No label from your team's vote, your captain or anyone else shows on your profile or your team page." on={!!u.archetypeOptOut} onClick={() => run("PATCH", "/api/me", { archetypeOptOut: !u.archetypeOptOut })} testid="switch-archetype-opt-out" />
        </div>
      </Section>

      {me.roles.some((r) => r.role === "admin") && (
        <Section title="Your player type">
          <div className="card p-4" data-testid="card-own-archetype">
            <p className="text-xs text-[var(--mute)]">As system admin you can pick your own. Your team's vote is kept and still shows next to it.</p>
            <select className="input w-full mt-2" value={u.archetypeSelf ?? ""} onChange={async (e) => setErr(await act("PATCH", "/api/me", { archetypeSelf: e.target.value || null }, ["/api/me", "/api/players"]))} data-testid="select-own-archetype">
              <option value="">Let my team decide</option>
              {Object.entries(ARCHETYPE_LABEL).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
            </select>
          </div>
        </Section>
      )}

      <Section title="Help">
        <div className="card divide-y divide-[var(--line)]">
          <a href={`mailto:${SUPPORT_EMAIL}?subject=${encodeURIComponent("Late Ice help")}&body=${encodeURIComponent(`\n\n---\nApp: Late Ice\nAccount: ${u.id}`)}`} className="flex items-center gap-3 px-4 min-h-[52px]" data-testid="link-help">
            <span className="flex-1 font-bold text-sm">Email us</span><span className="text-[var(--mute)]">›</span>
          </a>
          <Link href="/privacy" className="flex items-center gap-3 px-4 min-h-[52px]" data-testid="link-privacy">
            <span className="flex-1 font-bold text-sm">Terms and privacy</span><span className="text-[var(--mute)]">›</span>
          </Link>
        </div>
      </Section>

      <div className="card mt-7 p-4 flex items-center gap-3">
        <span className="flex-1 min-w-0 text-xs text-[var(--mute)] truncate">Signed in as {u.email ?? u.phone}</span>
        <button className="btn btn-ghost h-11 text-sm" onClick={async () => { await signOut(); swap("/"); }} data-testid="button-sign-out">Sign out</button>
      </div>

      <Section title="Your data">
        <div className="card divide-y divide-[var(--line)]">
          <button className="w-full flex items-center gap-3 px-4 min-h-[52px] text-left" onClick={async () => {
            const r = await fetch(apiUrl("/api/me/export"), { headers: authHeaders() });
            if (!r.ok) { setErr("Couldn't build your download. Try again in a minute."); return; }
            const url = URL.createObjectURL(new Blob([JSON.stringify(await r.json(), null, 2)], { type: "application/json" }));
            const a = document.createElement("a"); a.href = url; a.download = "late-ice-my-data.json"; a.click(); URL.revokeObjectURL(url);
          }} data-testid="button-export">
            <span className="flex-1"><span className="block font-bold text-sm">Download my data</span><span className="block text-xs text-[var(--mute)]">Profile, teams, games, ratings and notices as a file</span></span>
          </button>
          <button className="w-full flex items-center gap-3 px-4 min-h-[52px] text-left" onClick={async () => {
            if (!confirm("Delete your Late Ice account? Your name comes off every roster and game, and your old game lines stay as \"Player\" and your number. This can't be undone.")) return;
            const r = await fetch(apiUrl("/api/me/delete"), { method: "POST", headers: { ...authHeaders(), "Content-Type": "application/json" }, body: JSON.stringify({ confirm: true }) });
            if (!r.ok) { setErr((await r.json().catch(() => null))?.message ?? `Couldn't delete the account. Email ${SUPPORT_EMAIL} and we'll do it.`); return; }
            await signOut(); swap("/");
          }} data-testid="button-delete-account">
            <span className="flex-1"><span className="block font-bold text-sm down">Delete my account</span><span className="block text-xs text-[var(--mute)]">Removes your name; past scores stay</span></span>
          </button>
        </div>
        <p className="text-[11px] text-[var(--mute)] mt-2 px-1"><Link href="/terms" className="underline" data-testid="link-terms-settings">Terms</Link></p>
      </Section>
    </div>
  );
}

function Toggle({ label, hint, on, onClick, testid }: { label: string; hint: string; on: boolean; onClick: () => void; testid: string }) {
  return (
    <div className="flex items-center gap-3 py-2">
      <span className="flex-1"><span className="block font-bold text-sm">{label}</span><span className="block text-xs text-[var(--mute)]">{hint}</span></span>
      <button role="switch" aria-checked={on} aria-label={label} onClick={onClick} className={`h-8 w-[52px] shrink-0 rounded-full relative transition-colors ${on ? "bg-[var(--red-btn)]" : "bg-[var(--ice-3)] border border-[var(--line)]"}`} data-testid={testid}>
        <span className={`absolute top-1 h-6 w-6 rounded-full bg-white shadow transition-all ${on ? "left-[24px]" : "left-1"}`} />
      </button>
    </div>
  );
}
