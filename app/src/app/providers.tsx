"use client";
import { useEffect, useState } from "react";
import { QueryClientProvider, useQuery } from "@tanstack/react-query";
import { queryClient } from "@/lib/queryClient";
import { AuthProvider } from "@/lib/auth";
import { FilterCtx, type Boot } from "@/lib/ui";
import { Shell } from "@/components/Shell";

function Filtered({ children }: { children: React.ReactNode }) {
  const [leagueId, setLeagueId] = useState<number | null>(null);
  const { data: boot } = useQuery<Boot>({ queryKey: ["/api/bootstrap"] });
  return (
    <FilterCtx.Provider value={{ leagueId, setLeagueId, boot }}>
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
