import { describe, expect, it, vi } from "vitest";
import { shownArchetype } from "@/server/archetypes";

const { calls, one, q } = vi.hoisted(() => {
  const calls: { text: string; params: unknown[] }[] = [];
  const one = vi.fn(async (_db: unknown, text: string, params: unknown[] = []) => {
    calls.push({ text, params });
    if (text.includes("role='admin'")) return params[0] === 1 ? { ok: 1 } : undefined;
    if (text.includes("role='captain'")) return params[0] === 2 && params[1] === 10 ? { ok: 1 } : undefined;
    if (text.includes("FROM roster_entries")) return params[0] === 10 && params[1] === 77 ? { ok: 1 } : undefined;
    return undefined;
  });
  const q = vi.fn(async (_db: unknown, text: string, params: unknown[] = []) => {
    calls.push({ text, params });
    return [];
  });
  return { calls, one, q };
});

vi.mock("@/server/db", () => ({
  sql: {},
  one: (db: unknown, text: string, params?: unknown[]) => one(db, text, params),
  q: (db: unknown, text: string, params?: unknown[]) => q(db, text, params),
}));

const db = {};
const TEAM = 10;
const PLAYER = 77;

async function load() {
  return import("@/server/archetypes");
}

describe("shownArchetype", () => {
  const voted = { archetype: "sniper", votes: 3 };

  it("lets a captain override win, and a player opt-out hide every label", () => {
    expect(shownArchetype({ voted, override: "pest", self: "bender" })?.archetype).toBe("pest");
    expect(shownArchetype({ voted, override: "pest", self: "bender" })?.override).toBe(true);
    expect(shownArchetype({ voted, self: "bender" })).toMatchObject({ archetype: "bender", self: true, teamVote: "sniper" });
    expect(shownArchetype({ voted })).toEqual(voted);
    expect(shownArchetype({ voted, override: "pest", self: "bender", optedOut: true })).toBeNull();
    expect(shownArchetype({ voted: null, override: "grinder" })?.archetype).toBe("grinder");
  });
});

describe("captain archetype override", () => {
  it("lets this team's captain set one, and an admin set one", async () => {
    const { setCaptainArchetype } = await load();
    calls.length = 0;
    await setCaptainArchetype(db as never, 2, TEAM, PLAYER, "pest");
    expect(calls.some((c) => c.text.startsWith("UPDATE roster_entries SET archetype_override") && c.params[0] === "pest" && c.params[1] === TEAM && c.params[2] === PLAYER)).toBe(true);

    calls.length = 0;
    await setCaptainArchetype(db as never, 1, TEAM, PLAYER, null);
    expect(calls.some((c) => c.text.startsWith("UPDATE roster_entries SET archetype_override") && c.params[0] === null)).toBe(true);
  });

  it("refuses everyone who is not this team's captain or an admin", async () => {
    const { setCaptainArchetype } = await load();
    const denied = [
      ["an assistant captain", 3],
      ["a captain of another team", 2],
      ["the player", 4],
      ["a commissioner", 5],
      ["a rink manager", 6],
      ["support", 7],
    ] as const;
    for (const [label, userId] of denied) {
      const teamId = label === "a captain of another team" ? 99 : TEAM;
      calls.length = 0;
      await expect(setCaptainArchetype(db as never, userId, teamId, PLAYER, "pest"), label).rejects.toMatchObject({ status: 403 });
      expect(calls.some((c) => c.text.startsWith("UPDATE")), label).toBe(false);
    }
  });

  it("refuses an unknown archetype and a player who is not on the team", async () => {
    const { setCaptainArchetype } = await load();
    calls.length = 0;
    await expect(setCaptainArchetype(db as never, 2, TEAM, PLAYER, "wizard")).rejects.toMatchObject({ status: 400 });
    expect(calls).toEqual([]);
    await expect(setCaptainArchetype(db as never, 2, TEAM, 88, "pest")).rejects.toMatchObject({ status: 404 });
    expect(calls.some((c) => c.text.startsWith("UPDATE"))).toBe(false);
  });
});

describe("archetype opt-out", () => {
  it("lets the player opt out and opt back in", async () => {
    const { setArchetypeOptOut } = await load();
    calls.length = 0;
    await setArchetypeOptOut(db as never, 4, 4, true);
    await setArchetypeOptOut(db as never, 4, 4, false);
    const writes = calls.filter((c) => c.text.startsWith("UPDATE users SET archetype_opt_out"));
    expect(writes.map((c) => c.params)).toEqual([[true, 4], [false, 4]]);
  });

  it("refuses a captain, an admin, or anyone else opting out another player", async () => {
    const { setArchetypeOptOut } = await load();
    for (const actorId of [1, 2, 3, 5]) {
      calls.length = 0;
      await expect(setArchetypeOptOut(db as never, actorId, 4, true)).rejects.toMatchObject({ status: 403 });
      expect(calls.some((c) => c.text.startsWith("UPDATE"))).toBe(false);
    }
  });
});
