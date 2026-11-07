"use client";
import { useQuery } from "@tanstack/react-query";
import { CaptainPanel } from "@/components/CaptainPanel";
import { ShotMap } from "@/components/ShotMap";
import { Schedule } from "@/components/Schedule";
import { AddButton, AddTeamForm } from "@/components/ManageForms";
import { ArchetypeChip, ArchetypeVotes, ArchetypeOverride } from "@/components/Archetypes";
import { Bobble } from "@/components/Bobble";
import { TeamTournaments } from "@/views/Event";
import { act, useMe } from "@/lib/auth";
import { useLocation } from "@/lib/router";
import { Link } from "@/lib/router";
import { useState } from "react";
import { BackBar, Empty, GameRow, LevelPill, Loading, More, Section, StandingsSkeleton, TeamBadge, fmtDate, fmtRating, useFilter } from "@/lib/ui";

function StandingsTable({ rows, compact = false, mine = [] }: { rows: any[]; compact?: boolean; mine?: number[] }) {
  return (
    <table className="w-full text-sm tnum table-fixed">
      <thead>
        <tr className="text-[var(--mute)] text-xs">
          <th className="text-left font-medium py-2 pl-4">Team</th>
          <th className="font-medium w-7">GP</th>
          <th className="font-medium w-[52px]">W-L-T</th>
          {!compact && <th className="font-medium w-9">DIFF</th>}
          <th className="font-medium w-11 pr-4 text-right">PTS</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((t, i) => (
          <tr key={t.id} className={`border-t border-[var(--line)] ${mine.includes(t.id) ? "bg-[var(--red-dim)]" : ""}`} data-mine={mine.includes(t.id) || undefined}>
            <td className="py-0.5 pl-4 overflow-hidden">
              <Link href={`/team/${t.id}`} className="flex items-center gap-2 min-w-0 min-h-[44px]" data-testid={`link-standings-team-${t.id}`}>
                <span className="w-4 shrink-0 text-[var(--mute)] text-xs">{i + 1}</span>
                <TeamBadge team={t} size={24} />
                <span className="truncate font-bold min-w-0">{t.name}</span>
              </Link>
            </td>
            <td className="text-center text-[var(--mute)]">{t.gp}</td>
            <td className="text-center">{t.w}-{t.l}-{t.t}</td>
            {!compact && <td className={`text-center ${t.diff > 0 ? "up" : t.diff < 0 ? "down" : "text-[var(--mute)]"}`}>{t.diff == null ? "–" : `${t.diff > 0 ? "+" : ""}${t.diff}`}</td>}
            <td className="text-right pr-4 font-display text-lg">{t.pts}</td>
          </tr>
        ))}
      </tbody>
      {!compact && (
        <tfoot>
          <tr><td colSpan={5} className="px-4 pt-3 pb-1 text-xs text-[var(--mute)] text-left font-sans">GP games played · W-L-T wins, losses, ties · DIFF goals for minus goals against · PTS 2 for a win, 1 for a tie</td></tr>
        </tfoot>
      )}
    </table>
  );
}

function LeagueCard({ league, mine }: { league: any; mine: number[] }) {
  const rows = league.standings ?? [];
  const gp = rows.reduce((a: number, t: any) => a + t.gp, 0) / 2;
  return (
    <div className="card overflow-hidden" data-testid={`card-league-${league.id}`}>
      <Link href={`/league/${league.id}`} className="flex items-center justify-between px-4 pt-4 pb-2 min-h-[48px]" data-testid={`link-league-${league.level}`}>
        <div className="flex items-center gap-2"><LevelPill level={league.level === "DEMO" ? "Demo" : league.level} /><span className="font-black">{league.name}</span></div>
        <span className="text-xs text-[var(--mute)]">{gp} games · Leaders and results ›</span>
      </Link>
      <StandingsTable rows={rows} mine={mine} />
    </div>
  );
}

