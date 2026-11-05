"use client";
import { useState } from "react";
import { act } from "@/lib/auth";
import { DEFAULT_AVATAR, HAIRS, HELMETS, SKINS, type Avatar } from "@/lib/avatar";
import { Bobble } from "./Bobble";
import { ARCHETYPE_LABEL } from "./Archetypes";
import { Section } from "@/lib/ui";

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return <div><div className="label mb-1.5">{label}</div><div className="flex flex-wrap gap-2">{children}</div></div>;
}
function Swatch({ color, on, onClick, label }: { color: string; on: boolean; onClick: () => void; label: string }) {
  return <button type="button" aria-label={label} aria-pressed={on} onClick={onClick} className={`h-9 w-9 rounded-full border-2 ${on ? "border-[var(--red)]" : "border-[var(--line)]"}`} style={{ background: color }} />;
}
function Pill({ on, onClick, children, testid }: { on: boolean; onClick: () => void; children: React.ReactNode; testid?: string }) {
  return <button type="button" aria-pressed={on} onClick={onClick} data-testid={testid} className={`h-9 px-3.5 rounded-full border text-sm font-bold ${on ? "border-[var(--red)] bg-[var(--red-dim)]" : "border-[var(--line)] bg-[var(--ice-3)] text-[var(--mute)]"}`}>{children}</button>;
}

/** Build your bobblehead. Jersey and number come from your team; the face and prop from your teammates' vote. */
export function AvatarBuilder({ saved, jersey, number, archetype, goalie }: { saved: Avatar | null; jersey: string; number: string | null; archetype: { archetype: string; votes: number } | null; goalie: boolean }) {
  const [a, setA] = useState<Avatar>({ ...DEFAULT_AVATAR, ...(saved ?? {}) });
  const [err, setErr] = useState<string | null>(null);
  const [savedAt, setSavedAt] = useState<number | null>(null);
  const set = (p: Partial<Avatar>) => setA({ ...a, ...p });
  const dirty = JSON.stringify(a) !== JSON.stringify({ ...DEFAULT_AVATAR, ...(saved ?? {}) });
  return (
    <Section title="Your bobblehead">
      <div className="card p-4" data-testid="card-avatar-builder">
        <div className="flex items-center gap-4">
          <Bobble avatar={a} jersey={jersey} number={number} archetype={archetype?.archetype} goalie={goalie} size={112} label="Your bobblehead" />
          <div className="text-sm min-w-0">
            <div className="font-bold">{archetype ? ARCHETYPE_LABEL[archetype.archetype] : "No archetype yet"}</div>
            <p className="text-xs text-[var(--mute)] mt-0.5">{archetype ? `Your teammates voted (${archetype.votes}). It sets the face and the prop.` : "Your teammates vote it from the team page. It sets the face and adds a prop."}</p>
            <p className="text-xs text-[var(--mute)] mt-1">Jersey and number come from your team.</p>
          </div>
        </div>
        <div className="mt-4 space-y-3.5">
          <Row label="Skin">{SKINS.map((c, i) => <Swatch key={c} color={c} on={a.skin === i} onClick={() => set({ skin: i })} label={`Skin tone ${i + 1}`} />)}</Row>
          <Row label="Helmet">{HELMETS.map((c) => c === "team" ? <Pill key={c} on={a.helmet === "team"} onClick={() => set({ helmet: "team" })}>Team color</Pill> : <Swatch key={c} color={c} on={a.helmet === c} onClick={() => set({ helmet: c })} label={`Helmet ${c}`} />)}</Row>
          {!goalie && <Row label="Face">{(["cage", "visor", "none"] as const).map((g) => <Pill key={g} on={a.guard === g} onClick={() => set({ guard: g })} testid={`button-guard-${g}`}>{g === "cage" ? "Cage" : g === "visor" ? "Half visor" : "Nothing"}</Pill>)}</Row>}
          <Row label="Beard">{(["none", "stubble", "full"] as const).map((b) => <Pill key={b} on={a.beard === b} onClick={() => set({ beard: b })}>{b === "none" ? "None" : b === "stubble" ? "Stubble" : "Full"}</Pill>)}</Row>
          <Row label="Hair">
            <Pill on={a.style === "none"} onClick={() => set({ style: "none" })}>Tucked in</Pill>
            <Pill on={a.style === "flow"} onClick={() => set({ style: "flow" })}>Flow</Pill>
          </Row>
          <Row label="Hair color">{HAIRS.map((c, i) => <Swatch key={c} color={c} on={a.hair === i} onClick={() => set({ hair: i })} label={`Hair color ${i + 1}`} />)}</Row>
          <Row label="Extras"><Pill on={a.eyeBlack} onClick={() => set({ eyeBlack: !a.eyeBlack })}>Eye black</Pill></Row>
        </div>
        {err && <p className="text-sm down mt-3">{err}</p>}
        <button className="btn btn-red w-full h-11 mt-4" disabled={!dirty && !!saved} onClick={async () => { const e = await act("PATCH", "/api/me", { avatar: a }); setErr(e); if (!e) setSavedAt(Date.now()); }} data-testid="button-save-avatar">{savedAt && !dirty ? "Saved" : "Save my bobblehead"}</button>
      </div>
    </Section>
  );
}
