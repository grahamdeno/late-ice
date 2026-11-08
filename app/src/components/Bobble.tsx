"use client";
import { DEFAULT_AVATAR, HAIRS, SKINS, type Avatar } from "@/lib/avatar";

type Face = { eyeH?: number; pupil?: number; lids?: string; brows?: string; mouth?: string; mouthFill?: string; props?: string[] };
const SMILE = "M48 70 C54 77 66 77 72 70";
/** What a voted archetype does to the face, and the prop it adds. */
const FACES: Record<string, Face> = {
  goon: { brows: "M39 43 L54 48 M66 48 L81 43", mouth: "M47 71 C53 79 67 79 73 71 Z", mouthFill: "#EEF3F8", props: ["blackeye", "gap", "scar"] },
  pest: { brows: "M40 44 L54 48 M66 42 L80 44", mouth: "M50 73 C58 75 66 72 72 67", pupil: 2, props: ["mouthguard"] },
  grinder: { brows: "M40 47 L54 45 M66 45 L80 47", mouth: "M50 73 L70 73", props: ["sweat", "eyeblack"] },
  sniper: { eyeH: 4.5, lids: "M38 50 L56 50 L56 54 L38 54 Z M64 50 L82 50 L82 54 L64 54 Z", brows: "M40 49 L54 47 M66 47 L80 49", mouth: "M52 72 C57 74 63 74 68 72", props: ["crosshair", "eyeblack"] },
  playmaker: { pupil: 3, brows: "M40 44 L54 44 M66 44 L80 44", props: ["pass"] },
  beauty: { brows: "M40 45 C45 42 50 42 54 44 M66 44 C70 42 75 42 80 45", mouth: "M46 69 C53 79 67 79 74 69 Z", mouthFill: "#EEF3F8", props: ["sparkle", "flow"] },
  duster: { eyeH: 3.5, lids: "M38 48 L56 48 L56 55 L38 55 Z M64 48 L82 48 L82 55 L64 55 Z", mouth: "M53 74 C57 72 63 72 67 74", props: ["dust"] },
  cherry_picker: { pupil: -3, brows: "M40 45 L54 44 M66 44 L80 45", mouth: "M49 70 C55 76 65 76 71 70", props: ["cherry"] },
  bender: { eyeH: 8.5, brows: "M40 42 L54 45 M66 45 L80 42", mouth: "M55 73 C55 69 65 69 65 73 C65 77 55 77 55 73 Z", mouthFill: "#0d1420", props: ["wobble"] },
  energy: { eyeH: 8, brows: "M39 41 L54 43 M66 43 L81 41", mouth: "M46 68 C50 84 70 84 74 68 Z", mouthFill: "#0d1420", props: ["bolt"] },
};

