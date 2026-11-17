"use client";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "@/lib/router";
import { useMe, act } from "@/lib/auth";
import { apiRequest, invalidatePrefixes } from "@/lib/queryClient";
import { fmtDate } from "@/lib/ui";

type Wrap = { teamId: number; seasonId: number; playerId: number; teamName: string; color: string; seasonName: string; openedAt: string; updatedOn: string | null; home: boolean };

function useMyWraps() {
  const { me } = useMe();
  return useQuery<{ wraps: Wrap[] }>({ queryKey: ["/api/wrapped"], enabled: !!me });
}

/** A1: a full-width card on Home for 14 days after a team's Wrapped opens. */
export function WrappedHomeCards() {
  const { data } = useMyWraps();
  const cards = (data?.wraps ?? []).filter((w) => w.home);
  if (!cards.length) return null;
  return (
    <>
      {cards.map((w) => (
        <Link key={`${w.teamId}-${w.seasonId}`} href={`/wrapped/${w.teamId}/${w.seasonId}`} className="hero mt-4 p-5 block min-h-[88px]" style={{ ["--team" as any]: w.color }} data-testid={`card-wrapped-home-${w.teamId}`}>
          <span className="block label">Season Wrapped · {w.teamName}</span>
          <span className="block font-display text-[26px] leading-tight font-black mt-1">Your {w.seasonName} is wrapped</span>
          <span className="block text-sm font-bold text-[var(--blue)] mt-2">Tap through your season ›</span>
        </Link>
      ))}
    </>
  );
}

/** A1: after 14 days Wrapped lives on the Career page. Only the player's own career shows it. */
export function WrappedCareerLinks({ playerId }: { playerId: number }) {
  const { data } = useMyWraps();
  const mine = (data?.wraps ?? []).filter((w) => w.playerId === playerId);
  if (!mine.length) return null;
  return (
    <>
      <h2 className="font-black text-[17px] mt-7 mb-3 px-1">Season Wrapped</h2>
      <div className="card divide-y divide-[var(--line)]" data-testid="list-wrapped">
        {mine.map((w) => (
          <Link key={`${w.teamId}-${w.seasonId}`} href={`/wrapped/${w.teamId}/${w.seasonId}`} className="flex items-center gap-3 px-4 py-3 min-h-[56px]" data-testid={`link-wrapped-${w.teamId}-${w.seasonId}`}>
            <span className="flex-1 min-w-0"><span className="block font-bold text-sm">{w.seasonName}</span><span className="block text-xs text-[var(--mute)]">{w.teamName}{w.updatedOn ? ` · Updated ${fmtDate(w.updatedOn)}` : ""}</span></span>
            <span className="text-sm text-[var(--blue)] font-bold">Open</span>
          </Link>
        ))}
      </div>
    </>
  );
}

/** A5: the captain's "Wrap the season" on Manage team. Shown only to people who may wrap this team. */
export function WrapSeasonTeam({ teamId }: { teamId: number }) {
  const url = `/api/wrapped/season?teamId=${teamId}`;
  const { data } = useQuery<any>({ queryKey: [url] });
  const [err, setErr] = useState<string | null>(null);
  if (!data?.canWrap) return null;
  const wrap = async () => {
    if (!confirm("Wrap the season? Players get their recap now. Later sheets still update it.")) return;
    setErr(await act("POST", "/api/wrapped/season", { teamId }, ["/api/wrapped"]));
  };
  return (
    <div className="card p-4 mt-4" data-testid="card-wrap-season">
      <div className="text-sm font-bold">Season Wrapped</div>
      {data.wrapped ? (
        <>
          <p className="text-xs text-[var(--mute)] mt-0.5">{data.seasonName} was wrapped on {fmtDate(String(data.openedAt).slice(0, 10))}. Players see their recap on Home.</p>
          <Link href={`/wrapped/team/${teamId}/${data.seasonId}`} className="text-sm text-[var(--blue)] font-bold min-h-[44px] inline-flex items-center" data-testid="link-team-wrap">Open the team wrap ›</Link>
        </>
      ) : (
        <>
          <p className="text-xs text-[var(--mute)] mt-0.5">{data.hasGames ? `It opens by itself after your last game. Wrap ${data.seasonName} now to open every player's recap today.` : "Your team has no games on record yet, so there is nothing to wrap."}</p>
          <button className="btn btn-red h-11 mt-2" disabled={!data.hasGames} onClick={wrap} data-testid="button-wrap-season">Wrap the season</button>
        </>
      )}
      {err && <p className="text-xs down mt-2" role="alert">{err}</p>}
    </div>
  );
}

/** A5: rink staff wrap every team in a league from the staff page. */
export function WrapSeasonLeague({ leagueId, name }: { leagueId: number; name: string }) {
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const wrap = async () => {
    if (!confirm(`Wrap the season for every team in ${name}? Players get their recap now. Later sheets still update it.`)) return;
    setBusy(true); setMsg(null);
    try {
      const r = await (await apiRequest("POST", "/api/wrapped/season", { leagueId })).json();
      invalidatePrefixes(["/api/wrapped"]);
      setMsg(`Wrapped ${r.opened} ${r.opened === 1 ? "team" : "teams"}${r.alreadyOpen ? `. ${r.alreadyOpen} already wrapped` : ""}${r.skipped ? `. ${r.skipped} with no games skipped` : ""}.`);
    } catch (e: any) { setMsg(e?.message ?? "Couldn't wrap the season."); }
    setBusy(false);
  };
  return (
    <div className="card p-4" data-testid="card-wrap-league">
      <p className="text-xs text-[var(--mute)]">Opens every team's recap in this league. Teams with no games are skipped. Each team's captain can also do this for their own team.</p>
      <button className="btn btn-red h-11 mt-2" disabled={busy} onClick={wrap} data-testid={`button-wrap-league-${leagueId}`}>Wrap the season</button>
      {msg && <p className="text-xs mt-2" role="status" data-testid="text-wrap-league-result">{msg}</p>}
    </div>
  );
}
