"use client";
import { useState } from "react";
import { act } from "@/lib/auth";
import { Link } from "@/lib/router";
import { Delta, fmtDate } from "@/lib/ui";

/** Three stars for a game, the voting form for players, and milestones earned in the game. */
export function Stars({ g }: { g: any }) {
  const s = g.stars;
  const [picks, setPicks] = useState<string[]>(() => [0, 1, 2].map((i) => String(s?.voting?.mine?.[i] ?? "")));
  const [err, setErr] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  if (!s) return null;
  const v = s.voting;
  const stars: any[] = s.stars ?? [];
  const closes = v?.closesAt ? fmtDate(v.closesAt.slice(0, 10)) : "";
  const save = async () => {
    setErr(null); setSaved(false);
    const ids = picks.filter(Boolean).map(Number);
    const e = await act("PUT", `/api/games/${g.id}/stars`, { picks: ids }, [`/api/games/${g.id}`]);
    if (e) setErr(e); else setSaved(true);
  };
  const taken = (i: number) => new Set(picks.filter((p, j) => p && j !== i));
  return (
    <div data-testid="section-stars">
      {(stars.length > 0 || v) && <h2 className="font-black text-[17px] mt-7 mb-1 px-1">Three stars</h2>}
      {s.mode === "voted" && <p className="text-xs text-[var(--mute)] mb-3 px-1" data-testid="text-stars-voted">Voted by the players in this game.</p>}
      {s.mode !== "voted" && v?.open && <p className="text-xs text-[var(--mute)] mb-3 px-1" data-testid="text-stars-open">By the numbers so far. Players vote until {closes}.</p>}
      {s.mode !== "voted" && v && !v.open && v.voters < v.minVoters && <p className="text-xs text-[var(--mute)] mb-3 px-1">By the numbers. Not enough players voted.</p>}
      {stars.length > 0 && (
        <div className="grid grid-cols-3 gap-2 mt-2">
          {stars.map((p: any, i: number) => (
            <Link key={p.player_id} href={`/player/${p.player_id}`} className="card p-3 text-center" data-testid={`card-star-${i + 1}`}>
              <div className="font-display text-xl text-[var(--red)]">{"★".repeat(3 - i)}</div>
              <div className="font-bold text-sm leading-tight mt-1">{p.name}</div>
              <div className="text-xs text-[var(--mute)] mt-0.5">{p.goals}G {p.assists}A</div>
              <Delta d={p.delta} className="text-xs" />
            </Link>
          ))}
        </div>
      )}
      {v?.canVote && (
        <div className="card p-4 mt-3" data-testid="panel-vote-stars">
          <div className="font-bold text-sm">Pick your three stars</div>
          <p className="text-xs text-[var(--mute)] mt-0.5">Best first. Only totals show, never who voted for whom. You can't pick yourself.</p>
          {[0, 1, 2].map((i) => (
            <label key={i} className="flex items-center gap-2 mt-2.5">
              <span className="w-14 text-sm font-bold text-[var(--red)]">{"★".repeat(3 - i)}</span>
              <select className="input flex-1 min-w-0" value={picks[i]} onChange={(e) => setPicks(picks.map((p, j) => (j === i ? e.target.value : p)))} data-testid={`select-star-${i + 1}`}>
                <option value="">{i === 0 ? "Choose a player" : "Optional"}</option>
                {s.candidates.map((c: any) => <option key={c.player_id} value={c.player_id} disabled={taken(i).has(String(c.player_id))}>{c.name}</option>)}
              </select>
            </label>
          ))}
          <button className="btn btn-red h-11 w-full mt-3" disabled={!picks[0]} onClick={save} data-testid="button-save-stars">{v.mine?.length ? "Update my stars" : "Save my stars"}</button>
          {saved && <p className="text-xs mt-2" data-testid="text-stars-saved">Saved. {v.voters + (v.mine?.length ? 0 : 1)} {v.voters + (v.mine?.length ? 0 : 1) === 1 ? "player has" : "players have"} voted.</p>}
          {err && <p className="text-xs down mt-2" data-testid="text-stars-error">{err}</p>}
        </div>
      )}
      {g.milestones?.length > 0 && (
        <div className="flex flex-wrap gap-1.5 mt-3" data-testid="list-game-milestones">
          {g.milestones.map((m: any) => (
            <Link key={`${m.player_id}-${m.kind}`} href={`/player/${m.player_id}/career`} className="text-xs font-bold rounded-full bg-[var(--ice-3)] px-2.5 py-1">{m.name}: {m.label}</Link>
          ))}
        </div>
      )}
    </div>
  );
}
