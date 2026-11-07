"use client";
import { useQuery } from "@tanstack/react-query";
import { Link } from "@/lib/router";
import { useMe, type MeSlot } from "@/lib/auth";
import { GameLine, Rsvp } from "@/components/Schedule";
import { GameDetails, GoalieNudge, Scout, SharpenCard } from "@/components/GameNight";
import { Delta, Empty, FaceoffDot, GameRow, HomeFeedSkeleton, More, Section, TeamBadge, fmtDate, fmtRating, useFilter, type GameCard } from "@/lib/ui";

type Feed = { games: GameCard[]; movers: any[]; leaders: any[]; pending: any[] };

/** Home answers "am I playing, and how did the last one go" before anything else. */
export default function Home() {
  const { leagueId, rinkId, boot } = useFilter();
  const { me } = useMe();
  // Your own league's results come first. With no league picked, a signed-in player sees theirs.
  const myLeagueId = me?.slots?.[0]?.league_id ?? null;
  const feedLeague = leagueId ?? myLeagueId;
  const { data, isLoading } = useQuery<Feed>({
    queryKey: [feedLeague ? `/api/feed?league=${feedLeague}` : rinkId ? `/api/feed?rink=${rinkId}` : "/api/feed"],
  });
  const league = boot?.leagues.find((l) => l.id === leagueId);
  const place = league ? `${league.name} · ${boot?.season?.name ?? ""}` : `${boot?.rink?.name ?? ""}${boot?.season ? ` · ${boot.season.name}` : ""}`;
  const slot: MeSlot | undefined = me?.slots?.[0];
  const pending = data?.pending?.filter((p) => p.status === "review") ?? [];

  if (!slot) return <Welcome place={place} data={data} isLoading={isLoading} pending={pending} signedIn={!!me} />;

  const next = slot.next;
  const today = new Date().toLocaleDateString("en-CA");
  const title = next?.local_date === today ? "Tonight" : next ? "Next game" : "Your team";
  return (
    <div>
      <div className="label">{place}</div>
      <h1 className="text-[28px] leading-tight font-black mt-1" data-testid="text-home-title">{title}</h1>

      <div className="hero mt-4 p-5" style={{ ["--team" as any]: slot.color || undefined }} data-testid="card-next-game">
        <div className="flex items-center gap-2 mb-3">
          <TeamBadge team={{ id: slot.team_id, name: slot.team_name, color: slot.color, logo: slot.logo }} size={22} />
          <Link href={`/team/${slot.team_id}`} className="font-bold text-sm truncate flex-1 min-h-[40px] flex items-center">{slot.team_name}</Link>
          {next?.rsvp?.counts && <span className="text-xs text-[var(--mute)] tnum" data-testid="text-next-counts">{next.rsvp.counts.in || next.rsvp.counts.out || next.rsvp.counts.late ? `${next.rsvp.counts.in} in${next.rsvp.counts.late ? `, ${next.rsvp.counts.late} late` : ""}${next.rsvp.counts.out ? `, ${next.rsvp.counts.out} out` : ""}` : "No answers yet"}</span>}
        </div>
        {next ? (
          <>
            <GameLine g={next} />
            {next.rsvp?.member && <div className="mt-3"><Rsvp g={next} /></div>}
            <GameDetails g={next} />
            {(slot.teamRole === "captain" || slot.teamRole === "assistant_captain") && <GoalieNudge g={next} teamId={slot.team_id} />}
            {next.rsvp?.member && <Scout g={next} />}
            <div className="flex gap-4 mt-3 text-sm font-bold">
              <Link href={`/team/${slot.team_id}/lineup/${next.id}`} className="text-[var(--blue)] min-h-[40px] inline-flex items-center" data-testid="link-home-lineup">Lineup</Link>
              {(slot.teamRole === "captain" || slot.teamRole === "assistant_captain") && next.status === "scheduled" && <Link href={`/team/${slot.team_id}?details=${next.id}#game-${next.id}`} className="text-[var(--blue)] min-h-[40px] inline-flex items-center" data-testid="link-home-details">{next.sheet || next.jersey || next.locker_room ? "Edit details" : "Set sheet & room"}</Link>}
              <Link href={`/team/${slot.team_id}#schedule`} className="text-[var(--blue)] min-h-[40px] inline-flex items-center">Schedule</Link>
            </div>
          </>
        ) : (
          <p className="text-sm text-[var(--mute)]">No game on the schedule yet. <Link href={`/team/${slot.team_id}#schedule`} className="text-[var(--blue)] font-bold">Connect your team's calendar</Link> to see games here.</p>
        )}
      </div>

      <SharpenCard compact />

      <div className="grid grid-cols-2 gap-3 mt-3">
        {slot.last && <LastResult slot={slot} />}
        <Link href="/scan" className={`card p-4 block ${slot.last ? "" : "col-span-2"}`} data-testid="card-scan-cta">
          <span className="block label">Just played?</span>
          <span className="block mt-2"><FaceoffDot size={30} /></span>
          <span className="block text-sm font-bold mt-2">Snap the sheet</span>
        </Link>
      </div>

      {pending.length > 0 && pending.map((p) => (
        <Link key={p.id} href={`/sheet/${p.id}`} className="card mt-3 p-3 min-h-[52px] flex items-center gap-3" data-testid={`link-pending-${p.id}`}>
          <span className="h-2.5 w-2.5 rounded-full bg-[var(--amber)]" />
          <span className="text-sm flex-1">A scanned sheet is waiting for a quick check</span>
          <span className="text-sm font-bold text-[var(--amber)]">Review</span>
        </Link>
      ))}

      {isLoading ? <HomeFeedSkeleton /> : data && (
        <>
          <Section title={feedLeague === slot.league_id ? `Latest in ${slot.league_name}` : "Latest finals"} action={<Link href={`/league/${slot.league_id}`} className="text-sm text-[var(--mute)] min-h-[32px] inline-flex items-center" data-testid="link-all-results">All results</Link>}>
            {data.games.length ? <div className="space-y-3">{data.games.slice(0, 3).map((g) => <GameRow key={g.id} g={g} />)}</div>
              : <Empty title="No finals yet" body="The first scanned sheet puts this league on the board." />}
          </Section>
          {data.movers.length > 0 && (
            <More title="Biggest movers" hint="Late Ice Rating, latest games" count={data.movers.length} testid="button-more-movers">
              <Movers movers={data.movers} />
            </More>
          )}
        </>
      )}
    </div>
  );
}

