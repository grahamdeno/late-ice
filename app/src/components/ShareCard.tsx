"use client";
import { useState } from "react";
import { authHeaders } from "@/lib/queryClient";

/** Share a result or player card as a picture: the phone's share sheet where there is one, else a download. */
export function ShareCard({ kind, id, title, label = "Share card", shareKey }: { kind: "game" | "player"; id: number | string; title: string; label?: string; shareKey?: string | null }) {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const share = async () => {
    setBusy(true); setErr(null);
    try {
      const res = await fetch(`/api/cards/${kind}/${id}?format=story`, { headers: authHeaders() });
      if (!res.ok) throw new Error("no card");
      const blob = await res.blob();
      const file = new File([blob], `late-ice-${kind}-${id}.png`, { type: "image/png" });
      const nav: any = navigator;
      // A result's link carries its share key, so a teammate who isn't signed in still sees the score.
      const url = `${location.origin}/${kind}/${id}${shareKey ? `?s=${encodeURIComponent(shareKey)}` : ""}`;
      if (nav.canShare?.({ files: [file] })) await nav.share({ files: [file], title, url });
      else {
        const a = document.createElement("a");
        a.href = URL.createObjectURL(blob); a.download = file.name; a.click();
        setTimeout(() => URL.revokeObjectURL(a.href), 2000);
      }
    } catch (e: any) {
      if (e?.name !== "AbortError") setErr("Couldn't make the card. Try again.");
    }
    setBusy(false);
  };
  return (
    <div>
      <button className="btn btn-ghost h-11 w-full text-sm" disabled={busy} onClick={share} data-testid={`button-share-${kind}`}>{busy ? "Making the card…" : label}</button>
      {err && <p className="text-xs down mt-1.5">{err}</p>}
    </div>
  );
}
