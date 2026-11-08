"use client";
import { COUNTRIES, guessCountry, regionLabel, regionsOf } from "@/lib/geo";
import { useState } from "react";
import { apiRequest, invalidatePrefixes } from "@/lib/queryClient";

/** One small form pattern for every "+ Add": a button that opens into a short form, then closes. */
function useSend() {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const send = async (method: string, url: string, body?: unknown, keys?: string[]) => {
    setBusy(true); setErr(null);
    try {
      const r = await (await apiRequest(method, url, body)).json();
      await invalidatePrefixes(keys?.length ? keys : ["/api/me", "/api/bootstrap"]);
      setBusy(false);
      return r;
    }
    catch (e: any) { setErr(e.message); setBusy(false); return null; }
  };
  return { busy, err, setErr, send };
}

export function AddButton({ label, onClick, testid }: { label: string; onClick: () => void; testid?: string }) {
  return <button className="text-sm text-[var(--blue)] font-bold" onClick={onClick} data-testid={testid}>+ {label}</button>;
}

const LEVEL_OPTS = [["A", "A: top level"], ["B", "B"], ["C", "C"], ["D", "D: newest players"]] as const;
const TAG_OPTS = [["", "No tag"], ["40+", "40+"], ["50+", "50+"], ["Women's", "Women's"], ["Coed", "Coed"]] as const;
const COLORS = ["#EF4444", "#F97316", "#F5B301", "#22C55E", "#14B8A6", "#3B82F6", "#8B5CF6", "#EC4899", "#A3A3A3", "#F8FAFC"];

