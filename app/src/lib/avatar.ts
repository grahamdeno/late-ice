// Bobblehead avatar parts. Shared by the server (validation) and the app (drawing).
export const SKINS = ["#F6D2B8", "#F1C6A6", "#E0AC86", "#C68A62", "#8D5A3B", "#5E3A24"];
export const HAIRS = ["#1E1410", "#5A3A22", "#8A5A35", "#C58B3F", "#E3C58A", "#8b8f96", "#B5432A"];
export const HELMETS = ["team", "#141a24", "#EEF3F8", "#3B82F6", "#EF4444", "#22C55E", "#F5B301", "#A855F7"];
export const GUARDS = ["cage", "visor", "none"] as const;
export const BEARDS = ["none", "stubble", "full"] as const;
export const HAIRSTYLES = ["none", "flow"] as const;

export interface Avatar { skin: number; hair: number; helmet: string; guard: (typeof GUARDS)[number]; beard: (typeof BEARDS)[number]; style: (typeof HAIRSTYLES)[number]; eyeBlack: boolean }
export const DEFAULT_AVATAR: Avatar = { skin: 2, hair: 1, helmet: "team", guard: "cage", beard: "none", style: "none", eyeBlack: false };

export function cleanAvatar(a: any): Avatar | null {
  if (!a || typeof a !== "object") return null;
  const pick = <T,>(list: readonly T[], v: any, d: T) => (list.includes(v) ? v : d);
  return {
    skin: Number.isInteger(a.skin) && a.skin >= 0 && a.skin < SKINS.length ? a.skin : DEFAULT_AVATAR.skin,
    hair: Number.isInteger(a.hair) && a.hair >= 0 && a.hair < HAIRS.length ? a.hair : DEFAULT_AVATAR.hair,
    helmet: pick(HELMETS, a.helmet, "team"),
    guard: pick(GUARDS, a.guard, "cage"),
    beard: pick(BEARDS, a.beard, "none"),
    style: pick(HAIRSTYLES, a.style, "none"),
    eyeBlack: !!a.eyeBlack,
  };
}
