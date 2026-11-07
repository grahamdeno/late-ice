"use client";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { act, useMe } from "@/lib/auth";
import { Link } from "@/lib/router";
import { BackBar, Delta, FaceoffDot, LevelPill, Loading, TeamBadge, fmtDate, img } from "@/lib/ui";
import { Stars } from "@/components/Stars";
import { ShareCard } from "@/components/ShareCard";

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
  const periods = Math.max(3, (g.periods.home || []).length);
  const imported = g.source === "daysmart";

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

      <div className="hero p-5">
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
        {!imported && <table className="w-full mt-5 text-sm tnum">
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
        </table>}
      </div>

      {imported && (
        <>
          <p className="text-[11px] text-[var(--mute)] mt-3 px-1" data-testid="text-imported-game">
            {g.lineupTeams?.length
              ? "From DaySmart, with the lineup from the team's poll, so this game is rated for that team. DaySmart has no times, penalties or shots. Scan the sheet to add the rest."
              : "From DaySmart. It records the score and who was credited with goals and assists, but no times, penalties, shots or lineups, so this game isn't rated. Scan the sheet to add the rest."}
          </p>
          {sides.map((s) => {
            const rows = g.imported.filter((l: any) => l.team_id === s.team.id);
            const un = g.unassigned?.[s.key] ?? 0;
            return (
              <div key={s.key} className="card mt-3 overflow-hidden">
                <div className="px-4 py-2.5 border-b border-[var(--line)] font-bold flex items-center gap-2"><TeamBadge team={s.team} size={22} />{s.team.name}<span className="ml-auto font-display text-xl tnum">{s.score}</span></div>
                <div className="divide-y divide-[var(--line)]">
                  {rows.map((l: any) => (
                    <Link key={l.player_id} href={`/player/${l.player_id}`} className="flex items-center gap-3 px-4 py-2.5 text-sm" data-testid={`row-imported-${l.player_id}`}>
                      <span className="flex-1 truncate font-medium">{l.name}</span>
                      <span className="tnum text-[var(--mute)]">{l.goals}G {l.assists}A</span>
                    </Link>
                  ))}
                  {un > 0 && <div className="px-4 py-2.5 text-xs text-[var(--mute)]">{un} {un === 1 ? "goal" : "goals"} with no scorer recorded</div>}
                  {!rows.length && !un && <div className="px-4 py-2.5 text-xs text-[var(--mute)]">No scoring recorded.</div>}
                </div>
              </div>
            );
          })}
          <Stars g={g} />
        </>
      )}

      <div className="mt-5"><ShareCard kind="game" id={g.id} title={`${g.home.name} ${g.homeScore}-${g.awayScore} ${g.away.name}`} label="Share this result" /></div>

      {!imported && <>

      <Stars g={g} />

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

      </>}

      {g.sheetId && (
        <a href={img(`/api/sheets/${g.sheetId}/image`)} target="_blank" rel="noreferrer" className="card mt-4 p-3 flex items-center gap-3" data-testid="link-source-sheet">
          <img src={img(`/api/sheets/${g.sheetId}/image`)} alt="Original scoresheet" className="h-14 w-20 object-cover object-top rounded-lg" />
          <div className="flex-1"><div className="font-bold text-sm">Source scoresheet</div><div className="text-xs text-[var(--mute)]">Every stat on this page came from this photo</div></div>
        </a>
      )}
      {g.goalies && (g.goalies.reports.length > 0 || g.goalies.canSubmit) && <GoalieNumbers g={g} />}
      <ReportMistake gameId={Number(id)} />
    </div>
  );
}

/** Something wrong on this game? Tell rink staff, who fix it and send a notice back. */
function ReportMistake({ gameId }: { gameId: number }) {
  const { me } = useMe();
  const [open, setOpen] = useState(false);
  const [kind, setKind] = useState("points");
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  if (!me) return null;
  if (done) return <p className="text-sm text-[var(--mute)] mt-6 px-1" data-testid="text-report-sent">Thanks. Rink staff will check it and you'll get a notice when it's sorted.</p>;
  if (!open) return <button className="mt-6 px-1 text-sm text-[var(--mute)] underline underline-offset-4" onClick={() => setOpen(true)} data-testid="button-report-mistake">Something wrong on this game? Report a mistake</button>;
  const send = async () => {
    setBusy(true);
    const e = await act("POST", `/api/games/${gameId}/report`, { kind, body: text }, []);
    setBusy(false);
    if (e) setErr(e); else setDone(true);
  };
  return (
    <div className="card mt-6 p-4" data-testid="card-report-mistake">
      <div className="font-bold">Report a mistake</div>
      <div className="flex gap-2 mt-3 flex-wrap">
        {([["score", "The score"], ["points", "A goal or assist"], ["lineup", "Who played"], ["other", "Something else"]] as const).map(([k, label]) => (
          <button key={k} className="chip" data-active={kind === k} onClick={() => setKind(k)} data-testid={`chip-report-${k}`}>{label}</button>
        ))}
      </div>
      <textarea className="input w-full h-24 mt-3 py-2.5" value={text} onChange={(e) => setText(e.target.value)} maxLength={600}
        placeholder="What's wrong, and what should it be? For example: #12 had the second goal, not #19." data-testid="input-report-body" />
      {err && <p className="text-sm down mt-2">{err}</p>}
      <div className="flex gap-2 mt-3">
        <button className="btn btn-red h-10 px-4 text-sm" onClick={send} disabled={busy || text.trim().length < 5} data-testid="button-report-send">{busy ? "Sending…" : "Send to rink staff"}</button>
        <button className="btn btn-ghost h-10 px-4 text-sm" onClick={() => setOpen(false)}>Cancel</button>
      </div>
    </div>
  );
}

