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
  it("does not create a team from notes lines after the rosters", () => {
    const notes = [
      "NOTES",
      "  leftover note that must not become a player",
      "PLAYERROW goals vs score: 2026-08-23 10:30 PM Backside",
      "Home/Away conflict 2026-08-23 3:00 PM: team-page order",
      "Twins",
      "  A. B.",
      "DaySmart game pages show per-player G/A/PIM totals",
    ];
    const p = parseReport([
      "LEAGUE C League | LEVEL C",
      "ROSTERS",
      "Whiskey Dekes",
      "  M. K.",
      ...notes,
    ].join("\n"));
    // "Twins" would pass looksLikeTeamName, and the indented line under it would keep it,
    // if the NOTES section did not end the roster list.
    expect(looksLikeTeamName("Twins")).toBe(true);
    expect(looksLikeTeamName("NOTES")).toBe(false);
    const created = new Set<string>([
      ...p.teamRows.map((r) => r.team),
      ...Object.keys(p.rosters),
      ...p.games.flatMap((g) => [g.home, g.away]),
      ...p.totals.map((r) => r.team),
    ]);
    expect([...created]).toEqual(["Whiskey Dekes"]);
    expect(p.rosters).toEqual({ "Whiskey Dekes": ["M. K."] });
    for (const line of notes) expect(created.has(line.trim()), line).toBe(false);
  });
  it("keeps real names and rejects junk", () => {
    for (const n of ["Hammer'd Heads", "Seal Team Sticks (Muckers)", "E-Ride", "Kraken Beers", "ICE DOGS"]) expect(looksLikeTeamName(n)).toBe(true);
    for (const n of ["NOTES", "ZEROROWS / approximate zero-row counts in source f", "DaySmart game pages show per-player G/A/PIM totals", "2026-08-17 10:00 PM Twins"]) expect(looksLikeTeamName(n)).toBe(false);
  });
});
