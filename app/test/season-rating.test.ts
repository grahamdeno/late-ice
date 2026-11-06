import { describe, expect, it } from "vitest";
import { seasonStart, SEASON } from "@/server/rating";

describe("seasonStart", () => {
  it("leaves an average scorer at the league baseline", () => {
    expect(seasonStart(3.8, 1, 1, 0.5, 10)).toBe(3.8);
  });
  it("raises a scorer above the league average and lowers one below", () => {
    expect(seasonStart(3.8, 1.5, 1, 0.5, 10)).toBeGreaterThan(3.8);
    expect(seasonStart(3.8, 0.5, 1, 0.5, 10)).toBeLessThan(3.8);
  });
  it("never moves more than the cap", () => {
    expect(seasonStart(3.8, 9, 1, 0.5, 1000)).toBeCloseTo(3.8 + SEASON.cap, 2);
    expect(seasonStart(3.8, 0, 9, 0.5, 1000)).toBeCloseTo(3.8 - SEASON.cap, 2);
  });
  it("moves less on few games", () => {
    expect(seasonStart(3.8, 2, 1, 0.5, 2) - 3.8).toBeLessThan(seasonStart(3.8, 2, 1, 0.5, 10) - 3.8);
  });
  it("keeps the baseline with no games, and stays on the 1 to 7 scale", () => {
    expect(seasonStart(3.8, 0, 1, 0.5, 0)).toBe(3.8);
    expect(seasonStart(6.9, 9, 1, 0.5, 100)).toBeLessThanOrEqual(7);
  });
  it("does not blow up when every player scored the same", () => {
    expect(Number.isFinite(seasonStart(3.8, 1, 1, 0, 10))).toBe(true);
  });
});
