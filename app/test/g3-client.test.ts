import { readFileSync } from "node:fs";
import { QueryObserver } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  ME_REFETCH_MS,
  STALE_MS,
  GC_MS,
  currentTabPrefixes,
  fallbackInvalidationPrefixes,
  getQueryFn,
  invalidatePrefixes,
  makeQueryClient,
  queryClient,
  queryKeyMatchesPrefix,
  resetQueryScopeForTests,
  runMutation,
  setCurrentPath,
  shouldKeepPrevious,
  syncQueryScope,
  tabPrefetchKeys,
  tokenSubject,
} from "../src/lib/queryClient";

beforeEach(() => {
  queryClient.clear();
  resetQueryScopeForTests();
  setCurrentPath("/");
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("query defaults", () => {
  it("keeps data for 5 minutes and garbage-collects after 30", () => {
    const defaults = makeQueryClient().getDefaultOptions().queries;
    expect(defaults?.staleTime).toBe(STALE_MS);
    expect(defaults?.staleTime).toBe(5 * 60 * 1000);
    expect(defaults?.gcTime).toBe(GC_MS);
    expect(defaults?.gcTime).toBe(30 * 60 * 1000);
    expect(typeof defaults?.placeholderData).toBe("function");
    expect(ME_REFETCH_MS).toBe(5 * 60 * 1000);
  });

  it("does not send cache no-store on a read", async () => {
    let init: RequestInit | undefined;
    vi.stubGlobal("fetch", async (_url: string, options: RequestInit) => {
      init = options;
      return new Response(JSON.stringify({ ok: true }), { status: 200 });
    });
    const fn = getQueryFn({ on401: "throw" });
    await fn({ queryKey: ["/api/health"], signal: new AbortController().signal } as never);
    expect(init?.cache).toBeUndefined();
    expect(init && "cache" in init).toBe(false);
  });
});

describe("prefix invalidation", () => {
  it("matches a path boundary and not a longer name", () => {
    expect(queryKeyMatchesPrefix(["/api/me"], "/api/me")).toBe(true);
    expect(queryKeyMatchesPrefix(["/api/me/spots"], "/api/me")).toBe(true);
    expect(queryKeyMatchesPrefix(["/api/me?x=1"], "/api/me")).toBe(true);
    expect(queryKeyMatchesPrefix(["/api/media"], "/api/me")).toBe(false);
    expect(queryKeyMatchesPrefix(["/api/teams/5/schedule"], "/api/teams")).toBe(true);
    expect(queryKeyMatchesPrefix(["/api/team-requests"], "/api/teams")).toBe(false);
    expect(queryKeyMatchesPrefix(["/api/feed?rink=1"], "/api/feed")).toBe(true);
    expect(queryKeyMatchesPrefix(["/api/feed?league=2"], "/api/feed?rink=1")).toBe(false);
  });

  it("invalidates only the prefixes act was given", async () => {
    vi.stubGlobal("fetch", async () => new Response("{}", { status: 200 }));
    queryClient.setQueryData(["/api/me"], { id: 1 });
    queryClient.setQueryData(["/api/players/5"], { name: "Ada" });
    queryClient.setQueryData(["/api/feed?rink=1"], { games: [] });
    const err = await runMutation("POST", "/api/players/5/claim", undefined, ["/api/players", "/api/me"]);
    expect(err).toBeNull();
    expect(queryClient.getQueryState(["/api/me"])?.isInvalidated).toBe(true);
    expect(queryClient.getQueryState(["/api/players/5"])?.isInvalidated).toBe(true);
    expect(queryClient.getQueryState(["/api/feed?rink=1"])?.isInvalidated).toBe(false);
  });

  it("falls back to /api/me and the current tab", async () => {
    vi.stubGlobal("fetch", async () => new Response("{}", { status: 200 }));
    setCurrentPath("/players");
    queryClient.setQueryData(["/api/me"], { id: 1 });
    queryClient.setQueryData(["/api/players?rink=4"], []);
    queryClient.setQueryData(["/api/feed?rink=4"], { games: [] });
    expect(await runMutation("POST", "/api/me/notifications/read")).toBeNull();
    expect(queryClient.getQueryState(["/api/me"])?.isInvalidated).toBe(true);
    expect(queryClient.getQueryState(["/api/players?rink=4"])?.isInvalidated).toBe(true);
    expect(queryClient.getQueryState(["/api/feed?rink=4"])?.isInvalidated).toBe(false);
  });

  it("leaves the cache alone when the write fails", async () => {
    vi.stubGlobal("fetch", async () => new Response(JSON.stringify({ message: "No" }), { status: 400 }));
    queryClient.setQueryData(["/api/me"], { id: 1 });
    expect(await runMutation("PATCH", "/api/me", { hidden: true }, ["/api/me"])).toBe("No");
    expect(queryClient.getQueryState(["/api/me"])?.isInvalidated).toBe(false);
  });

  it("names the tab prefixes the shell actually shows", () => {
    expect(currentTabPrefixes("/")).toEqual(["/api/feed"]);
    expect(currentTabPrefixes("/leagues")).toContain("/api/standings");
    expect(currentTabPrefixes("/team/3")).toContain("/api/teams");
    expect(currentTabPrefixes("/scan")).toContain("/api/samples");
    expect(currentTabPrefixes("/players")).toEqual(["/api/players"]);
    expect(currentTabPrefixes("/player/8")).toEqual(["/api/players"]);
    expect(currentTabPrefixes("/me")).toEqual(["/api/me"]);
    expect(currentTabPrefixes("/settings")).toEqual(["/api/me"]);
    expect(fallbackInvalidationPrefixes("/leagues")).toEqual(["/api/me", "/api/standings", "/api/leagues", "/api/teams"]);
  });
});

describe("keepPreviousData scope", () => {
  it("keeps a filter change and drops a different player, rink, or record", () => {
    expect(shouldKeepPrevious("/api/feed?rink=1", "/api/feed?league=3")).toBe(true);
    expect(shouldKeepPrevious("/api/leagues/4?season=1", "/api/leagues/4?season=2")).toBe(true);
    expect(shouldKeepPrevious("/api/players/1", "/api/players/2")).toBe(false);
    expect(shouldKeepPrevious("/api/feed?rink=1", "/api/feed?rink=2")).toBe(false);
    expect(shouldKeepPrevious("/api/bootstrap", "/api/bootstrap?rink=2")).toBe(false);
    expect(shouldKeepPrevious("/api/rink?id=1", "/api/rink?id=2")).toBe(false);
    expect(shouldKeepPrevious("/api/teams/1/schedule", "/api/teams/2/schedule")).toBe(false);
  });

  it("does not paint the previous player while the next one loads", async () => {
    const client = makeQueryClient();
    const obs = new QueryObserver(client, {
      queryKey: ["/api/players/1"],
      queryFn: async () => ({ name: "Ada" }),
    });
    const unsub = obs.subscribe(() => {});
    await obs.refetch();
    let release: (row: { name: string }) => void = () => {};
    const gate = new Promise<{ name: string }>((resolve) => { release = resolve; });
    obs.setOptions({ queryKey: ["/api/players/2"], queryFn: () => gate });
    expect(obs.getCurrentResult().isPlaceholderData).toBe(false);
    expect(obs.getCurrentResult().data).toBeUndefined();
    release({ name: "Bea" });
    await vi.waitFor(() => expect(obs.getCurrentResult().data).toEqual({ name: "Bea" }));
    unsub();
  });

  it("keeps the previous list when the league filter changes", async () => {
    const client = makeQueryClient();
    const obs = new QueryObserver(client, {
      queryKey: ["/api/feed?rink=1"],
      queryFn: async () => ({ games: [1] }),
    });
    const unsub = obs.subscribe(() => {});
    await obs.refetch();
    let release: (row: { games: number[] }) => void = () => {};
    const gate = new Promise<{ games: number[] }>((resolve) => { release = resolve; });
    obs.setOptions({ queryKey: ["/api/feed?league=9"], queryFn: () => gate });
    expect(obs.getCurrentResult().isPlaceholderData).toBe(true);
    expect(obs.getCurrentResult().data).toEqual({ games: [1] });
    release({ games: [9] });
    await vi.waitFor(() => expect(obs.getCurrentResult().data).toEqual({ games: [9] }));
    unsub();
  });
});

describe("account and rink cache", () => {
  it("reads the account id from the access token", () => {
    const body = Buffer.from(JSON.stringify({ sub: "user-a" })).toString("base64url");
    expect(tokenSubject(`x.${body}.y`)).toBe("user-a");
    expect(tokenSubject("")).toBe("");
  });

  it("drops cached data when the account or rink changes and keeps it when they do not", () => {
    syncQueryScope("user-a|1", true);
    queryClient.setQueryData(["/api/me"], { id: 1 });
    queryClient.setQueryData(["/api/feed?rink=1"], { games: [1] });
    syncQueryScope("user-a|1", true);
    expect(queryClient.getQueryData(["/api/me"])).toEqual({ id: 1 });
    syncQueryScope("user-a|2", true);
    expect(queryClient.getQueryData(["/api/feed?rink=1"])).toBeUndefined();
    queryClient.setQueryData(["/api/me"], { id: 1 });
    syncQueryScope("user-b|2", true);
    expect(queryClient.getQueryData(["/api/me"])).toBeUndefined();
  });

  it("drops anonymous responses once a signed-in scope is first applied", () => {
    queryClient.setQueryData(["/api/players?rink=1"], [{ name: "A. Y." }]);
    syncQueryScope("user-a|1", true);
    expect(queryClient.getQueryData(["/api/players?rink=1"])).toBeUndefined();
  });
});

describe("boot prefetch keys", () => {
  it("uses the standings, feed, players and me keys the views use by default", () => {
    expect(tabPrefetchKeys({ rinkId: 4, seasonId: 7, signedIn: true })).toEqual([
      "/api/feed?rink=4",
      "/api/standings?rink=4&season=7",
      "/api/players?rink=4",
      "/api/me",
    ]);
    expect(tabPrefetchKeys({ rinkId: 4, seasonId: null, signedIn: false })).toEqual([
      "/api/feed?rink=4",
      "/api/standings?rink=4",
      "/api/players?rink=4",
    ]);
    expect(tabPrefetchKeys({ rinkId: null, seasonId: null, signedIn: false })).toEqual([
      "/api/feed",
      "/api/standings",
      "/api/players",
    ]);
  });
});

function lin(channel: number) {
  const c = channel / 255;
  return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
}
function luminance(hex: string) {
  const h = hex.replace("#", "");
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
}
function contrast(fg: string, bg: string) {
  const lighter = Math.max(luminance(fg), luminance(bg));
  const darker = Math.min(luminance(fg), luminance(bg));
  return (lighter + 0.05) / (darker + 0.05);
}
function blockVars(css: string, header: string) {
  const start = css.indexOf(header);
  if (start < 0) throw new Error(`missing ${header}`);
  const body = css.slice(start, css.indexOf("}", start));
  const pick = (name: string) => {
    const m = body.match(new RegExp(`${name}:\\s*(#[0-9a-fA-F]{6})`));
    if (!m) throw new Error(`${header} missing ${name}`);
    return m[1].toLowerCase();
  };
  return { ice: pick("--ice"), ice2: pick("--ice-2"), mute: pick("--mute"), dim: pick("--dim") };
}

describe("polish css", () => {
  const css = readFileSync(new URL("../src/app/globals.css", import.meta.url), "utf8");
  const layout = readFileSync(new URL("../src/app/layout.tsx", import.meta.url), "utf8");

  it("measures mute and dim at 4.6:1 or better on both ice backgrounds", () => {
    const dark = blockVars(css, ":root {");
    const light = blockVars(css, ':root[data-theme="light"]');
    const auto = blockVars(css, ':root:not([data-theme="dark"])');
    expect(auto).toEqual(light);
    const rows = [
      ["dark mute on ice", dark.mute, dark.ice],
      ["dark mute on ice-2", dark.mute, dark.ice2],
      ["dark dim on ice", dark.dim, dark.ice],
      ["dark dim on ice-2", dark.dim, dark.ice2],
      ["light mute on ice", light.mute, light.ice],
      ["light mute on ice-2", light.mute, light.ice2],
      ["light dim on ice", light.dim, light.ice],
      ["light dim on ice-2", light.dim, light.ice2],
    ] as const;
    const ratios = rows.map(([label, fg, bg]) => ({ label, fg, bg, ratio: contrast(fg, bg) }));
    console.log(JSON.stringify(ratios, null, 2));
    for (const row of ratios) expect(row.ratio, row.label).toBeGreaterThanOrEqual(4.6);
  });

  it("uses a 12px blur, one reduced-motion block, a red focus ring, and 36px chips", () => {
    const glass = css.slice(css.indexOf(".glass, .glass-sheet"), css.indexOf(".glass {"));
    expect(glass).toContain("blur(12px)");
    expect(glass).not.toContain("saturate");
    const motion = css.match(/@media \(prefers-reduced-motion: reduce\) \{[\s\S]*?\}/g) ?? [];
    expect(motion).toHaveLength(1);
    expect(motion[0]).toContain(".rise");
    expect(motion[0]).toContain(".drop-in");
    expect(motion[0]).toContain(".pulse-dot");
    expect(motion[0]).toContain("animation: none");
    expect(css).toContain("outline: 2px solid var(--red)");
    const chip = css.match(/\.chip \{[\s\S]*?\}/)?.[0] ?? "";
    expect(chip).toContain("min-height: 44px");
    expect(chip).toContain("gap: 8px");
  });

  it("loads Satoshi locally and Big Shoulders through next/font", () => {
    expect(layout).toContain('next/font/local');
    expect(layout).toContain("Satoshi-Medium.woff2");
    expect(layout).toContain("Satoshi-Bold.woff2");
    expect(layout).toContain("Satoshi-Black.woff2");
    expect(layout).toContain("BigShouldersDisplay-latin.woff2");
    expect(layout).toContain('display: "swap"');
    expect(layout).not.toContain("fontshare");
    expect(layout).not.toContain("fonts.googleapis");
    expect(layout).not.toContain("Big_Shoulders");
    expect(css).toContain("var(--font-satoshi)");
    expect(css).toContain("var(--font-display-face)");
  });
});

describe("invalidatePrefixes helper", () => {
  it("refreshes every key under a prefix in one pass", async () => {
    queryClient.setQueryData(["/api/teams/1"], { id: 1 });
    queryClient.setQueryData(["/api/teams/1/manage"], { id: 1 });
    queryClient.setQueryData(["/api/players"], []);
    await invalidatePrefixes(["/api/teams"]);
    expect(queryClient.getQueryState(["/api/teams/1"])?.isInvalidated).toBe(true);
    expect(queryClient.getQueryState(["/api/teams/1/manage"])?.isInvalidated).toBe(true);
    expect(queryClient.getQueryState(["/api/players"])?.isInvalidated).toBe(false);
  });
});
