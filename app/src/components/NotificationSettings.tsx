"use client";
import { useEffect, useState } from "react";
import { apiRequest } from "@/lib/queryClient";
import { useAuth } from "@/lib/auth";

type PrefKey = "game_day" | "result" | "sub_request" | "roster" | "confirm";
type Prefs = Record<PrefKey, boolean> & { publicKey: string | null };

const TOGGLES: { key: PrefKey; label: string; hint: string; testid: string }[] = [
  { key: "game_day", label: "Game day", hint: "A morning note when you have a game.", testid: "input-pref-game-day" },
  { key: "result", label: "Results", hint: "When a final includes you.", testid: "input-pref-result" },
  { key: "sub_request", label: "Sub requests", hint: "When a team asks you to sub.", testid: "input-pref-sub-request" },
  { key: "roster", label: "Roster", hint: "When a captain adds you, claims you, or takes you off.", testid: "input-pref-roster" },
  { key: "confirm", label: "Sheet to confirm", hint: "When a scoresheet is waiting on you.", testid: "input-pref-confirm" },
];

function urlBase64ToUint8Array(base64: string) {
  const pad = "=".repeat((4 - (base64.length % 4)) % 4);
  const b64 = (base64 + pad).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(b64);
  const out = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

/**
 * The five notification switches and Allow.
 * C1 drops this on the Settings page with no props.
 * `overlay` is only for the temporary providers mount, so the block does not push every screen.
 */
export function NotificationSettings({ overlay = false }: { overlay?: boolean }) {
  const { token } = useAuth();
  const [prefs, setPrefs] = useState<Prefs | null>(null);
  const [open, setOpen] = useState(!overlay);
  const [status, setStatus] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!token) { setPrefs(null); return; }
    let dead = false;
    apiRequest("GET", "/api/push/prefs")
      .then((r) => r.json())
      .then((j: Prefs) => { if (!dead) setPrefs(j); })
      .catch(() => { if (!dead) setPrefs(null); });
    return () => { dead = true; };
  }, [token]);

  if (!token || !prefs) return null;

  async function toggle(key: PrefKey, value: boolean) {
    if (!prefs) return;
    const prev = prefs;
    setPrefs({ ...prefs, [key]: value });
    setStatus("");
    try {
      const res = await apiRequest("PUT", "/api/push/prefs", { [key]: value });
      setPrefs(await res.json());
    } catch {
      setPrefs(prev);
      setStatus("Couldn't save that.");
    }
  }

  async function allow() {
    if (!prefs?.publicKey) { setStatus("Notifications aren't set up on this server yet."); return; }
    if (!("Notification" in window) || !("serviceWorker" in navigator) || !("PushManager" in window)) {
      setStatus("This browser can't take notifications.");
      return;
    }
    setBusy(true);
    setStatus("");
    try {
      const perm = await Notification.requestPermission();
      if (perm !== "granted") { setStatus("Notifications stay off in this browser."); return; }
      const reg = await navigator.serviceWorker.ready;
      const key = urlBase64ToUint8Array(prefs.publicKey);
      // A subscription made with an older server key can't be reused or replaced in place.
      const old = await reg.pushManager.getSubscription();
      const oldKey = old?.options?.applicationServerKey ? new Uint8Array(old.options.applicationServerKey as ArrayBuffer) : null;
      if (old && (!oldKey || oldKey.length !== key.length || oldKey.some((b, i) => b !== key[i]))) await old.unsubscribe();
      const sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: key });
      await apiRequest("POST", "/api/push/subscribe", sub.toJSON());
      setStatus("This browser can send notifications.");
    } catch {
      setStatus("Couldn't turn notifications on.");
    } finally {
      setBusy(false);
    }
  }

  const panel = (
    <form className="card p-4" data-testid="form-notification-settings" onSubmit={(e) => e.preventDefault()}>
      <div className="font-bold">Notifications</div>
      <div className="mt-2 divide-y divide-[var(--line)]">
        {TOGGLES.map((t) => (
          <label key={t.key} className="flex items-center justify-between gap-3 py-2.5 min-h-9">
            <span className="min-w-0">
              <span className="block text-sm font-bold">{t.label}</span>
              <span className="block text-xs text-[var(--mute)]">{t.hint}</span>
            </span>
            <input
              type="checkbox"
              className="h-6 w-6 shrink-0"
              checked={!!prefs[t.key]}
              data-testid={t.testid}
              onChange={(e) => { toggle(t.key, e.target.checked).catch(() => {}); }}
            />
          </label>
        ))}
      </div>
      <button type="button" className="btn btn-red mt-3 h-9 px-4 text-sm" data-testid="button-notify-allow" disabled={busy} onClick={() => { allow().catch(() => {}); }}>
        Allow
      </button>
      {status && <p className="mt-2 text-xs text-[var(--mute)]" data-testid="text-notify-status" role="status">{status}</p>}
    </form>
  );

  if (!overlay) return panel;
  return (
    <>
      <button
        type="button"
        className="chip fixed z-30"
        style={{ right: 12, bottom: "calc(env(safe-area-inset-bottom) + 104px)" }}
        data-testid="button-notification-settings"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
      >
        Notifications
      </button>
      {open && (
        <div className="fixed z-30 inset-x-3 mx-auto max-w-[536px]" style={{ bottom: "calc(env(safe-area-inset-bottom) + 148px)" }}>
          {panel}
        </div>
      )}
    </>
  );
}
