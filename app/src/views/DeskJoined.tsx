"use client";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "@/lib/router";
import { apiRequest } from "@/lib/queryClient";
import { DeskFrame, Gate, RinkSwitch, day, useDeskRink } from "@/views/Desk";

/**
 * Who's joined: for each team, how much of the roster has signed up, who the captain is, and the
 * team's invite link. Staff see every team at the rink; captains see their own.
 */

type Team = {
  id: number; name: string; color: string | null; leagueId: number; level: string; league: string;
  roster: number; joined: number; lastJoined: string | null; captain: string | null; assistants: string[];
  invite: { uses: number; maxUses: number; createdAt: string } | null; step: "captain" | "link" | "joining" | "done";
};
type Data = { rink: { id: number; name: string }; teams: Team[]; totals: { teams: number; roster: number; joined: number; noCaptain: number; noLink: number } };

const STEP: Record<Team["step"], { label: string; tone: string }> = {
  captain: { label: "No captain", tone: "var(--down)" },
  link: { label: "No invite link yet", tone: "var(--amber)" },
  joining: { label: "Joining", tone: "var(--blue)" },
  done: { label: "Everyone's in", tone: "var(--up)" },
};

/** Invite links point at the app, not the desk. */
function appOrigin() {
  if (typeof window === "undefined") return "";
  const { protocol, host } = window.location;
  return `${protocol}//${host.replace(/^desk\./, "app.")}`;
}

export function DeskJoined() {
  return <Gate>{(overview) => <JoinedBody overview={overview} />}</Gate>;
}

