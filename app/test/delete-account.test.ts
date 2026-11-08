import { beforeEach, describe, expect, it, vi } from "vitest";

const { calls, tx, one } = vi.hoisted(() => {
  const calls: { db: unknown; text: string; params: unknown[] }[] = [];
  const tx = { tag: "account-delete" };
  const one = vi.fn(async (db: unknown, text: string, params: unknown[] = []) => {
    calls.push({ db, text, params });
    if (text.includes("COUNT(*)")) return { n: 2 };
    return undefined;
  });
  return { calls, tx, one };
});

vi.mock("@/server/db", () => ({
  sql: {
    begin: (fn: (db: typeof tx) => Promise<unknown>) => fn(tx),
  },
  q: async (db: unknown, text: string, params: unknown[] = []) => {
    calls.push({ db, text, params });
    if (text.includes("FROM players p WHERE p.user_id")) return [{ id: 9, roster_number: "12" }];
    return [];
  },
  one: (db: unknown, text: string, params?: unknown[]) => one(db, text, params),
}));

import { deleteAccountRow } from "@/server/privacy";

describe("deleteAccountRow", () => {
  beforeEach(() => {
    calls.length = 0;
    one.mockImplementation(async (db: unknown, text: string, params: unknown[] = []) => {
      calls.push({ db, text, params });
      if (text.includes("COUNT(*)")) return { n: 2 };
      return undefined;
    });
  });

  it("deletes that user's app_events inside the same transaction, before the user row", async () => {
    await deleteAccountRow({ id: 44, number: "12", auth_id: null });
    const eventDelete = calls.findIndex((c) => c.text === "DELETE FROM app_events WHERE user_id = $1");
    const userDelete = calls.findIndex((c) => c.text === "DELETE FROM users WHERE id = $1");
    expect(eventDelete).toBeGreaterThan(-1);
    expect(userDelete).toBeGreaterThan(eventDelete);
    expect(calls[eventDelete]).toEqual({
      db: tx,
      text: "DELETE FROM app_events WHERE user_id = $1",
      params: [44],
    });
    expect(calls.every((c) => c.db === tx)).toBe(true);
  });

  it("does not delete app_events when the account is part of a merge", async () => {
    one.mockImplementation(async (db: unknown, text: string, params: unknown[] = []) => {
      calls.push({ db, text, params });
      if (text.includes("account_merges")) return { "?column?": 1 };
      return undefined;
    });
    await expect(deleteAccountRow({ id: 44, number: "12", auth_id: null })).rejects.toMatchObject({ status: 409 });
    expect(calls.some((c) => c.text.includes("app_events"))).toBe(false);
  });
});
