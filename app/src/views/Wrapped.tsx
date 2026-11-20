"use client";
import { useEffect, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "@/lib/router";
import { act } from "@/lib/auth";
import { apiRequest, authHeaders } from "@/lib/queryClient";
import { BackBar, Loading, fmtDate } from "@/lib/ui";
import { Bobble } from "@/components/Bobble";

/*
 * Season Wrapped (A2, A3). One card at a time. Tap the right side, swipe left or press Next for the next card;
 * tap the left side, swipe right or press Back to go back. The buttons are always on screen, so no gesture is
 * the only way. Cards never advance by themselves. Each card is one screen-reader element holding the card's
 * full text; Back and Next are real buttons next to it. On large text sizes a card scrolls.
 */

type Card = { kind: string; title: string; headline: string; lines: string[]; data?: any };

const enc = encodeURIComponent;

export default function Wrapped({ teamId, seasonId, playerKey, shareKey }: { teamId: string; seasonId: string; playerKey: string | null; shareKey: string | null }) {
  const qs = playerKey && shareKey ? `?p=${enc(playerKey)}&s=${enc(shareKey)}` : "";
  const { data, error } = useQuery<any>({ queryKey: [`/api/wrapped/recap/${teamId}/${seasonId}${qs}`], retry: false });
  const [i, setI] = useState(0);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const touch = useRef<number | null>(null);
  const cards: Card[] = data?.cards ?? [];
  const n = cards.length;
  const go = (d: number) => setI((x) => Math.min(n - 1, Math.max(0, x + d)));

  useEffect(() => {
    const key = (e: KeyboardEvent) => { if (e.key === "ArrowRight") go(1); else if (e.key === "ArrowLeft") go(-1); };
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  });

  if (error) return <div className="card p-4 text-sm" data-testid="text-wrapped-error">{(error as any).status === 401 ? "Sign in to see this recap, or ask for a fresh link." : ((error as any).message ?? "This recap isn't available.")}</div>;
  if (!data) return <Loading />;
  const c = cards[i];
  const own = data.mode === "own";

  const share = async (withPicture: boolean) => {
    setBusy(true); setNote(null);
    try {
      if (!navigator.onLine) throw Object.assign(new Error("offline"), { offline: true });
      const r = await (await apiRequest("POST", `/api/wrapped/recap/${teamId}/${seasonId}/share`)).json();
      const url = `${location.origin}${r.path}`;
      const nav: any = navigator;
      if (withPicture) {
        const res = await fetch(`${r.imagePath}&card=${enc(c.kind)}`, { headers: authHeaders() });
        if (!res.ok) throw new Error("no card");
        const blob = await res.blob();
        const file = new File([blob], `late-ice-wrapped-${c.kind}.png`, { type: "image/png" });
        if (nav.canShare?.({ files: [file] })) { await nav.share({ files: [file], title: `${data.season.name} with ${data.team.name}`, text: data.alts[i], url }); setBusy(false); return; }
        const a = document.createElement("a");
        a.href = URL.createObjectURL(blob); a.download = file.name; a.click();
        setTimeout(() => URL.revokeObjectURL(a.href), 2000);
        setBusy(false); return;
      }
      if (nav.share) await nav.share({ title: `${data.season.name} with ${data.team.name}`, url });
      else { await nav.clipboard?.writeText(url); setNote("Link copied."); }
    } catch (e: any) {
      if (e?.offline) setNote("You're offline. Try again when you're back online.");
      else if (e?.name !== "AbortError") setNote("Couldn't share that. Try again.");
    }
    setBusy(false);
  };

  return (
    <div data-testid="page-wrapped">
      {own ? <BackBar href="/" title="Home" /> : <div className="label mb-2">Shared from Late Ice</div>}
      <div className="text-xs text-[var(--mute)] mb-2 tnum" data-testid="text-wrapped-step">Card {i + 1} of {n}</div>

      {c && (
        <div
          className="hero p-5 min-h-[420px] max-h-[70vh] overflow-y-auto select-none"
          style={{ ["--team" as any]: data.team.color }}
          role="group" aria-roledescription="card" tabIndex={0}
          aria-label={`Card ${i + 1} of ${n}. ${data.alts[i]}`}
          data-testid={`card-wrapped-${c.kind}`}
          onClick={(e) => { const r = e.currentTarget.getBoundingClientRect(); if (e.clientX - r.left < r.width * 0.3) go(-1); else go(1); }}
          onTouchStart={(e) => { touch.current = e.touches[0].clientX; }}
          onTouchEnd={(e) => { if (touch.current == null) return; const dx = e.changedTouches[0].clientX - touch.current; touch.current = null; if (Math.abs(dx) > 40) go(dx < 0 ? 1 : -1); }}
        >
          <div aria-hidden="true">
            <div className="label">{c.title}</div>
            {c.kind === "cover" && (
              <div className="flex justify-center my-3"><Bobble avatar={c.data?.avatar} jersey={c.data?.color} number={c.data?.number} goalie={c.data?.position === "G"} size={132} tile={false} /></div>
            )}
            <div className="font-display text-[44px] leading-[1.05] font-black mt-2 break-words" data-testid="text-card-headline">{c.headline}</div>
            <ul className="mt-4 space-y-2 text-[17px]">
              {c.lines.map((l, k) => <li key={k}>{l}</li>)}
            </ul>
            {c.kind === "rating" && c.data?.series?.length > 1 && <Spark series={c.data.series} />}
          </div>
        </div>
      )}

      <div className="flex items-center gap-3 mt-3">
        <button className="btn btn-ghost h-11 min-w-[44px] flex-1" disabled={i === 0} onClick={() => go(-1)} data-testid="button-wrapped-back">Back</button>
        <div className="flex gap-1.5" aria-hidden="true">{cards.map((_, k) => <span key={k} className={`h-2 w-2 rounded-full ${k === i ? "bg-[var(--red)]" : "bg-[var(--line)]"}`} />)}</div>
        <button className="btn btn-red h-11 min-w-[44px] flex-1" disabled={i >= n - 1} onClick={() => go(1)} data-testid="button-wrapped-next">Next</button>
      </div>

      {data.updatedOn && <p className="text-xs text-[var(--mute)] mt-3" data-testid="text-wrapped-updated">Updated {fmtDate(data.updatedOn)}</p>}

      {own ? (
        <div className="mt-4 space-y-2">
          <button className="btn btn-ghost h-11 w-full text-sm" disabled={busy} onClick={() => share(true)} data-testid="button-wrapped-share-card">{busy ? "Making the card…" : "Share this card"}</button>
          <button className="btn btn-ghost h-11 w-full text-sm" disabled={busy} onClick={() => share(false)} data-testid="button-wrapped-share-link">Share my whole recap</button>
          {note && <p className="text-xs text-[var(--mute)]" role="status">{note}</p>}
        </div>
      ) : (
        <div className="mt-4">
          {data.cta === "claim"
            ? <Link href="/me" className="btn btn-red h-11 w-full inline-flex items-center justify-center text-sm" data-testid="link-wrapped-claim">Claim your spot</Link>
            : <Link href="/join" className="btn btn-red h-11 w-full inline-flex items-center justify-center text-sm" data-testid="link-wrapped-get">Get Late Ice</Link>}
        </div>
      )}

    </div>
  );
}

function Spark({ series }: { series: number[] }) {
  const w = 300, h = 70, pad = 6;
  const lo = Math.min(...series), hi = Math.max(...series), span = hi - lo || 1;
  const pts = series.map((v, k) => `${pad + (k / (series.length - 1)) * (w - pad * 2)},${h - pad - ((v - lo) / span) * (h - pad * 2)}`).join(" ");
  return <svg viewBox={`0 0 ${w} ${h}`} className="w-full mt-4" aria-hidden="true"><polyline points={pts} fill="none" stroke="var(--red)" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" /></svg>;
}

/** A4: the team wrap. Captains and assistants choose which awards go out before sharing. */
export function TeamWrapped({ teamId, seasonId, shareKey }: { teamId: string; seasonId: string; shareKey: string | null }) {
  const qs = shareKey ? `?s=${enc(shareKey)}` : "";
  const url = `/api/wrapped/team/${teamId}/${seasonId}`;
  const { data, error } = useQuery<any>({ queryKey: [`${url}${qs}`], retry: false });
  const [err, setErr] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  if (error) return <div className="card p-4 text-sm" data-testid="text-wrapped-error">{(error as any).message ?? "This team wrap isn't available."}</div>;
  if (!data) return <Loading />;
  const hidden: string[] = data.hiddenAwards ?? [];
  const toggle = async (key: string) => {
    const next = hidden.includes(key) ? hidden.filter((k) => k !== key) : [...hidden, key];
    setErr(await act("PUT", url, { hiddenAwards: next }, [url]));
  };
  const share = async () => {
    setNote(null);
    try {
      const r = await (await apiRequest("POST", `${url}/share`)).json();
      const link = `${location.origin}${r.path}`;
      const nav: any = navigator;
      const res = await fetch(r.imagePath, { headers: authHeaders() });
      const blob = res.ok ? await res.blob() : null;
      const file = blob ? new File([blob], "late-ice-team-wrap.png", { type: "image/png" }) : null;
      if (file && nav.canShare?.({ files: [file] })) await nav.share({ files: [file], title: `${data.team.name} ${data.season.name}`, url: link });
      else if (nav.share) await nav.share({ title: `${data.team.name} ${data.season.name}`, url: link });
      else { await nav.clipboard?.writeText(link); setNote("Link copied."); }
    } catch (e: any) { if (e?.name !== "AbortError") setNote(navigator.onLine ? "Couldn't share that. Try again." : "You're offline. Try again when you're back online."); }
  };
  return (
    <div data-testid="page-team-wrapped">
      {data.canManage ? <BackBar href={`/team/${teamId}/manage`} title="Manage team" /> : <div className="label mb-2">Shared from Late Ice</div>}
      <div className="hero p-5" style={{ ["--team" as any]: data.team.color }}>
        <div className="label">{data.season.name} · Team wrap</div>
        <h1 className="font-display text-3xl mt-1 font-black">{data.team.name}</h1>
        <div className="text-sm text-[var(--mute)]">{data.team.rink}</div>
      </div>
      {data.updatedOn && <p className="text-xs text-[var(--mute)] mt-2 px-1">Updated {fmtDate(data.updatedOn)}</p>}
      {err && <p className="text-sm down mt-2 px-1" role="alert">{err}</p>}
      <div className="space-y-3 mt-4">
        {data.awards.map((a: any) => (
          <div key={a.key} className={`card p-4 ${a.hidden ? "opacity-60" : ""}`} data-testid={`award-${a.key}`}>
            <div className="label">{a.title}</div>
            <div className="font-display text-2xl font-black break-words">{a.headline}</div>
            {a.lines.map((l: string, k: number) => <div key={k} className="text-sm text-[var(--mute)]">{l}</div>)}
            {data.canManage && (
              <label className="flex items-center gap-3 mt-3 min-h-[44px] text-sm font-bold">
                <input type="checkbox" className="h-5 w-5" checked={!a.hidden} onChange={() => toggle(a.key)} data-testid={`toggle-award-${a.key}`} />
                {a.hidden ? "Hidden from the shared wrap" : "Shown on the shared wrap"}
              </label>
            )}
          </div>
        ))}
      </div>
      {data.canManage && (
        <div className="mt-4">
          <button className="btn btn-red h-11 w-full text-sm" onClick={share} data-testid="button-team-wrap-share">Share the team wrap</button>
          {note && <p className="text-xs text-[var(--mute)] mt-2" role="status">{note}</p>}
        </div>
      )}
      {!data.canManage && data.mode === "shared" && <div className="mt-4"><Link href="/join" className="btn btn-red h-11 w-full inline-flex items-center justify-center text-sm">Get Late Ice</Link></div>}
    </div>
  );
}
