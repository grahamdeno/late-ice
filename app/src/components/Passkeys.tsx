"use client";
import { useEffect, useState } from "react";
import { supabase, passkeysSupported, passkeyError, takePasskeyOffer, clearPasskeyOffer } from "@/lib/supabase";
import { fmtDate } from "@/lib/ui";

type Key = { id: string; friendly_name?: string | null; created_at?: string; last_used_at?: string | null };

/** Add Face ID or a passkey to sign in without waiting for an email. The email code always still works. */
export function Passkeys() {
  const [keys, setKeys] = useState<Key[] | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const auth = () => supabase().auth as any;
  const load = async () => {
    const { data, error } = await auth().passkey.list();
    if (error) { setKeys([]); return; }
    setKeys(data ?? []);
  };
  useEffect(() => { if (passkeysSupported()) load(); }, []);
  if (!passkeysSupported()) return <div className="card p-4 text-sm text-[var(--mute)]">This browser can't use passkeys. The email code still works everywhere.</div>;

  const add = async () => {
    setBusy(true); setErr(null);
    const { error } = await auth().registerPasskey();
    if (error) setErr(passkeyError(error.message)); else await load();
    setBusy(false);
  };
  const remove = async (id: string) => {
    if (!confirm("Remove this passkey? You can still sign in with the email code.")) return;
    setBusy(true); setErr(null);
    const { error } = await auth().passkey.delete({ passkeyId: id });
    if (error) setErr("Couldn't remove it. Try again."); else await load();
    setBusy(false);
  };
  return (
    <div className="card p-4" data-testid="card-passkeys">
      <p className="text-sm">Sign in with Face ID, Touch ID or your phone's passcode instead of waiting for an email.</p>
      {keys && keys.length > 0 && (
        <div className="divide-y divide-[var(--line)] mt-3 border-t border-[var(--line)]">
          {keys.map((k) => (
            <div key={k.id} className="flex items-center gap-3 py-2.5 text-sm" data-testid={`row-passkey-${k.id}`}>
              <span className="flex-1 min-w-0"><span className="block font-bold truncate">{k.friendly_name || "Passkey"}</span><span className="block text-xs text-[var(--mute)]">{k.created_at ? `Added ${fmtDate(k.created_at.slice(0, 10))}` : ""}{k.last_used_at ? `, used ${fmtDate(k.last_used_at.slice(0, 10))}` : ""}</span></span>
              <button className="text-xs text-[var(--mute)] px-1" disabled={busy} onClick={() => remove(k.id)} data-testid={`button-remove-passkey-${k.id}`}>Remove</button>
            </div>
          ))}
        </div>
      )}
      <button className="btn btn-ghost w-full h-11 mt-3" disabled={busy} onClick={add} data-testid="button-add-passkey">{busy ? "Waiting…" : keys && keys.length ? "Add another passkey" : "Use Face ID next time"}</button>
      {err && <p className="text-xs down mt-2" data-testid="text-passkey-error">{err}</p>}
    </div>
  );
}

/**
 * Shown once, right after an email-code sign-in, when this account has no passkey yet:
 * one tap saves a passkey to iCloud Keychain or Google Password Manager.
 */
export function PasskeyOffer() {
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  useEffect(() => {
    if (!passkeysSupported() || !takePasskeyOffer()) return;
    (async () => {
      const { data, error } = await (supabase().auth as any).passkey.list();
      if (!error && !(data ?? []).length) setShow(true); else clearPasskeyOffer();
    })();
  }, []);
  if (!show) return null;
  const close = () => { clearPasskeyOffer(); setShow(false); };
  const save = async () => {
    setBusy(true); setErr(null);
    const { error } = await (supabase().auth as any).registerPasskey();
    setBusy(false);
    if (error) { setErr(passkeyError(error.message)); return; }
    clearPasskeyOffer(); setDone(true);
  };
  if (done) return <div className="card mb-3 p-4 text-sm" data-testid="card-passkey-saved"><b>Saved.</b> Next time, tap the email box and pick your passkey. <button className="text-[var(--blue)] ml-1" onClick={() => setShow(false)}>OK</button></div>;
  return (
    <div className="card mb-3 p-4" data-testid="card-passkey-offer">
      <div className="font-bold">Skip the email code next time?</div>
      <p className="text-sm text-[var(--mute)] mt-1">Save a passkey and sign in with Face ID or Touch ID. It syncs to your other devices.</p>
      <div className="flex gap-2 mt-3">
        <button className="btn btn-red flex-1 h-11" disabled={busy} onClick={save} data-testid="button-offer-passkey">{busy ? "Waiting…" : "Use Face ID"}</button>
        <button className="btn btn-ghost h-11 px-4" disabled={busy} onClick={close} data-testid="button-offer-passkey-later">Not now</button>
      </div>
      {err && <p className="text-xs down mt-2" data-testid="text-offer-passkey-error">{err}</p>}
    </div>
  );
}
