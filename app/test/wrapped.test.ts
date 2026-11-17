import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  AWARD_KEYS, HOME_DAYS, SHORT_SEASON_LINE, autoOpen, bestNight, cardAlt, cardPlan, cleanHidden, isShortSeason, lateNights,
  leaders, onHome, ordinal, rankByPoints, ratingArc, startMinutes, startsAfterTen, visibleAwards,
} from "@/server/wrapped-core";
import { shareKey, wrapShareKey, wrapShareKeyValid } from "@/server/visibility";

/* ---------- mocks for the database-backed parts ---------- */

const m = vi.hoisted(() => {
  const state = {
    rows: {} as Record<string, any>,
    lists: {} as Record<string, any[]>,
    can: true,
    audits: [] as any[],
    notified: [] as any[],
    inserted: 0,
    opened: new Set<string>(),
  };
  return { state };
});

vi.mock("@/server/db", () => ({
  sql: {},
  one: async (_db: unknown, text: string, params: unknown[] = []) => {
    const s = m.state;
    if (text.includes("INSERT INTO season_wraps")) {
      const key = `${params[0]}:${params[1]}`;
      if (s.opened.has(key)) return undefined;
      s.opened.add(key);
      s.inserted++;
      return { team_id: params[0] };
    }
    for (const k of Object.keys(s.rows)) if (text.includes(k)) return s.rows[k];
    return undefined;
  },
  q: async (_db: unknown, text: string) => {
    for (const k of Object.keys(m.state.lists)) if (text.includes(k)) return m.state.lists[k];
    return [];
  },
}));

vi.mock("@/server/permissions", async () => {
  const { HttpError } = await import("@/server/services");
  return {
    require_: async () => { if (!m.state.can) throw new HttpError(403, "Not allowed."); },
    can: async () => m.state.can,
    audit: async (...a: any[]) => { m.state.audits.push(a); },
  };
});

vi.mock("@/server/accounts", () => ({
  applyViewerNames: async (_db: unknown, _v: unknown, rows: any[]) => rows.map((r) => ({ ...r, name: r.id === 2 ? "Player #44" : `Name ${r.id}` })),
  notify: async (...a: any[]) => { m.state.notified.push(a); },
  publicInitials: (name: string, number?: string) => `${name.split(" ").map((p) => p[0]).join(".")}.${number ? ` #${number}` : ""}`,
  requireTeam: async () => undefined,
  suggestionsFor: async () => [],
  teamOrThrow: async (_db: unknown, id: number) => ({ id, league_id: 5, rink_id: 9, name: "Team" }),
}));

const db = {} as any;
const reset = () => {
  m.state.rows = {}; m.state.lists = {}; m.state.can = true; m.state.audits = []; m.state.notified = []; m.state.inserted = 0; m.state.opened = new Set();
};

/* ---------- A1: when Wrapped opens ---------- */

describe("A1 autoOpen", () => {
  const base = { teamGames: 8, scheduledCount: 10, lastScheduledDate: "2026-11-10", resultOnOrAfterLast: true, seasonEndsOn: "2026-12-01", today: "2026-11-11" };
  it("opens when the last scheduled game has a confirmed result", () => {
    expect(autoOpen(base)).toEqual({ open: true, reason: "last_game" });
  });
  it("stays closed while the last scheduled game has no result", () => {
    expect(autoOpen({ ...base, resultOnOrAfterLast: false }).open).toBe(false);
  });
  it("with no schedule, opens once the season end has passed", () => {
    const i = { ...base, scheduledCount: 0, lastScheduledDate: null };
    expect(autoOpen({ ...i, today: "2026-12-02" })).toEqual({ open: true, reason: "season_end" });
    expect(autoOpen({ ...i, today: "2026-11-30" }).open).toBe(false);
  });
  it("never opens for a team with no games", () => {
    expect(autoOpen({ ...base, teamGames: 0 }).open).toBe(false);
  });
});

describe("A1 onHome", () => {
  const opened = "2026-11-01T12:00:00Z";
  it("shows on Home for 14 days", () => {
    expect(HOME_DAYS).toBe(14);
    expect(onHome(opened, new Date("2026-11-15T12:00:00Z"))).toBe(true);
    expect(onHome(opened, new Date("2026-11-15T12:00:01Z"))).toBe(false);
  });
  it("is not on Home before it opened", () => { expect(onHome(opened, new Date("2026-10-31T00:00:00Z"))).toBe(false); });
});