/** One league as a closed row: name and who leads. Opens in place to the full table. */
function LeagueRow({ league }: { league: any }) {
  const [open, setOpen] = useState(false);
  const rows = league.standings ?? [];
  const leader = rows[0];
  return (
    <div className="card overflow-hidden mt-2" data-testid={`row-league-${league.id}`}>
      <button type="button" onClick={() => setOpen((o) => !o)} aria-expanded={open} className="w-full min-h-[52px] px-4 py-3 flex items-center gap-3 text-left" data-testid={`button-open-league-${league.level}`}>
        <LevelPill level={league.level} />
        <span className="flex-1 min-w-0">
          <span className="block font-bold truncate">{league.name}</span>
          <span className="block text-xs text-[var(--mute)] truncate">{leader && leader.gp > 0 ? `1st: ${leader.name}, ${leader.pts} pts` : `${rows.length} teams`}</span>
        </span>
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" aria-hidden="true" style={{ transform: open ? "rotate(180deg)" : "", transition: "transform .2s", color: "var(--mute)" }}><path d="M6 9l6 6 6-6" /></svg>
      </button>
      {open && (
        <div className="border-t border-[var(--line)]">
          <StandingsTable rows={rows} compact />
          <Link href={`/league/${league.id}`} className="flex items-center justify-center min-h-[44px] text-sm font-bold text-[var(--blue)] border-t border-[var(--line)]">Leaders and results</Link>
        </div>
      )}
    </div>
  );
}

/** Standings answers "where is my team" first: your league open, your team marked; other leagues one tap away. */
export function Leagues() {
  const { boot, leagueId } = useFilter();
  const { me } = useMe();
  const rinkId = boot?.rink?.id ?? null;
  const seasonId = boot?.season?.id ?? null;
  const key = rinkId ? `/api/standings?rink=${rinkId}${seasonId ? `&season=${seasonId}` : ""}` : "/api/standings";
  const { data } = useQuery<any>({ queryKey: [key], enabled: !!rinkId });
  if (!boot || (rinkId && !data)) return <StandingsSkeleton />;
  const all = (data?.leagues ?? []).filter((l: any) => l.level !== "DEMO" && l.level !== "TOURN");
  const myTeams = (me?.slots ?? []).map((s) => s.team_id);
  const myLeagues = new Set((me?.slots ?? []).map((s) => s.league_id));
  // Open: the league picked in the top sheet, else the leagues you play in, else the first one.
  const open = leagueId ? all.filter((l: any) => l.id === leagueId) : all.filter((l: any) => myLeagues.has(l.id));
  const first = open.length ? open : all.slice(0, 1);
  const rest = all.filter((l: any) => !first.includes(l));
  return (
    <div>
      <div className="label">{boot.rink?.name} · {boot.season?.name}</div>
      <h1 className="text-[28px] leading-tight font-black mt-1">Standings</h1>
      <div className="space-y-3 mt-3">{first.map((l: any) => <LeagueCard key={l.id} league={l} mine={myTeams} />)}</div>
      {rest.length > 0 && (
        <>
          <div className="label px-1 mt-6 mb-1">Other leagues at {boot.rink?.name}</div>
          {rest.map((l: any) => <LeagueRow key={l.id} league={l} />)}
        </>
      )}
      <p className="text-xs text-[var(--mute)] mt-4 px-1">Two points a win, one a tie. Standings reset every season; ratings carry over.</p>
    </div>
  );
}

