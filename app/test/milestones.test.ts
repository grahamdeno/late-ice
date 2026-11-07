import { describe, expect, it } from "vitest";
import { earnedMilestones, type GameRow } from "@/server/milestones";

const g = (n: number, o: Partial<GameRow> = {}): GameRow => ({ gameId: n, on: `2026-10-${String(n).padStart(2, "0")}`, goals: 0, assists: 0, goalie: false, shutout: false, imported: false, ...o });
const kinds = (rows: GameRow[]) => earnedMilestones(rows).map((e) => e.kind);

describe("milestones", () => {
  it("first goal, first assist and hat trick on Late Ice games", () => {
    expect(kinds([g(1, { goals: 1 }), g(2, { assists: 1 }), g(3, { goals: 3 })])).toEqual(["first_goal", "first_assist", "first_hat_trick"]);
  });
  it("imported games never give firsts but do count games and points", () => {
    const rows = Array.from({ length: 10 }, (_, i) => g(i + 1, { imported: true, goals: 1 }));
    const k = kinds(rows);
    expect(k).toContain("games_10");
    expect(k).toContain("points_10");
    expect(k).not.toContain("first_goal");
    expect(k).not.toContain("first_hat_trick");
  });
  it("shutout needs a goalie", () => {
    expect(kinds([g(1, { shutout: true })])).toEqual([]);
    expect(kinds([g(1, { goalie: true, shutout: true })])).toEqual(["first_shutout"]);
  });
  it("each milestone is earned once, at the game that reached it", () => {
    const e = earnedMilestones(Array.from({ length: 12 }, (_, i) => g(i + 1, { goals: 1 })));
    expect(e.filter((x) => x.kind === "first_goal").length).toBe(1);
    expect(e.find((x) => x.kind === "games_10")!.gameId).toBe(10);
    expect(e.find((x) => x.kind === "points_10")!.gameId).toBe(10);
  });
});
