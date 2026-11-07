"use client";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "@/lib/router";
import { apiRequest, invalidatePrefixes } from "@/lib/queryClient";
import { DeskFrame, Gate, RinkSwitch, useDeskRink } from "@/views/Desk";

/**
 * Imports: drop a DaySmart league report, read the preview, then load it. Nothing is saved
 * until Import is pressed. Past imports are listed underneath, from the audit log.
 */

const RELOAD = ["/api/staff", "/api/standings", "/api/players", "/api/teams", "/api/leagues", "/api/feed", "/api/bootstrap", "/api/rink", "/api/desk"];

export function DeskImports() {
  return <Gate>{(overview) => <ImportsBody overview={overview} />}</Gate>;
}

function ImportsBody({ overview }: { overview: any }) {
  const { rink: picked, rinks: all, pick } = useDeskRink(overview);
  const rinks = all.filter((r: any) => r.can?.edit);
  const rink = rinks.find((r: any) => r.id === picked?.id) ?? rinks[0] ?? null;
  const histKey = `/api/desk/imports?rink=${rink?.id}`;
  const { data: history } = useQuery<any[]>({ queryKey: [histKey], enabled: !!rink });
  const [text, setText] = useState("");
  const [file, setFile] = useState<string | null>(null);
  const [res, setRes] = useState<any>(null);
  const [busy, setBusy] = useState<null | "preview" | "apply">(null);
  const [err, setErr] = useState<string | null>(null);
  const [level, setLevel] = useState("");
  const [saved, setSaved] = useState<any>(null);
  const [over, setOver] = useState(false);

  if (!rink) return <DeskFrame><h1 className="font-black text-[28px]">Imports</h1><p className="text-[var(--mute)] mt-2">Importing is for rink managers. Ask your rink manager to load the DaySmart report.</p></DeskFrame>;

  const rinkId: number = rink.id;
  const reset = () => { setText(""); setFile(null); setRes(null); setLevel(""); setErr(null); };
  const load = async (f: File) => {
    setSaved(null); setRes(null); setLevel(""); setErr(null);
    setFile(f.name); const t = await f.text(); setText(t);
    void send(false, "", t);
  };
  async function send(apply: boolean, lv: string = level, body: string = text) {
    setBusy(apply ? "apply" : "preview"); setErr(null);
    try {
      const out = await (await apiRequest("POST", "/api/staff/import", { text: body, rinkId, apply, level: lv || null })).json();
      if (apply) {
        if (!out.applied) throw new Error("Nothing was saved. Check the preview and try again.");
        await invalidatePrefixes([...RELOAD, histKey]);
        setSaved(out.summary); reset();
      } else setRes(out);
    } catch (e: any) { setErr(e.message); }
    setBusy(null);
  }
  const s = res?.summary;
  const ready = !!s && !s.needsLevel;

  return (
    <DeskFrame>
      <div className="text-sm text-[var(--mute)]"><Link href="/desk">Rink Desk</Link> › Imports</div>
      <div className="flex items-center gap-3 flex-wrap mt-1">
        <h1 className="font-black text-[28px] flex-1 min-w-0">Import from DaySmart</h1>
        <RinkSwitch rink={rink} rinks={rinks} pick={pick} />
      </div>
      <p className="text-[var(--mute)] mt-1 max-w-3xl">One league per file: standings, season totals, rosters and game results. Drop the file, check the preview, then import. Importing the same file again only updates what changed.</p>

      {saved && (
        <div className="rounded-2xl p-4 mt-5 text-sm" style={{ background: "rgba(56,217,150,.12)", border: "1px solid var(--up)" }} data-testid="desk-import-done">
          <b className="up">Saved: {saved.league}.</b> {saved.gamesAdded} new games, {saved.gamesUpdated} updated · {saved.rosterAdded} new roster spots · {saved.standingsRows ?? 0} standings rows.
          {saved.gamesAdded > 0 && <> New games need lineups to count toward ratings. <Link href="/desk/lineups" className="font-bold text-[var(--blue)]">Add lineups</Link></>}
        </div>
      )}

      <div className="grid gap-5 mt-5 xl:grid-cols-2 items-start">
        <section className="card p-5">
          <label
            className={`flex flex-col items-center justify-center text-center rounded-2xl border-2 border-dashed h-40 cursor-pointer px-4 ${over ? "border-[var(--blue)] bg-[var(--surface-2)]" : "border-[var(--line)]"}`}
            onDragOver={(e) => { e.preventDefault(); setOver(true); }} onDragLeave={() => setOver(false)}
            onDrop={(e) => { e.preventDefault(); setOver(false); const f = e.dataTransfer.files?.[0]; if (f) void load(f); }}
            data-testid="desk-import-drop">
            <span className="font-black">{file ? file : "Drop the report file here"}</span>
            <span className="text-sm text-[var(--mute)] mt-1">{file ? "Drop another file to replace it" : "or click to choose it (.txt)"}</span>
            <input type="file" accept=".txt,text/plain" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) void load(f); e.target.value = ""; }} data-testid="input-desk-import-file" />
          </label>
          <textarea className="input w-full h-40 py-2.5 mt-4 text-xs font-mono" placeholder="Or paste the report here" value={text} onChange={(e) => { setText(e.target.value); setFile(null); setRes(null); }} data-testid="input-desk-import-text" />
          <div className="flex gap-2 mt-3">
            <button className="btn btn-ghost h-11 px-5" disabled={!!busy || text.length < 50} onClick={() => send(false)} data-testid="button-desk-import-preview">{busy === "preview" ? "Reading…" : s ? "Preview again" : "Preview"}</button>
            {(text || s) && <button className="btn btn-ghost h-11 px-4" disabled={!!busy} onClick={reset}>Clear</button>}
          </div>
          {err && <p className="text-sm down mt-3" data-testid="text-error">{err}</p>}
        </section>

        <section className="card p-5 min-h-40" aria-live="polite">
          {!s ? (
            <div className="text-[var(--mute)]">
              <h2 className="font-black text-lg text-[var(--white)]">Preview</h2>
              <p className="mt-2 text-sm">What the file would change shows here before anything is saved.</p>
            </div>
          ) : (
            <div data-testid="desk-import-summary">
              <h2 className="font-black text-lg">{s.league}{s.leagueCreated ? <span className="text-[var(--amber)] text-sm font-bold"> · new league</span> : null}</h2>
              <div className="grid grid-cols-2 gap-3 mt-4">
                <Num n={s.gamesAdded} label="New games" sub={s.gamesUpdated ? `${s.gamesUpdated} updated` : undefined} />
                <Num n={s.rosterAdded} label="New roster spots" sub={`${s.rosterExisting} already here`} />
                <Num n={s.standingsRows} label="Standings rows" />
                <Num n={s.playerTotals} label="Player season totals" sub={`${s.lines} game lines`} />
              </div>
              {s.teamsCreated?.length > 0 && <p className="text-sm text-[var(--amber)] mt-4">New teams: {s.teamsCreated.join(", ")}. Check the spelling matches the league before importing.</p>}
              <p className="text-xs text-[var(--mute)] mt-4">Teams: {s.teams.map((t: any) => (t.source === t.team ? t.team : `${t.source} → ${t.team}`)).join(", ")}</p>
              {s.unassigned.length > 0 && <p className="text-xs text-[var(--mute)] mt-2">No scorer recorded: {s.unassigned.map((u: any) => `${u.date} ${u.team} ${u.goals}`).join("; ")}</p>}
              {s.gamesSkipped.map((g: any, i: number) => <p key={i} className="text-xs text-[var(--amber)] mt-1">Skipped {g.date}: {g.why}</p>)}
              {s.warnings.map((w: string, i: number) => <p key={i} className="text-xs text-[var(--amber)] mt-1">{w}</p>)}

              {(s.needsLevel || s.leagueCreated) && (
                <label className="block mt-4">
                  <span className="label">Skill level for {s.league}{s.tag ? ` (${s.tag})` : ""}</span>
                  <select className="input w-full mt-1 h-11" value={level || (s.needsLevel ? "" : s.level ?? "")} disabled={!!busy} onChange={(e) => { setLevel(e.target.value); if (e.target.value) void send(false, e.target.value); }} data-testid="select-desk-import-level">
                    <option value="">Pick one</option>
                    <option value="A">A: top level</option><option value="B">B</option><option value="C">C</option><option value="D">D: newest players</option>
                  </select>
                </label>
              )}
              <button className="btn btn-red h-12 w-full mt-5" disabled={!!busy || !ready} onClick={() => send(true)} data-testid="button-desk-import-apply">
                {busy === "apply" ? "Saving…" : busy === "preview" ? "Updating preview…" : !ready ? "Pick a level first" : `Import ${s.league}`}
              </button>
            </div>
          )}
        </section>
      </div>

      <section className="mt-8">
        <h2 className="font-black text-lg">Past imports</h2>
        <div className="card mt-3 divide-y divide-[var(--line)]">
          {!history && <p className="p-4 text-sm text-[var(--mute)]">Loading…</p>}
          {history && !history.length && <p className="p-4 text-sm text-[var(--mute)]">No imports at this rink yet.</p>}
          {history?.map((h) => (
            <div key={h.id} className="flex items-center gap-4 px-5 py-3 text-sm">
              <span className="w-44 shrink-0 text-[var(--mute)]">{new Date(h.at).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}</span>
              <span className="flex-1 min-w-0 truncate">{h.games ?? 0} games · {h.roster ?? 0} new roster spots · {h.lines ?? 0} lines</span>
              <span className="text-[var(--mute)] truncate">{h.who ?? ""}</span>
            </div>
          ))}
        </div>
      </section>
    </DeskFrame>
  );
}

function Num({ n, label, sub }: { n: number; label: string; sub?: string }) {
  return (
    <div className="rounded-xl bg-[var(--ice-3)] p-3">
      <div className="font-display font-black text-2xl leading-none tabular-nums">{n ?? 0}</div>
      <div className="text-xs text-[var(--mute)] mt-1.5">{label}{sub ? ` · ${sub}` : ""}</div>
    </div>
  );
}
