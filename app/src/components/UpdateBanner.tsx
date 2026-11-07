"use client";
import { useEffect, useRef, useState } from "react";
import { useAuth } from "@/lib/auth";
import { queryClient } from "@/lib/queryClient";

/** "Update ready" once a waiting worker exists, or once a new worker takes control. Reload is the only navigation. */
export function UpdateBanner() {
  const { token } = useAuth();
  const [ready, setReady] = useState(false);
  const hadController = useRef(false);
  const reloadAsked = useRef(false);

  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;
    hadController.current = !!navigator.serviceWorker.controller;
    const onControl = () => {
      // The first claim (no previous controller) is install, not an update.
      if (!hadController.current) { hadController.current = true; return; }
      setReady(true);
      if (reloadAsked.current) window.location.reload();
    };
    const onMessage = (e: MessageEvent) => {
      // Stale-while-revalidate already answered this fetch. Refetch once the stored copy changes.
      if (e.data && e.data.type === "api-updated" && typeof e.data.url === "string") {
        const url = e.data.url;
        queryClient.invalidateQueries({ predicate: (q) => String(q.queryKey?.[0] ?? "") === url });
      }
    };
    navigator.serviceWorker.addEventListener("controllerchange", onControl);
    navigator.serviceWorker.addEventListener("message", onMessage);
    let reg: ServiceWorkerRegistration | undefined;
    const markWaiting = () => {
      if (reg?.waiting && navigator.serviceWorker.controller) setReady(true);
    };
    navigator.serviceWorker.getRegistration().then((r) => {
      if (!r) return;
      reg = r;
      markWaiting();
      r.addEventListener("updatefound", () => {
        const worker = r.installing;
        worker?.addEventListener("statechange", () => {
          if (worker.state === "installed") markWaiting();
        });
      });
    }).catch(() => {});
    return () => {
      navigator.serviceWorker.removeEventListener("controllerchange", onControl);
      navigator.serviceWorker.removeEventListener("message", onMessage);
    };
  }, []);

  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;
    const send = () => {
      navigator.serviceWorker.controller?.postMessage({ type: "auth", token });
    };
    navigator.serviceWorker.ready.then(send).catch(() => {});
    navigator.serviceWorker.addEventListener("controllerchange", send);
    return () => navigator.serviceWorker.removeEventListener("controllerchange", send);
  }, [token]);

  async function reload() {
    reloadAsked.current = true;
    const reg = await navigator.serviceWorker.getRegistration().catch(() => undefined);
    if (reg?.waiting) {
      reg.waiting.postMessage({ type: "activate" });
      return;
    }
    window.location.reload();
  }

  return (
    <>
      {ready && (
        <div
          className="card fixed z-50 inset-x-3 mx-auto max-w-[536px] p-3 flex items-center justify-between gap-3"
          style={{ top: "calc(env(safe-area-inset-top) + 76px)" }}
          data-testid="banner-update"
        >
          <span className="text-sm font-bold">Update ready</span>
          <button type="button" className="btn btn-red h-9 px-4 text-sm" data-testid="button-update-reload" onClick={() => { reload().catch(() => {}); }}>Reload</button>
        </div>
      )}
    </>
  );
}
