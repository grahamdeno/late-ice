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

  it("covers every MATRIX action from a section 3 row", () => {
    const fromDoc = new Set(SECTION3.map((row) => row.action));
    const keys = Object.keys(MATRIX).slice().sort();
    expect(keys).toEqual([...fromDoc].sort());
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
