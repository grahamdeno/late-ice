"use client";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { QueryClientProvider, useQuery } from "@tanstack/react-query";
import { getQueryFn, queryClient, setCurrentPath, syncQueryScope, tabPrefetchKeys, tokenSubject } from "@/lib/queryClient";
import { AuthProvider, useAuth } from "@/lib/auth";
import { FilterCtx, type Boot } from "@/lib/ui";
import { Shell } from "@/components/Shell";
import { useLocation } from "@/lib/router";

const RINK_KEY = "lateice.rink";
function Filtered({ children }: { children: React.ReactNode }) {
  const [path] = useLocation();
  setCurrentPath(path);
  const { ready, token } = useAuth();
  const [leagueId, setLeagueId] = useState<number | null>(null);
  // The rink you're looking at: picked on this phone, else your home rink (the server fills that in), else the first rink.
  const [rinkId, setRinkIdState] = useState<number | null>(null);
  useEffect(() => {
    try { const v = Number(localStorage.getItem(RINK_KEY)); if (v > 0) setRinkIdState(v); } catch { /* private mode */ }
  }, []);
  const setRinkId = (id: number) => {
    setRinkIdState(id); setLeagueId(null);
    try { localStorage.setItem(RINK_KEY, String(id)); } catch { /* private mode */ }
  };
  const scope = `${tokenSubject(token)}|${rinkId ?? ""}`;
  useLayoutEffect(() => { syncQueryScope(scope, ready); }, [scope, ready]);
  const { data: boot } = useQuery<Boot>({ queryKey: [rinkId ? `/api/bootstrap?rink=${rinkId}` : "/api/bootstrap"] });
  const prefetched = useRef("");
  const bootRink = boot?.rink?.id ?? null;
  const bootSeason = boot?.season?.id ?? null;
  useEffect(() => {
    if (!ready || !bootRink) return;
    const sig = `${tokenSubject(token)}|${bootRink}|${bootSeason ?? ""}`;
    if (prefetched.current === sig) return;
    prefetched.current = sig;
    const keys = tabPrefetchKeys({ rinkId: bootRink, seasonId: bootSeason, signedIn: !!token });
    void Promise.all(keys.map((key) => queryClient.prefetchQuery({
      queryKey: [key],
      ...(key === "/api/me" ? { queryFn: getQueryFn({ on401: "returnNull" }) } : {}),
    })));
  }, [ready, token, bootRink, bootSeason]);
  return (
    <FilterCtx.Provider value={{ leagueId, setLeagueId, rinkId: rinkId ?? boot?.rink?.id ?? null, setRinkId, boot }}>
      <Shell>{children}</Shell>
    </FilterCtx.Provider>
  );
}

export function Providers({ children }: { children: React.ReactNode }) {
  // Installable PWA: register the offline shell where allowed.
  useEffect(() => {
    try {
      if ("serviceWorker" in navigator && window.self === window.top) navigator.serviceWorker.register("/sw.js").catch(() => {});
    } catch { /* not available here */ }
  }, []);
  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <Filtered>{children}</Filtered>
      </AuthProvider>
    </QueryClientProvider>
  );
}
