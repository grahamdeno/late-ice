import { QueryClient, QueryFunction } from "@tanstack/react-query";
import { snapshotFile } from "@shared/snapshot";

// Where the Late Ice server lives.
// 1. A server address saved on this device (Rink page → "Server address")
// 2. VITE_API_BASE baked in at build time (GitHub Pages build)
// 3. The preview proxy placeholder
// 4. Same origin
const SAVED_KEY = "lateice.server";
function savedBase(): string {
  try { return (localStorage.getItem(SAVED_KEY) || "").replace(/\/$/, ""); } catch { return ""; }
}
const BUILT_BASE = (import.meta.env.VITE_API_BASE as string | undefined)?.replace(/\/$/, "") || "";
const PROXY_BASE = "__PORT_5000__".startsWith("__") ? "" : "__PORT_5000__";
export const API_BASE = savedBase() || BUILT_BASE || PROXY_BASE;

// Snapshot mode: a static build (GitHub Pages) with no server configured reads
// JSON files generated from the database at build time. Read-only.
export const SNAPSHOT = import.meta.env.VITE_SNAPSHOT === "1" && !API_BASE;

export function setServerBase(url: string) {
  try { url ? localStorage.setItem(SAVED_KEY, url.trim()) : localStorage.removeItem(SAVED_KEY); } catch {}
  location.reload();
}
export function apiUrl(path: string) {
  if (SNAPSHOT) return `./data/${snapshotFile(path)}`;
  return `${API_BASE}${path}`;
}

async function throwIfResNotOk(res: Response) {
  if (!res.ok) {
    const text = (await res.text()) || res.statusText;
    throw new Error(`${res.status}: ${text}`);
  }
}

export async function apiRequest(method: string, url: string, data?: unknown | undefined): Promise<Response> {
  if (SNAPSHOT && method !== "GET") {
    throw new Error("This copy of Late Ice is a read-only mirror. Scanning and sign-in need the Late Ice server; set its address on the Rink page.");
  }
  const res = await fetch(apiUrl(url), {
    method,
    headers: data ? { "Content-Type": "application/json" } : {},
    body: data ? JSON.stringify(data) : undefined,
    credentials: "include",
  });
  await throwIfResNotOk(res);
  return res;
}

type UnauthorizedBehavior = "returnNull" | "throw";
export const getQueryFn: <T>(options: { on401: UnauthorizedBehavior }) => QueryFunction<T> =
  ({ on401: unauthorizedBehavior }) =>
  async ({ queryKey }) => {
    const res = await fetch(apiUrl(queryKey.join("/")), { credentials: "include" });
    if (unauthorizedBehavior === "returnNull" && res.status === 401) return null;
    await throwIfResNotOk(res);
    return await res.json();
  };

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: { queryFn: getQueryFn({ on401: "throw" }), refetchInterval: false, refetchOnWindowFocus: false, staleTime: Infinity, retry: false },
    mutations: { retry: false },
  },
});