export function JoinedBody({ overview }: { overview: any }) {
  const { rink, rinks, pick } = useDeskRink(overview);
  const key = `/api/desk/joined?rink=${rink?.id}`;
  const { data, error, refetch } = useQuery<Data>({ queryKey: [key], enabled: !!rink });
  const [filter, setFilter] = useState<"all" | "behind" | Team["step"]>("all");
  const [league, setLeague] = useState<number | "all">("all");
  const [copied, setCopied] = useState<number | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const leagues = useMemo(() => {
    const m = new Map<number, string>();
    for (const t of data?.teams ?? []) m.set(t.leagueId, t.level);
    return [...m.entries()];
  }, [data]);
  const pct = (t: { joined: number; roster: number }) => (t.roster ? t.joined / t.roster : 0);
  const rows = (data?.teams ?? [])
    .filter((t) => league === "all" || t.leagueId === league)
    .filter((t) => filter === "all" || (filter === "behind" ? t.step !== "done" && pct(t) < 0.5 : t.step === filter))
    .sort((a, b) => pct(a) - pct(b) || a.name.localeCompare(b.name));

  const copy = async (t: Team) => {
    setErr(null);
    try {
      const r = await (await apiRequest("POST", `/api/teams/${t.id}/invite`)).json();
      const url = `${appOrigin()}${r.invite.path ?? `/join?invite=${r.invite.token}`}`;
      await navigator.clipboard.writeText(url);
      setCopied(t.id); setTimeout(() => setCopied(null), 2500);
      if (!t.invite) refetch();
    } catch (e: any) { setErr(e?.message ?? "Couldn't make the link."); }
  };

  const tot = data?.totals;
  const share = tot && tot.roster ? Math.round((tot.joined / tot.roster) * 100) : 0;

  return (
    <DeskFrame>
      <div className="flex items-center gap-3 flex-wrap">
        <h1 className="font-black text-[28px] flex-1 min-w-0">Who's joined</h1>
        <RinkSwitch rink={rink} rinks={rinks} pick={pick} />
      </div>
      <p className="text-[var(--mute)] mt-1 max-w-3xl">
        {overview.captainOnly
          ? "How much of your roster has signed up. Copy the invite link and send it to the team chat."
          : `Players on each roster at ${rink?.name ?? "this rink"} who have signed up. A team gets going once it has a captain and the captain sends the invite link.`}
      </p>
      {error && <p className="text-sm down mt-4" data-testid="text-error">{(error as any).message}</p>}

      {tot && (
        <div className="grid grid-cols-2 xl:grid-cols-4 gap-3.5 mt-6">
          <div className="card p-5">
            <div className="font-display font-black text-[40px] leading-none" data-testid="text-joined-share">{share}%</div>
            <div className="text-sm text-[var(--mute)] mt-2">{tot.joined} of {tot.roster} players signed up</div>
            <div className="h-1.5 rounded-full bg-[var(--ice-3)] mt-3 overflow-hidden"><div className="h-full bg-[var(--up)]" style={{ width: `${share}%` }} /></div>
          </div>
          <button className="card p-5 text-left hover:bg-[var(--surface-2)]" onClick={() => setFilter("captain")} data-testid="tile-no-captain">
            <div className={`font-display font-black text-[40px] leading-none ${tot.noCaptain ? "text-[var(--red)]" : ""}`}>{tot.noCaptain}</div>
            <div className="text-sm text-[var(--mute)] mt-2">Teams with no captain</div>
          </button>
          <button className="card p-5 text-left hover:bg-[var(--surface-2)]" onClick={() => setFilter("link")} data-testid="tile-no-link">
            <div className={`font-display font-black text-[40px] leading-none ${tot.noLink ? "text-[var(--amber)]" : ""}`}>{tot.noLink}</div>
            <div className="text-sm text-[var(--mute)] mt-2">Captains who haven't made the link</div>
          </button>
          <div className="card p-5">
            <div className="font-display font-black text-[40px] leading-none">{tot.teams}</div>
            <div className="text-sm text-[var(--mute)] mt-2">Teams</div>
          </div>
        </div>
      )}

      {data && data.teams.length > 1 && (
        <div className="flex items-center gap-2 mt-6 flex-wrap">
          {(["all", "behind", "captain", "link", "done"] as const).map((f) => (
            <button key={f} className="chip" data-active={filter === f} onClick={() => setFilter(f)} data-testid={`chip-joined-${f}`}>
              {f === "all" ? "All teams" : f === "behind" ? "Under half" : STEP[f].label}
            </button>
          ))}
          {leagues.length > 1 && (
            <select className="input h-9 w-auto text-sm ml-auto" value={league} onChange={(e) => setLeague(e.target.value === "all" ? "all" : Number(e.target.value))} aria-label="League" data-testid="select-joined-league">
              <option value="all">Every league</option>
              {leagues.map(([id, level]) => <option key={id} value={id}>{level}</option>)}
            </select>
          )}
        </div>
      )}
      {err && <p className="text-sm down mt-3" data-testid="text-invite-error">{err}</p>}

      <div className="card mt-4 overflow-x-auto">
        <table className="w-full text-sm" data-testid="table-joined">
          <thead>
            <tr className="text-left text-[var(--mute)] border-b border-[var(--line)]">
              <th className="label px-5 py-3">Team</th>
              <th className="label px-3 py-3 w-56">Signed up</th>
              <th className="label px-3 py-3">Captain</th>
              <th className="label px-3 py-3 w-44">Status</th>
              <th className="label px-3 py-3 w-40">Invite link</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[var(--line)]">
            {!data && !error && <tr><td colSpan={5} className="p-5 text-[var(--mute)]">Loading…</td></tr>}
            {data && rows.length === 0 && <tr><td colSpan={5} className="p-5 text-[var(--mute)]">No teams match.</td></tr>}
            {rows.map((t) => {
              const p = Math.round(pct(t) * 100);
              const st = STEP[t.step];
              return (
                <tr key={t.id} data-testid={`row-joined-${t.id}`}>
                  <td className="px-5 py-3">
                    <div className="flex items-center gap-2.5">
                      <span className="h-2.5 w-2.5 rounded-full shrink-0" style={{ background: t.color || "var(--mute)" }} />
                      <span className="min-w-0">
                        <Link href={`/team/${t.id}`} className="block font-bold truncate hover:underline">{t.name}</Link>
                        <span className="block text-xs text-[var(--mute)]">{t.level} · {t.league}</span>
                      </span>
                    </div>
                  </td>
                  <td className="px-3 py-3">
                    <div className="flex items-center gap-2.5">
                      <span className="w-24 h-1.5 rounded-full bg-[var(--ice-3)] overflow-hidden shrink-0"><span className="block h-full" style={{ width: `${p}%`, background: p >= 50 ? "var(--up)" : "var(--amber)" }} /></span>
                      <span className="tnum font-bold">{t.joined}/{t.roster}</span>
                    </div>
                    {t.lastJoined && <div className="text-xs text-[var(--mute)] mt-0.5">Latest {day(t.lastJoined)}</div>}
                  </td>
                  <td className="px-3 py-3">
                    {t.captain ? <span className="font-bold">{t.captain}</span> : overview.captainOnly ? <span className="text-[var(--down)] font-bold">None yet</span> : <Link href={`/staff/league/${t.leagueId}`} className="text-[var(--down)] font-bold">Name a captain</Link>}
                    {t.assistants.length > 0 && <div className="text-xs text-[var(--mute)] truncate max-w-[220px]">Assistants: {t.assistants.join(", ")}</div>}
                  </td>
                  <td className="px-3 py-3"><span className="inline-flex items-center gap-2 font-bold" style={{ color: st.tone }}><span className="h-2 w-2 rounded-full" style={{ background: st.tone }} />{st.label}</span></td>
                  <td className="px-3 py-3">
                    <button className="btn btn-ghost h-9 px-3 text-sm" onClick={() => copy(t)} data-testid={`button-copy-invite-${t.id}`}>
                      {copied === t.id ? "Copied" : t.invite ? "Copy link" : "Make and copy"}
                    </button>
                    {t.invite && <div className="text-xs text-[var(--mute)] mt-1">{t.invite.uses} joined through it</div>}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </DeskFrame>
  );
}
