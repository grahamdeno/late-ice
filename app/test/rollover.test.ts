import { describe, expect, it } from "vitest";
import { nextSeasonName } from "@/server/rollover";

describe("next season name", () => {
  it("follows the calendar", () => {
    expect(nextSeasonName("Fall 2026", "2026-12-15")).toBe("Winter 2027");
    expect(nextSeasonName("Fall 2026", "2027-01-05")).toBe("Winter 2027");
    expect(nextSeasonName("Winter 2027", "2027-03-20")).toBe("Spring 2027");
    expect(nextSeasonName("Spring 2027", "2027-06-01")).toBe("Summer 2027");
    expect(nextSeasonName("Summer 2027", "2027-09-01")).toBe("Fall 2027");
  });
  it("never repeats the current name", () => {
    expect(nextSeasonName("Fall 2027", "2027-10-01")).toBe("Fall 2027 (2)");
  });
});