export function LeaguePage({ id }: { id: string }) {
  const [seasonId, setSeasonId] = useState<number | null>(null);
  const [adding, setAdding] = useState(false);
  const { data, error } = useQuery<any>({ queryKey: [seasonId ? `/api/leagues/${id}?season=${seasonId}` : `/api/leagues/${id}`] });
  if (!data) return <Loading error={error} />;
  const { league, season, seasons } = data;
  const can = data.can ?? {};
  return (
    <div>
      <BackBar href="/leagues" to="Standings" />
      <div className="flex items-center gap-2"><LevelPill level={league.level === "DEMO" ? "Demo" : league.level} /><span className="label">{season?.name}</span></div>
      <h1 className="font-display text-[40px] leading-none font-black uppercase mt-2">{league.name}</h1>
      <p className="text-sm text-[var(--mute)] mt-2">{league.blurb}</p>
      {seasons.length > 1 && (
        <div className="flex gap-2 mt-4 overflow-x-auto scrollbar-none">
          {seasons.map((s: any) => (
            <button key={s.id} className="chip" data-active={(seasonId ?? season?.id) === s.id} onClick={() => setSeasonId(s.id)} data-testid={`chip-season-${s.id}`}>{s.name}</button>
          ))}
        </div>
      )}
      <div className="flex items-center justify-end mt-4 min-h-[20px]">
        {!adding && (can.addTeam ? <AddButton label="Team" onClick={() => setAdding(true)} testid="button-league-add-team" />
          : data.signedIn ? <button className="text-sm text-[var(--blue)] font-bold" onClick={() => setAdding(true)} data-testid="button-start-team">Start a team</button> : null)}
      </div>
      {adding && <div className="mt-2"><AddTeamForm leagueId={league.id} leagueName={league.name} request={!can.addTeam} onDone={() => setAdding(false)} /></div>}
      <div className="card overflow-hidden mt-2"><StandingsTable rows={data.standings} /></div>
      {data.imported && (
        <p className="text-xs text-[var(--mute)] mt-2 px-1" data-testid="text-imported-note">
          Includes {data.imported.gp / 2} games imported from the {data.imported.source}, as of {fmtDate(data.imported.as_of)}. Goal totals start with the first scanned sheet.
        </p>
      )}
      <div className="grid grid-cols-2 gap-2 mt-3">
        {data.standings.slice(0, 4).map((t: any) => (
          <Link key={t.id} href={`/team/${t.id}`} className="card p-3" data-testid={`card-team-rating-${t.id}`}>
            <div className="label truncate">{t.name}</div>
            <div className="font-display text-2xl mt-1 tnum">{fmtRating(t.rating)}</div>
            <div className="text-xs text-[var(--mute)]">Team strength, from results</div>
          </Link>
        ))}
      </div>
      <Section title="Scoring leaders">
        {data.leaders.length ? (
          <div className="card divide-y divide-[var(--line)]">
            {data.leaders.map((p: any, i: number) => (
              <Link key={p.id} href={`/player/${p.id}`} className="flex items-center gap-3 p-3.5" data-testid={`row-league-leader-${p.id}`}>
                <span className="w-5 text-center font-display text-lg text-[var(--mute)]">{i + 1}</span>
                <span className="flex-1 min-w-0"><span className="block font-bold truncate">{p.name}</span><span className="block text-xs text-[var(--mute)] truncate">{p.team}</span></span>
                <span className="tnum text-sm text-[var(--mute)]">{p.g}G {p.a}A</span>
                <span className="font-display text-xl w-8 text-right">{p.pts}</span>
              </Link>
            ))}
          </div>
        ) : <Empty title="No points yet" body="Leaders show up after the first sheet in this league is scanned." />}
      </Section>
      <Section title="Results">
        {data.games.length ? <div className="space-y-3">{data.games.map((g: any) => <GameRow key={g.id} g={g} />)}</div>
          : <Empty title="No results yet" body="Scan a sheet from this league to start the season." action={<Link href="/scan" className="btn btn-red">Scan a sheet</Link>} />}
      </Section>
    </div>
  );
}

