"use client";
import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link, useLocation } from "@/lib/router";
import { apiRequest, queryClient, setToken } from "@/lib/queryClient";
import { useMe, normEmail, POSITION_LABEL, INVITE_KEY } from "@/lib/auth";
import { supabase } from "@/lib/supabase";
import { FaceoffDot, Loading } from "@/lib/ui";

type Step = "email" | "code" | "profile";
const COOLDOWN = 60;

const CODE_TTL_MS = 10 * 60 * 1000;

/** Plain-language message. Supabase reports wrong and expired codes the same way,
 *  so the time since the code was sent decides which one to show. */
function codeError(message: string, sentAt: number | null) {
  const m = message.toLowerCase();
  if (m.includes("rate") || m.includes("seconds") || m.includes("too many")) return "Too many codes requested. Wait a minute and try again.";
  if (m.includes("expired") || m.includes("invalid") || m.includes("token")) {
    return sentAt && Date.now() - sentAt > CODE_TTL_MS
      ? "That code has expired. Send a new one."
      : "That code doesn't match. Check the latest email and try again.";
  }
  return "Something went wrong. Try again.";
}

/** A team's invite link: remember it through sign-in, and say which team it's for. */
function useInvite() {
  const [token, setTok] = useState<string | null>(null);
  useEffect(() => {
    let t: string | null = null;
    try { t = new URLSearchParams(window.location.search).get("invite"); } catch { /* no window */ }
    try { if (t) localStorage.setItem(INVITE_KEY, t); else t = localStorage.getItem(INVITE_KEY); } catch { /* storage off */ }
    setTok(t);
  }, []);
  const { data } = useQuery<any>({ queryKey: [`/api/invites/${token}`], enabled: !!token });
  return data?.valid ? data : null;
}

export default function Join() {
  const [, nav] = useLocation();
  const { me, loading } = useMe();
  const invite = useInvite();
  const { data: gate } = useQuery<{ paused: boolean }>({ queryKey: ["/api/signup-status"] });
  const [step, setStep] = useState<Step>("email");
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [wait, setWait] = useState(0);
  const [sentAt, setSentAt] = useState<number | null>(null);

  // Already signed in: finish the profile or go to it.
  useEffect(() => {
    if (!me) return;
    if (me.user.profileComplete) nav("/me");
    else setStep("profile");
  }, [me, nav]);

  // Resend cooldown ticker.
  useEffect(() => {
    if (wait <= 0) return;
    const t = setTimeout(() => setWait((w) => w - 1), 1000);
    return () => clearTimeout(t);
  }, [wait]);

  if (loading) return <Loading />;

  const send = async (e?: React.FormEvent) => {
    e?.preventDefault();
    const addr = normEmail(email);
    if (!addr) return setErr("Enter a valid email address.");
    if (wait > 0) return;
    setBusy(true); setErr(null);
    // A typed code, not a magic link: no emailRedirectTo.
    const { error } = await supabase().auth.signInWithOtp({ email: addr, options: { shouldCreateUser: true } });
    if (error) setErr(codeError(error.message, null));
    else { setCode(""); setStep("code"); setWait(COOLDOWN); setSentAt(Date.now()); }
    setBusy(false);
  };

  const verify = async (e?: React.FormEvent) => {
    e?.preventDefault();
    const addr = normEmail(email);
    if (!addr || code.length !== 6) return;
    setBusy(true); setErr(null);
    const { data, error } = await supabase().auth.verifyOtp({ email: addr, token: code, type: "email" });
    if (error || !data.session) { setErr(codeError(error?.message ?? "invalid", sentAt)); setBusy(false); return; }
    setToken(data.session.access_token);
    // AuthProvider also picks up the session; load the profile to decide where to go.
    try {
      const res = await apiRequest("GET", "/api/me");
      const j = await res.json();
      await queryClient.invalidateQueries();
      if (j.user.profileComplete) nav("/me"); else setStep("profile");
    } catch (e: any) { setErr(e.message); }
    setBusy(false);
  };

  return (
    <div className="pt-2">
      <div className="label">Join Late Ice</div>
      <h1 className="font-display text-[40px] leading-[0.95] font-black uppercase mt-1">
        {step === "profile" ? <>Four fields.<br /><span className="text-[var(--red)]">That's the whole form.</span></> : <>Your number.<br /><span className="text-[var(--red)]">Your rating.</span></>}
      </h1>
      <p className="text-sm text-[var(--mute)] mt-3">
        {step === "profile"
          ? "Registering puts you in the draft pool at your home rink. Your captain pulls you onto the team, or you claim the spot the scoresheet already made for you."
          : "Sign in with your email. We send a six-digit code. No password."}
      </p>

      {invite && (
        <div className="card mt-4 p-3.5 text-sm border-[var(--up)]/40" data-testid="card-invite-banner">
          You're invited to join <b>{invite.team}</b> ({invite.league}, {invite.rink}). Sign in and you're in.
        </div>
      )}
      {!invite && step === "email" && (
        <div className="card mt-4 p-3.5 text-xs text-[var(--mute)]" data-testid="card-gate-note">
          {gate?.paused ? "New sign-ups are paused right now. Players who already have an account can still sign in." : "Late Ice is invite-only for now. Without your captain's link you'll be on the waitlist until staff let you in."}
        </div>
      )}
      {step === "email" && (
        <form onSubmit={send} className="card-hi p-5 mt-5 space-y-3">
          <label className="block">
            <span className="label">Email</span>
            <input className="input w-full mt-1.5" type="email" inputMode="email" autoComplete="email" autoCapitalize="none" spellCheck={false} placeholder="you@example.com" value={email} onChange={(e) => setEmail(e.target.value)} data-testid="input-email" autoFocus />
          </label>
          {err && <p className="text-sm down" data-testid="text-error">{err}</p>}
          <button className="btn btn-red w-full h-12" disabled={busy || !normEmail(email)} data-testid="button-send-code">{busy ? "Sending…" : "Email me a code"}</button>
          <p className="text-[11px] text-[var(--mute)] text-center">By joining you agree to the <Link href="/privacy" className="underline">terms and privacy</Link>.</p>
        </form>
      )}

      {step === "code" && (
        <form onSubmit={verify} className="card-hi p-5 mt-5 space-y-3">
          <div className="text-sm">Code sent to <b className="break-all">{normEmail(email)}</b>. <button type="button" className="text-[var(--blue)]" onClick={() => { setStep("email"); setErr(null); }} data-testid="button-change-email">Change</button></div>
          <p className="text-xs text-[var(--mute)]">Check your inbox and spam folder. The code expires in 10 minutes.</p>
          <label className="block">
            <span className="label">Six-digit code</span>
            <input className="input w-full mt-1.5 tnum tracking-[0.4em] text-center text-xl" inputMode="numeric" autoComplete="one-time-code" maxLength={6} value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))} data-testid="input-code" autoFocus />
          </label>
          {err && <p className="text-sm down" data-testid="text-error">{err}</p>}
          <button className="btn btn-red w-full h-12" disabled={busy || code.length !== 6} data-testid="button-verify">{busy ? "Checking…" : "Sign in"}</button>
          <button type="button" className="btn btn-ghost w-full h-10" onClick={() => send()} disabled={busy || wait > 0} data-testid="button-resend">
            {wait > 0 ? `Send a new code in ${wait}s` : "Send a new code"}
          </button>
        </form>
      )}

      {step === "profile" && <ProfileForm onDone={() => nav("/me")} />}
    </div>
  );
}