function LastResult({ slot }: { slot: MeSlot }) {
  const g = slot.last!;
  const home = g.home_team_id === slot.team_id;
  const mine = home ? g.home_score : g.away_score, theirs = home ? g.away_score : g.home_score;
  const res = mine > theirs ? "W" : mine < theirs ? "L" : "T";
  const opp = home ? { id: g.away_team_id, name: g.away_name, color: g.away_color, logo: g.away_logo } : { id: g.home_team_id, name: g.home_name, color: g.home_color, logo: g.home_logo };
  const delta = g.after !== null && g.before !== null ? g.after - g.before : null;
  const dressed = g.goals !== null;
  return (
    <Link href={`/game/${g.id}`} className="card p-4 block min-w-0" data-testid="card-last-result">
      <span className="block label">Last game · {fmtDate(g.played_on)}</span>
      <span className={`block font-display text-[32px] leading-none tnum mt-2 ${res === "W" ? "up" : res === "L" ? "down" : ""}`}>{res} {mine}-{theirs}</span>
      <span className="block text-sm truncate mt-1">vs {opp.name}</span>
      <span className="block text-xs text-[var(--mute)] truncate">{delta !== null ? <>Rating {fmtRating(g.after)} <Delta d={delta} className="text-xs" /></> : dressed ? (g.is_goalie ? "In goal" : `${g.goals} G, ${g.assists} A${g.pim ? `, ${g.pim} PIM` : ""}`) : g.source !== "sheet" ? "From DaySmart" : "You weren't on the sheet"}</span>
    </Link>
  );
}

function Movers({ movers }: { movers: any[] }) {
  return (
    <div className="divide-y divide-[var(--line)]">
      {movers.map((m, i) => (
        <Link key={m.id + "-" + i} href={`/player/${m.id}`} className="flex items-center gap-3 px-4 py-3 min-h-[48px]" data-testid={`row-mover-${m.id}`}>
          <span className="w-5 text-center font-display text-lg text-[var(--mute)]">{i + 1}</span>
          <span className="flex-1 font-bold truncate">{m.name}</span>
          <span className="tnum text-[var(--mute)] text-sm">{fmtRating(m.after)}</span>
          <Delta d={m.delta} className="w-16 text-right text-sm" />
        </Link>
      ))}
    </div>
  );
}

