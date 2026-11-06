import { describe, expect, it } from "vitest";
import { matchNames, norm } from "@/server/lineups";

const roster = [
  { id: 1, name: "Graham DeNoyer", display: "Graham D.", number: "9" },
  { id: 2, name: "Steve Lawson", display: "S. L.", number: "12" },
  { id: 3, name: "Andy Fischer", display: "A. F.", number: null },
  { id: 4, name: "Andy Morales", display: "A. M.", number: "4" },
  { id: 5, name: "José Hernández", display: "J. H.", number: null },
];

describe("matchNames", () => {
  it("matches full names, shown names, first plus last initial and numbers", () => {
    const r = matchNames("Graham DeNoyer\nS. L.\nAndy F\n#4", roster);
    expect(r.matched.map((m) => m.playerId)).toEqual([1, 2, 3, 4]);
    expect(r.unmatched).toEqual([]);
  });

  it("leaves an ambiguous first name unmatched", () => {
    const r = matchNames("Andy", roster);
    expect(r.matched).toEqual([]);
    expect(r.unmatched).toEqual(["Andy"]);
  });

  it("matches each player once and ignores accents, commas and list markers", () => {
    const r = matchNames("1. jose hernandez, Steve, steve lawson", roster);
    expect(r.matched.map((m) => m.playerId)).toEqual([5, 2]);
    expect(r.unmatched).toEqual(["steve lawson"]);
  });

  it("a unique last name is enough", () => {
    expect(matchNames("Fischer", roster).matched.map((m) => m.playerId)).toEqual([3]);
  });

  it("normalizes names", () => {
    expect(norm("  Zoë   O'Neil ")).toBe("zoe o neil");
  });
});