export function ProfileForm({ onDone, submitLabel = "Join the draft pool" }: { onDone: () => void; submitLabel?: string }) {
  const { me } = useMe();
  const { data: rinks } = useQuery<{ id: number; name: string; address: string }[]>({ queryKey: ["/api/rinks"] });
  const [name, setName] = useState(me?.user.name ?? "");
  const [number, setNumber] = useState(me?.user.number ?? "");
  const [position, setPosition] = useState<string>(me?.user.position ?? "");
  const [rink, setRink] = useState<number | null>(me?.user.homeRink?.id ?? null);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => { if (rink === null && rinks?.length === 1) setRink(rinks[0].id); }, [rinks, rink]);

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true); setErr(null);
    try {
      await apiRequest("PATCH", "/api/me", { name, number, position, homeRinkId: rink });
      await queryClient.invalidateQueries();
      onDone();
    } catch (e: any) { setErr(e.message); }
    setBusy(false);
  };

  return (
    <form onSubmit={save} className="card-hi p-5 mt-5 space-y-4">
      <label className="block">
        <span className="label">Name</span>
        <input className="input w-full mt-1.5" autoComplete="name" placeholder="First and last" value={name} onChange={(e) => setName(e.target.value)} data-testid="input-name" />
      </label>
      <div className="grid grid-cols-[96px_1fr] gap-3">
        <label className="block">
          <span className="label">Number</span>
          <input className="input w-full mt-1.5 tnum text-center" inputMode="numeric" maxLength={2} placeholder="#" value={number} onChange={(e) => setNumber(e.target.value.replace(/\D/g, "").slice(0, 2))} data-testid="input-number" />
        </label>
        <div>
          <span className="label">Position</span>
          <div className="grid grid-cols-4 gap-1.5 mt-1.5">
            {(["C", "W", "D", "G"] as const).map((p) => (
              <button type="button" key={p} onClick={() => setPosition(p)} className={`h-11 rounded-xl border text-sm font-bold ${position === p ? "border-[var(--red)] bg-[var(--red-dim)]" : "border-[var(--line)] bg-[var(--ice-3)]"}`} data-testid={`button-position-${p}`}>
                {POSITION_LABEL[p]}
              </button>
            ))}
          </div>
        </div>
      </div>
      <div>
        <span className="label">Home rink</span>
        <div className="space-y-1.5 mt-1.5">
          {(rinks ?? []).map((r) => (
            <button type="button" key={r.id} onClick={() => setRink(r.id)} className={`w-full text-left rounded-xl border p-3 ${rink === r.id ? "border-[var(--red)] bg-[var(--red-dim)]" : "border-[var(--line)] bg-[var(--ice-3)]"}`} data-testid={`button-rink-${r.id}`}>
              <div className="font-bold text-sm">{r.name}</div>
              <div className="text-xs text-[var(--mute)]">{r.address}</div>
            </button>
          ))}
        </div>
      </div>
      {err && <p className="text-sm down" data-testid="text-error">{err}</p>}
      <button className="btn btn-red w-full h-12" disabled={busy || !name.trim() || !position || !rink} data-testid="button-save-profile">{busy ? "Saving…" : submitLabel}</button>
    </form>
  );
}
