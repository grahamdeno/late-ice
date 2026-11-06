"use client";
import { useEffect, useState } from "react";
import { QueryClientProvider, useQuery } from "@tanstack/react-query";
import { queryClient } from "@/lib/queryClient";
import { AuthProvider } from "@/lib/auth";
import { FilterCtx, type Boot } from "@/lib/ui";
import { Shell } from "@/components/Shell";
import { InstallCard } from "@/components/InstallCard";
import { UpdateBanner } from "@/components/UpdateBanner";
import { NotificationSettings } from "@/components/NotificationSettings";

const RINK_KEY = "lateice.rink";
function Filtered({ children }: { children: React.ReactNode }) {
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
  const { data: boot } = useQuery<Boot>({ queryKey: [rinkId ? `/api/bootstrap?rink=${rinkId}` : "/api/bootstrap"] });
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
        <InstallCard />
        <UpdateBanner />
        <NotificationSettings overlay />
        <Filtered>{children}</Filtered>
      </AuthProvider>
    </QueryClientProvider>
  );
}
