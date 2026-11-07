import { describe, expect, it } from "vitest";
import { effectiveStatus, weightOf, ANSWER_HOURS } from "@/server/goalies";
import { ratePlayer } from "@/server/rating";

const base = { rating: 4, gamesRated: 10, goals: 0, assists: 0, pim: 0, isGoalie: 1, own: 4, opp: 4, gf: 3, ga: 2, eventId: null };

describe("goalie numbers", () => {
  it("counts a pending report as unverified once the answer window passes", () => {
    const now = Date.now();
    expect(effectiveStatus("pending", new Date(now - (ANSWER_HOURS - 1) * 3600_000), now)).toBe("pending");
    expect(effectiveStatus("pending", new Date(now - (ANSWER_HOURS + 1) * 3600_000), now)).toBe("unverified");
    expect(effectiveStatus("disputed", new Date(0), now)).toBe("disputed");
  });
  it("weights verified fully, unverified at half, the rest not at all", () => {
    expect(weightOf("verified")).toBe(1);
    expect(weightOf("unverified")).toBe(0.5);
    expect(weightOf("pending")).toBe(0);
    expect(weightOf("disputed")).toBe(0);
  });
  it("rewards a save percentage above the league's, half as much when unconfirmed", () => {
    const full = ratePlayer({ ...base, shotsAgainst: 30, goalsAgainst: 2, svBase: 0.88 });
    const half = ratePlayer({ ...base, shotsAgainst: 30, goalsAgainst: 2, svBase: 0.88, goalieWeight: 0.5 });
    const g = (r: any) => r.reasons.find((x: any) => x.label.startsWith("Goalie")).value;
    expect(g(full)).toBeGreaterThan(0);
    expect(g(half)).toBeCloseTo(g(full) / 2, 6);
  });
  it("measures against the league, not a fixed number", () => {
    const tough = ratePlayer({ ...base, shotsAgainst: 30, goalsAgainst: 3, svBase: 0.92 });
    const easy = ratePlayer({ ...base, shotsAgainst: 30, goalsAgainst: 3, svBase: 0.85 });
    const g = (r: any) => r.reasons.find((x: any) => x.label.startsWith("Goalie")).value;
    expect(g(tough)).toBeLessThan(0);
    expect(g(easy)).toBeGreaterThan(0);
  });
});
