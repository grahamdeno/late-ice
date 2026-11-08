"use client";
import { QueryClient, keepPreviousData, type QueryFunction } from "@tanstack/react-query";

// The API is served by this same Next.js app.
export const API_BASE = "";
// The static read-only mirror from the pilot is gone; kept so older views compile unchanged.
export const SNAPSHOT = false;

export const STALE_MS = 5 * 60 * 1000;
export const GC_MS = 30 * 60 * 1000;
/** How often the signed-in profile refetches. Drafts and notices wait this long. */
export const ME_REFETCH_MS = STALE_MS;

// Current Supabase access token, kept in sync by AuthProvider.
let token = "";
export function getToken() { return token; }
export function setToken(t: string | null) { token = t || ""; }

export function authHeaders(): Record<string, string> {
  return token ? { Authorization: `Bearer ${token}` } : {};
}

export function apiUrl(path: string) { return `${API_BASE}${path}`; }

/** `sub` from an access token. Empty when signed out or the token is not a JWT. */
export function tokenSubject(accessToken: string): string {
  if (!accessToken) return "";
  try {
    const part = accessToken.split(".")[1];
    if (!part) return "";
    const padded = part.replace(/-/g, "+").replace(/_/g, "/") + "=".repeat((4 - (part.length % 4)) % 4);
    const json = JSON.parse(atob(padded));
    return typeof json.sub === "string" ? json.sub : "";
  } catch {
    return "";
  }
}

async function throwIfResNotOk(res: Response) {
  if (!res.ok) {
    const text = (await res.text()) || res.statusText;
    let message = text;
    try { message = JSON.parse(text).message || text; } catch {}
    throw Object.assign(new Error(message), { status: res.status, body: text });
  }
}

export async function apiRequest(method: string, url: string, data?: unknown): Promise<Response> {
  const res = await fetch(apiUrl(url), {
    method,
    headers: { ...(data ? { "Content-Type": "application/json" } : {}), ...authHeaders() },
    body: data ? JSON.stringify(data) : undefined,
  });
  await throwIfResNotOk(res);
  return res;
}

type UnauthorizedBehavior = "returnNull" | "throw";
export const getQueryFn: <T>(options: { on401: UnauthorizedBehavior }) => QueryFunction<T> =
  ({ on401 }) =>
  async ({ queryKey, signal }) => {
    const url = String(queryKey[0]);
    const res = await fetch(apiUrl(url), { headers: authHeaders(), signal });
    if (on401 === "returnNull" && res.status === 401) return null as any;
    await throwIfResNotOk(res);
    const data = await res.json();
    tagQueryData(data, url);
    return data;
  };

export function queryKeyUrl(queryKey: readonly unknown[] | undefined): string | null {
  const head = queryKey?.[0];
  return typeof head === "string" ? head : null;
}

/**
 * Prefix match on the URL stored in queryKey[0].
 * `/api/me` matches `/api/me`, `/api/me/spots` and `/api/me?x=1`, not `/api/media`.
 */
export function queryKeyMatchesPrefix(queryKey: readonly unknown[], prefix: string): boolean {
  const url = queryKeyUrl(queryKey);
  if (!url || !prefix) return false;
  return url === prefix || url.startsWith(prefix + "/") || url.startsWith(prefix + "?");
}

function parseQueryUrl(url: string) {
  const i = url.indexOf("?");
  const path = i === -1 ? url : url.slice(0, i);
  return { path, params: new URLSearchParams(i === -1 ? "" : url.slice(i + 1)) };
}

/**
 * keepPreviousData is safe for a filter change (league, season) and unsafe when the
 * resource id, rink, or record id changes. Account changes are handled by dropping the cache.
 */
export function shouldKeepPrevious(prevUrl: string, nextUrl: string): boolean {
  if (prevUrl === nextUrl) return true;
  const prev = parseQueryUrl(prevUrl);
  const next = parseQueryUrl(nextUrl);
  if (prev.path !== next.path) return false;
  const prevId = prev.params.get("id");
  const nextId = next.params.get("id");
  if ((prevId || nextId) && prevId !== nextId) return false;
  const prevRink = prev.params.get("rink");
  const nextRink = next.params.get("rink");
  if (prevRink !== nextRink) {
    const filterSwap = !!(prev.params.get("league") || next.params.get("league"));
    if (!filterSwap) return false;
  }
  return true;
}

const dataScope = new WeakMap<object, string>();

export function tagQueryData(data: unknown, _url: string) {
  if (data && typeof data === "object") dataScope.set(data, activeScope);
}

let activeScope = "";
let scopeReady = false;

/** Test helper. Production code reaches the same state on a fresh page. */
export function resetQueryScopeForTests() {
  activeScope = "";
  scopeReady = false;
}

export function currentQueryScope() { return activeScope; }

/**
 * Drop cached responses when the signed-in account or the selected rink changes,
 * and on the first signed-in paint so anonymous responses are not reused.
 */
export function syncQueryScope(scope: string, ready: boolean) {
  if (!ready) return;
  if (!scopeReady) {
    scopeReady = true;
    activeScope = scope;
    if (scope.split("|")[0]) dropForNewScope();
    return;
  }
  if (scope === activeScope) return;
  activeScope = scope;
  dropForNewScope();
}

