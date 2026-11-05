import { beforeEach, describe, expect, it, vi } from "vitest";

const { one } = vi.hoisted(() => ({ one: vi.fn() }));

vi.mock("@/server/db", () => ({
  sql: {},
  one: (...args: unknown[]) => one(...args),
  q: vi.fn(),
}));

import { GET } from "@/app/api/health/route";

async function call() {
  const res = await GET(new Request("http://localhost/api/health"), { params: Promise.resolve({}) });
  return { status: res.status, json: await res.json() };
}

describe("GET /api/health", () => {
  beforeEach(() => {
    one.mockReset();
  });

  it("returns ok after SELECT 1", async () => {
    one.mockResolvedValue({ "?column?": 1 });
    const res = await call();
    expect(one).toHaveBeenCalledWith(expect.anything(), "SELECT 1");
    expect(res.status).toBe(200);
    expect(res.json).toEqual({ ok: true, db: true });
  });

  it("returns 503 when the database does not answer", async () => {
    one.mockRejectedValue(new Error("connection refused"));
    const res = await call();
    expect(res.status).toBe(503);
    expect(res.json).toEqual({ ok: false, db: false });
  });
});
