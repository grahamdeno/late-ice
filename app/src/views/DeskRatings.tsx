"use client";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "@/lib/router";
import { apiRequest, invalidatePrefixes } from "@/lib/queryClient";
import { DeskFrame, Gate, RinkSwitch, useDeskRink } from "@/views/Desk";

/**
 * Ratings: per league, how spread out the players are, how many are rated, how many games
 * count toward ratings, and who moved most this month. Admins can replay ratings on demand.
 */

type League = {
  id: number; name: string; level: string; players: number; rated: number; average: number | null;
  spread: { from: number; n: number }[]; movers: { id: number; name: string; delta: number; games: number }[];
  games: number; ratedGames: number;
};
type Data = { rink: { id: number; name: string }; leagues: League[]; lastRun: { kind: string; games: number; ms: number; created_at: string } | null; canRecompute: boolean };

export function DeskRatings() {
  return <Gate>{(overview) => <RatingsBody overview={overview} />}</Gate>;
}

function RatingsBody({ overview }: { overview: any }) {
  const { rink, rinks, pick } = useDeskRink(overview);
  const key = `/api/desk/ratings?rink=${rink?.id}`;
  const { data, error } = useQuery<Data>({ queryKey: [key], enabled: !!rink });
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const recompute = async () => {
    setBusy(true); setMsg(null);
    try {
      const r = await (await apiRequest("POST", "/api/staff/recompute")).json();
      await invalidatePrefixes([key, "/api/players", "/api/teams", "/api/games", "/api/me", "/api/desk"]);
      setMsg(`Replayed ${r.games} games in ${(r.ms / 1000).toFixed(1)} seconds.`);
    } catch (e: any) { setMsg(e?.message ?? "Couldn't recalculate."); }
    setBusy(false);
  };
  const last = data?.lastRun ? new Date(data.lastRun.created_at).toLocaleString("en-US", { weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }) : null;

  return (
    <DeskFrame>
      <div className="text-sm text-[var(--mute)]"><Link href="/desk">Rink Desk</Link> › Ratings</div>
      <div className="flex items-center gap-3 flex-wrap mt-1">
        <h1 className="font-black text-[28px] flex-1 min-w-0">Ratings</h1>
        <RinkSwitch rink={rink} rinks={rinks} pick={pick} />
        {data?.canRecompute && <button className="btn btn-ghost h-11 px-4" onClick={recompute} disabled={busy} data-testid="button-ratings-recompute">{busy ? "Recalculating…" : "Recalculate now"}</button>}
      </div>
      <p className="text-[var(--mute)] mt-1 max-w-3xl">
        Every game counts toward the rating of everyone who played it: scanned sheets always, DaySmart games once their lineup is in. Ratings replay from the first game each night{last ? `; last run ${last}` : ""}.
      </p>
      {msg && <p className="text-sm up mt-3" data-testid="text-ratings-msg">{msg}</p>}
      {error && <p className="down mt-4">{(error as any).message}</p>}
      {!data && !error && <p className="text-[var(--mute)] mt-6">Loading…</p>}

      <div className="grid gap-5 mt-6 xl:grid-cols-2">
        {data?.leagues.map((l) => <LeagueCard key={l.id} l={l} />)}
      </div>
    </DeskFrame>
  );
}

function LeagueCard({ l }: { l: League }) {
  const max = Math.max(1, ...l.spread.map((b) => b.n));
  const unratedGames = l.games - l.ratedGames;
  return (
    <section className="card p-5" data-testid={`card-ratings-${l.id}`}>
      <div className="flex items-baseline gap-2"><span className="font-black text-[var(--red)]">{l.level}</span><h2 className="font-black text-lg flex-1">{l.name}</h2></div>
      <div className="grid grid-cols-3 gap-3 mt-4">
        <Stat n={l.average != null ? l.average.toFixed(2) : "–"} label="Average rating" />
        <Stat n={`${l.rated}/${l.players}`} label="Players rated" />
        <Stat n={`${l.ratedGames}/${l.games}`} label="Games that count" />
      </div>
      {unratedGames > 0 && (
        <p className="text-sm text-[var(--amber)] mt-3">{unratedGames} imported game{unratedGames === 1 ? "" : "s"} still need a lineup to count. <Link href="/desk/lineups" className="font-bold text-[var(--blue)]">Add lineups</Link></p>
      )}

      <h3 className="label mt-5">Spread</h3>
      {l.spread.length ? (
        <div className="mt-2" role="img" aria-label={`Ratings from ${l.spread[0].from.toFixed(2)} to ${(l.spread[l.spread.length - 1].from + 0.25).toFixed(2)}`}>
          <div className="flex items-end gap-1 h-28">
            {l.spread.map((b) => (
              <div key={b.from} className="flex-1 flex flex-col justify-end h-full" title={`${b.from.toFixed(2)} to ${(b.from + 0.25).toFixed(2)}: ${b.n} players`}>
                <div className="rounded-t-md bg-[var(--blue)]" style={{ height: `${(b.n / max) * 100}%`, minHeight: b.n ? 3 : 0, opacity: 0.85 }} />
              </div>
            ))}
          </div>
          <div className="flex justify-between text-[11px] text-[var(--mute)] mt-1 tabular-nums">
            <span>{l.spread[0].from.toFixed(2)}</span><span>{(l.spread[l.spread.length - 1].from + 0.25).toFixed(2)}</span>
          </div>
        </div>
      ) : <p className="text-sm text-[var(--mute)] mt-2">No rated players yet.</p>}

      <h3 className="label mt-5">Biggest moves, last 30 days</h3>
      {l.movers.length ? (
        <div className="mt-2 divide-y divide-[var(--line)]">
          {l.movers.map((m) => (
            <Link key={m.id} href={`/player/${m.id}`} className="flex items-center gap-3 py-2 text-sm hover:text-[var(--white)]">
              <span className="flex-1 min-w-0 truncate font-bold">{m.name}</span>
              <span className="text-xs text-[var(--mute)]">{m.games} game{m.games === 1 ? "" : "s"}</span>
              <span className={`w-14 text-right font-bold tabular-nums ${m.delta >= 0 ? "up" : "down"}`}>{m.delta >= 0 ? "+" : ""}{m.delta.toFixed(2)}</span>
            </Link>
          ))}
        </div>
      ) : <p className="text-sm text-[var(--mute)] mt-2">No rated games in the last 30 days.</p>}
    </section>
  );
}

function Stat({ n, label }: { n: string; label: string }) {
  return <div className="rounded-xl bg-[var(--ice-3)] p-3"><div className="font-display font-black text-2xl leading-none tabular-nums">{n}</div><div className="text-xs text-[var(--mute)] mt-1.5">{label}</div></div>;
}