const STATUS_TEXT: Record<string, string> = {
  verified: "Confirmed by the other team",
  pending: "Waiting on the other team's captain",
  unverified: "Not confirmed, counts at half weight",
  disputed: "The other team gave a different number. Staff will settle it.",
};

/** Goalie shots against: the goalie enters, the other team's captain confirms. */
function GoalieNumbers({ g }: { g: any }) {
  const { reports, canSubmit, myShots } = g.goalies;
  const [shots, setShots] = useState<string>(myShots != null ? String(myShots) : "");
  const [counter, setCounter] = useState<Record<number, string>>({});
  const [err, setErr] = useState<string | null>(null);
  const keys = [`/api/games/${g.id}`, "/api/players"];
  const teamName = (id: number) => (id === g.home.id ? g.home.name : g.away.name);
  return (
    <section className="mt-8" data-testid="section-goalie-numbers">
      <h2 className="text-[18px] font-black px-1 mb-3">Goalie numbers</h2>
      <div className="card divide-y divide-[var(--line)]">
        {reports.map((r: any) => (
          <div key={r.id} className="p-4" data-testid={`row-goalie-${r.id}`}>
            <div className="flex items-center gap-3">
              <span className="flex-1 min-w-0">
                <span className="block font-bold text-sm truncate">{r.name} <span className="text-[var(--mute)] font-medium">· {teamName(r.team_id)}</span></span>
                <span className="block text-xs text-[var(--mute)]">{STATUS_TEXT[r.status] ?? r.status}</span>
              </span>
              <span className="text-right tnum">
                <span className="block font-display text-xl">{r.savePct != null ? r.savePct.toFixed(3).replace(/^0/, "") : "–"}</span>
                <span className="block text-[11px] text-[var(--mute)]">{r.shots_against - r.goals_against} saves on {r.shots_against}</span>
              </span>
            </div>
            {r.canAnswer && (
              <div className="mt-3 space-y-2">
                <p className="text-xs text-[var(--mute)]">Does {r.shots_against} shots on goal look right for your team?</p>
                <div className="grid grid-cols-2 gap-2">
                  <button className="btn btn-ghost h-11 text-sm" onClick={async () => setErr(await act("POST", `/api/goalie-reports/${r.id}`, { answer: "agree" }, keys))} data-testid={`button-goalie-agree-${r.id}`}>Agree</button>
                  <button className="btn btn-ghost h-11 text-sm" onClick={async () => setErr(await act("POST", `/api/goalie-reports/${r.id}`, { answer: "unsure" }, keys))} data-testid={`button-goalie-unsure-${r.id}`}>Not sure</button>
                </div>
                <form className="flex gap-2" onSubmit={async (e) => { e.preventDefault(); setErr(await act("POST", `/api/goalie-reports/${r.id}`, { answer: "differ", counter: Number(counter[r.id]) }, keys)); }}>
                  <input className="input flex-1" inputMode="numeric" placeholder="Your count" aria-label="Your shots count" value={counter[r.id] ?? ""} onChange={(e) => setCounter({ ...counter, [r.id]: e.target.value.replace(/\D/g, "") })} />
                  <button className="btn btn-ghost h-11 text-sm" disabled={!counter[r.id]} data-testid={`button-goalie-differ-${r.id}`}>Different number</button>
                </form>
              </div>
            )}
          </div>
        ))}
        {canSubmit && (
          <form className="p-4 space-y-2" onSubmit={async (e) => { e.preventDefault(); setErr(await act("POST", `/api/games/${g.id}/goalie`, { shots: Number(shots) }, keys)); }} data-testid="form-goalie-submit">
            <label className="block text-sm font-bold" htmlFor="goalie-shots">{myShots != null ? "Change your shots against" : "You were in goal? Enter shots against"}</label>
            <p className="text-xs text-[var(--mute)]">Goals against come from the score. The other team's captain confirms your number.</p>
            <div className="flex gap-2">
              <input id="goalie-shots" className="input flex-1" inputMode="numeric" placeholder="Shots on goal" value={shots} onChange={(e) => setShots(e.target.value.replace(/\D/g, ""))} data-testid="input-goalie-shots" />
              <button className="btn btn-red h-11" disabled={!shots} data-testid="button-goalie-submit">Send</button>
            </div>
          </form>
        )}
      </div>
      {err && <p className="text-sm down mt-2 px-1" data-testid="text-goalie-error">{err}</p>}
    </section>
  );
}

function toSec(t: string | null) {
  if (!t) return 0;
  const [m, s] = t.split(":").map(Number);
  return (m || 0) * 60 + (s || 0);
}