/** Signed out, or signed in without a team yet: what Late Ice is, the scan button, and the rink's latest. */
function Welcome({ place, data, isLoading, pending, signedIn }: { place: string; data?: Feed; isLoading: boolean; pending: any[]; signedIn: boolean }) {
  return (
    <div>
      <div className="rise">
        <div className="label">{place}</div>
        <h1 className="font-display text-[clamp(34px,11.5vw,44px)] leading-[0.95] font-black uppercase mt-1">Every game counts.<br /><span className="text-[var(--red)]">Even the 11:15.</span></h1>
      </div>
      <Link href="/scan" className="card-hi mt-5 p-5 flex items-center gap-4 rise" data-testid="card-scan-cta" style={{ animationDelay: ".05s" }}>
        <span className="h-14 w-14 rounded-2xl flex items-center justify-center shrink-0" style={{ background: "var(--red-dim)" }}><FaceoffDot size={34} /></span>
        <span className="flex-1">
          <span className="block font-black text-[17px]">Just played? Snap the sheet.</span>
          <span className="block text-sm text-[var(--mute)] mt-0.5">One photo. We read every goal, assist and penalty. No typing.</span>
        </span>
        <span aria-hidden="true">›</span>
      </Link>
      {!signedIn && (
        <Link href="/join" className="card mt-3 px-4 min-h-[56px] flex items-center gap-3" data-testid="link-home-join">
          <span className="flex-1"><span className="block font-bold text-[15px]">Join your team</span><span className="block text-xs text-[var(--mute)]">Your schedule, your line and your rating, in two minutes.</span></span>
          <span className="text-[var(--mute)]" aria-hidden="true">›</span>
        </Link>
      )}
      {pending.map((p) => (
        <Link key={p.id} href={`/sheet/${p.id}`} className="card mt-3 p-3 flex items-center gap-3" data-testid={`link-pending-${p.id}`}>
          <span className="h-2.5 w-2.5 rounded-full bg-[var(--amber)]" />
          <span className="text-sm flex-1">A scanned sheet is waiting for a quick check</span>
          <span className="text-sm font-bold text-[var(--amber)]">Review</span>
        </Link>
      ))}
      {isLoading ? <HomeFeedSkeleton /> : data && (
        <>
          <Section title="Latest finals" action={<Link href="/leagues" className="text-sm text-[var(--mute)] min-h-[40px] inline-flex items-center" data-testid="link-all-standings">Standings</Link>}>
            {data.games.length ? (
              <div className="space-y-3">{data.games.slice(0, 3).map((g) => <GameRow key={g.id} g={g} />)}</div>
            ) : (
              <Empty
                title={data.leaders.length ? "No sheets scanned yet" : "No games on the books yet"}
                body={data.leaders.length ? "Standings and point totals so far are imported from the rink's stats page. The first scanned sheet adds goals, times and ratings." : "The first person to scan a sheet puts this league on the board."}
                action={<Link href="/scan" className="btn btn-red" data-testid="button-empty-scan">Scan a sheet</Link>}
              />
            )}
          </Section>
          {data.movers.length > 0 && <More title="Biggest movers" hint="Late Ice Rating, latest games" count={data.movers.length} testid="button-more-movers"><Movers movers={data.movers} /></More>}
          {data.leaders.length > 0 && <More title="Points leaders" count={data.leaders.length} testid="button-more-leaders">
            <div className="divide-y divide-[var(--line)]">
              {data.leaders.map((p, i) => (
                <Link key={p.id + "-" + p.team_id} href={`/player/${p.id}`} className="flex items-center gap-3 px-4 py-3" data-testid={`row-leader-${p.id}`}>
                  <span className="w-5 text-center font-display text-lg text-[var(--mute)]">{i + 1}</span>
                  <span className="flex-1 min-w-0"><span className="block font-bold truncate">{p.name}</span><span className="block text-xs text-[var(--mute)] truncate">{p.team}</span></span>
                  <span className="tnum text-sm text-[var(--mute)]">{p.g}G {p.a}A</span>
                  <span className="tnum font-display text-xl w-8 text-right">{p.pts}</span>
                </Link>
              ))}
            </div>
          </More>}
        </>
      )}
    </div>
  );
}
