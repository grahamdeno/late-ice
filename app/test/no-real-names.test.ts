import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

// Real Polar Ice Wilmington team names. Screens anyone can see without signing in (the website, the app's views and
// components) must never type these in; signed-out visitors only ever see Midnight Pond's made-up teams.
const REAL = ["Hammer'd Heads", "Hammer&apos;d Heads", "Hammerd Heads", "Seal Team Sticks", "Whiskey Dekes", "Wild Puckers", "Blue Liners",
  "Fighting Irish", "Backside Checkers", "Hinson Hookers", "Polar Ice"];
const DIRS = ["src/app/site", "src/site", "src/views", "src/components"];

function files(dir: string): string[] {
  return readdirSync(dir).flatMap((f) => { const p = join(dir, f); return statSync(p).isDirectory() ? files(p) : /\.(tsx?|svg)$/.test(f) ? [p] : []; });
}

describe("no real team names on public screens", () => {
  it("the website, views and components type in no real team or rink name", () => {
    const hits: string[] = [];
    for (const f of DIRS.flatMap(files)) {
      const text = readFileSync(f, "utf8");
      for (const n of REAL) if (text.includes(n)) hits.push(`${f}: ${n}`);
    }
    expect(hits).toEqual([]);
  });
});
