import { useQuery } from "@tanstack/react-query";
import { SNAPSHOT, apiRequest, getQueryFn, getToken, queryClient, setToken } from "./queryClient";

export interface MeUser {
  id: number; phone: string; name: string | null; number: string | null; position: "F" | "D" | "G" | null;
  homeRink: { id: number; name: string } | null; status: "available" | "ir" | "away" | "resting";
  statusUntil: string | null; hidden: boolean; profileComplete: boolean;
}
export interface MeSlot {
  id: number; name: string; rating: number; games_rated: number; position: string; number: string | null; source: string;
  team_id: number; team_name: string; color: string; logo: string | null; league_id: number; level: string; league_name: string;
  captain: { id: number; name: string } | null; isCaptain: boolean;
}
export interface Notice { id: number; kind: string; title: string; body: string | null; link: string | null; team_id: number | null; read_at: string | null; created_at: string }
export interface Me {
  user: MeUser; slots: MeSlot[]; captainTeams: { id: number; name: string; color: string; logo: string | null; level: string; rink_id: number }[];
  notifications: Notice[]; unread: number;
  suggestions: { id: number; name: string; rating: number; number: string | null; team_id: number; team_name: string; color: string; logo: string | null; level: string; score: number }[];
}

export const signedIn = () => !SNAPSHOT && !!getToken();

export function useMe() {
  const q = useQuery<Me | null>({
    queryKey: ["/api/me"],
    queryFn: getQueryFn({ on401: "returnNull" }),
    enabled: signedIn(),
    // Drafts, claims and notices arrive from other people; keep this fresh.
    staleTime: 15_000,
    refetchOnWindowFocus: true,
    refetchOnMount: true,
    refetchInterval: 60_000,
  });
  return { me: signedIn() ? q.data ?? null : null, loading: signedIn() && q.isLoading, refetch: q.refetch };
}

export async function signOut() {
  try { await apiRequest("POST", "/api/auth/logout"); } catch {}
  setToken(null);
  queryClient.clear();
}

/** Run a write, then refresh everything that may show it. Returns an error message or null. */
export async function act(method: string, url: string, body?: unknown): Promise<string | null> {
  try {
    await apiRequest(method, url, body);
    await queryClient.invalidateQueries();
    return null;
  } catch (e: any) {
    return e?.message || "Something went wrong.";
  }
}

export const POSITION_LABEL: Record<string, string> = { F: "Forward", D: "Defense", G: "Goalie" };
export const STATUS_LABEL: Record<string, string> = { available: "Available", ir: "Injured reserve", away: "Away", resting: "Resting" };
