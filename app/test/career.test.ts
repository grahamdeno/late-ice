import { describe, expect, it } from "vitest";
import { goalieCorner } from "@/server/career";

const base = { teamId: 1, homeTeamId: 1, homeScore: 3, awayScore: 1, goalsAgainst: null, shotsAgainst: null };

describe("goalie corner", () => {
  it("builds record and goals against from the score alone", () => {
    const r = goalieCorner([base, { ...base, homeScore: 1, awayScore: 2 }, { ...base, homeScore: 2, awayScore: 2 }]);
    expect([r.w, r.l, r.t]).toEqual([1, 1, 1]);
    expect(r.goalsAgainst).toBe(5);
    expect(r.gaa).toBe(1.67);
    expect(r.savePct).toBeNull();
  });
  it("counts shutouts and plays the away side", () => {
    const r = goalieCorner([{ ...base, teamId: 2, homeScore: 0, awayScore: 4 }]);
    expect([r.w, r.shutouts]).toEqual([1, 1]);
  });
  it("save percentage only uses games with shots entered", () => {
    const r = goalieCorner([{ ...base, shotsAgainst: 20, goalsAgainst: 2 }, base]);
    expect(r.savePct).toBe(0.9);
    expect(r.gamesWithShots).toBe(1);
    expect(r.shots).toBe(20);
  });
  it("handles no games", () => { expect(goalieCorner([]).gaa).toBeNull(); });
});