/**
 * Forget every cached response, then refetch what is on screen.
 * removeQueries would cancel a request a mounted page is waiting on and nothing would restart it:
 * a signed-in fresh load of a team or player page then spun forever.
 */
function dropForNewScope() {
  void queryClient.resetQueries().catch(() => {});
}

let currentPath = "/";
export function setCurrentPath(path: string) { currentPath = path || "/"; }
export function getCurrentPath() { return currentPath; }

/** Query prefixes for the tab that is on screen. Nested team and player pages count as their tab. */
export function currentTabPrefixes(path = currentPath): string[] {
  if (path.startsWith("/leagues") || path.startsWith("/league") || path.startsWith("/team")) return ["/api/standings", "/api/leagues", "/api/teams"];
  if (path.startsWith("/players") || path.startsWith("/player")) return ["/api/players"];
  if (path.startsWith("/scan") || path.startsWith("/sheet")) return ["/api/samples", "/api/sheets"];
  if (path.startsWith("/me") || path.startsWith("/settings") || path.startsWith("/join")) return ["/api/me"];
  if (path.startsWith("/rink")) return ["/api/rink", "/api/rinks", "/api/bootstrap"];
  if (path.startsWith("/pool")) return ["/api/pool"];
  if (path.startsWith("/staff")) return ["/api/staff"];
  if (path.startsWith("/game")) return ["/api/games"];
  if (path.startsWith("/event")) return ["/api/events"];
  return ["/api/feed"];
}

export function fallbackInvalidationPrefixes(path = currentPath): string[] {
  return [...new Set(["/api/me", ...currentTabPrefixes(path)])];
}

/** Home, Standings, Players and Me, with the same default keys those views use (no league filter). */
export function tabPrefetchKeys(opts: { rinkId: number | null; seasonId: number | null; signedIn: boolean }): string[] {
  const rink = opts.rinkId;
  const feed = rink ? `/api/feed?rink=${rink}` : "/api/feed";
  const standings = rink ? `/api/standings?rink=${rink}${opts.seasonId ? `&season=${opts.seasonId}` : ""}` : "/api/standings";
  const players = rink ? `/api/players?rink=${rink}` : "/api/players";
  const keys = [feed, standings, players];
  if (opts.signedIn) keys.push("/api/me");
  return keys;
}

export function invalidationTargets(keys?: string[], path?: string): string[] {
  return keys?.length ? [...new Set(keys.filter(Boolean))] : fallbackInvalidationPrefixes(path);
}

/** The write behind act(): refresh only the given prefixes, or /api/me plus the current tab. */
export async function runMutation(method: string, url: string, body?: unknown, keys?: string[]): Promise<string | null> {
  try {
    await apiRequest(method, url, body);
    await invalidatePrefixes(invalidationTargets(keys));
    return null;
  } catch (e: any) {
    return e?.message || "Something went wrong.";
  }
}

export function invalidatePrefixes(prefixes: string[]) {
  const unique = [...new Set(prefixes.filter(Boolean))];
  if (!unique.length) return Promise.resolve();
  return queryClient.invalidateQueries({
    predicate: (q) => unique.some((p) => queryKeyMatchesPrefix(q.queryKey, p)),
  });
}

function scopeSafePlaceholder(nextKey: readonly unknown[], inner: (previousData: unknown, previousQuery?: { queryKey?: readonly unknown[] }) => unknown) {
  return (previousData: unknown, previousQuery?: { queryKey?: readonly unknown[] }) => {
    const prevUrl = queryKeyUrl(previousQuery?.queryKey);
    const nextUrl = queryKeyUrl(nextKey);
    if (prevUrl && nextUrl && !shouldKeepPrevious(prevUrl, nextUrl)) return undefined;
    if (previousData && typeof previousData === "object") {
      const stamped = dataScope.get(previousData);
      if (stamped !== undefined && stamped !== activeScope) return undefined;
    }
    return inner(previousData, previousQuery);
  };
}

export function makeQueryClient() {
  const client = new QueryClient({
    defaultOptions: {
      queries: {
        queryFn: getQueryFn({ on401: "throw" }),
        refetchOnWindowFocus: false,
        staleTime: STALE_MS,
        gcTime: GC_MS,
        placeholderData: keepPreviousData,
        retry: false,
      },
      mutations: { retry: false },
    },
  });
  // The placeholder callback only receives the previous query. Close over the next key
  // when each observer's options are defaulted, so a player or rink change does not keep the last screen.
  const orig = client.defaultQueryOptions.bind(client);
  client.defaultQueryOptions = (options) => {
    const defaulted = orig(options);
    if (options?._defaulted) return defaulted;
    if (typeof defaulted.placeholderData === "function") {
      const inner = defaulted.placeholderData as (previousData: unknown, previousQuery?: { queryKey?: readonly unknown[] }) => unknown;
      defaulted.placeholderData = scopeSafePlaceholder(defaulted.queryKey, inner) as typeof defaulted.placeholderData;
    }
    return defaulted;
  };
  return client;
}
// One client for the browser session; AuthProvider and the views share it.
export const queryClient = makeQueryClient();
