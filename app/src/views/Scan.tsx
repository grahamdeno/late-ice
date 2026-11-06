"use client";
import { useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link, useLocation } from "@/lib/router";
import { apiRequest } from "@/lib/queryClient";
import { FaceoffDot, ScanSkeleton, img } from "@/lib/ui";
import { useMe } from "@/lib/auth";

/** Shrink big phone photos before upload. Keeps handwriting legible, cuts upload time. */
async function toDataUrl(file: File, max = 2200): Promise<string> {
  let bitmap: ImageBitmap | null = null;
  try {
    bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
    const longSide = Math.max(bitmap.width, bitmap.height);
    if (longSide < 800) throw new Error("That photo is too small. Move closer so the sheet fills the frame.");
    const scale = Math.min(1, max / longSide);
    const c = document.createElement("canvas");
    c.width = Math.round(bitmap.width * scale);
    c.height = Math.round(bitmap.height * scale);
    const ctx = c.getContext("2d");
    if (!ctx) throw new Error("Could not read that photo. Try another one.");
    ctx.drawImage(bitmap, 0, 0, c.width, c.height);
    return c.toDataURL("image/jpeg", 0.86);
  } catch (e) {
    if (e instanceof Error && /too small|Could not read/.test(e.message)) throw e;
    throw new Error("Could not read that photo. Try another one.");
  } finally {
    bitmap?.close();
  }
}

export default function Scan() {
  const [, , swap] = useLocation();
  const { me, loading } = useMe();
  const cam = useRef<HTMLInputElement>(null);
  const lib = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const { data: samples } = useQuery<{ id: string; title: string; image: string }[]>({ queryKey: ["/api/samples"] });
  const { data: allowance } = useQuery<{ show: boolean; left: number | null }>({ queryKey: ["/api/sheets/allowance"], enabled: !!me });

  const upload = async (f?: File) => {
    if (!f) return;
    setBusy(true); setErr(null);
    try {
      const image = await toDataUrl(f);
      const r = await apiRequest("POST", "/api/sheets", { image });
      const { id } = await r.json();
      swap(`/sheet/${id}`);
    } catch (e: any) {
      const msg = String(e?.message || "");
      if (/too small|Could not read/.test(msg)) setErr(msg);
      else setErr([401, 413, 429].includes(e?.status) ? e.message : "Upload failed. Check your signal and try again.");
      setBusy(false);
    }
  };
  const sample = async (id: string) => {
    setBusy(true); setErr(null);
    try {
      const r = await apiRequest("POST", `/api/sheets/sample/${id}`);
      swap(`/sheet/${(await r.json()).id}`);
    } catch (e: any) { setErr(e.message); setBusy(false); }
  };

  if (loading) return <ScanSkeleton />;

  if (!loading && !me) {
    return (
      <div>
        <div className="label">Post-game · 30 seconds</div>
        <h1 className="font-display text-[40px] leading-none font-black uppercase mt-1">Snap the sheet</h1>
        <div className="card-hi mt-5 p-5 text-center" data-testid="card-scan-signin">
          <div className="flex justify-center mb-3"><FaceoffDot size={44} /></div>
          <div className="font-bold">Sign in to scan</div>
          <p className="text-sm text-[var(--mute)] mt-1">Scans are tied to a player so wrong sheets can be traced and fixed. It takes a minute, and it's free.</p>
          <Link href="/join" className="btn btn-red h-11 mt-4 inline-flex" data-testid="button-scan-join">Join or sign in</Link>
        </div>
      </div>
    );
  }

  return (
    <div>
      <div className="label">Post-game · 30 seconds</div>
      <h1 className="font-display text-[40px] leading-none font-black uppercase mt-1">Snap the sheet</h1>
      <p className="text-[var(--mute)] mt-2">Grab the scoresheet off the scorer's table. One photo puts the game, the goals and everyone's rating on the books.</p>
      {allowance?.show && allowance.left != null && (
        <p className="text-sm mt-2" data-testid="text-scans-left">You have {allowance.left} {allowance.left === 1 ? "scan" : "scans"} left today.</p>
      )}

      <div className="card-hi mt-5 p-4">
        <div className="relative aspect-[4/3] rounded-2xl overflow-hidden border border-[var(--line)] flex items-center justify-center" style={{ background: "repeating-linear-gradient(0deg,var(--ice-2) 0 22px,var(--ice-3) 22px 23px)" }}>
          {["top-3 left-3 border-t-4 border-l-4 rounded-tl-xl", "top-3 right-3 border-t-4 border-r-4 rounded-tr-xl", "bottom-3 left-3 border-b-4 border-l-4 rounded-bl-xl", "bottom-3 right-3 border-b-4 border-r-4 rounded-br-xl"].map((c) => (
            <span key={c} className={`absolute h-8 w-8 border-[var(--red)] ${c}`} />
          ))}
          <div className="text-center px-6">
            <FaceoffDot size={56} pulse={busy} />
            <div className="font-bold mt-2">{busy ? "Uploading…" : "Fit all four corners in frame"}</div>
            <div className="text-xs text-[var(--mute)] mt-1">Flat on a table, good light, no glare</div>
          </div>
        </div>
        <input ref={cam} type="file" accept="image/*" capture="environment" className="hidden" onChange={(e) => upload(e.target.files?.[0])} data-testid="input-camera" />
        <input ref={lib} type="file" accept="image/*" className="hidden" onChange={(e) => upload(e.target.files?.[0])} data-testid="input-library" />
        <div className="grid grid-cols-[1fr_auto] gap-2 mt-4">
          <button className="btn btn-red" disabled={busy} onClick={() => cam.current?.click()} data-testid="button-take-photo">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" /><circle cx="12" cy="13" r="4" /></svg>
            Take photo
          </button>
          <button className="btn btn-ghost" disabled={busy} onClick={() => lib.current?.click()} data-testid="button-upload">Upload</button>
        </div>
        {err && <div className="text-sm text-[var(--down)] mt-3" data-testid="text-upload-error">{err}</div>}
      </div>

      <div className="mt-6 grid grid-cols-3 gap-2 text-center">
        {[["1", "Snap", "Photo of the sheet"], ["2", "Check", "Glance, fix a typo"], ["3", "Final", "Ratings update"]].map(([n, t, d]) => (
          <div key={n} className="card p-3">
            <div className="font-display text-2xl text-[var(--red)]">{n}</div>
            <div className="font-bold text-sm">{t}</div>
            <div className="text-[11px] text-[var(--mute)]">{d}</div>
          </div>
        ))}
      </div>

      {samples && samples.length > 0 && (
        <div className="mt-7">
          <div className="flex items-end justify-between mb-3">
            <h2 className="font-black text-[17px]">No sheet handy? Try one.</h2>
            <span className="label">Test sheets</span>
          </div>
          <div className="grid grid-cols-2 gap-3">
            {samples.map((s) => (
              <button key={s.id} onClick={() => sample(s.id)} disabled={busy} className="card overflow-hidden text-left disabled:opacity-50" data-testid={`button-sample-${s.id}`}>
                <img src={img(s.image)} alt={s.title} className="w-full aspect-[4/3] object-cover object-top" loading="lazy" />
                <div className="p-3 text-sm font-bold leading-snug">{s.title}</div>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
