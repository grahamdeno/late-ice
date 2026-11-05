"use client";
import { useEffect, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "@/lib/router";
import { act, POSITION_LABEL } from "@/lib/auth";
import { queryClient } from "@/lib/queryClient";
import { Loading, fmtDate } from "@/lib/ui";
import { Bobble } from "@/components/Bobble";

type L = { f: (number | null)[][]; d: (number | null)[][]; g: (number | null)[]; extras: number[] };
type P = { id: number; name: string; position: string; rating: number; number: string | null; isSub: boolean; avatar: any; archetype: string | null; answer: string | null; guest: boolean };
type Slot = { kind: "f" | "d" | "g"; line: number; i: number };

const W = 1080, H = 1350;

/** The lineup for one game: forward lines, defense pairs, goalie. Captains set it; everyone sees it; Share makes a picture. */
export default function Lineup({ teamId, gameId }: { teamId: string; gameId: string }) {
  const key = `/api/teams/${teamId}/schedule/${gameId}/lineup`;
  const { data, error } = useQuery<any>({ queryKey: [key] });
  const [L, setL] = useState<L | null>(null);
  const [pick, setPick] = useState<Slot | null>(null);
  const [dirty, setDirty] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState<null | "save" | "share">(null);
  const svgRef = useRef<SVGSVGElement>(null);
  useEffect(() => { if (data && !L) setL(data.lineup); }, [data, L]);
  if (error) return <div className="card p-4 text-sm">{(error as any).message}</div>;
  if (!data || !L) return <Loading />;
  const players: P[] = data.players;
  const byId = new Map(players.map((p) => [p.id, p]));
  const used = new Set([...L.f.flat(), ...L.d.flat(), ...L.g].filter((v): v is number => v !== null));
  const edit = data.can.edit;

  const place = (slot: Slot, pid: number | null) => {
    const next: L = { f: L.f.map((l) => [...l]), d: L.d.map((l) => [...l]), g: [...L.g], extras: L.extras.filter((x) => x !== pid) };
    if (pid !== null) for (const line of [...next.f, ...next.d, next.g]) { const i = line.indexOf(pid); if (i >= 0) line[i] = null; }
    (slot.kind === "g" ? next.g : next[slot.kind][slot.line])[slot.i] = pid;
    setL(next); setDirty(true); setPick(null);
  };
  const save = async () => {
    setBusy("save"); setErr(null);
    const e = await act("PUT", key, L);
    setErr(e); if (!e) { setDirty(false); await queryClient.invalidateQueries({ queryKey: [key] }); }
    setBusy(null);
  };
  const share = async () => {
    setBusy("share"); setErr(null);
    try {
      const blob = await toPng(svgRef.current!);
      const file = new File([blob], `${data.team.name.replace(/[^a-z0-9]+/gi, "-")}-lineup-${data.game.date}.png`, { type: "image/png" });
      const title = `${data.team.name} lineup, ${fmtDate(data.game.date)}`;
      if (navigator.canShare?.({ files: [file] })) await navigator.share({ files: [file], title });
      else { const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = file.name; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 5000); }
    } catch (e: any) { if (e?.name !== "AbortError") setErr("Couldn't make the picture on this phone. Try a screenshot."); }
    setBusy(null);
  };
  const g = data.game;
  const slotLabel = (s: Slot) => (s.kind === "g" ? "Goalie" : s.kind === "d" ? `D${s.line + 1} · ${["Left", "Right"][s.i]}` : `Line ${s.line + 1} · ${["LW", "C", "RW"][s.i]}`);

  return (
    <div>
      <Link href={`/team/${teamId}`} className="text-xs text-[var(--mute)]" data-testid="link-back-team">‹ {data.team.name}</Link>
      <h1 className="font-display text-[34px] leading-none font-black uppercase mt-1">Lineup</h1>
      <div className="text-sm text-[var(--mute)] mt-1">{fmtDate(g.date)}{g.time ? ` · ${g.time}` : ""}{g.opponent ? ` · vs ${g.opponent}` : ""}</div>
      {!data.saved && edit && <p className="text-xs text-[var(--amber)] mt-2 px-1" data-testid="text-lineup-draft">Filled in from who said In. Tap a spot to change it, then Save.</p>}
      {!data.saved && !edit && <p className="text-xs text-[var(--mute)] mt-2 px-1">The captain hasn't set the lines yet. This is a guess from who's In.</p>}
      {err && <p className="text-sm down mt-2 px-1" data-testid="text-error">{err}</p>}

      <div className="card-hi mt-4 overflow-hidden" style={{ aspectRatio: `${W} / ${H}` }}>
        <LineupCard svgRef={svgRef} team={data.team} game={g} L={L} byId={byId} />
      </div>

      <div className="grid grid-cols-2 gap-2 mt-3">
        <button className="btn btn-red h-11" onClick={share} disabled={!!busy} data-testid="button-share-lineup">{busy === "share" ? "Making picture…" : "Share picture"}</button>
        {edit ? <button className="btn btn-ghost h-11" onClick={save} disabled={!!busy || !dirty} data-testid="button-save-lineup">{busy === "save" ? "Saving…" : dirty ? "Save lineup" : data.saved ? "Saved" : "Save lineup"}</button>
              : <Link href={`/team/${teamId}`} className="btn btn-ghost h-11">Back to team</Link>}
      </div>

      {edit && (
        <div className="mt-5">
          <div className="label px-1 mb-2">Spots · tap one, then pick a player</div>
          <div className="space-y-2">
            {L.f.map((line, li) => <Row key={`f${li}`} title={`Line ${li + 1}`} cells={line} kind="f" line={li} labels={["LW", "C", "RW"]} byId={byId} pick={pick} setPick={setPick} />)}
            {L.d.map((pair, li) => <Row key={`d${li}`} title={`D ${li + 1}`} cells={pair} kind="d" line={li} labels={["L", "R"]} byId={byId} pick={pick} setPick={setPick} />)}
            <Row title="Goalie" cells={L.g} kind="g" line={0} labels={["G"]} byId={byId} pick={pick} setPick={setPick} />
          </div>
          {pick && (
            <div className="card mt-3 p-3" data-testid="card-pick-player">
              <div className="flex items-center justify-between">
                <span className="text-sm font-bold">{slotLabel(pick)}</span>
                <div className="flex gap-1.5">
                  <button className="btn btn-ghost h-8 text-xs" onClick={() => place(pick, null)} data-testid="button-clear-slot">Clear</button>
                  <button className="btn btn-ghost h-8 text-xs" onClick={() => setPick(null)}>Cancel</button>
                </div>
              </div>
              <div className="mt-2 divide-y divide-[var(--line)]">
                {[...players].sort((a, b) => ans(a) - ans(b) || b.rating - a.rating).map((p) => (
                  <button key={p.id} className="w-full flex items-center gap-2.5 py-2 text-left text-sm" onClick={() => place(pick, p.id)} data-testid={`button-pick-${p.id}`}>
                    <Bobble avatar={p.avatar} jersey={data.team.color} number={p.number} archetype={p.archetype} goalie={p.position === "G"} size={32} />
                    <span className="flex-1 min-w-0"><span className="block font-bold truncate">{p.name}{p.number ? ` #${p.number}` : ""}</span><span className="block text-[11px] text-[var(--mute)]">{POSITION_LABEL[p.position] ?? p.position}{p.isSub ? " · sub" : ""}{used.has(p.id) ? " · placed" : ""}</span></span>
                    <span className={`text-[11px] font-bold ${p.answer === "in" ? "up" : p.answer === "out" ? "down" : "text-[var(--mute)]"}`}>{p.answer === "in" ? "In" : p.answer === "out" ? "Out" : p.answer === "late" ? "Late" : "No answer"}</span>
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
const ans = (p: P) => (p.answer === "in" ? 0 : p.answer === "late" ? 1 : p.answer === null ? 2 : 3);

function Row({ title, cells, kind, line, labels, byId, pick, setPick }: { title: string; cells: (number | null)[]; kind: "f" | "d" | "g"; line: number; labels: string[]; byId: Map<number, P>; pick: Slot | null; setPick: (s: Slot) => void }) {
  return (
    <div className="flex items-center gap-2">
      <span className="label w-12 shrink-0">{title}</span>
      <div className={`flex-1 grid gap-1.5 ${cells.length === 3 ? "grid-cols-3" : cells.length === 2 ? "grid-cols-2" : "grid-cols-1"}`}>
        {cells.map((pid, i) => {
          const p = pid !== null ? byId.get(pid) : undefined;
          const on = pick?.kind === kind && pick.line === line && pick.i === i;
          return (
            <button key={i} onClick={() => setPick({ kind, line, i })} className={`h-12 rounded-xl border px-2 text-left text-xs ${on ? "border-[var(--red)] bg-[var(--red-dim)]" : "border-[var(--line)] bg-[var(--ice-3)]"}`} data-testid={`slot-${kind}${line}-${i}`}>
              <span className="block text-[10px] text-[var(--mute)]">{labels[i]}</span>
              <span className="block font-bold truncate">{p ? `${p.number ? "#" + p.number + " " : ""}${p.name}` : "Open"}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

/** The shareable card, drawn as one SVG so it can become a PNG. Plain sans-serif so the picture matches what the phone draws. */
function LineupCard({ svgRef, team, game, L, byId }: { svgRef: React.RefObject<SVGSVGElement | null>; team: any; game: any; L: L; byId: Map<number, P> }) {
  const ink = "#EEF3F8", mute = "#8b97a8", red = "#FF3B3B", font = "-apple-system, 'Helvetica Neue', Arial, sans-serif";
  const cell = (pid: number | null, x: number, y: number, w: number) => {
    const p = pid !== null ? byId.get(pid) : undefined;
    return (
      <g key={`${x}-${y}`} transform={`translate(${x} ${y})`}>
        <rect width={w} height={150} rx={22} fill="#0b0f16" stroke="#1c2431" strokeWidth={2} />
        {p ? (
          <>
            <g transform={`translate(${w / 2 - 44} 6)`}><Bobble avatar={p.avatar} jersey={team.color} number={null} archetype={p.archetype} goalie={p.position === "G"} size={88} tile={false} /></g>
            <text x={w / 2} y={122} textAnchor="middle" fontFamily={font} fontWeight={800} fontSize={p.name.length > 14 ? 20 : 24} fill={ink}>{p.number ? `#${p.number} ` : ""}{p.name}</text>
            <text x={w / 2} y={144} textAnchor="middle" fontFamily={font} fontWeight={600} fontSize={16} fill={mute}>{POSITION_LABEL[p.position] ?? p.position}{p.isSub ? " · sub" : ""}{p.archetype ? ` · ${p.archetype}` : ""}</text>
          </>
        ) : <text x={w / 2} y={84} textAnchor="middle" fontFamily={font} fontWeight={700} fontSize={20} fill={mute}>Open</text>}
      </g>
    );
  };
  const pad = 60, gap = 18;
  const w3 = (W - pad * 2 - gap * 2) / 3, w2 = (W - pad * 2 - gap) / 2;
  let y = 250;
  const rows: React.ReactNode[] = [];
  const label = (t: string, yy: number) => <text key={`l${yy}`} x={pad} y={yy} fontFamily={font} fontWeight={800} fontSize={22} fill={red} letterSpacing={2}>{t.toUpperCase()}</text>;
  L.f.forEach((line, i) => { if (line.every((v) => v === null) && i > 1) return; rows.push(label(`Line ${i + 1}`, y)); line.forEach((pid, j) => rows.push(cell(pid, pad + j * (w3 + gap), y + 12, w3))); y += 150 + 12 + 44; });
  L.d.forEach((pair, i) => { if (pair.every((v) => v === null) && i > 1) return; rows.push(label(`Defense ${i + 1}`, y)); pair.forEach((pid, j) => rows.push(cell(pid, pad + j * (w2 + gap), y + 12, w2))); y += 150 + 12 + 44; });
  rows.push(label("Goalie", y)); rows.push(cell(L.g[0] ?? null, pad, y + 12, w2)); if (L.g[1]) rows.push(cell(L.g[1], pad + w2 + gap, y + 12, w2));
  const extras = L.extras.map((id) => byId.get(id)).filter(Boolean) as P[];
  return (
    <svg ref={svgRef} viewBox={`0 0 ${W} ${H}`} width="100%" height="100%" xmlns="http://www.w3.org/2000/svg" role="img" aria-label={`${team.name} lineup`} data-testid="svg-lineup">
      <rect width={W} height={H} fill="#05070B" />
      <circle cx={-80} cy={-80} r={520} fill={team.color} opacity={0.14} />
      <circle cx={70} cy={92} r={14} fill={red} />
      <text x={100} y={104} fontFamily={font} fontWeight={900} fontSize={36} fill={ink} letterSpacing={1}>LATE ICE</text>
      <text x={pad} y={178} fontFamily={font} fontWeight={900} fontSize={56} fill={ink}>{team.name.toUpperCase()}</text>
      <text x={pad} y={218} fontFamily={font} fontWeight={600} fontSize={26} fill={mute}>{fmtDate(game.date)}{game.time ? ` · ${game.time}` : ""}{game.opponent ? ` · vs ${game.opponent}` : ""}{game.location ? ` · ${game.location}` : ""}</text>
      {rows}
      {extras.length > 0 && <text x={pad} y={Math.min(H - 70, y + 150 + 60)} fontFamily={font} fontWeight={600} fontSize={22} fill={mute}>Also in: {extras.map((p) => `${p.number ? "#" + p.number + " " : ""}${p.name}`).join(", ")}</text>}
      <text x={W - pad} y={H - 40} textAnchor="end" fontFamily={font} fontWeight={600} fontSize={22} fill={mute}>late-ice.tangomike.app</text>
    </svg>
  );
}

/** SVG on the page to a PNG, through an image and a canvas. */
async function toPng(svg: SVGSVGElement): Promise<Blob> {
  const xml = new XMLSerializer().serializeToString(svg);
  const url = URL.createObjectURL(new Blob([xml], { type: "image/svg+xml;charset=utf-8" }));
  try {
    const img = new Image();
    img.decoding = "sync";
    await new Promise<void>((res, rej) => { img.onload = () => res(); img.onerror = () => rej(new Error("svg")); img.src = url; });
    const c = document.createElement("canvas");
    c.width = W; c.height = H;
    const ctx = c.getContext("2d")!;
    ctx.drawImage(img, 0, 0, W, H);
    return await new Promise<Blob>((res, rej) => c.toBlob((b) => (b ? res(b) : rej(new Error("png"))), "image/png"));
  } finally { URL.revokeObjectURL(url); }
}
