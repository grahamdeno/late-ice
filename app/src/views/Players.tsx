"use client";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link, useLocation } from "@/lib/router";
import { useMe, act, posMatch } from "@/lib/auth";
import { BackBar, Delta, Empty, LevelPill, Loading, TeamBadge, fmtDate, fmtRating, useFilter } from "@/lib/ui";

export function Players() {
  const { leagueId, boot } = useFilter();
  const [qs, setQs] = useState("");
  const [pos, setPos] = useState("skaters");
  const { data } = useQuery<any[]>({ queryKey: [leagueId ? `/api/players?league=${leagueId}` : "/api/players"] });
  const league = boot?.leagues.find((l) => l.id === leagueId);
  const rows = (data ?? []).filter((p) => posMatch(pos, p.position) && p.name.toLowerCase().includes(qs.toLowerCase()));
  return (
    <div>
      <div className="label">{league ? league.name : "All Wilmington"} · Late Ice Rating</div>
      <h1 className="font-display text-[40px] leading-none font-black uppercase mt-1">Players</h1>
      <p className="text-sm text-[var(--mute)] mt-2">Every player on a scanned sheet gets a rating. Win against better teams and it climbs.</p>
      <input value={qs} onChange={(e) => setQs(e.target.value)} placeholder="Find a player" className="mt-4 w-full h-11 rounded-xl bg-[var(--ice-2)] border border-[var(--line)] px-4 focus:outline-none focus:border-[var(--red)]" data-testid="input-player-search" />
      <div className="flex gap-1.5 mt-3 overflow-x-auto scrollbar-none -mx-4 px-4">
        {([["skaters", "Skaters"], ["C", "Center"], ["W", "Wing"], ["D", "Defense"], ["G", "Goalie"]] as const).map(([k, label]) => (
          <button key={k} onClick={() => setPos(k)} data-active={pos === k} className="chip shrink-0" data-testid={`button-pos-${k}`}>{label}</button>
        ))}
      </div>
      {pos === "C" || pos === "W" ? <p className="text-[11px] text-[var(--mute)] mt-2">Shows players who picked {pos === "C" ? "center" : "wing"} on their profile. Imported spots are just "forward" until someone claims them.</p> : null}
      {!data ? <Loading /> : rows.length === 0 ? (
        <div className="mt-4"><Empty title={qs ? "No match" : pos !== "skaters" ? "Nobody at this position yet" : "No players yet"} body={qs ? "Try another spelling." : pos !== "skaters" ? "Players set their position on their profile." : "Players appear the moment their first scoresheet is scanned."} /></div>
      ) : (
        <div className="card divide-y divide-[var(--line)] mt-4">
          {rows.map((p, i) => (
            <Link key={p.id} href={`/player/${p.id}`} className="flex items-center gap-3 px-4 py-3" data-testid={`row-player-${p.id}`}>
              <span className="w-6 text-center font-display text-lg text-[var(--mute)]">{i + 1}</span>
              <span className="flex-1 min-w-0">
                <span className="block font-bold truncate">{p.name}{p.position && p.position !== "F" && <span className="text-[var(--mute)] font-medium"> · {p.position}</span>}</span>
                <span className="block text-xs text-[var(--mute)] truncate">{p.teams} · {p.levels}</span>
              </span>
              <span className="text-right">
                <span className="block font-display text-xl tnum">{fmtRating(p.rating)}</span>
                <Delta d={p.last_delta} className="text-[11px]" />
              </span>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}

function Spark({ pts }: { pts: number[] }) {
  if (pts.length < 2) return null;
  const min = Math.min(...pts) - 0.02, max = Math.max(...pts) + 0.02;
  const W = 300, H = 70;
  const xy = pts.map((v, i) => [(i / (pts.length - 1)) * W, H - ((v - min) / (max - min)) * H]);
  const d = xy.map(([x, y], i) => `${i ? "L" : "M"}${x.toFixed(1)} ${y.toFixed(1)}`).join(" ");
  return (
    <svg viewBox={`0 0 ${W} ${H + 6}`} className="w-full h-20 mt-3" preserveAspectRatio="none" aria-label="Rating over time">
      <path d={`${d} L${W} ${H + 6} L0 ${H + 6}Z`} fill="rgba(255,59,59,.12)" />
      <path d={d} fill="none" stroke="#FF3B3B" strokeWidth="2.5" vectorEffect="non-scaling-stroke" />
      {xy.map(([x, y], i) => <circle key={i} cx={x} cy={y} r="3.5" style={{ fill: "var(--ice)", stroke: "var(--red)" }} strokeWidth="2" vectorEffect="non-scaling-stroke" />)}
    </svg>
  );
}

export function PlayerPage({ id }: { id: string }) {
  const { data } = useQuery<any>({ queryKey: [`/api/players/${id}`] });
  const [openRow, setOpenRow] = useState<number | null>(null);
  if (!data) return <Loading />;
  const { player, teams, history, totals, ranks, reliability, imported } = data;
  const series = history.length ? [history[0].before, ...history.map((h: any) => h.after)] : [];
  const start = series[0] ?? player.rating;
  const provisional = player.games_rated < 5;
  return (
    <div>
      <BackBar href="/players" title="Player" />
      <div className="card-hi p-5">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h1 className="font-black text-[26px] leading-tight" data-testid="text-player-name">{player.name}</h1>
            <div className="flex flex-wrap gap-1.5 mt-2">
              {teams.map((t: any) => (
                <Link key={t.id} href={`/team/${t.id}`} className="chip h-7 text-xs" data-testid={`link-player-team-${t.id}`}>
                  <TeamBadge team={t} size={16} /> {t.name} {t.number && <span className="text-[var(--mute)]">#{t.number}</span>}
                </Link>
              ))}
            </div>
          </div>
          {!player.registered && <span className="chip h-7 text-[11px] text-[var(--mute)] shrink-0">Unclaimed</span>}
        </div>
        <div className="mt-5 flex items-end gap-3">
          <div>
            <div className="label">Late Ice Rating</div>
            <div className="font-display text-[64px] leading-none tnum" data-testid="text-player-rating">{fmtRating(player.rating)}</div>
          </div>
          {history.length > 0 && <div className="pb-2"><Delta d={player.rating - start} className="text-lg" /><div className="text-[11px] text-[var(--mute)]">since first game</div></div>}
        </div>
        <Spark pts={series} />
        <div className="mt-4">
          <div className="flex justify-between text-xs"><span className="label">Reliability</span><span className="text-[var(--mute)]">{reliability}%{provisional ? " · provisional" : ""}</span></div>
          <div className="h-1.5 rounded-full bg-[var(--ice-3)] mt-1.5 overflow-hidden"><div className="h-full rounded-full bg-[var(--red)]" style={{ width: `${reliability}%` }} /></div>
          <div className="text-[11px] text-[var(--mute)] mt-1.5">{provisional ? `Moves fast for the first 5 games. ${5 - player.games_rated} to go.` : "Settled. Each game nudges it."}</div>
        </div>
      </div>

      <div className="grid grid-cols-4 gap-2 mt-3 text-center">
        {[["GP", totals.gp], ["G", totals.g], ["A", totals.a], ["PIM", totals.pim]].map(([k, v]) => (
          <div key={k} className="card py-3"><div className="font-display text-2xl tnum">{v}</div><div className="label text-[10px]">{k}</div></div>
        ))}
      </div>
      {imported && (
        <p className="text-[11px] text-[var(--mute)] mt-2 px-1" data-testid="text-imported-player">Totals include {imported.gp} games imported from the {imported.source} as of {fmtDate(imported.as_of)}.</p>
      )}
      {ranks.length > 0 && (
        <div className="flex gap-2 mt-3 flex-wrap">
          {ranks.map((r: any) => (
            <span key={r.level} className="chip"><LevelPill level={r.level} /> {r.tied ? "T-" : ""}#{r.rank} of {r.of}</span>
          ))}
        </div>
      )}

      {data.importedGames?.length > 0 && (
        <>
          <h2 className="font-black text-[17px] mt-7 mb-3 px-1">Game by game <span className="label ml-1">From DaySmart</span></h2>
          <div className="card divide-y divide-[var(--line)]" data-testid="list-imported-games">
            {data.importedGames.map((x: any) => {
              const mineHome = teams.some((t: any) => t.id === x.game.home.id);
              const opp = mineHome ? x.game.away : x.game.home;
              const sc = mineHome ? [x.game.homeScore, x.game.awayScore] : [x.game.awayScore, x.game.homeScore];
              return (
                <Link key={x.game.id} href={`/game/${x.game.id}`} className="flex items-center gap-3 p-3.5 text-sm">
                  <span className={`h-8 w-8 rounded-lg flex items-center justify-center font-black text-xs ${sc[0] > sc[1] ? "bg-[rgba(56,217,150,.15)] up" : sc[0] < sc[1] ? "bg-[rgba(255,107,107,.15)] down" : "bg-[var(--ice-3)]"}`}>{sc[0] > sc[1] ? "W" : sc[0] < sc[1] ? "L" : "T"}</span>
                  <span className="flex-1 min-w-0"><span className="block font-bold truncate">{sc[0]}–{sc[1]} vs {opp.name}</span><span className="block text-xs text-[var(--mute)]">{fmtDate(x.game.playedOn)}</span></span>
                  <span className="tnum text-[var(--mute)]">{x.goals}G {x.assists}A</span>
                </Link>
              );
            })}
          </div>
        </>
      )}

      <h2 className="font-black text-[17px] mt-7 mb-3 px-1">Why it moved</h2>
      {history.length === 0 ? <Empty title="No rated games yet" body="Ratings start after the first scanned game." /> : (
        <div className="space-y-2">
          {[...history].reverse().map((h: any) => {
            const opp = teams.find((t: any) => t.id === h.game.home.id) ? h.game.away : h.game.home;
            const mine = teams.find((t: any) => t.id === h.game.home.id) ? [h.game.homeScore, h.game.awayScore] : [h.game.awayScore, h.game.homeScore];
            const res = mine[0] > mine[1] ? "W" : mine[0] < mine[1] ? "L" : "T";
            const open = openRow === h.id;
            return (
              <div key={h.id} className="card overflow-hidden">
                <button onClick={() => setOpenRow(open ? null : h.id)} className="w-full flex items-center gap-3 p-3.5 text-left" data-testid={`button-history-${h.id}`}>
                  <span className={`h-8 w-8 rounded-lg flex items-center justify-center font-black text-sm ${res === "W" ? "bg-[rgba(56,217,150,.15)] up" : res === "L" ? "bg-[rgba(255,107,107,.15)] down" : "bg-[var(--ice-3)]"}`}>{res}</span>
                  <TeamBadge team={opp} size={24} />
                  <span className="flex-1 min-w-0"><span className="block text-sm font-bold truncate">{mine[0]}–{mine[1]} vs {opp.name}</span><span className="block text-xs text-[var(--mute)]">{fmtDate(h.game.playedOn)}</span></span>
                  <Delta d={h.after - h.before} className="text-sm" />
                </button>
                {open && (
                  <div className="px-4 pb-3 space-y-1.5 text-sm border-t border-[var(--line)] pt-3">
                    {h.reasons.map((r: any, i: number) => (
                      <div key={i} className="flex justify-between gap-3"><span className="text-[var(--mute)]">{r.label}</span>{r.value !== 0 && <Delta d={r.value} />}</div>
                    ))}
                    <div className="flex justify-between pt-1.5 border-t border-[var(--line)] font-bold"><span>{fmtRating(h.before)} → {fmtRating(h.after)}</span><Link href={`/game/${h.game_id}`} className="text-[var(--blue)] text-xs">Game ›</Link></div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      <ClaimCard player={player} />
    </div>
  );
}

function ClaimCard({ player }: { player: any }) {
  const { me } = useMe();
  const [, nav] = useLocation();
  const [err, setErr] = useState<string | null>(null);
  const [hideOpen, setHideOpen] = useState(false);
  const [contact, setContact] = useState("");
  const [hidden, setHidden] = useState(false);
  if (player.mine) {
    return (
      <div className="card mt-6 p-4 flex items-center gap-3" data-testid="card-mine">
        <div className="flex-1"><div className="font-bold">This is you</div><div className="text-xs text-[var(--mute)]">Hide your name or set your availability from your profile.</div></div>
        <Link href="/me" className="btn btn-ghost h-10">Profile</Link>
      </div>
    );
  }
  return (
    <div className="mt-6 space-y-3">
      {!player.registered && (
        <div className="card p-4 flex items-center gap-3" data-testid="card-claim">
          <div className="flex-1"><div className="font-bold">Is this you?</div><div className="text-xs text-[var(--mute)]">{me ? "Claim it and these stats and this rating become yours. Your captain can see the claim." : "Join with your phone number, then claim it."}</div></div>
          <button
            className="btn btn-red h-10"
            onClick={async () => {
              if (!me) return nav("/join");
              if (!me.user.profileComplete) return nav("/join");
              const e = await act("POST", `/api/players/${player.id}/claim`);
              setErr(e);
              if (!e) nav("/me");
            }}
            data-testid="button-claim"
          >
            {me ? "Claim" : "Join"}
          </button>
        </div>
      )}
      {err && <p className="text-sm down px-1">{err}</p>}
      {!player.registered && !player.hidden && !hidden && (
        <div className="px-1">
          {!hideOpen ? (
            <button className="text-xs text-[var(--mute)] underline" onClick={() => setHideOpen(true)} data-testid="button-hide-open">Don't want your name here? Hide it.</button>
          ) : (
            <form className="card p-4 space-y-2" onSubmit={async (e) => { e.preventDefault(); const r = await act("POST", `/api/players/${player.id}/hide`, { contact }); setErr(r); if (!r) setHidden(true); }}>
              <div className="text-sm font-bold">Hide this name</div>
              <p className="text-xs text-[var(--mute)]">The name is replaced with the jersey number everywhere. Games still count for the team. No account needed.</p>
              <input className="input w-full" placeholder="Phone or email (optional, so we can reach you)" value={contact} onChange={(e) => setContact(e.target.value)} data-testid="input-hide-contact" />
              <button className="btn btn-red h-10 w-full" data-testid="button-hide">Hide name</button>
            </form>
          )}
        </div>
      )}
      {hidden && <p className="text-xs text-[var(--mute)] px-1" data-testid="text-hidden">Done. The name is hidden.</p>}
    </div>
  );
}
