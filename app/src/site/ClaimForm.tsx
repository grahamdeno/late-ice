"use client";
import { useState } from "react";

type Rink = { id: number; name: string; city: string | null; state: string | null };
const field = "mt-1.5 w-full h-12 rounded-xl bg-[#0b0f16] border border-[#243041] px-3.5 text-[#eef3f8] focus:outline-none focus:border-[#5aa9ff]";
const lbl = "block text-sm font-bold text-[#c3ccd8]";

/** Claim an existing rink or add a new one. Saves a lead; Graham and support hear about it in the app. */
export function ClaimForm({ rinks, initialRink, thanksHref }: { rinks: Rink[]; initialRink: number | null; thanksHref: string }) {
  const [rinkId, setRinkId] = useState<string>(initialRink ? String(initialRink) : "");
  const picked = rinks.find((r) => String(r.id) === rinkId);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const get = (k: string) => String(f.get(k) ?? "");
    setBusy(true); setErr(null);
    try {
      const res = await fetch("/api/leads", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          rinkId: picked?.id ?? null, rinkName: picked?.name ?? get("rinkName"), city: picked ? [picked.city, picked.state].filter(Boolean).join(", ") : get("city"),
          contactName: get("contactName"), role: get("role"), email: get("email"), phone: get("phone"), leagueCount: get("leagueCount"),
          scheduler: get("scheduler"), notes: get("notes"), founding: f.get("founding") === "on", website: get("website"), source: picked ? "claim" : "new rink",
        }),
      });
      if (!res.ok) { setErr((await res.json().catch(() => null))?.message ?? "That didn't go through. Try again or email us."); return; }
      window.location.href = thanksHref;
    } catch {
      setErr("That didn't go through. Check your connection and try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="rounded-[26px] bg-[#151c28] p-6 sm:p-8" data-testid="form-claim">
      <label className={lbl}>Your rink
        <select className={field} value={rinkId} onChange={(e) => setRinkId(e.target.value)} data-testid="select-claim-rink">
          <option value="">Not listed, add a new rink</option>
          {rinks.map((r) => <option key={r.id} value={r.id}>{r.name}{r.city ? ` · ${r.city}` : ""}</option>)}
        </select>
      </label>
      {!picked && (
        <div className="grid gap-4 sm:grid-cols-2 mt-4">
          <label className={lbl}>Rink name<input name="rinkName" required className={field} /></label>
          <label className={lbl}>City and state<input name="city" className={field} placeholder="Wilmington, NC" /></label>
        </div>
      )}
      <div className="grid gap-4 sm:grid-cols-2 mt-4">
        <label className={lbl}>Your name<input name="contactName" required autoComplete="name" className={field} /></label>
        <label className={lbl}>Your role
          <select name="role" className={field} defaultValue="Rink manager">
            <option>Rink manager</option><option>League commissioner</option><option>Hockey director</option><option>Owner</option><option>Other</option>
          </select>
        </label>
        <label className={lbl}>Work email<input name="email" type="email" required autoComplete="email" className={field} placeholder="you@yourrink.com" /></label>
        <label className={lbl}>Phone (optional)<input name="phone" type="tel" autoComplete="tel" className={field} /></label>
        <label className={lbl}>Adult leagues you run
          <select name="leagueCount" className={field} defaultValue="1 to 3"><option>1 to 3</option><option>4 to 6</option><option>7 or more</option></select>
        </label>
        <label className={lbl}>Scheduling software
          <select name="scheduler" className={field} defaultValue="DaySmart"><option>DaySmart</option><option>Something else</option><option>Spreadsheets</option></select>
        </label>
      </div>
      <label className={`${lbl} mt-4`}>Anything we should know<textarea name="notes" rows={3} className={`${field} h-auto py-3`} /></label>
      <label className="flex items-start gap-3 mt-4 text-sm text-[#c3ccd8]"><input type="checkbox" name="founding" defaultChecked className="mt-1 h-4 w-4" /> Count us in as a founding rink: free through this season, price agreed together before the next.</label>
      <input name="website" tabIndex={-1} autoComplete="off" aria-hidden="true" className="absolute -left-[9999px] h-0 w-0 opacity-0" />
      <div className="flex items-center gap-4 mt-6 flex-wrap">
        <button disabled={busy} className="text-white bg-[#e0262b] hover:bg-[#ec3035] disabled:opacity-60 font-bold rounded-2xl h-12 px-6" data-testid="button-claim-submit">{busy ? "Sending" : picked ? `Claim ${picked.name}` : "Add our rink"}</button>
        <span className="text-sm text-[#8b97a8]">We check that you work at the rink before giving anyone staff access.</span>
      </div>
      {err && <p className="text-sm text-[#ff8a8a] mt-3" role="alert" data-testid="text-claim-error">{err}</p>}
    </form>
  );
}
