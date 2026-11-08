/** Search what the viewer can see: first name, the shown last initial, jersey number, team. A typed surname never matches a
 *  hidden one (that would reveal it); with no match it falls back to players whose shown last initial fits. */
export function findPlayers<T extends { name: string; number?: string | null; teams?: string | null }>(list: T[], query: string): { rows: T[]; byInitial: string | null } {
  const q = query.trim().toLowerCase();
  if (!q) return { rows: list, byInitial: null };
  const words = (s: string) => s.toLowerCase().replace(/[^a-z0-9 ]/g, " ").split(/\s+/).filter(Boolean);
  const tokens = words(q);
  const hit = (p: T) => {
    const hay = [...words(p.name), ...words(p.teams ?? "")];
    const num = String(p.number ?? "").replace(/\D/g, "");
    return tokens.every((t) => (/^\d+$/.test(t) ? num === t || hay.includes(t) : hay.some((w) => w.startsWith(t))));
  };
  const rows = list.filter(hit);
  if (rows.length || tokens.length !== 1 || !/^[a-z]{3,}$/.test(tokens[0])) return { rows, byInitial: null };
  const letter = tokens[0][0];
  const byInitial = list.filter((p) => { const parts = p.name.trim().split(/\s+/).filter((w) => !w.startsWith("#")); const last = parts.length > 1 ? parts[parts.length - 1] : ""; return new RegExp(`^${letter}\\.?$`, "i").test(last); });
  return byInitial.length ? { rows: byInitial, byInitial: letter.toUpperCase() } : { rows: [], byInitial: null };
}
