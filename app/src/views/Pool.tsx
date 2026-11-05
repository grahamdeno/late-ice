"use client";
import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link, useLocation } from "@/lib/router";
import { useMe, act, POSITION_LABEL, posMatch, STATUS_LABEL } from "@/lib/auth";
import { BackBar, Empty, LevelPill, Loading, TeamBadge, fmtRating } from "@/lib/ui";

interface PoolPlayer {
  id: number; name: string; number: string | null; position: string | null; status: string; status_until: string | null;
  teams: { id: number; name: string; level: string }[]; rating: number | null;
}

/** Draft pool. /pool, /pool/:teamId (draft onto that team), /pool/:teamId/match/:slotId (match a sheet slot). */
export default function Pool({ teamId, slotId }: { teamId?: string; slotId?: string }) {
  const [, nav] = useLocation();
  const { me, loading } = useMe();
  const [team, setTeam] = useState<number | null>(teamId ? Number(teamId) : null);
  const [pos, setPos] = useState<string>("all");
  const [onlyFree, setOnlyFree] = useState(false);
  const [pick, setPick] = useState<PoolPlayer | null>(null);
  const [number, setNumber] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => { if (!loading && !me) nav("/join"); }, [loading, me, nav]);
  useEffect(() => { if (team === null && me?.captainTeams.length) setTeam(me.captainTeams[0].id); }, [me, team]);

  const rinkId = me?.captainTeams.find((t) => t.id === team)?.rink_id ?? me?.user.homeRink?.id;
  const { data, error } = useQuery<{ rinkId: number; players: PoolPlayer[] }>({ queryKey: [`/api/pool?rink=${rinkId}`], enabled: !!me && !!rinkId });
  const manage = useQuery<any>({ queryKey: [`/api/teams/${team}/manage`], enabled: !!me && !!team && !!slotId });

  if (loading || !me) return <Loading />;
  if (!me.captainTeams.length) {
    return (
      <div>
        <BackBar href="/me" title="Draft pool" />
        <Empty title="Captains only" body="The draft pool is where captains find players. Take the captain role from your team on your profile first." action={<Link href="/me" className="btn btn-red">My profile</Link>} />
      </div>
    );
  }
  const slot = slotId ? manage.data?.slots.find((s: any) => s.id === Number(slotId)) : null;
  const matchMode = !!slotId;
  const myTeam = me.captainTeams.find((t) => t.id === team);

  const players = (data?.players ?? [])
    .filter((p) => posMatch(pos, p.position))
    .filter((p) => !onlyFree || p.status === "available")
    .filter((p) => !p.teams.some((t) => t.id === team));

  const submit = async () => {
    if (!pick || !team) return;
    setBusy(true);
    const e = matchMode
      ? await act("POST", `/api/teams/${team}/match`, { playerId: Number(slotId), userId: pick.id })
      : await act("POST", `/api/teams/${team}/draft`, { userId: pick.id, number: number || pick.number });
    setBusy(false);
    if (e) return setErr(e);
    nav(`/team/${team}`);
  };

  return (
    <div>
      <BackBar href={team ? `/team/${team}` : "/me"} title={matchMode ? "Match a player" : "Draft pool"} />
      <h1 className="font-black text-2xl">{matchMode ? `Who is ${slot ? `${slot.number ? "#" + slot.number + " " : ""}${slot.name}` : "this player"}?` : "Draft pool"}</h1>
      <p className="text-sm text-[var(--mute)] mt-1">
        {matchMode
          ? "Pick the registered player behind this spot on the sheet. Their goals, assists and rating move onto that player's profile, and they get a notice."
          : "Registered players at your rink. Pull one onto your roster and they get a notice. They can decline."}
      </p>

      {me.captainTeams.length > 1 && !matchMode && (
        <div className="flex gap-2 mt-4 overflow-x-auto scrollbar-none">
          {me.captainTeams.map((t) => (
            <button key={t.id} onClick={() => setTeam(t.id)} className={`chip shrink-0 ${team === t.id ? "border-[var(--red)] bg-[var(--red-dim)]" : ""}`} data-testid={`button-pool-team-${t.id}`}>
              <TeamBadge team={t} size={18} /> {t.name}
            </button>
          ))}
        </div>
      )}
      {myTeam && <div className="mt-3 text-xs text-[var(--mute)]">{matchMode ? "Matching on" : "Drafting to"} <b className="text-[var(--white)]">{myTeam.name}</b></div>}

      <div className="flex gap-2 mt-3 flex-wrap">
        {["all", "F", "D", "G"].map((p) => (
          <button key={p} onClick={() => setPos(p)} className={`chip ${pos === p ? "border-[var(--red)] bg-[var(--red-dim)]" : ""}`} data-testid={`button-filter-pos-${p}`}>{p === "all" ? "All" : POSITION_LABEL[p]}</button>
        ))}
        <button onClick={() => setOnlyFree((v) => !v)} className={`chip ${onlyFree ? "border-[var(--red)] bg-[var(--red-dim)]" : ""}`} data-testid="button-filter-available">Available only</button>
      </div>

      {error ? <p className="text-sm down mt-4">{(error as any).message}</p> : !data ? <Loading /> : players.length === 0 ? (
        <div className="mt-4"><Empty title="Nobody here yet" body="Share the app with your team. Everyone who registers at this rink shows up here." /></div>
      ) : (
        <div className="card divide-y divide-[var(--line)] mt-4">
          {players.map((p) => (
            <button key={p.id} onClick={() => { setPick(p); setNumber(p.number ?? ""); setErr(null); }} className={`w-full flex items-center gap-3 p-3.5 text-left ${pick?.id === p.id ? "bg-[var(--red-dim)]" : ""}`} data-testid={`row-pool-${p.id}`}>
              <span className="w-9 text-center font-display text-lg tnum text-[var(--mute)]">{p.number ? `#${p.number}` : "–"}</span>
              <span className="flex-1 min-w-0">
                <span className="block font-bold truncate">{p.name}</span>
                <span className="block text-xs text-[var(--mute)] truncate">
                  {p.position ? POSITION_LABEL[p.position] : ""}{p.status !== "available" ? ` · ${STATUS_LABEL[p.status]}` : ""}
                  {p.teams.length ? ` · ${p.teams.map((t) => `${t.name} (${t.level})`).join(", ")}` : " · Free agent"}
                </span>
              </span>
              <span className="font-display text-lg tnum">{fmtRating(p.rating)}</span>
            </button>
          ))}
        </div>
      )}

      {pick && (
        <div className="fixed inset-x-0 bottom-0 z-50" style={{ paddingBottom: "env(safe-area-inset-bottom)" }}>
          <div className="mx-auto max-w-[560px] px-4 pb-24">
            <div className="card-hi p-4 drop-in">
              <div className="flex items-center gap-3">
                {myTeam && <TeamBadge team={myTeam} size={32} />}
                <span className="flex-1 min-w-0">
                  <span className="block font-bold truncate">{matchMode ? `Match ${pick.name}` : `Draft ${pick.name}`}</span>
                  <span className="block text-xs text-[var(--mute)] truncate">{matchMode ? `to ${slot?.number ? "#" + slot.number : "this spot"} on ${myTeam?.name}` : `to ${myTeam?.name}`}</span>
                </span>
                {!matchMode && (
                  <input className="input w-16 tnum text-center" inputMode="numeric" maxLength={2} placeholder="#" value={number} onChange={(e) => setNumber(e.target.value.replace(/\D/g, "").slice(0, 2))} data-testid="input-draft-number" />
                )}
              </div>
              {err && <p className="text-sm down mt-2" data-testid="text-error">{err}</p>}
              <div className="grid grid-cols-2 gap-2 mt-3">
                <button className="btn btn-ghost h-11" onClick={() => setPick(null)} data-testid="button-cancel-pick">Cancel</button>
                <button className="btn btn-red h-11" disabled={busy} onClick={submit} data-testid="button-confirm-pick">{busy ? "Saving…" : matchMode ? "Match" : "Draft"}</button>
              </div>
            </div>
          </div>
        </div>
      )}
      {myTeam && <div className="mt-4 text-xs text-[var(--mute)] px-1 flex items-center gap-2"><LevelPill level={myTeam.level} /> Players at other levels can still be drafted. The league's sub rules are up to the rink.</div>}
    </div>
  );
}