export function Bobble({ avatar, jersey = "#8b97a8", number, archetype, goalie = false, size = 40, label, tile = true }: {
  avatar?: Partial<Avatar> | null; jersey?: string; number?: string | null; archetype?: string | null; goalie?: boolean; size?: number; label?: string; tile?: boolean;
}) {
  const a = { ...DEFAULT_AVATAR, ...(avatar ?? {}) };
  const skin = SKINS[a.skin] ?? SKINS[2], hair = HAIRS[a.hair] ?? HAIRS[1];
  const helmet = a.helmet === "team" ? jersey : a.helmet;
  const f: Face = (archetype && FACES[archetype]) || {};
  const has = (p: string) => !!f.props?.includes(p);
  const eyeH = f.eyeH ?? 7, pupil = f.pupil ?? 0;
  const flow = a.style === "flow" || has("flow");
  const small = size < 48;
  const svg = (
    <svg width={tile ? size * 0.98 : size} height={tile ? size * 0.98 : size} viewBox="0 0 120 120" role={label ? "img" : undefined} aria-label={label} aria-hidden={label ? undefined : true}>
      <path d="M41 120 C41 103 48 96 60 96 C72 96 79 103 79 120 Z" fill={jersey} />
      <path d="M53 96 L60 104 L67 96 Z" fill="#EEF3F8" />
      {!small && number && <text x="60" y="117" textAnchor="middle" fontFamily="Big Shoulders Display, sans-serif" fontWeight="900" fontSize="10" fill="#0d1420">{number}</text>}
      <rect x="56" y="86" width="8" height="12" rx="2" fill={skin} />
      {flow && !goalie && <path d="M22 60 C14 72 18 84 12 92 M98 60 C106 72 102 84 108 92 M26 66 C22 76 24 84 20 90 M94 66 C98 76 96 84 100 90" stroke={hair} strokeWidth="6" strokeLinecap="round" fill="none" />}
      <circle cx="22" cy="58" r="7" fill={skin} /><circle cx="98" cy="58" r="7" fill={skin} />
      <ellipse cx="60" cy="54" rx="37" ry="38" fill={skin} />
      {a.beard !== "none" && <path d="M26 62 C28 84 44 92 60 92 C76 92 92 84 94 62 C85 75 73 79 60 79 C47 79 35 75 26 62 Z" fill={hair} opacity={a.beard === "stubble" ? 0.45 : 1} />}
      {has("blackeye") && <ellipse cx="73" cy="57" rx="10" ry="8" fill="#5b3b6e" fillOpacity=".55" />}
      {(a.eyeBlack || has("eyeblack")) && <g fill="#0d1420"><rect x="38" y="64" width="16" height="4" rx="2" /><rect x="66" y="64" width="16" height="4" rx="2" /></g>}
      <ellipse cx="47" cy="57" rx="7" ry={eyeH} fill="#EEF3F8" /><ellipse cx="73" cy="57" rx="7" ry={eyeH} fill="#EEF3F8" />
      <circle cx={48 + pupil} cy="58" r="3.3" fill="#0d1420" /><circle cx={72 + pupil} cy="58" r="3.3" fill="#0d1420" />
      {f.lids && <path d={f.lids} fill={skin} />}
      <path d={f.brows ?? "M40 46 L54 46 M66 46 L80 46"} stroke="#2a1c12" strokeWidth="3" strokeLinecap="round" fill="none" />
      <path d={f.mouth ?? SMILE} stroke="#0d1420" strokeWidth="2.6" fill={f.mouthFill ?? "none"} strokeLinecap="round" strokeLinejoin="round" />
      {has("gap") && <rect x="56.5" y="73.5" width="5" height="5" fill="#0d1420" />}
      {has("scar") && <path d="M34 44 L42 52 M36 50 L40 46" stroke="#b5655a" strokeWidth="2" strokeLinecap="round" />}
      {goalie ? (
        <g>
          <path d="M20 50 C20 22 38 10 60 10 C82 10 100 22 100 50 L100 66 C100 86 82 96 60 96 C38 96 20 86 20 66 Z" fill={helmet} />
          <path d="M34 48 L86 48 L83 76 C76 84 44 84 37 76 Z" fill="#0d1420" />
          <path d="M47 48 L47 80 M60 48 L60 82 M73 48 L73 80 M34 62 L86 62" stroke="#d7dde5" strokeWidth="2" fill="none" />
        </g>
      ) : (
        <g>
          <path d="M20 54 C20 24 38 12 60 12 C82 12 100 24 100 54 L100 58 L90 58 L90 42 C79 35 41 35 30 42 L30 58 L20 58 Z" fill={helmet} />
          <path d="M38 20 C46 15 56 14 62 15" stroke="#ffffff" strokeOpacity=".35" strokeWidth="4" strokeLinecap="round" fill="none" />
          {a.guard === "cage" && <g stroke="#d7dde5" strokeWidth={small ? 3 : 2} fill="none"><rect x="34" y="42" width="52" height="46" rx="13" /><path d={small ? "M60 42 L60 88 M34 64 L86 64" : "M47 42 L47 88 M60 42 L60 88 M73 42 L73 88 M34 57 L86 57 M34 72 L86 72"} /></g>}
          {a.guard === "visor" && <path d="M33 42 L87 42 L85 56 L35 56 Z" fill="#9cc6ff" fillOpacity=".45" stroke="#d7dde5" strokeWidth="1.6" />}
        </g>
      )}
      {!small && has("sweat") && <path d="M96 34 C99 39 99 42 96 43 C93 42 93 39 96 34 Z M102 46 C104 49 104 51 102 52 C100 51 100 49 102 46 Z" fill="#9cc6ff" />}
      {!small && has("sparkle") && <path d="M100 20 L102 26 L108 28 L102 30 L100 36 L98 30 L92 28 L98 26 Z" fill="#F5B301" />}
      {!small && has("cherry") && <g><path d="M96 20 C98 12 104 8 110 8 M96 20 C94 14 92 12 88 12" stroke="#22C55E" strokeWidth="2" fill="none" strokeLinecap="round" /><circle cx="88" cy="16" r="6" fill="#E11D48" /><circle cx="98" cy="22" r="6" fill="#E11D48" /></g>}
      {!small && has("dust") && <g><circle cx="100" cy="22" r="4" fill="#8b97a8" fillOpacity=".35" /><circle cx="108" cy="30" r="3" fill="#8b97a8" fillOpacity=".3" /><text x="94" y="50" fontFamily="DM Sans, sans-serif" fontWeight="700" fontSize="10" fill="#8b97a8">z</text></g>}
      {!small && has("crosshair") && <g><circle cx="104" cy="24" r="9" stroke="#FF3B3B" strokeWidth="2" fill="none" /><path d="M104 11 L104 18 M104 30 L104 37 M91 24 L98 24 M110 24 L117 24" stroke="#FF3B3B" strokeWidth="2" strokeLinecap="round" /></g>}
      {!small && has("pass") && <g><path d="M86 22 C96 14 106 16 112 24" stroke="#5aa9ff" strokeWidth="2.4" fill="none" strokeLinecap="round" strokeDasharray="3 4" /><path d="M108 18 L113 25 L105 26" stroke="#5aa9ff" strokeWidth="2.4" fill="none" strokeLinecap="round" strokeLinejoin="round" /></g>}
      {!small && has("mouthguard") && <path d="M66 74 C70 80 70 86 74 90" stroke="#F97316" strokeWidth="4" fill="none" strokeLinecap="round" />}
      {!small && has("wobble") && <path d="M30 104 C26 108 30 112 26 116 M90 104 C94 108 90 112 94 116" stroke="#8b97a8" strokeWidth="2" fill="none" strokeLinecap="round" />}
      {!small && has("bolt") && <path d="M104 8 L94 28 L102 28 L96 44 L112 22 L104 22 L110 8 Z" fill="#F5B301" />}
    </svg>
  );
  if (!tile) return svg;
  return <span className="inline-flex items-end justify-center overflow-hidden shrink-0 bg-[var(--ice-3)]" style={{ width: size, height: size, borderRadius: Math.round(size * 0.28) }}>{svg}</span>;
}
