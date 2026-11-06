import { describe, expect, it } from "vitest";
import { ratePlayer } from "@/server/rating";

function input(over: Partial<Parameters<typeof ratePlayer>[0]> = {}) {
  return {
    rating: 4,
    gamesRated: 10,
    goals: 0,
    assists: 0,
    pim: 0,
    isGoalie: 0,
    shotsAgainst: null,
    goalsAgainst: null,
    own: 4,
    opp: 4,
    gf: 2,
    ga: 1,
    eventId: null,
    ...over,
  };
}

function delta(move: { reasons: { value: number }[] }) {
  return move.reasons.reduce((sum, reason) => sum + reason.value, 0);
}

describe("ratePlayer", () => {
  it("does not move a tie against an equal team", () => {
    const move = ratePlayer(input({ gf: 1, ga: 1, rating: 4.2 }));
    expect(move.reasons[0].value).toBe(0);
    expect(move.reasons[0].label.startsWith("Tie 1-1 vs a stronger team")).toBe(true);
    expect(move.after).toBe(4.2);
  });

  it("moves a win against an equal team by the base result", () => {
    const move = ratePlayer(input({ gf: 1, ga: 0, own: 4, opp: 4, rating: 4 }));
    expect(move.reasons[0].value).toBeCloseTo(0.03, 10);
    expect(move.after).toBeCloseTo(4.03, 3);
  });

  it("moves more for a win against a stronger team than a weaker one", () => {
    const stronger = ratePlayer(input({ opp: 5.2, own: 4, gf: 2, ga: 1 }));
    const weaker = ratePlayer(input({ opp: 2.8, own: 4, gf: 2, ga: 1 }));
    expect(delta(stronger)).toBeGreaterThan(delta(weaker));
    expect(delta(weaker)).toBeGreaterThan(0);
    expect(stronger.reasons[0].label).toContain("stronger");
    expect(weaker.reasons[0].label).toContain("weaker");
    expect(stronger.after).toBeGreaterThan(weaker.after);
  });

  it("moves a provisional player twice as fast", () => {
    const established = ratePlayer(input({ gamesRated: 10, opp: 5.2 }));
    const provisional = ratePlayer(input({ gamesRated: 2, opp: 5.2 }));
    expect(provisional.reasons[0].value).toBeCloseTo(established.reasons[0].value * 2, 10);
    expect(delta(provisional)).toBeCloseTo(delta(established) * 2, 10);
    expect(provisional.reasons.some((r) => r.label === "Provisional: game 3 of 5 moves faster" && r.value === 0)).toBe(true);
    expect(established.reasons.some((r) => r.label.startsWith("Provisional"))).toBe(false);
    expect(provisional.after - 4).toBeGreaterThan(established.after - 4);
  });

  it("counts a tournament game half", () => {
    const league = ratePlayer(input({ opp: 5.2, goals: 1, assists: 1 }));
    const tournament = ratePlayer(input({ opp: 5.2, goals: 1, assists: 1, eventId: 9 }));
    expect(delta(tournament)).toBeCloseTo(delta(league) / 2, 10);
    expect(tournament.reasons.some((r) => r.label === "Tournament game: counts half" && r.value === 0)).toBe(true);
    expect(tournament.after - 4).toBeLessThan(league.after - 4);
  });

  it("stays at 1 when a loss would go lower", () => {
    const move = ratePlayer(input({ rating: 1, gamesRated: 10, own: 5, opp: 2, gf: 0, ga: 5 }));
    expect(move.after).toBe(1);
    expect(delta(move)).toBeLessThan(0);
  });

  it("stays at 7 when a win would go higher", () => {
    const move = ratePlayer(input({ rating: 7, gamesRated: 10, own: 3, opp: 6, gf: 5, ga: 0 }));
    expect(move.after).toBe(7);
    expect(delta(move)).toBeGreaterThan(0);
  });

  it("keeps an ordinary result inside 1 to 7", () => {
    const samples = [
      input({ rating: 3.8, opp: 4.4, gf: 3, ga: 2 }),
      input({ rating: 5, opp: 3.2, gf: 1, ga: 4, pim: 10 }),
      input({ rating: 2, gamesRated: 0, opp: 6, gf: 0, ga: 1 }),
      input({ rating: 6.5, gamesRated: 4, opp: 3, gf: 4, ga: 1, eventId: 1 }),
    ];
    for (const sample of samples) {
      const after = ratePlayer(sample).after;
      expect(after).toBeGreaterThanOrEqual(1);
      expect(after).toBeLessThanOrEqual(7);
      expect(after).toBeGreaterThan(1);
      expect(after).toBeLessThan(7);
    }
  });

  it("adds points, a goalie save, and a long penalty", () => {
    const points = ratePlayer(input({ goals: 2, assists: 2, gf: 1, ga: 1, own: 4, opp: 4 }));
    expect(points.reasons.find((r) => r.label === "2G 2A on the sheet")?.value).toBeCloseTo(0.012, 10);
    const onePoint = ratePlayer(input({ goals: 1, assists: 0, gf: 1, ga: 1, own: 4, opp: 4 }));
    expect(onePoint.reasons.find((r) => r.label === "1G 0A on the sheet")?.value).toBeCloseTo(0.004, 10);

    const goalie = ratePlayer(input({
      isGoalie: 1, shotsAgainst: 30, goalsAgainst: 2, gf: 1, ga: 1, own: 4, opp: 4,
    }));
    const save = goalie.reasons.find((r) => r.label.startsWith("Goalie:"));
    expect(save).toBeDefined();
    expect(save!.value).toBeGreaterThan(0);
    expect(save!.value).toBeLessThanOrEqual(0.012);

    const penalized = ratePlayer(input({ pim: 6, gf: 1, ga: 1, own: 4, opp: 4 }));
    expect(penalized.reasons.find((r) => r.label === "6 penalty minutes")?.value).toBe(-0.004);
    const short = ratePlayer(input({ pim: 4, gf: 1, ga: 1, own: 4, opp: 4 }));
    expect(short.reasons.some((r) => r.label.includes("penalty"))).toBe(false);
  });
});
