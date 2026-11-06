import { describe, expect, it } from "vitest";
import { checkSheet } from "@/server/ocr";
import { sheet, team } from "./fixtures/sheet";

const warnings: { name: string; warning: string; build: () => ReturnType<typeof sheet> }[] = [
  {
    name: "not a scoresheet",
    warning: "This does not look like a hockey scoresheet.",
    build: () => sheet({ is_scoresheet: false }),
  },
  {
    name: "home team name missing",
    warning: "Home team name could not be read.",
    build: () => sheet({ home: team({ name: null }) }),
  },
  {
    name: "visitor team name missing",
    warning: "Visitor team name could not be read.",
    build: () => sheet({ away: team({ name: null }) }),
  },
  {
    name: "home scoring list disagrees with the score box",
    warning: "Home: 1 goals in the scoring list but the score box says 2.",
    build: () => sheet({ home: team({ total: 2, score_by_period: [] }) }),
  },
  {
    name: "visitor scoring list disagrees with the score box",
    warning: "Visitor: 1 goals in the scoring list but the score box says 2.",
    build: () => sheet({ away: team({ total: 2, score_by_period: [] }) }),
  },
  {
    name: "home period scores do not add up",
    warning: "Home: period scores add to 2, total says 1.",
    build: () => sheet({ home: team({ score_by_period: [2] }) }),
  },
  {
    name: "visitor period scores do not add up",
    warning: "Visitor: period scores add to 2, total says 1.",
    build: () => sheet({ away: team({ score_by_period: [2] }) }),
  },
  {
    name: "home scorer is not on the roster",
    warning: "Home: #99 is on the scoring list but not the roster.",
    build: () => sheet({
      home: team({ goals: [{ period: 1, time: "12:00", scorer: "99", assist1: null, assist2: null }] }),
    }),
  },
  {
    name: "visitor assist is not on the roster",
    warning: "Visitor: #99 is on the scoring list but not the roster.",
    build: () => sheet({
      away: team({ goals: [{ period: 1, time: "12:00", scorer: "12", assist1: "99", assist2: null }] }),
    }),
  },
  {
    name: "home has no goalie",
    warning: "Home: no goalie marked.",
    build: () => sheet({
      home: team({ roster: [{ number: "1", name: "Pat Goal", position: "F" }, { number: "12", name: "Sam Skater", position: null }] }),
    }),
  },
  {
    name: "visitor has no goalie",
    warning: "Visitor: no goalie marked.",
    build: () => sheet({
      away: team({ roster: [{ number: "1", name: "Pat Goal", position: null }, { number: "12", name: "Sam Skater", position: null }] }),
    }),
  },
  {
    name: "game date missing",
    warning: "Game date could not be read.",
    build: () => sheet({ date: null }),
  },
];

describe("checkSheet", () => {
  it("gives a clean sheet no warnings", () => {
    expect(checkSheet(sheet())).toEqual([]);
  });

  it.each(warnings)("$name", ({ build, warning }) => {
    expect(checkSheet(build())).toContain(warning);
  });

  it("lists every problem on one bad sheet", () => {
    const found = checkSheet(sheet({
      is_scoresheet: false,
      date: null,
      home: team({ name: null }),
      away: team({ name: null }),
    }));
    expect(found).toEqual(expect.arrayContaining([
      "This does not look like a hockey scoresheet.",
      "Home team name could not be read.",
      "Visitor team name could not be read.",
      "Game date could not be read.",
    ]));
  });

  it("says a missing number once when that number scored and assisted", () => {
    const found = checkSheet(sheet({
      home: team({ goals: [{ period: 1, time: "12:00", scorer: "99", assist1: "99", assist2: "77" }] }),
    }));
    const missing = found.filter((w) => w.includes("not the roster"));
    expect(missing).toEqual([
      "Home: #99 is on the scoring list but not the roster.",
      "Home: #77 is on the scoring list but not the roster.",
    ]);
  });

  it("does not invent a score warning when the score box is blank", () => {
    const found = checkSheet(sheet({
      home: team({
        total: null,
        score_by_period: [9],
        goals: [
          { period: 1, time: "1:00", scorer: "12", assist1: null, assist2: null },
          { period: 2, time: "2:00", scorer: "12", assist1: null, assist2: null },
        ],
      }),
    }));
    expect(found.some((w) => w.includes("score box") || w.includes("period scores"))).toBe(false);
  });
});
