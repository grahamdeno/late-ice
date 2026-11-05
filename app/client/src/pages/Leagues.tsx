import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import { useState } from "react";
import { BackBar, Empty, GameRow, LevelPill, Loading, Section, TeamBadge, fmtDate, fmtRating, useFilter } from "@/lib/ui";

function StandingsTable({ rows, compact = false }: { rows: any[]; compact?: boolean }) {
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
          <tr key={t.id} className="border-t border-[var(--line)]">
            <td className="py-2.5 pl-4 overflow-hidden">
              <Link href={`/team/${t.id}`} className="flex items-center gap-2 min-w-0" data-testid={`link-standings-team-${t.id}`}>
                <span className="w-4 shrink-0 text-[var(--mute)] text-xs">{i + 1}</span>
                <TeamBadge team={t} size={24} />
                <span className="truncate font-bold min-w-0">{t.name}</span>
              </Link>
            </td>
            <td className="text-center text-[var(--mute)]">{t.gp}</td>
            <td className="text-center">{t.w}-{t.l}-{t.t}</td>
            {!compact && <td className={`text-center ${t.diff > 0 ? "up" : t.diff < 0 ? "down" : "text-[var(--mute)]"}`}>{t.diff > 0 ? "+" : ""}{t.diff}</td>}
            <td className="text-right pr-4 font-display text-lg">{t.pts}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function LeagueCard({ id }: { id: number }) {
  const { data } = useQuery<any>({ queryKey: [`/api/leagues/${id}`] });
  if (!data) return <div className="card h-40" />;
  const gp = data.standings.reduce((a: number, t: any) => a + t.gp, 0) / 2;
  return (
    <div className="card overflow-hidden">
      <Link href={`/league/${id}`} className="flex items-center justify-between px-4 pt-4 pb-2" data-testid={`link-league-${data.league.level}`}>
        <div className="flex items-center gap-2"><LevelPill level={data.league.level === "DEMO" ? "Demo" : data.league.level} /><span className="font-black">{data.league.name}</span></div>
        <span className="text-xs text-[var(--mute)]">{gp} games ›</span>
      </Link>
      <StandingsTable rows={data.standings} compact />
    </div>
  );
}

export function Leagues() {
  const { boot } = useFilter();
  if (!boot) return <Loading />;
  return (
    <div>
      <div className="label">Polar Ice Wilmington · {boot.season?.name}</div>
      <h1 className="font-display text-[40px] leading-none font-black uppercase mt-1">Standings</h1>
      <p className="text-sm text-[var(--mute)] mt-2">Two points a win, one a tie. Standings reset every season; ratings carry over.</p>
      <div className="space-y-3 mt-5">{boot.leagues.map((l) => <LeagueCard key={l.id} id={l.id} />)}</div>
    </div>
  );
}

export function LeaguePage({ id }: { id: string }) {
  const [seasonId, setSeasonId] = useState<number | null>(null);
  const { data } = useQuery<any>({ queryKey: [seasonId ? `/api/leagues/${id}?season=${seasonId}` : `/api/leagues/${id}`] });
  if (!data) return <Loading />;
  const { league, season, seasons } = data;
  return (
    <div>
      <BackBar href="/leagues" title="Standings" />
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
      <div className="card overflow-hidden mt-5"><StandingsTable rows={data.standings} /></div>
      {data.imported && (
        <p className="text-[11px] text-[var(--mute)] mt-2 px-1" data-testid="text-imported-note">
          Includes {data.imported.gp / 2} games imported from the {data.imported.source}, as of {fmtDate(data.imported.as_of)}. Goal totals start with the first scanned sheet.
        </p>
      )}
      <div className="grid grid-cols-2 gap-2 mt-3">
        {data.standings.slice(0, 4).map((t: any) => (
          <Link key={t.id} href={`/team/${t.id}`} className="card p-3" data-testid={`card-team-rating-${t.id}`}>
            <div className="label truncate">{t.name}</div>
            <div className="font-display text-2xl mt-1 tnum">{fmtRating(t.rating)}</div>
            <div className="text-[11px] text-[var(--mute)]">Team rating (roster avg)</div>
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
  const { data } = useQuery<any>({ queryKey: [`/api/teams/${id}`] });
  if (!data) return <Loading />;
  const { team, league, record, roster, games, rating, season, imported } = data;
  return (
    <div>
      <BackBar href={`/league/${league.id}`} title={league.name} />
      <div className="card-hi p-5 overflow-hidden relative">
        <div className="absolute -right-10 -top-10 h-40 w-40 rounded-full opacity-20" style={{ background: team.color }} />
        <div className="flex items-center gap-4 relative">
          <TeamBadge team={team} size={64} />
          <div className="min-w-0">
            <div className="flex items-center gap-2"><LevelPill level={league.level === "DEMO" ? "Demo" : league.level} /><span className="label">{season?.name ?? "Polar Ice"}</span></div>
            <h1 className="font-black text-2xl leading-tight mt-1" data-testid="text-team-name">{team.name}</h1>
          </div>
        </div>
        <div className="grid grid-cols-4 gap-2 mt-5 text-center">
          {[["Record", `${record.w}-${record.l}-${record.t}`], ["Points", record.pts], ["GF-GA", record.scanned ? `${record.gf}-${record.ga}` : "–"], ["Rating", fmtRating(rating)]].map(([k, v]) => (
            <div key={k as string} className="rounded-xl bg-[var(--ice-3)] py-2.5">
              <div className="font-display text-xl tnum">{v}</div>
              <div className="text-[10px] label">{k}</div>
            </div>
          ))}
        </div>
      </div>
      {team.is_sample ? (
        <div className="mt-3 text-xs text-[var(--mute)] px-1" data-testid="text-sample-team">Placeholder team name. Real Wilmington team names replace these as sheets come in.</div>
      ) : imported ? (
        <div className="mt-3 text-xs text-[var(--mute)] px-1" data-testid="text-imported-team">Record and totals include {imported.gp} games imported from the {imported.source} as of {fmtDate(imported.as_of)}. Ratings start moving with the first scanned sheet.</div>
      ) : null}
      <Section title="Roster" action={<span className="label">{roster.length} players</span>}>
        {roster.length ? (
          <div className="card divide-y divide-[var(--line)]">
            {roster.map((p: any) => (
              <Link key={p.id} href={`/player/${p.id}`} className="flex items-center gap-3 px-4 py-3 text-sm" data-testid={`row-roster-${p.id}`}>
                <span className="tnum text-[var(--mute)] w-8">{p.number ? `#${p.number}` : ""}</span>
                <span className="flex-1 truncate font-bold">{p.name}{p.position === "G" && <span className="text-[var(--mute)] font-medium"> · G</span>}</span>
                <span className="tnum text-[var(--mute)]">{p.gp}GP {p.g}G {p.a}A</span>
                <span className="tnum font-display text-lg w-12 text-right">{fmtRating(p.rating)}</span>
              </Link>
            ))}
          </div>
        ) : <Empty title="Roster fills itself" body="Players are added straight from the scoresheet the first time this team's game is scanned." />}
      </Section>
      <Section title="Games">
        {games.length ? <div className="space-y-3">{games.map((g: any) => <GameRow key={g.id} g={g} />)}</div> : <Empty title="No games yet" body="Snap the sheet after this team's next game." />}
      </Section>
    </div>
  );
}
