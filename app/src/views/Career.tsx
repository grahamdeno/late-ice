"use client";
import { useQuery } from "@tanstack/react-query";
import { Link } from "@/lib/router";
import { BackBar, Loading, fmtDate } from "@/lib/ui";
import { ShareCard } from "@/components/ShareCard";

/** A player's whole run: seasons, rating over time, milestones, and goalie numbers for goalies. */
export function CareerPage({ id }: { id: string }) {
  const { data } = useQuery<any>({ queryKey: [`/api/players/${id}/career`] });
  if (!data) return <Loading />;
  const { player, seasons, totals, rating, milestones, goalie } = data;
  return (
    <div data-testid="page-career">
      <BackBar href={`/player/${id}`} title="Career" />
      <div className="hero p-5">
        <div className="label">Career</div>
        <h1 className="font-display text-3xl mt-1" data-testid="text-career-name">{player.name}</h1>
        <div className="flex items-end gap-6 mt-3">
          <div><div className="font-display text-4xl tnum">{player.rating.toFixed(1)}</div><div className="label">Rating</div></div>
          {rating.peak != null && rating.peakAfterTen && <div><div className="font-display text-2xl tnum">{rating.peak.toFixed(1)}</div><div className="label">Peak</div></div>}
        </div>
        <div className="grid grid-cols-4 gap-2 mt-4 text-center">
          {[["GP", totals.gp], ["G", totals.g], ["A", totals.a], ["PTS", totals.g + totals.a]].map(([k, v]) => (
            <div key={k as string}><div className="font-display text-2xl tnum">{v}</div><div className="label">{k}</div></div>
          ))}
        </div>
      </div>

      {rating.series.length > 1 && (
        <>
          <h2 className="font-black text-[17px] mt-7 mb-3 px-1">Rating over time</h2>
          <div className="card p-4"><RatingLine series={rating.series.map((x: any) => x.rating)} /></div>
        </>
      )}

      {milestones.length > 0 && (
        <>
          <h2 className="font-black text-[17px] mt-7 mb-3 px-1">Milestones</h2>
          <div className="card divide-y divide-[var(--line)]" data-testid="list-milestones">
            {milestones.map((m: any) => (
              <div key={m.kind} className="flex items-center gap-3 px-4 py-3" data-testid={`row-milestone-${m.kind}`}>
                <span className="text-[var(--red)] text-lg">★</span>
                <div className="flex-1 min-w-0"><div className="font-bold text-sm">{m.label}</div><div className="text-xs text-[var(--mute)]">{m.blurb}</div></div>
                {m.gameId && m.earnedOn ? <Link href={`/game/${m.gameId}`} className="text-xs text-[var(--blue)] font-bold shrink-0">{fmtDate(m.earnedOn)}</Link> : null}
              </div>
            ))}
          </div>
        </>
      )}

      {goalie && (
        <>
          <h2 className="font-black text-[17px] mt-7 mb-3 px-1">Goalie corner</h2>
          <div className="card p-4" data-testid="card-goalie-corner">
            <div className="grid grid-cols-3 gap-2 text-center">
              <div><div className="font-display text-2xl tnum">{goalie.w}-{goalie.l}-{goalie.t}</div><div className="label">Record</div></div>
              <div><div className="font-display text-2xl tnum">{goalie.gaa ?? "–"}</div><div className="label">Goals against / game</div></div>
              <div><div className="font-display text-2xl tnum">{goalie.shutouts}</div><div className="label">Shutouts</div></div>
            </div>
            <div className="mt-4 text-sm">
              {goalie.savePct != null
                ? <><b className="tnum">{goalie.savePct.toFixed(3).replace(/^0/, "")}</b> save percentage on <b className="tnum">{goalie.shots}</b> shots, over {goalie.gamesWithShots} {goalie.gamesWithShots === 1 ? "game" : "games"} with shot counts.</>
                : <span className="text-[var(--mute)]">No shot counts yet. Enter shots against on a game to add a save percentage.</span>}
            </div>
          </div>
        </>
      )}

      <h2 className="font-black text-[17px] mt-7 mb-3 px-1">By season</h2>
      <div className="card overflow-x-auto" data-testid="table-seasons">
        <table className="w-full text-sm tnum">
          <thead><tr className="text-[var(--mute)] text-left"><th className="font-medium px-4 py-2">Season, team</th><th className="font-medium">GP</th><th className="font-medium">G</th><th className="font-medium">A</th><th className="font-medium pr-4">PTS</th></tr></thead>
          <tbody>
            {seasons.map((r: any) => (
              <tr key={`${r.season_id}-${r.team_id}`} className="border-t border-[var(--line)]">
                <td className="px-4 py-2"><div className="font-bold">{r.season}</div><div className="text-xs text-[var(--mute)]">{r.team}</div></td>
                <td>{r.gp}</td><td>{r.g}</td><td>{r.a}</td><td className="pr-4 font-bold">{r.pts}</td>
              </tr>
            ))}
            {!seasons.length && <tr><td className="px-4 py-3 text-[var(--mute)]" colSpan={5}>No games on record yet.</td></tr>}
          </tbody>
        </table>
      </div>
      <p className="text-[11px] text-[var(--mute)] mt-2 px-1">Counts games Late Ice has on record, including games the rink imported.</p>

      {player.claimed && <div className="mt-5"><ShareCard kind="player" id={player.id} title={`${player.name} on Late Ice`} label="Share my player card" /></div>}
    </div>
  );
}

/** A plain line of the rating after each game. */
function RatingLine({ series }: { series: number[] }) {
  const w = 320, h = 90, pad = 6;
  const lo = Math.min(...series), hi = Math.max(...series), span = hi - lo || 1;
  const pts = series.map((v, i) => `${pad + (i / (series.length - 1)) * (w - pad * 2)},${h - pad - ((v - lo) / span) * (h - pad * 2)}`).join(" ");
  return (
    <svg viewBox={`0 0 ${w} ${h}`} className="w-full" role="img" aria-label={`Rating from ${series[0].toFixed(1)} to ${series[series.length - 1].toFixed(1)}`} data-testid="chart-rating">
      <polyline points={pts} fill="none" stroke="var(--red)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
