"use client";
import { useQuery } from "@tanstack/react-query";
import { Link } from "@/lib/router";
import { BackBar, Delta, FaceoffDot, LevelPill, Loading, TeamBadge, fmtDate, img } from "@/lib/ui";

export default function Game({ id, fresh }: { id: string; fresh?: boolean }) {
  const { data: g } = useQuery<any>({ queryKey: [`/api/games/${id}`] });
  if (!g) return <Loading />;
  const sides = [
    { key: "home", team: g.home, score: g.homeScore },
    { key: "away", team: g.away, score: g.awayScore },
  ] as const;
  const nameFor = (teamId: number, num: string | null) => g.lines.find((l: any) => l.team_id === teamId && l.number === num)?.name;
  const timeline = sides
    .flatMap((s) => (g.goals[s.key] || []).map((x: any) => ({ ...x, side: s.key, team: s.team })))
    .sort((a: any, b: any) => (a.period - b.period) || (toSec(b.time) - toSec(a.time)));
  const stars = [...g.lines].sort((a: any, b: any) => (b.goals * 2 + b.assists) - (a.goals * 2 + a.assists) || (b.delta ?? 0) - (a.delta ?? 0)).slice(0, 3);
  const periods = Math.max(3, (g.periods.home || []).length);

  return (
    <div>
      <BackBar href="/" title={`${g.league.name} · ${fmtDate(g.playedOn)}`} />

      {fresh && (
        <div className="card-hi p-4 mb-3 flex items-center gap-3 rise" style={{ borderColor: "rgba(56,217,150,.35)" }} data-testid="banner-in-books">
          <FaceoffDot size={34} />
          <div>
            <div className="font-black">In the books.</div>
            <div className="text-sm text-[var(--mute)]">Standings and {g.lines.length} player ratings just updated.</div>
          </div>
        </div>
      )}

      <div className="card-hi p-5">
        <div className="flex items-center justify-between mb-4">
          <LevelPill level={g.league.level} />
          <span className="label">Final{g.startTime ? ` · ${g.startTime}` : ""}</span>
        </div>
        <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-3">
          {sides.map((s, i) => (
            <Link key={s.key} href={`/team/${s.team.id}`} className={`flex flex-col items-center text-center gap-2 ${i === 1 ? "order-3" : ""}`} data-testid={`link-team-${s.key}`}>
              <TeamBadge team={s.team} size={52} />
              <span className="text-sm font-bold leading-tight">{s.team.name}</span>
            </Link>
          ))}
          <div className="order-2 font-display text-6xl tnum flex items-center gap-2" data-testid="text-final-score">
            <span className={g.homeScore >= g.awayScore ? "" : "text-[var(--mute)]"}>{g.homeScore}</span>
            <span className="text-[var(--mute)] text-3xl">–</span>
            <span className={g.awayScore >= g.homeScore ? "" : "text-[var(--mute)]"}>{g.awayScore}</span>
          </div>
        </div>
        <table className="w-full mt-5 text-sm tnum">
          <thead><tr className="text-[var(--mute)]"><th className="text-left font-medium py-1"> </th>{Array.from({ length: periods }, (_, i) => <th key={i} className="font-medium">{i + 1}</th>)}<th className="font-medium">T</th><th className="font-medium">SOG</th></tr></thead>
          <tbody>
            {sides.map((s) => (
              <tr key={s.key} className="border-t border-[var(--line)]">
                <td className="py-1.5 truncate max-w-[110px]">{s.team.name}</td>
                {Array.from({ length: periods }, (_, i) => <td key={i} className="text-center">{g.periods[s.key]?.[i] ?? "–"}</td>)}
                <td className="text-center font-bold">{s.score}</td>
                <td className="text-center text-[var(--mute)]">{(g.shots[s.key] || []).reduce((a: number, b: number) => a + (b || 0), 0) || "–"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <h2 className="font-black text-[17px] mt-7 mb-3 px-1">Three stars</h2>
      <div className="grid grid-cols-3 gap-2">
        {stars.map((p: any, i: number) => (
          <Link key={p.player_id} href={`/player/${p.player_id}`} className="card p-3 text-center" data-testid={`card-star-${i + 1}`}>
            <div className="font-display text-xl text-[var(--red)]">{"★".repeat(3 - i)}</div>
            <div className="font-bold text-sm leading-tight mt-1">{p.name}</div>
            <div className="text-xs text-[var(--mute)] mt-0.5">{p.goals}G {p.assists}A</div>
            <Delta d={p.delta} className="text-xs" />
          </Link>
        ))}
      </div>

      <h2 className="font-black text-[17px] mt-7 mb-3 px-1">Scoring</h2>
      <div className="card divide-y divide-[var(--line)]">
        {timeline.map((x: any, i: number) => (
          <div key={i} className="flex items-center gap-3 p-3">
            <span className="label w-12">P{x.period} {x.time}</span>
            <TeamBadge team={x.team} size={24} />
            <div className="flex-1 min-w-0">
              <div className="font-bold truncate">{nameFor(x.team.id, x.scorer) ?? `#${x.scorer}`}</div>
              <div className="text-xs text-[var(--mute)] truncate">{[x.assist1, x.assist2].filter(Boolean).map((n: string) => nameFor(x.team.id, n) ?? `#${n}`).join(", ") || "Unassisted"}</div>
            </div>
          </div>
        ))}
      </div>

      {(g.penalties.home?.length || g.penalties.away?.length) ? (
        <>
          <h2 className="font-black text-[17px] mt-7 mb-3 px-1">Penalties</h2>
          <div className="card divide-y divide-[var(--line)]">
            {sides.flatMap((s) => (g.penalties[s.key] || []).map((p: any, i: number) => (
              <div key={s.key + i} className="flex items-center gap-3 p-3 text-sm">
                <span className="label w-8">P{p.period}</span>
                <TeamBadge team={s.team} size={22} />
                <span className="flex-1 truncate">{nameFor(s.team.id, p.number) ?? `#${p.number}`} · {p.offense}</span>
                <span className="tnum text-[var(--mute)]">{p.minutes}:00</span>
              </div>
            )))}
          </div>
        </>
      ) : null}

      <h2 className="font-black text-[17px] mt-7 mb-3 px-1">Rating moves</h2>
      {sides.map((s) => (
        <div key={s.key} className="card mb-3 overflow-hidden">
          <div className="px-4 py-2.5 border-b border-[var(--line)] font-bold flex items-center gap-2"><TeamBadge team={s.team} size={22} />{s.team.name}</div>
          <div className="divide-y divide-[var(--line)]">
            {g.lines.filter((l: any) => l.team_id === s.team.id).map((l: any) => (
              <Link key={l.player_id} href={`/player/${l.player_id}`} className="flex items-center gap-3 px-4 py-2.5 text-sm" data-testid={`row-line-${l.player_id}`}>
                <span className="tnum text-[var(--mute)] w-7">#{l.number}</span>
                <span className="flex-1 truncate font-medium">{l.name}{l.is_goalie ? <span className="text-[var(--mute)]"> · G</span> : null}</span>
                <span className="tnum text-[var(--mute)] w-14 text-right">{l.is_goalie && l.shots_against ? `${l.shots_against - l.goals_against} SV` : `${l.goals}G ${l.assists}A`}</span>
                <Delta d={l.delta} className="w-16 text-right" />
              </Link>
            ))}
          </div>
        </div>
      ))}

      {g.sheetId && (
        <a href={img(`/api/sheets/${g.sheetId}/image`)} target="_blank" rel="noreferrer" className="card mt-4 p-3 flex items-center gap-3" data-testid="link-source-sheet">
          <img src={img(`/api/sheets/${g.sheetId}/image`)} alt="Original scoresheet" className="h-14 w-20 object-cover object-top rounded-lg" />
          <div className="flex-1"><div className="font-bold text-sm">Source scoresheet</div><div className="text-xs text-[var(--mute)]">Every stat on this page came from this photo</div></div>
        </a>
      )}
    </div>
  );
}

function toSec(t: string | null) {
  if (!t) return 0;
  const [m, s] = t.split(":").map(Number);
  return (m || 0) * 60 + (s || 0);
}
