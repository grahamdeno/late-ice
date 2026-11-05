"use client";
import { useState } from "react";
import { Link } from "@/lib/router";
import { useMe, act } from "@/lib/auth";



/** Captain line on the team page, plus the roster builder when the viewer is the captain. */
export function CaptainPanel({ team, captain, assistants = [] }: { team: any; captain: { id: number; name: string } | null; assistants?: { id: number; name: string }[] }) {
  const { me } = useMe();
  const [err, setErr] = useState<string | null>(null);
  if (team.is_sample) return null;
  const myRole = me?.captainTeams.find((t) => t.id === team.id)?.role ?? null;
  const isCap = myRole === "captain";
  const runsTeam = !!myRole;
  const onRoster = !!me?.slots.some((s) => s.team_id === team.id);
  const run = async (method: string, url: string, body?: unknown) => setErr(await act(method, url, body));

  return (
    <>
      <div className="card mt-3 p-3.5 flex items-center gap-3 text-sm" data-testid="card-captain">
        <span className="label">Captain</span>
        <span className="flex-1 font-bold truncate">{captain ? captain.name : <span className="text-[var(--mute)] font-medium">No captain yet</span>}</span>
        {!me && <Link href="/join" className="btn btn-ghost h-8 text-xs" data-testid="link-join-team">Your team? Join</Link>}
        {me && !captain && onRoster && <button className="btn btn-red h-8 text-xs" onClick={() => run("POST", `/api/teams/${team.id}/captain`)} data-testid="button-take-captain">I'm the captain</button>}
        {me && captain && !runsTeam && onRoster && <button className="btn btn-ghost h-8 text-xs" onClick={() => confirm("Tell the captain you're the real captain?") && run("POST", `/api/teams/${team.id}/captain`)} data-testid="button-contest-captain">Contest</button>}
      </div>
      {assistants.length > 0 && (
        <div className="card mt-2 p-3.5 flex items-center gap-3 text-sm" data-testid="card-assistants">
          <span className="label">Assistants</span>
          <span className="flex-1 font-bold truncate">{assistants.map((a) => a.name).join(", ")}</span>
        </div>
      )}
      {me && !onRoster && !runsTeam && <p className="text-[11px] text-[var(--mute)] mt-2 px-1">On this team? Tap your name in the roster and claim it.</p>}
      {err && <p className="text-sm down mt-2 px-1" data-testid="text-error">{err}</p>}
      {(runsTeam || me?.staff) && (
        <Link href={`/team/${team.id}/manage`} className="card-hi mt-3 p-4 flex items-center gap-3" data-testid="link-manage-team">
          <span className="flex-1"><span className="block font-bold">Manage team</span><span className="block text-xs text-[var(--mute)]">Roster, add players, invites, draft pool{isCap ? ", assistants, team name" : ""}.</span></span>
          <span>›</span>
        </Link>
      )}
    </>
  );
}
