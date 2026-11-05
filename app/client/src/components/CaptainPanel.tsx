import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import { useMe, act, STATUS_LABEL } from "@/lib/auth";
import { SNAPSHOT } from "@/lib/queryClient";
import { Section, fmtRating } from "@/lib/ui";

const COLORS = ["#EF4444", "#F97316", "#F5B301", "#22C55E", "#14B8A6", "#3B82F6", "#8B5CF6", "#EC4899", "#A3A3A3", "#F8FAFC"];

const ACTION_TEXT: Record<string, string> = {
  claim: "claimed", match: "matched", draft: "drafted", release: "released", remove: "removed", merge: "merged",
  captain: "took the captain role", step_down: "stepped down as captain", decline: "declined", contest: "contested the captain", edit_team: "edited the team",
};

/** Captain line on the team page, plus the roster builder when the viewer is the captain. */
export function CaptainPanel({ team, captain }: { team: any; captain: { id: number; name: string } | null }) {
  const { me } = useMe();
  const [err, setErr] = useState<string | null>(null);
  if (SNAPSHOT || team.is_sample) return null;
  const isCap = !!me?.captainTeams.some((t) => t.id === team.id);
  const onRoster = !!me?.slots.some((s) => s.team_id === team.id);
  const run = async (method: string, url: string, body?: unknown) => setErr(await act(method, url, body));

  return (
    <>
      <div className="card mt-3 p-3.5 flex items-center gap-3 text-sm" data-testid="card-captain">
        <span className="label">Captain</span>
        <span className="flex-1 font-bold truncate">{captain ? captain.name : <span className="text-[var(--mute)] font-medium">No captain yet</span>}</span>
        {!me && <Link href="/join" className="btn btn-ghost h-8 text-xs" data-testid="link-join-team">Your team? Join</Link>}
        {me && !captain && onRoster && <button className="btn btn-red h-8 text-xs" onClick={() => run("POST", `/api/teams/${team.id}/captain`)} data-testid="button-take-captain">I'm the captain</button>}
        {me && captain && !isCap && onRoster && <button className="btn btn-ghost h-8 text-xs" onClick={() => confirm("Tell the captain you're the real captain?") && run("POST", `/api/teams/${team.id}/captain`)} data-testid="button-contest-captain">Contest</button>}
      </div>
      {me && !onRoster && !isCap && <p className="text-[11px] text-[var(--mute)] mt-2 px-1">On this team? Tap your name in the roster and claim it.</p>}
      {err && <p className="text-sm down mt-2 px-1" data-testid="text-error">{err}</p>}
      {isCap && <RosterBuilder teamId={team.id} />}
    </>
  );
}

function RosterBuilder({ teamId }: { teamId: number }) {
  const { me } = useMe();
  const { data } = useQuery<any>({ queryKey: [`/api/teams/${teamId}/manage`] });
  const [err, setErr] = useState<string | null>(null);
  const [mergeFrom, setMergeFrom] = useState<number | null>(null);
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState("");
  const [color, setColor] = useState("");
  if (!data) return null;
  const run = async (method: string, url: string, body?: unknown) => setErr(await act(method, url, body));
  const unregistered = data.slots.filter((s: any) => !s.registered).length;

  return (
    <Section title="Roster builder" action={<Link href={`/pool/${teamId}`} className="btn btn-red h-8 text-xs" data-testid="link-draft">Draft a player</Link>}>
      <div className="card p-3.5 text-xs text-[var(--mute)]">
        {data.slots.length - unregistered} of {data.slots.length} registered. Spots from the scoresheet hold stats until you match them to a registered player.
        {mergeFrom && <div className="mt-2 text-[var(--white)] font-bold">Pick the spot to merge into, or <button className="text-[var(--blue)]" onClick={() => setMergeFrom(null)}>cancel</button>.</div>}
      </div>
      {err && <p className="text-sm down mt-2 px-1" data-testid="text-error">{err}</p>}
      <div className="card divide-y divide-[var(--line)] mt-2">
        {data.slots.map((s: any) => (
          <div key={s.id} className={`p-3.5 ${mergeFrom === s.id ? "bg-[var(--red-dim)]" : ""}`} data-testid={`row-slot-${s.id}`}>
            <div className="flex items-center gap-3 text-sm">
              <span className="tnum text-[var(--mute)] w-8">{s.number ? `#${s.number}` : "–"}</span>
              <span className="flex-1 min-w-0">
                <span className="block font-bold truncate">{s.name}{s.position === "G" ? " · G" : ""}</span>
                <span className="block text-[11px] text-[var(--mute)]">
                  {s.registered ? <span className="up">Registered</span> : "From the sheet"}
                  {s.source === "draft" ? " · drafted" : ""}{s.gp ? ` · ${s.gp} scanned GP` : ""}
                  {s.registered && s.status && s.status !== "available" ? ` · ${STATUS_LABEL[s.status]}${s.status_until ? ` until ${s.status_until}` : ""}` : ""}
                </span>
              </span>
              <span className="tnum font-display text-lg">{fmtRating(s.rating)}</span>
            </div>
            <div className="flex flex-wrap gap-1.5 mt-2 pl-11">
              {mergeFrom && mergeFrom !== s.id ? (
                <button className="btn btn-red h-8 text-xs" onClick={async () => { await run("POST", `/api/teams/${teamId}/merge`, { fromId: mergeFrom, intoId: s.id }); setMergeFrom(null); }} data-testid={`button-merge-into-${s.id}`}>Merge into this</button>
              ) : !mergeFrom && (
                <>
                  {!s.registered && <Link href={`/pool/${teamId}/match/${s.id}`} className="btn btn-ghost h-8 text-xs" data-testid={`button-match-${s.id}`}>Match</Link>}
                  {s.registered && s.user_id !== me?.user.id && <button className="btn btn-ghost h-8 text-xs" onClick={() => confirm(`Release ${s.name}'s claim on this spot?`) && run("POST", `/api/teams/${teamId}/slots/${s.id}/release`)} data-testid={`button-release-${s.id}`}>Release</button>}
                  <button className="btn btn-ghost h-8 text-xs" onClick={() => setMergeFrom(s.id)} data-testid={`button-merge-${s.id}`}>Same person as…</button>
                  {s.user_id !== me?.user.id && <button className="btn btn-ghost h-8 text-xs" onClick={() => confirm(`Take ${s.name} off the roster? Games already played keep their lines.`) && run("POST", `/api/teams/${teamId}/slots/${s.id}/remove`)} data-testid={`button-remove-${s.id}`}>Remove</button>}
                </>
              )}
            </div>
          </div>
        ))}
      </div>

      <div className="card mt-3 p-4">
        {!editing ? (
          <div className="flex items-center gap-3">
            <span className="h-6 w-6 rounded-full" style={{ background: data.team.color }} />
            <span className="flex-1 text-sm font-bold">Team name and color</span>
            <button className="btn btn-ghost h-8 text-xs" onClick={() => { setName(data.team.name); setColor(data.team.color); setEditing(true); }} data-testid="button-edit-team">Edit</button>
          </div>
        ) : (
          <form className="space-y-3" onSubmit={async (e) => { e.preventDefault(); const r = await act("PATCH", `/api/teams/${teamId}`, { name, color }); setErr(r); if (!r) setEditing(false); }}>
            <input className="input w-full" value={name} onChange={(e) => setName(e.target.value)} data-testid="input-team-name" />
            <div className="flex flex-wrap gap-2">
              {COLORS.map((c) => (
                <button type="button" key={c} onClick={() => setColor(c)} className="h-8 w-8 rounded-full" style={{ background: c, outline: color.toUpperCase() === c ? "2px solid var(--white)" : "none", outlineOffset: 2 }} aria-label={c} />
              ))}
            </div>
            <div className="grid grid-cols-2 gap-2">
              <button type="button" className="btn btn-ghost h-10" onClick={() => setEditing(false)}>Cancel</button>
              <button className="btn btn-red h-10" data-testid="button-save-team">Save</button>
            </div>
          </form>
        )}
      </div>

      {data.actions.length > 0 && (
        <details className="card mt-3 p-4 text-xs">
          <summary className="font-bold text-sm cursor-pointer">Roster history</summary>
          <div className="mt-2 space-y-1.5 text-[var(--mute)]">
            {data.actions.map((a: any) => (
              <div key={a.id}>{a.actor ?? "Someone"} {ACTION_TEXT[a.action] ?? a.action}{a.player ? ` ${a.player}` : ""}{a.target && a.target !== a.actor && a.action !== "release" ? ` (${a.target})` : ""} · {a.created_at.slice(0, 10)}</div>
            ))}
          </div>
        </details>
      )}

      <button className="text-xs text-[var(--mute)] mt-3 px-1" onClick={() => confirm("Step down as captain? Anyone on the roster can take the role.") && run("POST", `/api/teams/${teamId}/captain/step-down`)} data-testid="button-step-down">Step down as captain</button>
    </Section>
  );
}
