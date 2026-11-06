import { describe, expect, it } from "vitest";
import { MATRIX } from "@/server/permissions";
import { SECTION3 } from "./fixtures/roles";

function sameRoles(got: readonly string[], want: readonly string[]) {
  return [...got].slice().sort().join(",") === [...want].slice().sort().join(",");
}

describe("permission MATRIX", () => {
  it("grants each role exactly what section 3 says", () => {
    const mismatches: string[] = [];
    for (const row of SECTION3) {
      const got = MATRIX[row.action as keyof typeof MATRIX];
      if (!got || !sameRoles(got, row.roles)) {
        mismatches.push(`${row.action} (${row.row}): code [${got ? [...got].join(", ") : "missing"}] doc [${row.roles.join(", ")}]`);
      }
    }
    expect(mismatches).toEqual([]);
  });

  it("covers every MATRIX action from a section 3 row, plus the two actions section 3 does not name", () => {
    const fromDoc = new Set(SECTION3.map((row) => row.action));
    // signup.approve has no section 3 row. name.unhide is wider than the support row
    // (support.fix is the section 3 "hide or unhide a name on request" grant).
    const unnamed = {
      "signup.approve": ["rink_manager", "admin"],
      "name.unhide": ["assistant_captain", "captain", "support", "admin"],
    } as const;
    const keys = Object.keys(MATRIX).slice().sort();
    expect(keys).toEqual([...fromDoc, ...Object.keys(unnamed)].sort());
    for (const [action, roles] of Object.entries(unnamed)) {
      expect(sameRoles(MATRIX[action as keyof typeof MATRIX], roles), action).toBe(true);
    }
  });

  it("does not store the player role", () => {
    for (const roles of Object.values(MATRIX)) expect(roles).not.toContain("player");
  });

  it("keeps team calendar off the rink manager, and scan off support", () => {
    expect(MATRIX["schedule.feed"]).not.toContain("rink_manager");
    expect(MATRIX["sheet.confirm"]).not.toContain("support");
    expect(MATRIX["sheet.confirm"]).toContain("scorekeeper");
  });
});