describe("A1 opening notifies once", () => {
  beforeEach(reset);
  it("the second open of the same team and season does nothing", async () => {
    const { openWrap } = await import("@/server/wrapped");
    m.state.rows["JOIN seasons s ON s.id=g.season_id"] = { id: 3, name: "Fall 2026" };
    const first = await openWrap(db, 10, 3, 1);
    const second = await openWrap(db, 10, 3, 1);
    expect(first).toBe(true);
    expect(second).toBe(false);
    expect(m.state.inserted).toBe(1);
  });
});

/* ---------- A2: which cards appear ---------- */

describe("A2 cardPlan", () => {
  const full = { games: 10, statGames: 10, ratedGames: 10, hasBestNight: true, hasRoom: true, milestones: 2 };
  it("a full season shows every card with data, ending on the team card", () => {
    expect(cardPlan(full)).toEqual(["cover", "showed_up", "scoring", "best_night", "rating", "room", "milestones", "team"]);
  });
  it("a card with no data is absent", () => {
    const plan = cardPlan({ ...full, statGames: 0, hasBestNight: false, ratedGames: 2, hasRoom: false, milestones: 0 });
    expect(plan).toEqual(["cover", "showed_up", "team"]);
  });
  it("a short season (fewer than 3 games) gets cover, showed up and team only", () => {
    expect(isShortSeason(2)).toBe(true);
    expect(isShortSeason(3)).toBe(false);
    expect(cardPlan({ ...full, games: 2 })).toEqual(["cover", "showed_up", "team"]);
    expect(SHORT_SEASON_LINE).toBe("A short season on paper. The full story starts in Winter.");
  });
  it("card 9 is never in the plan until Handoff B", async () => {
    expect(cardPlan(full)).not.toContain("rollcall");
    const { rollCallCard } = await import("@/server/wrapped");
    expect(await rollCallCard(db, { teamId: 10, seasonId: 3, playerId: 7, mode: "own" })).toBeNull();
  });
});

describe("A2 showed up", () => {
  it("reads common start time formats", () => {
    expect(startMinutes("9:15 PM")).toBe(21 * 60 + 15);
    expect(startMinutes("9:15pm")).toBe(21 * 60 + 15);
    expect(startMinutes("21:15")).toBe(21 * 60 + 15);
    expect(startMinutes("9 PM")).toBe(21 * 60);
    expect(startMinutes("12:05 AM")).toBe(5);
    expect(startMinutes("soon")).toBeNull();
    expect(startMinutes("13:99")).toBeNull();
    expect(startMinutes(null)).toBeNull();
  });
  it("after 10 pm is strictly later than 10:00 pm", () => {
    expect(startsAfterTen(22 * 60)).toBe(false);
    expect(startsAfterTen(22 * 60 + 1)).toBe(true);
  });
  it("a 12:30 am start counts as the latest game of the night before", () => {
    const r = lateNights([
      { on: "2026-10-09", start: "10:30 PM" },
      { on: "2026-10-10", start: "12:30 AM" },
      { on: "2026-10-11", start: "8:00 PM" },
      { on: "2026-10-12", start: "TBD" },
    ]);
    expect(r.latest?.on).toBe("2026-10-10");
    expect(r.afterTen).toBe(2);
    expect(r.text).toBe("12:30 am on Oct 10");
  });
  it("unknown start times are skipped, never guessed", () => {
    expect(lateNights([{ on: "2026-10-09", start: null }])).toMatchObject({ latest: null, afterTen: 0, text: null });
  });
});

describe("A2 scoring and best night", () => {
  it("equal points share a rank", () => {
    const rows = [{ id: 1, pts: 9 }, { id: 2, pts: 9 }, { id: 3, pts: 4 }];
    expect(rankByPoints(rows, 1)).toEqual({ rank: 1, of: 3 });
    expect(rankByPoints(rows, 2)).toEqual({ rank: 1, of: 3 });
    expect(rankByPoints(rows, 3)).toEqual({ rank: 3, of: 3 });
    expect(rankByPoints(rows, 99)).toBeNull();
    expect([1, 2, 3, 4, 11, 12, 13, 21, 22].map(ordinal)).toEqual(["1st", "2nd", "3rd", "4th", "11th", "12th", "13th", "21st", "22nd"]);
  });
  it("best night is the biggest points game, goals break ties", () => {
    const b = bestNight([
      { gameId: 1, on: "2026-10-01", goals: 1, assists: 2, delta: 0.1 },
      { gameId: 2, on: "2026-10-08", goals: 2, assists: 1, delta: 0 },
      { gameId: 3, on: "2026-10-15", goals: 0, assists: 1, delta: 0.4 },
    ]);
    expect(b).toMatchObject({ gameId: 2, by: "points" });
  });
  it("a player with no points gets the biggest rating jump, and no jump means no card", () => {
    expect(bestNight([{ gameId: 1, on: "2026-10-01", goals: 0, assists: 0, delta: 0.3 }, { gameId: 2, on: "2026-10-02", goals: 0, assists: 0, delta: 0.6 }])).toMatchObject({ gameId: 2, by: "rating" });
    expect(bestNight([{ gameId: 1, on: "2026-10-01", goals: 0, assists: 0, delta: -0.2 }])).toBeNull();
    expect(bestNight([])).toBeNull();
  });
});

