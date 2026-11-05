"use client";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useMe } from "@/lib/auth";
import { Section } from "@/lib/ui";

interface Pt { gameId: number; date: string | null; opponent: string; playerId: number; player: string; kind: "goal" | "assist"; x: number; y: number; sample: boolean }

const H = 85; // half rink is about 100 ft deep and 85 ft wide
const sy = (y: number) => (y / 100) * H;

/** Team-only shot and assist map on a half rink. Synthetic spots are drawn hollow and labeled. */
export function ShotMap({ teamId }: { teamId: number }) {
  const { me } = useMe();
  const onTeam = !!me?.slots.some((s) => s.team_id === teamId);
  const { data } = useQuery<{ sample: boolean; points: Pt[] }>({ queryKey: [`/api/teams/${teamId}/shotmap`], enabled: onTeam });
  const [player, setPlayer] = useState<number | null>(null);
  const [kind, setKind] = useState<"all" | "goal" | "assist">("all");

  const players = useMemo(() => {
    const m = new Map<number, { id: number; name: string; g: number; a: number }>();
    for (const p of data?.points ?? []) {
      const r = m.get(p.playerId) ?? { id: p.playerId, name: p.player, g: 0, a: 0 };
      p.kind === "goal" ? r.g++ : r.a++;
      m.set(p.playerId, r);
    }
    return [...m.values()].sort((a, b) => b.g - a.g || b.a - a.a);
  }, [data]);

  if (!onTeam || !data) return null;
  const pts = data.points.filter((p) => (player === null || p.playerId === player) && (kind === "all" || p.kind === kind));
  const sample = data.points.some((p) => p.sample);
  const goals = pts.filter((p) => p.kind === "goal").length, assists = pts.length - goals;

  return (
    <Section title="Shot map" action={sample ? <span className="chip h-6 text-[10px] border-[var(--amber)] text-[var(--amber)]" data-testid="badge-sample">Sample</span> : <span className="label">Team only</span>}>
      <div className="card-hi overflow-hidden" data-testid="card-shotmap">
        <svg viewBox={`0 0 100 ${H}`} className="w-full block" aria-label="Half rink shot map">
          <rect x="0.5" y="0.5" width="99" height={H - 1} rx="14" style={{ fill: "var(--rink)", stroke: "var(--rink-line)" }} strokeWidth="0.6" />
          <rect x="0" y="0" width="1.6" height={H} fill="#5aa9ff" opacity=".9" />
          <line x1="89" y1="2" x2="89" y2={H - 2} stroke="#FF3B3B" strokeWidth="0.4" opacity=".8" />
          {[22, 78].map((y) => (
            <g key={y}><circle cx="69" cy={sy(y)} r="12.5" fill="none" stroke="#FF3B3B" strokeWidth="0.4" opacity=".7" /><circle cx="69" cy={sy(y)} r="0.9" fill="#FF3B3B" /></g>
          ))}
          <path d={`M89 ${sy(50) - 5} A6 6 0 0 0 89 ${sy(50) + 5}`} fill="rgba(90,169,255,.18)" stroke="#5aa9ff" strokeWidth="0.4" />
          <rect x="89" y={sy(50) - 2.6} width="3" height="5.2" fill="none" style={{ stroke: "var(--white)" }} strokeWidth="0.5" />
          {pts.map((p, i) => (
            <circle key={i} cx={p.x} cy={sy(p.y)} r={p.kind === "goal" ? 1.7 : 1.3}
              fill={p.sample ? "none" : p.kind === "goal" ? "#FF3B3B" : "#5aa9ff"}
              stroke={p.kind === "goal" ? "#FF3B3B" : "#5aa9ff"} strokeWidth="0.55" opacity=".95">
              <title>{`${p.player} · ${p.kind} vs ${p.opponent}${p.date ? ` · ${p.date}` : ""}${p.sample ? " · sample spot" : ""}`}</title>
            </circle>
          ))}
        </svg>
        <div className="flex items-center gap-4 px-4 py-2.5 border-t border-[var(--line)] text-xs">
          <span className="flex items-center gap-1.5"><svg width="10" height="10"><circle cx="5" cy="5" r="4" fill="none" stroke="#FF3B3B" strokeWidth="1.5" /></svg>{goals} shots that scored</span>
          <span className="flex items-center gap-1.5"><svg width="10" height="10"><circle cx="5" cy="5" r="3.4" fill="none" stroke="#5aa9ff" strokeWidth="1.5" /></svg>{assists} assist passes</span>
        </div>
      </div>
      {sample && (
        <p className="text-[11px] text-[var(--mute)] mt-2 px-1" data-testid="text-sample-note">
          Sample spots. DaySmart records who scored but not where, so these are placed to show how the map works. They replace themselves as players plot their real goals. Only players on this team see this map.
        </p>
      )}
      <div className="flex gap-2 mt-3 flex-wrap">
        {(["all", "goal", "assist"] as const).map((k) => (
          <button key={k} onClick={() => setKind(k)} className={`chip ${kind === k ? "border-[var(--red)] bg-[var(--red-dim)]" : ""}`} data-testid={`button-shotmap-kind-${k}`}>{k === "all" ? "Goals and assists" : k === "goal" ? "Goals" : "Assists"}</button>
        ))}
      </div>
      <div className="flex gap-2 mt-2 overflow-x-auto scrollbar-none pb-1">
        <button onClick={() => setPlayer(null)} className={`chip shrink-0 ${player === null ? "border-[var(--red)] bg-[var(--red-dim)]" : ""}`}>Whole team</button>
        {players.map((p) => (
          <button key={p.id} onClick={() => setPlayer(p.id)} className={`chip shrink-0 ${player === p.id ? "border-[var(--red)] bg-[var(--red-dim)]" : ""}`} data-testid={`button-shotmap-player-${p.id}`}>
            {p.name} <span className="text-[var(--mute)]">{p.g}G {p.a}A</span>
          </button>
        ))}
      </div>
    </Section>
  );
}
