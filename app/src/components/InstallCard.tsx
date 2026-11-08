"use client";
import { useEffect, useState } from "react";

const VISITS = "lateice.install.visits";
const COUNTED = "lateice.install.counted";
const DISMISS = "lateice.install.dismissedUntil";
const THIRTY_DAYS = 30 * 24 * 60 * 60 * 1000;

type InstallPrompt = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: string }> };

function installed() {
  const nav = navigator as Navigator & { standalone?: boolean };
  return window.matchMedia("(display-mode: standalone)").matches || nav.standalone === true;
}

function iosDevice() {
  return /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
}

/** Second visit, and only when the app is still running in a browser tab. */
export function InstallCard() {
  const [ios, setIos] = useState(false);
  const [ready, setReady] = useState(false);
  const [prompt, setPrompt] = useState<InstallPrompt | null>(null);

  useEffect(() => {
    if (installed()) return;
    let show = false;
    try {
      const until = Number(localStorage.getItem(DISMISS) || 0);
      if (!(until > Date.now())) {
        if (!sessionStorage.getItem(COUNTED)) {
          const visits = Number(localStorage.getItem(VISITS) || 0) + 1;
          localStorage.setItem(VISITS, String(visits));
          sessionStorage.setItem(COUNTED, "1");
          show = visits >= 2;
        } else {
          show = Number(localStorage.getItem(VISITS) || 0) >= 2;
        }
      }
    } catch { /* private mode: skip the card rather than nag */ }
    if (show) {
      setIos(iosDevice());
      setReady(true);
    }
    const onPrompt = (e: Event) => {
      e.preventDefault();
      setPrompt(e as InstallPrompt);
    };
    window.addEventListener("beforeinstallprompt", onPrompt);
    return () => window.removeEventListener("beforeinstallprompt", onPrompt);
  }, []);

  function dismiss() {
    try { localStorage.setItem(DISMISS, String(Date.now() + THIRTY_DAYS)); } catch { /* private mode */ }
    setReady(false);
  }

  if (!ready) return null;
  if (!ios && !prompt) return null;

  return (
    <div
      className="card fixed z-30 inset-x-3 mx-auto max-w-[536px] p-4"
      style={{ bottom: "calc(env(safe-area-inset-bottom) + 104px)" }}
      data-testid="card-install"
    >
      <div className="font-bold">Add Late Ice to your home screen</div>
      {ios ? (
        <ol className="mt-2 space-y-1 text-sm text-[var(--mute)] list-decimal pl-4">
          <li data-testid="text-install-share">Tap Share.</li>
          <li data-testid="text-install-add">Then tap Add to Home Screen.</li>
        </ol>
      ) : (
        <p className="mt-2 text-sm text-[var(--mute)]">Install the app so it opens from your home screen.</p>
      )}
      <div className="mt-3 flex gap-2">
        {!ios && prompt && (
          <button
            type="button"
            className="btn btn-red h-11 px-4 text-sm"
            data-testid="button-install"
            onClick={async () => {
              await prompt.prompt();
              await prompt.userChoice.catch(() => {});
              setPrompt(null);
              setReady(false);
            }}
          >
            Install
          </button>
        )}
        <button type="button" className="btn btn-ghost h-11 px-4 text-sm" data-testid="button-install-dismiss" onClick={dismiss}>Not now</button>
      </div>
    </div>
  );
}
