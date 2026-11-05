"use client";
import { useState } from "react";
import { act } from "@/lib/auth";
import { Section } from "@/lib/ui";

export const ARCHETYPE_LABEL: Record<string, string> = {
  goon: "Goon", pest: "Pest", grinder: "Grinder", sniper: "Sniper", playmaker: "Playmaker",
  beauty: "Beauty", duster: "Duster", cherry_picker: "Cherry picker", bender: "Bender", energy: "Energy guy",
};
export const ARCHETYPE_BLURB: Record<string, string> = {
  goon: "Drops the gloves", pest: "Chirps all game", grinder: "Wins the corners", sniper: "Picks corners",
  playmaker: "Sees the ice", beauty: "Flow and dangles", duster: "Keeps the bench warm", cherry_picker: "Waits for the breakaway", bender: "Ankles fold, still shows up", energy: "Loudest on the bench",
};

export function ArchetypeChip({ a }: { a?: { archetype: string; votes: number } | null }) {
  if (!a) return null;
  return <span className="ml-1.5 inline-flex items-center h-5 px-1.5 rounded-md bg-[var(--ice-3)] border border-[var(--line)] text-[10px] font-black uppercase tracking-wide align-middle" title={`${ARCHETYPE_BLURB[a.archetype]} · ${a.votes} votes`} data-testid="chip-archetype">{ARCHETYPE_LABEL[a.archetype]}</span>;
}

/** Teammates vote each other's archetype for the season. Shows once enough teammates agree. */
export function ArchetypeVotes({ teamId, roster, data }: { teamId: number; roster: any[]; data: any }) {
  const [err, setErr] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  if (!data?.voter) return null;
  const mates = roster.filter((p) => !data.own.includes(p.id));
  if (!mates.length) return null;
  return (
    <Section title="Archetypes" action={<button className="text-sm text-[var(--blue)] font-bold" onClick={() => setOpen((o) => !o)} data-testid="button-archetype-votes">{open ? "Done" : "Vote"}</button>}>
      <p className="text-xs text-[var(--mute)] px-1 -mt-1">Pick one for each teammate this season. It shows on their profile once {data.minVotes} teammates agree. Yours is up to them.</p>
      {open && (
        <div className="card divide-y divide-[var(--line)] mt-2">
          {mates.map((p) => (
            <label key={p.id} className="flex items-center gap-3 px-4 py-2.5 text-sm">
              <span className="flex-1 min-w-0 truncate font-bold">{p.name}</span>
              <select className="input h-9 text-sm w-[150px]" value={data.mine[p.id] ?? ""} onChange={async (e) => setErr(await act("PUT", `/api/teams/${teamId}/archetypes`, { playerId: p.id, archetype: e.target.value || null }))} data-testid={`select-archetype-${p.id}`}>
                <option value="">No vote</option>
                {Object.entries(ARCHETYPE_LABEL).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
              </select>
            </label>
          ))}
        </div>
      )}
      {err && <p className="text-xs down mt-1">{err}</p>}
    </Section>
  );
}
