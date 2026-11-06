import { describe, it, expect } from "vitest";
import { parseReport, looksLikeTeamName } from "../src/server/report-parse";

describe("report parser ignores non-team rows", () => {
  it("stops the roster list at a NOTES section", () => {
    const p = parseReport([
      "LEAGUE C League | LEVEL C",
      "ROSTERS",
      "Whiskey Dekes",
      "  M. K.",
      "NOTES",
      "PLAYERROW goals vs score: 2026-08-23 10:30 PM Backside",
      "Home/Away conflict 2026-08-23 3:00 PM: team-page order",
      "10/4 Whiskey Dekes vs Hinson Hookers: source flagged",
    ].join("\n"));
    expect(Object.keys(p.rosters)).toEqual(["Whiskey Dekes"]);
  });
  it("keeps real names and rejects junk", () => {
    for (const n of ["Hammer'd Heads", "Seal Team Sticks (Muckers)", "E-Ride", "Kraken Beers", "ICE DOGS"]) expect(looksLikeTeamName(n)).toBe(true);
    for (const n of ["NOTES", "ZEROROWS / approximate zero-row counts in source f", "DaySmart game pages show per-player G/A/PIM totals", "2026-08-17 10:00 PM Twins"]) expect(looksLikeTeamName(n)).toBe(false);
  });
});
