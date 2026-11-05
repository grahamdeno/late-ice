"use client";
import { useQuery } from "@tanstack/react-query";
import { Link } from "@/lib/router";
import { Delta, Empty, FaceoffDot, GameRow, Loading, Section, fmtRating, useFilter, type GameCard } from "@/lib/ui";

export default function Home() {
  const { leagueId, rinkId, boot } = useFilter();
  const { data, isLoading } = useQuery<{ games: GameCard[]; movers: any[]; leaders: any[]; pending: any[] }>({
    queryKey: [leagueId ? `/api/feed?league=${leagueId}` : rinkId ? `/api/feed?rink=${rinkId}` : "/api/feed"],
  });
  const league = boot?.leagues.find((l) => l.id === leagueId);

  return (
    <div>
      <div className="rise">
        <div className="label">{league ? `${league.name} · ${boot?.season?.name ?? ""}` : `${boot?.rink?.name ?? ""}${boot?.region ? ` · ${boot.region.name}, ${boot.region.state}` : ""}${boot?.season ? ` · ${boot.season.name}` : ""}`}</div>
        <h1 className="font-display text-[clamp(34px,11.5vw,44px)] leading-[0.95] font-black uppercase mt-1">Every game counts.<br /><span className="text-[var(--red)]">Even the 11:15.</span></h1>
      </div>

      <Link href="/scan" className="card-hi mt-5 p-5 flex items-center gap-4 rise" data-testid="card-scan-cta" style={{ animationDelay: ".05s" }}>
        <span className="h-14 w-14 rounded-2xl flex items-center justify-center shrink-0" style={{ background: "var(--red-dim)" }}><FaceoffDot size={34} /></span>
        <span className="flex-1">
          <span className="block font-black text-[17px]">Just played? Snap the sheet.</span>
          <span className="block text-sm text-[var(--mute)] mt-0.5">One photo. We read every goal, assist and penalty. No typing.</span>
        </span>
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round"><path d="M9 18l6-6-6-6" /></svg>
      </Link>

      {data?.pending?.filter((p) => p.status === "review").length ? (
        <div className="mt-3 space-y-2">
          {data.pending.filter((p) => p.status === "review").map((p) => (
            <Link key={p.id} href={`/sheet/${p.id}`} className="card p-3 flex items-center gap-3 border-[var(--amber)]/40" data-testid={`link-pending-${p.id}`}>
              <span className="h-2.5 w-2.5 rounded-full bg-[var(--amber)]" />
              <span className="text-sm flex-1">A scanned sheet is waiting for a quick check</span>
              <span className="text-sm font-bold text-[var(--amber)]">Review</span>
            </Link>
          ))}
        </div>
      ) : null}

      {isLoading ? <Loading /> : (
        <>
          <Section title="Latest finals" action={<Link href="/leagues" className="text-sm text-[var(--mute)]" data-testid="link-all-standings">Standings</Link>}>
            {data!.games.length ? (
              <div className="space-y-3">{data!.games.slice(0, 6).map((g) => <GameRow key={g.id} g={g} />)}</div>
            ) : (
              <Empty
                title={data!.leaders.length ? "No sheets scanned yet" : "No games on the books yet"}
                body={data!.leaders.length ? "Standings and point totals so far are imported from the rink's stats page. The first scanned sheet adds goals, times and ratings." : "The first person to scan a sheet puts this league on the board."}
                action={<Link href="/scan" className="btn btn-red" data-testid="button-empty-scan">Scan a sheet</Link>}
              />
            )}
          </Section>

          {data!.movers.length > 0 && (
            <Section title="Biggest movers" action={<span className="label">Late Ice Rating</span>}>
              <div className="card divide-y divide-[var(--line)]">
                {data!.movers.map((m, i) => (
                  <Link key={m.id + "-" + i} href={`/player/${m.id}`} className="flex items-center gap-3 p-3.5" data-testid={`row-mover-${m.id}`}>
                    <span className="w-5 text-center font-display text-lg text-[var(--mute)]">{i + 1}</span>
                    <span className="flex-1 font-bold truncate">{m.name}</span>
                    <span className="tnum text-[var(--mute)] text-sm">{fmtRating(m.after)}</span>
                    <Delta d={m.delta} className="w-16 text-right text-sm" />
                  </Link>
                ))}
              </div>
            </Section>
          )}

          {data!.leaders.length > 0 && (
            <Section title="Points leaders">
              <div className="card divide-y divide-[var(--line)]">
                {data!.leaders.map((p, i) => (
                  <Link key={p.id + "-" + p.team_id} href={`/player/${p.id}`} className="flex items-center gap-3 p-3.5" data-testid={`row-leader-${p.id}`}>
                    <span className="w-5 text-center font-display text-lg text-[var(--mute)]">{i + 1}</span>
                    <span className="flex-1 min-w-0">
                      <span className="block font-bold truncate">{p.name}</span>
                      <span className="block text-xs text-[var(--mute)] truncate">{p.team}</span>
                    </span>
                    <span className="tnum text-sm text-[var(--mute)]">{p.g}G {p.a}A</span>
                    <span className="tnum font-display text-xl w-8 text-right">{p.pts}</span>
                  </Link>
                ))}
              </div>
            </Section>
          )}
        </>
      )}
    </div>
  );
}