export function AddLeagueForm({ rinkId, onDone }: { rinkId: number; onDone: () => void }) {
  const [level, setLevel] = useState("C");
  const [tag, setTag] = useState("");
  const [name, setName] = useState("");
  const { busy, err, send } = useSend();
  return (
    <form className="card p-4 space-y-2.5" onSubmit={async (e) => { e.preventDefault(); if (await send("POST", `/api/rinks/${rinkId}/leagues`, { level, tag, name }, ["/api/rinks", "/api/leagues", "/api/standings", "/api/bootstrap", "/api/feed"])) onDone(); }} data-testid="form-add-league">
      <div className="label">New league</div>
      <input className="input w-full" placeholder="Name the rink uses, e.g. Monday A League" value={name} onChange={(e) => setName(e.target.value)} data-testid="input-league-name" />
      <div className="grid grid-cols-2 gap-2">
        <label className="block min-w-0"><span className="label">Skill level</span>
          <select className="input w-full mt-1" value={level} onChange={(e) => setLevel(e.target.value)} data-testid="select-league-level">{LEVEL_OPTS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select>
        </label>
        <label className="block min-w-0"><span className="label">Tag</span>
          <select className="input w-full mt-1" value={tag} onChange={(e) => setTag(e.target.value)} data-testid="select-league-tag">{TAG_OPTS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select>
        </label>
      </div>
      <p className="text-xs text-[var(--mute)]">Skill level is one scale for every rink, so standings and ratings compare fairly. The name is whatever your rink calls it.</p>
      {err && <p className="text-sm down">{err}</p>}
      <div className="grid grid-cols-2 gap-2"><button type="button" className="btn btn-ghost h-11" onClick={onDone}>Cancel</button><button className="btn btn-red h-11" disabled={busy} data-testid="button-save-league">{busy ? "Adding…" : "Add league"}</button></div>
    </form>
  );
}

/** Rink staff add the team now; anyone else sends it to rink staff to approve. */
export function AddTeamForm({ leagueId, leagueName, request = false, onDone }: { leagueId: number; leagueName: string; request?: boolean; onDone: () => void }) {
  const [name, setName] = useState("");
  const [color, setColor] = useState(COLORS[5]);
  const [captain, setCaptain] = useState(true);
  const [sent, setSent] = useState(false);
  const { busy, err, send } = useSend();
  if (sent) return <div className="card p-4 text-sm" data-testid="text-team-requested">Sent. Rink staff will add <b>{name}</b> to the {leagueName}, and you'll get a notice. <button className="text-[var(--blue)] font-bold ml-1" onClick={onDone}>OK</button></div>;
  return (
    <form className="card p-4 space-y-2.5" data-testid="form-add-team" onSubmit={async (e) => {
      e.preventDefault();
      const r = await send("POST", request ? "/api/team-requests" : `/api/leagues/${leagueId}/teams`, { leagueId, name, color, captain }, ["/api/leagues", "/api/teams", "/api/standings", "/api/bootstrap", "/api/me"]);
      if (!r) return;
      if (r.requested) setSent(true); else onDone();
    }}>
      <div className="label">{request ? `Start a team in the ${leagueName}` : `New team in the ${leagueName}`}</div>
      <input className="input w-full" placeholder="Team name" value={name} onChange={(e) => setName(e.target.value)} required data-testid="input-team-name" />
      <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Jersey color">
        {COLORS.map((c) => <button type="button" key={c} role="radio" aria-checked={color === c} aria-label={c} onClick={() => setColor(c)} className={`h-8 w-8 rounded-full border-2 ${color === c ? "border-[var(--white)]" : "border-transparent"}`} style={{ background: c }} />)}
      </div>
      {request && (
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={captain} onChange={(e) => setCaptain(e.target.checked)} /> I'm the captain</label>
      )}
      {err && <p className="text-sm down">{err}</p>}
      <div className="grid grid-cols-2 gap-2"><button type="button" className="btn btn-ghost h-11" onClick={onDone}>Cancel</button><button className="btn btn-red h-11" disabled={busy || !name.trim()} data-testid="button-save-team">{busy ? "Saving…" : request ? "Send to rink staff" : "Add team"}</button></div>
    </form>
  );
}

export function AddSeasonForm({ rinkId, onDone }: { rinkId: number; onDone: () => void }) {
  const [name, setName] = useState("");
  const [starts, setStarts] = useState("");
  const [ends, setEnds] = useState("");
  const { busy, err, send } = useSend();
  return (
    <form className="card p-4 space-y-2.5" onSubmit={async (e) => { e.preventDefault(); if (await send("POST", `/api/rinks/${rinkId}/seasons`, { name, startsOn: starts, endsOn: ends }, ["/api/rinks", "/api/bootstrap", "/api/standings"])) onDone(); }} data-testid="form-add-season">
      <div className="label">New season</div>
      <input className="input w-full" placeholder="Name, e.g. Winter 2027" value={name} onChange={(e) => setName(e.target.value)} required data-testid="input-season-name" />
      <div className="grid grid-cols-2 gap-2">
        <label className="block min-w-0"><span className="label">Starts</span><input type="date" className="input w-full mt-1" value={starts} onChange={(e) => setStarts(e.target.value)} required /></label>
        <label className="block min-w-0"><span className="label">Ends</span><input type="date" className="input w-full mt-1" value={ends} onChange={(e) => setEnds(e.target.value)} required /></label>
      </div>
      {err && <p className="text-sm down">{err}</p>}
      <div className="grid grid-cols-2 gap-2"><button type="button" className="btn btn-ghost h-11" onClick={onDone}>Cancel</button><button className="btn btn-red h-11" disabled={busy}>{busy ? "Adding…" : "Add season"}</button></div>
    </form>
  );
}

export function EditRinkForm({ rink, onDone }: { rink: any; onDone: () => void }) {
  const [v, setV] = useState({ name: rink.name ?? "", address: rink.address ?? "", phone: rink.phone ?? "", website: rink.website ?? "", sheets: String(rink.sheets ?? 1) });
  const { busy, err, send } = useSend();
  const f = (k: keyof typeof v, ph: string, mode?: "tel" | "url" | "numeric") => (
    <input className="input w-full" placeholder={ph} inputMode={mode} value={v[k]} onChange={(e) => setV({ ...v, [k]: e.target.value })} data-testid={`input-rink-${k}`} />
  );
  return (
    <form className="card p-4 space-y-2.5" onSubmit={async (e) => { e.preventDefault(); if (await send("PATCH", `/api/rinks/${rink.id}`, v, ["/api/rinks", "/api/rink", "/api/bootstrap"])) onDone(); }} data-testid="form-edit-rink">
      <div className="label">Rink profile</div>
      {f("name", "Rink name")}{f("address", "Street address")}{f("phone", "Front desk phone", "tel")}{f("website", "Website", "url")}{f("sheets", "Sheets of ice", "numeric")}
      {err && <p className="text-sm down">{err}</p>}
      <div className="grid grid-cols-2 gap-2"><button type="button" className="btn btn-ghost h-11" onClick={onDone}>Cancel</button><button className="btn btn-red h-11" disabled={busy}>{busy ? "Saving…" : "Save"}</button></div>
    </form>
  );
}

const ROLE_OPTS = [["owner", "Owner or general manager"], ["hockey_director", "Hockey director"], ["league_coordinator", "League coordinator"], ["front_desk", "Front desk or scorekeeper"], ["other", "Something else"]] as const;
export const RINK_ROLE_LABEL: Record<string, string> = Object.fromEntries(ROLE_OPTS);

/** "My rink isn't listed." Goes to the system admins; checks for a rink that's already here first. */
export function RinkRequestForm({ onDone, admin = false }: { onDone: () => void; admin?: boolean }) {
  const [v, setV] = useState({ name: "", city: "", state: "", website: "", country: guessCountry() as string });
  const [manage, setManage] = useState(false);
  const [role, setRole] = useState("hockey_director");
  const [matches, setMatches] = useState<any[] | null>(null);
  const [done, setDone] = useState<string | null>(null);
  const { busy, err, setErr, send } = useSend();
  const submit = async (confirmNew = false) => {
    setErr(null);
    try {
      const r = await (await apiRequest("POST", "/api/rink-requests", { ...v, manage, role, confirmNew })).json();
      await invalidatePrefixes(["/api/rinks", "/api/rink", "/api/staff", "/api/bootstrap"]);
      setDone(r.created ? `${v.name} is added.` : "Sent. An admin checks that the rink is real" + (manage ? " and that you work there" : "") + ", and you'll get a notice.");
    } catch (e: any) {
      let j: any = null;
      try { j = JSON.parse(e.body); } catch { /* not JSON */ }
      if (e.status === 409 && j?.matches) setMatches(j.matches);
      else setErr(e.message);
    }
  };
  if (done) return <div className="card p-4 text-sm" data-testid="text-rink-requested">{done} <button className="text-[var(--blue)] font-bold ml-1" onClick={onDone}>OK</button></div>;
  return (
    <form className="card p-4 space-y-2.5" onSubmit={(e) => { e.preventDefault(); submit(false); }} data-testid="form-rink-request">
      <div className="label">{admin ? "Add a rink" : "Add a rink that isn't listed"}</div>
      <input className="input w-full" placeholder="Rink name" value={v.name} onChange={(e) => setV({ ...v, name: e.target.value })} required data-testid="input-new-rink-name" />
      <div className="flex gap-1.5">
        {COUNTRIES.map(([k, label]) => (
          <button type="button" key={k} onClick={() => setV({ ...v, country: k, state: "" })} data-active={v.country === k} className="chip" data-testid={`button-new-rink-country-${k}`}>{label}</button>
        ))}
      </div>
      <div className="grid grid-cols-[1fr_130px] gap-2">
        <input className="input w-full min-w-0" placeholder="City" value={v.city} onChange={(e) => setV({ ...v, city: e.target.value })} required data-testid="input-new-rink-city" />
        <select className="input w-full min-w-0" value={v.state} onChange={(e) => setV({ ...v, state: e.target.value })} required aria-label={regionLabel(v.country)} data-testid="input-new-rink-state">
          <option value="">{regionLabel(v.country)}</option>
          {Object.entries(regionsOf(v.country)).map(([code, n]) => <option key={code} value={code}>{n}</option>)}
        </select>
      </div>
      <input className="input w-full" placeholder="Rink website (helps us check it)" inputMode="url" value={v.website} onChange={(e) => setV({ ...v, website: e.target.value })} />
      {!admin && (
        <>
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={manage} onChange={(e) => setManage(e.target.checked)} data-testid="checkbox-manage-rink" /> I work at this rink and want to manage it</label>
          {manage && (
            <>
              <select className="input w-full" value={role} onChange={(e) => setRole(e.target.value)}>{ROLE_OPTS.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select>
              <p className="text-xs text-[var(--mute)]">Signed in with your work email at the rink's own web address? That confirms it right away. Otherwise an admin calls the rink's public number to check.</p>
            </>
          )}
        </>
      )}
      {matches && (
        <div className="rounded-xl border border-[var(--amber)] p-3 text-sm" data-testid="card-rink-matches">
          <div className="font-bold">Is it one of these?</div>
          {matches.map((m) => <div key={m.id} className="text-[var(--mute)]">{m.name}{m.city ? ` · ${m.city}, ${m.state}` : ""}</div>)}
          <p className="text-xs text-[var(--mute)] mt-1">If so, open it from the Rink tab instead.</p>
          <button type="button" className="btn btn-ghost h-11 mt-2 text-sm" onClick={() => submit(true)} data-testid="button-rink-not-these">No, it's a different rink</button>
        </div>
      )}
      {err && <p className="text-sm down">{err}</p>}
      <div className="grid grid-cols-2 gap-2"><button type="button" className="btn btn-ghost h-11" onClick={onDone}>Cancel</button><button className="btn btn-red h-11" disabled={busy || !v.name || !v.city || v.state.length !== 2} data-testid="button-send-rink-request">{admin ? "Add rink" : "Send"}</button></div>
    </form>
  );
}