export function TeamPage({ id }: { id: string }) {
  const { data, error } = useQuery<any>({ queryKey: [`/api/teams/${id}`] });
  const [, , swap] = useLocation();
  const [removeErr, setRemoveErr] = useState<string | null>(null);
  if (!data) return <Loading error={error} />;
  const { team, league, record, roster, games, rating, season, imported } = data;
  return (
    <div>
      <BackBar href={`/league/${league.id}`} to={league.name} />
      <div className="hero p-5" style={{ ["--team" as any]: team.color || undefined }}>
        <div className="flex items-center gap-4">
          <TeamBadge team={team} size={64} />
          <div className="min-w-0">
            <div className="flex items-center gap-2"><LevelPill level={league.level === "DEMO" ? "Demo" : league.level} /><span className="label">{season?.name ?? "Polar Ice"}</span></div>
            <h1 className="font-black text-2xl leading-tight mt-1" data-testid="text-team-name">{team.name}</h1>
          </div>
        </div>
        <div className="grid grid-cols-4 gap-2 mt-5 text-center">
          {[["Record", `${record.w}-${record.l}-${record.t}`], ["Points", record.pts], ["GF-GA", record.gf != null && record.gp ? `${record.gf}-${record.ga}` : "–"], ["Strength", fmtRating(rating)]].map(([k, v]) => (
            <div key={k as string} className="tile py-2.5">
              <div className="font-display text-xl tnum">{v}</div>
              <div className="text-xs text-[var(--mute)] font-bold">{k}</div>
            </div>
          ))}
        </div>
      </div>
      {team.is_sample ? (
        <div className="mt-3 text-xs text-[var(--mute)] px-1" data-testid="text-sample-team">Placeholder team name. Real team names replace these as sheets come in.</div>
      ) : imported ? (
        <div className="mt-3 text-xs text-[var(--mute)] px-1" data-testid="text-imported-team">Record and totals include {imported.gp} games imported from the {imported.source} as of {fmtDate(imported.as_of)}. Ratings start moving with the first scanned sheet.</div>
      ) : null}
      <CaptainPanel team={team} captain={data.captain} assistants={data.assistants} />
      <Schedule teamId={team.id} />
      <Section title="Roster" action={<span className="label">{roster.filter((p: any) => !p.is_sub).length} players</span>}>
        {roster.length ? (
          <div className="card divide-y divide-[var(--line)]">
            {roster.filter((p: any) => !p.is_sub).map((p: any) => (
              <Link key={p.id} href={`/player/${p.id}`} className="flex items-center gap-3 px-4 py-2.5 min-h-[56px]" data-testid={`row-roster-${p.id}`}>
                <Bobble avatar={p.avatar} jersey={team.color} archetype={data.archetypes?.won?.[p.id]?.archetype} goalie={p.position === "G"} size={32} />
                <span className="flex-1 min-w-0">
                  <span className="flex items-center gap-1.5 min-w-0">
                    <span className="tnum text-[var(--mute)] text-sm shrink-0">{p.number ? `#${p.number}` : ""}</span>
                    <span className="truncate font-bold text-sm">{p.name}</span>
                    {p.badge ? <span className="shrink-0 inline-flex h-4 w-4 rounded-full bg-[var(--ice-3)] border border-[var(--line)] text-[9px] font-black items-center justify-center" title={p.badge === "C" ? "Captain" : "Assistant captain"} data-testid={`badge-${p.badge}-${p.id}`}>{p.badge}</span> : null}
                  </span>
                  <span className="block text-xs text-[var(--mute)] truncate">
                    {p.position === "G" ? "Goalie · " : ""}{p.gp} GP · {p.g} G · {p.a} A{p.registered ? " · Registered" : ""}<ArchetypeChip a={data.archetypes?.won?.[p.id]} />
                  </span>
                </span>
                <span className="tnum font-display text-lg w-12 text-right">{fmtRating(p.rating)}</span>
              </Link>
            ))}
          </div>
        ) : <Empty title="Roster fills itself" body="Players are added straight from the scoresheet the first time this team's game is scanned." />}
        {roster.some((p: any) => p.is_sub) && (
          <p className="text-xs text-[var(--mute)] mt-2 px-1" data-testid="text-subs">Subs this season: {roster.filter((p: any) => p.is_sub).map((p: any) => p.name).join(", ")}. Their games count for them, not as roster spots.</p>
        )}
      </Section>
      <More title="Games" hint="Every final this season" count={games.length} testid="button-more-games">
        {games.length ? <div className="space-y-3 p-3">{games.map((g: any) => <GameRow key={g.id} g={g} />)}</div> : <div className="p-4 text-sm text-[var(--mute)]">No games yet. Snap the sheet after this team's next game.</div>}
      </More>
      <More title="Player types" hint="Sniper, grinder, playmaker: what teammates say each player is" testid="button-more-archetypes"><div className="px-3 pb-3"><ArchetypeVotes teamId={team.id} roster={roster} data={data.archetypes} />{data.can?.overrideArchetype && <ArchetypeOverride teamId={team.id} roster={roster} data={data.archetypes} />}</div></More>
      <More title="Where the goals come from" hint="Shot map from scanned sheets" testid="button-more-shotmap"><div className="px-3 pb-3"><ShotMap teamId={team.id} /></div></More>
      <More title="Tournaments" testid="button-more-tournaments"><div className="px-3 pb-3"><TeamTournaments teamId={team.id} canManage={!!data.can?.manageRoster} /></div></More>
      {data.can?.remove && (
        <div className="mt-8 text-center">
          <button className="text-xs text-[var(--mute)] underline" onClick={async () => { if (!confirm(`Remove ${team.name}? It has no games or players, so nothing else changes.`)) return; const e = await act("DELETE", `/api/teams/${team.id}`, undefined, ["/api/teams", "/api/leagues", "/api/standings", "/api/bootstrap", "/api/feed", "/api/players"]); setRemoveErr(e); if (!e) swap(`/league/${league.id}`); }} data-testid="button-remove-team">Remove this team</button>
          {removeErr && <p className="text-xs down mt-1">{removeErr}</p>}
        </div>
      )}
    </div>
  );
}
