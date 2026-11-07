import { describe, expect, it } from "vitest";
import { imageKey, imageKeyValid } from "@/server/visibility";
import { rollDays } from "@/server/sample";

describe("scoresheet image keys", () => {
  it("a fresh key is valid", () => { expect(imageKeyValid(imageKey(7))).toBe(true); });
  it("a tampered key is refused", () => {
    const [u, e, s] = imageKey(7).split(".");
    expect(imageKeyValid(`${Number(u) + 1}.${e}.${s}`)).toBe(false);
    expect(imageKeyValid(`${u}.${Number(e) + 60}.${s}`)).toBe(false);
  });
  it("an expired key is refused", () => {
    const k = imageKey(7, Date.UTC(2026, 0, 1));
    expect(imageKeyValid(k, Date.UTC(2026, 0, 3))).toBe(false);
  });
  it("stays the same within a window so /api/me doesn't change on every refresh", () => {
    const t = Date.UTC(2026, 10, 7, 13, 0, 0);
    expect(imageKey(7, t)).toBe(imageKey(7, t + 60_000));
  });
  it("junk is refused", () => { expect(imageKeyValid(null)).toBe(false); expect(imageKeyValid("a.b")).toBe(false); });
});

describe("sample rink dates", () => {
  it("moves the newest game to three days ago", () => { expect(rollDays("2026-11-01", new Date("2026-11-20T12:00:00Z"))).toBe(16); });
  it("never moves backward", () => { expect(rollDays("2026-11-19", new Date("2026-11-20T12:00:00Z"))).toBe(0); });
});