describe("A2 rating arc", () => {
  it("needs three rated games", () => {
    expect(ratingArc([{ before: 3, after: 3.2 }, { before: 3.2, after: 3.4 }])).toBeNull();
  });
  it("reports start, finish and peak", () => {
    expect(ratingArc([{ before: 3, after: 3.5 }, { before: 3.5, after: 4.1 }, { before: 4.1, after: 3.9 }])).toEqual({ start: 3, finish: 3.9, peak: 4.1, games: 3 });
  });
});

/* ---------- A3: sharing ---------- */

describe("A3 share keys", () => {
  it("a key opens only the recap it was made for", () => {
    const k = wrapShareKey(10, 3, 77);
    expect(wrapShareKeyValid(10, 3, 77, k)).toBe(true);
    expect(wrapShareKeyValid(10, 3, 78, k)).toBe(false); // another player
    expect(wrapShareKeyValid(10, 4, 77, k)).toBe(false); // another season
    expect(wrapShareKeyValid(11, 3, 77, k)).toBe(false); // another team
  });
  it("the team wrap key (player 0) does not open a player recap, and the reverse", () => {
    const team = wrapShareKey(10, 3, 0), mine = wrapShareKey(10, 3, 77);
    expect(wrapShareKeyValid(10, 3, 77, team)).toBe(false);
    expect(wrapShareKeyValid(10, 3, 0, mine)).toBe(false);
  });
  it("a game share key does not open a recap", () => {
    expect(wrapShareKeyValid(10, 3, 77, shareKey(77))).toBe(false);
  });
  it("tampered, empty and junk keys are refused", () => {
    const k = wrapShareKey(10, 3, 77);
    expect(wrapShareKeyValid(10, 3, 77, k.slice(0, -1) + (k.endsWith("A") ? "B" : "A"))).toBe(false);
    expect(wrapShareKeyValid(10, 3, 77, "")).toBe(false);
    expect(wrapShareKeyValid(10, 3, 77, null)).toBe(false);
    expect(wrapShareKeyValid(10, 3, 77, "x".repeat(200))).toBe(false);
  });
});

describe("A3 recapAccess", () => {
  beforeEach(reset);
  const key = wrapShareKey(10, 3, 77);
  it("a valid key opens that recap with no sign-in", async () => {
    const { recapAccess } = await import("@/server/wrapped");
    expect(await recapAccess(db, null, 10, 3, "77", key)).toMatchObject({ playerId: 77, mode: "shared" });
  });
  it("a signed-out viewer with no key or a wrong key gets 401", async () => {
    const { recapAccess } = await import("@/server/wrapped");
    await expect(recapAccess(db, null, 10, 3, null, null)).rejects.toMatchObject({ status: 401 });
    await expect(recapAccess(db, null, 10, 3, "78", key)).rejects.toMatchObject({ status: 401 });
  });
  it("a signed-in viewer who is not on the roster gets 403", async () => {
    const { recapAccess } = await import("@/server/wrapped");
    await expect(recapAccess(db, { id: 5 }, 10, 3, null, null)).rejects.toMatchObject({ status: 403 });
  });
  it("a teammate cannot open another player's recap without a key", async () => {
    const { recapAccess } = await import("@/server/wrapped");
    m.state.rows["JOIN roster_entries re ON re.player_id=p.id WHERE p.user_id"] = { id: 12 };
    await expect(recapAccess(db, { id: 5 }, 10, 3, "77", null)).rejects.toMatchObject({ status: 403 });
  });
});

