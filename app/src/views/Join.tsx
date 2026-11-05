"use client";
import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link, useLocation } from "@/lib/router";
import { apiRequest, queryClient, setToken } from "@/lib/queryClient";
import { useMe, toE164, POSITION_LABEL } from "@/lib/auth";
import { supabase } from "@/lib/supabase";
import { FaceoffDot, Loading } from "@/lib/ui";

type Step = "phone" | "code" | "profile";

const fmtPhone = (s: string) => {
  const d = s.replace(/\D/g, "").replace(/^1(?=\d{10})/, "").slice(0, 10);
  if (d.length < 4) return d;
  if (d.length < 7) return `(${d.slice(0, 3)}) ${d.slice(3)}`;
  return `(${d.slice(0, 3)}) ${d.slice(3, 6)}-${d.slice(6)}`;
};

export default function Join() {
  const [, nav] = useLocation();
  const { me, loading } = useMe();
  const [step, setStep] = useState<Step>("phone");
  const [phone, setPhone] = useState("");
  const [code, setCode] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // Already signed in: finish the profile or go to it.
  useEffect(() => {
    if (!me) return;
    if (me.user.profileComplete) nav("/me");
    else setStep("profile");
  }, [me, nav]);

  if (loading) return <Loading />;

  const start = async (e?: React.FormEvent) => {
    e?.preventDefault();
    const e164 = toE164(phone);
    if (!e164) return setErr("Enter a 10-digit US mobile number.");
    setBusy(true); setErr(null);
    const { error } = await supabase().auth.signInWithOtp({ phone: e164 });
    if (error) setErr(error.message.includes("rate") ? "Too many codes for this number. Try again in a bit." : "Couldn't send the text. Check the number and try again.");
    else { setCode(""); setStep("code"); }
    setBusy(false);
  };

  const verify = async (e?: React.FormEvent) => {
    e?.preventDefault();
    const e164 = toE164(phone);
    if (!e164) return;
    setBusy(true); setErr(null);
    const { data, error } = await supabase().auth.verifyOtp({ phone: e164, token: code, type: "sms" });
    if (error || !data.session) { setErr("That code doesn't match or has expired."); setBusy(false); return; }
    setToken(data.session.access_token);
    // AuthProvider picks up the session; load the profile to decide where to go.
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
          : "Sign in with your phone. We text a six-digit code. No password."}
      </p>

      {step === "phone" && (
        <form onSubmit={start} className="card-hi p-5 mt-5 space-y-3">
          <label className="block">
            <span className="label">Mobile number</span>
            <input className="input w-full mt-1.5" inputMode="tel" autoComplete="tel" placeholder="(910) 555-0123" value={fmtPhone(phone)} onChange={(e) => setPhone(e.target.value)} data-testid="input-phone" autoFocus />
          </label>
          {err && <p className="text-sm down" data-testid="text-error">{err}</p>}
          <button className="btn btn-red w-full h-12" disabled={busy || phone.replace(/\D/g, "").length < 10} data-testid="button-send-code">{busy ? "Sending…" : "Text me a code"}</button>
        </form>
      )}

      {step === "code" && (
        <form onSubmit={verify} className="card-hi p-5 mt-5 space-y-3">
          <div className="text-sm">Code sent to <b>{fmtPhone(phone)}</b>. <button type="button" className="text-[var(--blue)]" onClick={() => setStep("phone")} data-testid="button-change-phone">Change</button></div>
          <label className="block">
            <span className="label">Six-digit code</span>
            <input className="input w-full mt-1.5 tnum tracking-[0.4em] text-center text-xl" inputMode="numeric" autoComplete="one-time-code" maxLength={6} value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))} data-testid="input-code" autoFocus />
          </label>
          {err && <p className="text-sm down" data-testid="text-error">{err}</p>}
          <button className="btn btn-red w-full h-12" disabled={busy || code.length !== 6} data-testid="button-verify">{busy ? "Checking…" : "Sign in"}</button>
          <button type="button" className="btn btn-ghost w-full h-10" onClick={() => start()} disabled={busy} data-testid="button-resend">Send a new code</button>
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
          <div className="grid grid-cols-3 gap-1.5 mt-1.5">
            {(["F", "D", "G"] as const).map((p) => (
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
