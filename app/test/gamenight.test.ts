import { describe, expect, it } from "vitest";
import { cleanDetail, pickCooler, stakesText } from "@/server/gamenight";

describe("cooler rotation", () => {
  it("picks the fewest turns, then the longest wait", () => {
    expect(pickCooler([{ id: 1, turns: 2, last: "2026-10-01" }, { id: 2, turns: 1, last: "2026-10-08" }, { id: 3, turns: 1, last: "2026-09-24" }])).toBe(3);
  });
  it("prefers someone who has never carried it", () => {
    expect(pickCooler([{ id: 5, turns: 1, last: "2026-10-01" }, { id: 6, turns: 0, last: null }])).toBe(6);
  });
  it("returns null with nobody to ask", () => { expect(pickCooler([])).toBeNull(); });
});

describe("what's at stake", () => {
  const opp = (pts: number) => ({ pts, rank: 1, name: "Zambonis" });
  it("a win that passes them", () => { expect(stakesText({ pts: 10, rank: 3 }, opp(11))).toBe("A win moves you past Zambonis in the standings."); });
  it("a win that ties them", () => { expect(stakesText({ pts: 10, rank: 3 }, opp(12))).toBe("A win ties you with Zambonis on points."); });
  it("far behind", () => { expect(stakesText({ pts: 4, rank: 6 }, opp(12))).toContain("A win cuts it to 6."); });
  it("level", () => { expect(stakesText({ pts: 8, rank: 2 }, opp(8))).toContain("level on points"); });
  it("narrow lead and wide lead", () => {
    expect(stakesText({ pts: 10, rank: 1 }, opp(9))).toContain("lets them catch you");
    expect(stakesText({ pts: 14, rank: 1 }, opp(6))).toContain("keeps the gap wide");
  });
});

describe("game details", () => {
  it("trims, collapses spaces and clears blanks", () => {
    expect(cleanDetail("  Sheet   2 ")).toBe("Sheet 2");
    expect(cleanDetail("   ")).toBeNull();
    expect(cleanDetail(undefined)).toBeUndefined();
    expect(cleanDetail("x".repeat(90))!.length).toBe(40);
  });
});
