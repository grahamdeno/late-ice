import { describe, expect, it } from "vitest";
import { numbersStars, votedStars, MIN_VOTERS, voteClosesAt, VOTE_HOURS } from "@/server/stars";

const c = (id: number, goals: number, assists: number, delta: number | null = 0) => ({ player_id: id, name: `P${id}`, team_id: 1, goals, assists, delta });

describe("by the numbers", () => {
  it("ranks by game points and drops zero-point players", () => {
    const r = numbersStars([c(1, 0, 0), c(2, 1, 0), c(3, 2, 1), c(4, 0, 2), c(5, 1, 1)]);
    expect(r.map((x) => x.player_id)).toEqual([3, 4, 5]);
  });
  it("breaks ties by rating move, then id", () => {
    expect(numbersStars([c(9, 1, 0, 0.1), c(8, 1, 0, 0.5), c(7, 1, 0, 0.5)]).map((x) => x.player_id)).toEqual([7, 8, 9]);
  });
  it("returns fewer than three when few scored", () => { expect(numbersStars([c(1, 1, 0), c(2, 0, 0)]).length).toBe(1); });
});

describe("voted stars", () => {
  const cands = [c(1, 0, 0), c(2, 1, 0), c(3, 0, 1), c(4, 0, 0)];
  it("needs the minimum number of voters", () => {
    expect(MIN_VOTERS).toBe(3);
    expect(votedStars(cands, [{ voter: 1, picks: [1, 2, 3] }, { voter: 2, picks: [1, 2, 3] }])).toBeNull();
  });
  it("scores 3, 2, 1 per ballot", () => {
    const r = votedStars(cands, [{ voter: 10, picks: [1, 2, 3] }, { voter: 11, picks: [1, 3, 2] }, { voter: 12, picks: [2, 1, 4] }])!;
    expect(r.map((x) => [x.player_id, x.votes])).toEqual([[1, 8], [2, 6], [3, 3]]);
  });
  it("breaks a points tie by game points", () => {
    const r = votedStars(cands, [{ voter: 10, picks: [1] }, { voter: 11, picks: [2] }, { voter: 12, picks: [3] }])!;
    expect(r[0].player_id).toBe(2);
  });
  it("ignores picks who were not in the game", () => {
    const r = votedStars(cands, [{ voter: 10, picks: [99, 1] }, { voter: 11, picks: [99, 1] }, { voter: 12, picks: [99, 1] }])!;
    expect(r.map((x) => x.player_id)).toEqual([1]);
  });
});

describe("window", () => {
  it("closes 48 hours after creation", () => {
    expect(VOTE_HOURS).toBe(48);
    expect(voteClosesAt("2026-11-01T00:00:00Z").toISOString()).toBe("2026-11-03T00:00:00.000Z");
  });
});