describe("A3 card text", () => {
  it("alt text is the title, the big thing and the lines, one sentence each", () => {
    expect(cardAlt({ title: "Showed up", headline: "12 games", lines: ["Latest puck drop: 11:15 pm on Oct 9."] }))
      .toBe("Showed up. 12 games. Latest puck drop: 11:15 pm on Oct 9.");
  });
});

/* ---------- names: a hidden name never shows on another player's card ---------- */

describe("names on cards", () => {
  beforeEach(reset);
  it("signed in uses the viewer name rules, so a hidden player stays hidden", async () => {
    const { namesFor } = await import("@/server/wrapped");
    const names = await namesFor(db, { id: 1 }, [2, 3]);
    expect(names.get(2)).toBe("Player #44");
    expect(names.get(3)).toBe("Name 3");
  });
  it("signed out gives initials, and a hidden player is a number or 'Hidden player'", async () => {
    const { namesFor } = await import("@/server/wrapped");
    m.state.lists["FROM players p"] = [
      { id: 2, name: "Mike Tolliver", hid: true, number: "44" },
      { id: 3, name: "Sam Rivers", hid: false, number: "9" },
      { id: 4, name: "Pat Quinn", hid: true, number: null },
    ];
    const names = await namesFor(db, null, [2, 3, 4]);
    expect(names.get(2)).toBe("Player #44");
    expect(names.get(4)).toBe("Hidden player");
    for (const v of names.values()) { expect(v).not.toMatch(/Tolliver|Quinn/); }
  });
});

/* ---------- A4: team awards ---------- */

describe("A4 awards", () => {
  const awards = AWARD_KEYS.map((key) => ({ key }));
  it("a hidden award is gone for everyone but the manager", () => {
    expect(visibleAwards(awards, ["points_leader"]).map((a) => a.key)).not.toContain("points_leader");
    expect(visibleAwards(awards, [])).toHaveLength(AWARD_KEYS.length);
  });
  it("only known award keys are stored, each once", () => {
    expect(cleanHidden(["record", "record", "nope", 5])).toEqual(["record"]);
    expect(cleanHidden("record")).toEqual([]);
    expect(cleanHidden(undefined)).toEqual([]);
  });
  it("leaders keeps ties up to three, and nobody when the top is zero", () => {
    expect(leaders([{ value: 5 }, { value: 5 }, { value: 3 }])).toHaveLength(2);
    expect(leaders([{ value: 5 }, { value: 5 }, { value: 5 }, { value: 5 }])).toHaveLength(3);
    expect(leaders([{ value: 0 }, { value: 0 }])).toEqual([]);
    expect(leaders([])).toEqual([]);
  });
});

/* ---------- A5: Wrap the season ---------- */

describe("A5 wrapSeason", () => {
  beforeEach(reset);
  it("someone who cannot manage the team gets the friendly 403", async () => {
    const { wrapSeason } = await import("@/server/wrapped");
    m.state.can = false;
    await expect(wrapSeason(db, { id: 1 }, { teamId: 10 })).rejects.toMatchObject({ status: 403, message: "Only the captain or rink staff can wrap the season." });
  });
  it("signed out gets 401", async () => {
    const { wrapSeason } = await import("@/server/wrapped");
    await expect(wrapSeason(db, null, { teamId: 10 })).rejects.toMatchObject({ status: 401 });
  });
  it("a team with no games gets 409, not an empty recap", async () => {
    const { wrapSeason } = await import("@/server/wrapped");
    await expect(wrapSeason(db, { id: 1 }, { teamId: 10 })).rejects.toMatchObject({ status: 409 });
  });
  it("a captain opens it, audits once, and a second press changes nothing", async () => {
    const { wrapSeason } = await import("@/server/wrapped");
    m.state.rows["JOIN seasons s ON s.id=g.season_id"] = { id: 3, name: "Fall 2026" };
    const first = await wrapSeason(db, { id: 1 }, { teamId: 10 });
    const second = await wrapSeason(db, { id: 1 }, { teamId: 10 });
    expect(first).toMatchObject({ opened: 1, alreadyOpen: 0 });
    expect(second).toMatchObject({ opened: 0, alreadyOpen: 1 });
    expect(m.state.audits).toHaveLength(1);
    expect(m.state.audits[0][2]).toBe("season.wrap");
  });
  it("asking for nothing is a 400", async () => {
    const { wrapSeason } = await import("@/server/wrapped");
    await expect(wrapSeason(db, { id: 1 }, {})).rejects.toMatchObject({ status: 400 });
  });
});
