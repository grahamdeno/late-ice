"use client";
import { QueryClient, type QueryFunction } from "@tanstack/react-query";

// The API is served by this same Next.js app.
export const API_BASE = "";
// The static read-only mirror from the pilot is gone; kept so older views compile unchanged.
export const SNAPSHOT = false;

// Current Supabase access token, kept in sync by AuthProvider.
let token = "";
export function getToken() { return token; }
export function setToken(t: string | null) { token = t || ""; }

export function authHeaders(): Record<string, string> {
  return token ? { Authorization: `Bearer ${token}` } : {};
}

export function apiUrl(path: string) { return `${API_BASE}${path}`; }

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
  async ({ queryKey }) => {
    const res = await fetch(apiUrl(String(queryKey[0])), { headers: authHeaders(), cache: "no-store" });
    if (on401 === "returnNull" && res.status === 401) return null as any;
    await throwIfResNotOk(res);
    return await res.json();
  };

export function makeQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: { queryFn: getQueryFn({ on401: "throw" }), refetchOnWindowFocus: false, staleTime: 30_000, retry: false },
      mutations: { retry: false },
    },
  });
}
// One client for the browser session; AuthProvider and the views share it.
export const queryClient = makeQueryClient();
