import { describe, expect, it } from "vitest";
import { findPlayers } from "@/lib/search";

const list = [
  { name: "Graham D.", number: "12", teams: "Hammer'd Heads" },
  { name: "J. S. #61", number: "61", teams: "Blue Liners" },
  { name: "Sam Smith", number: "9", teams: "Blue Liners" },
  { name: "Dave Dunn", number: null, teams: "Wild Puckers" },
];
const names = (q: string) => findPlayers(list, q).rows.map((p) => p.name);

describe("player search", () => {
  it("finds by first name, jersey number and team", () => {
    expect(names("graham")).toEqual(["Graham D."]);
    expect(names("12")).toEqual(["Graham D."]);
    expect(names("#61")).toEqual(["J. S. #61"]);
    expect(names("hammer")).toEqual(["Graham D."]);
    expect(names("blue")).toEqual(["J. S. #61", "Sam Smith"]);
  });
  it("finds a surname only where the surname is already shown", () => {
    expect(names("smith")).toEqual(["Sam Smith"]);
    expect(names("dunn")).toEqual(["Dave Dunn"]);
  });
  it("never matches a hidden surname; offers the players whose shown last initial fits instead", () => {
    const r = findPlayers(list, "DeNoyer");
    expect(r.byInitial).toBe("D");
    expect(r.rows.map((p) => p.name)).toEqual(["Graham D."]);
    expect(findPlayers(list, "Sxyz").rows.map((p) => p.name)).toEqual(["J. S. #61"]);
  });
  it("no initial fallback for short or numeric queries", () => {
    expect(findPlayers(list, "zz").rows).toEqual([]);
    expect(findPlayers(list, "77").rows).toEqual([]);
  });
});
