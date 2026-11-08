"use client";
import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { COUNTRIES, guessCountry, regionsOf } from "@/lib/geo";

type R = { id: number; name: string; address: string | null; city: string | null; state: string | null; country: string; leagues: number };

/** Find a rink anywhere Late Ice knows. Opens on the country the connection (or the phone) says you're in. */
export function RinkPicker({ value, onPick, onAdd }: { value: number | null; onPick: (id: number) => void; onAdd?: () => void }) {
  const { data } = useQuery<{ rinks: R[]; yourCountry: string | null }>({ queryKey: ["/api/rinks"] });
  const [country, setCountry] = useState<string | null>(null);
  const [text, setText] = useState("");
  useEffect(() => { if (data && !country) setCountry(data.yourCountry ?? guessCountry()); }, [data, country]);
  const c = country ?? "US";
  const rows = useMemo(() => {
    const t = text.trim().toLowerCase();
    const all = data?.rinks ?? [];
    // Typing searches both countries; otherwise show your country's rinks.
    const hit = t ? all.filter((r) => [r.name, r.city, r.state, r.address, regionsOf(r.country)[r.state ?? ""]].some((v) => (v ?? "").toLowerCase().includes(t))) : all.filter((r) => r.country === c);
    return hit.slice(0, 60);
  }, [data, text, c]);
  const groups = useMemo(() => {
    const m = new Map<string, R[]>();
    for (const r of rows) { const k = `${r.country}|${r.state ?? ""}`; m.set(k, [...(m.get(k) ?? []), r]); }
    return [...m.entries()];
  }, [rows]);
  return (
    <div className="space-y-2" data-testid="rink-picker">
      <div className="flex gap-1.5">
        {COUNTRIES.map(([k, label]) => (
          <button type="button" key={k} onClick={() => setCountry(k)} data-active={c === k} className="chip" data-testid={`button-country-${k}`}>{label}</button>
        ))}
      </div>
      <input className="input w-full" placeholder="Rink, city, state or province" value={text} onChange={(e) => setText(e.target.value)} data-testid="input-rink-search" />
      <div className="space-y-2 max-h-[46vh] overflow-y-auto overscroll-contain">
        {!data && <div className="text-xs text-[var(--mute)] px-1">Loading rinks…</div>}
        {data && rows.length === 0 && <div className="text-sm text-[var(--mute)] px-1">{text ? "No rink matches that yet." : "No rinks here yet. Be the first to add one."}</div>}
        {groups.map(([k, list]) => {
          const [ct, st] = k.split("|");
          return (
            <div key={k}>
              <div className="label px-1 mb-1">{regionsOf(ct)[st] ?? st}{text && ct !== c ? ` · ${ct === "CA" ? "Canada" : "United States"}` : ""}</div>
              <div className="space-y-1.5">
                {list.map((r) => (
                  <button type="button" key={r.id} onClick={() => onPick(r.id)} className={`w-full text-left rounded-xl border p-3 ${value === r.id ? "border-[var(--red)] bg-[var(--red-dim)]" : "border-[var(--line)] bg-[var(--ice-3)]"}`} data-testid={`button-rink-${r.id}`}>
                    <div className="font-bold text-sm">{r.name}</div>
                    <div className="text-xs text-[var(--mute)]">{[r.city, r.state].filter(Boolean).join(", ")}{r.leagues ? ` · ${r.leagues} league${r.leagues === 1 ? "" : "s"}` : ""}</div>
                  </button>
                ))}
              </div>
            </div>
          );
        })}
      </div>
      {/* Its own full-width target, set apart from the list, so a thumb reaching for it doesn't pick the rink above. */}
      {onAdd && (
        <div className="pt-4 mt-2 border-t border-[var(--line)]">
          <button type="button" onClick={onAdd} className="btn btn-ghost w-full h-12 text-sm font-bold" data-testid="button-rink-missing">+ Add a rink that isn't listed</button>
        </div>
      )}
    </div>
  );
}
