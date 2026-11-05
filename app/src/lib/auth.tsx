"use client";
import { createContext, useContext, useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { apiRequest, getQueryFn, queryClient, setToken } from "./queryClient";
import { supabase } from "./supabase";

export interface MeUser {
  id: number; email: string | null; phone: string | null; name: string | null; number: string | null; position: "C" | "W" | "F" | "D" | "G" | null;
  homeRink: { id: number; name: string } | null; access: "approved" | "waiting" | "removed"; status: "active" | "ir" | "away"; lookingForTeam: boolean; willSub: boolean; avatar: any | null; archetypeSelf?: string | null;
  statusUntil: string | null; hidden: boolean; profileComplete: boolean;
}
export interface MeSlot {
  id: number; name: string; rating: number; games_rated: number; position: string; number: string | null; source: string;
  team_id: number; team_name: string; color: string; logo: string | null; league_id: number; level: string; league_name: string;
  captain: { id: number; name: string } | null; isCaptain: boolean; teamRole: "captain" | "assistant_captain" | null;
  assistants: { id: number; name: string }[];
  next: any | null;
  archetype: { archetype: string; votes: number } | null;
}
export interface MyRole { id: number; role: string; scopeType: string; scopeId: number | null; where: string | null }
export interface Notice { id: number; kind: string; title: string; body: string | null; link: string | null; team_id: number | null; read_at: string | null; created_at: string }
export interface Me {
  user: MeUser; slots: MeSlot[]; captainTeams: { id: number; name: string; color: string; logo: string | null; level: string; rink_id: number; role: "captain" | "assistant_captain" }[];
  subRequests: any[];
  roles: MyRole[]; staff: boolean; handoffs: { id: number; team_id: number; team_name: string; from_name: string }[];
  notifications: Notice[]; unread: number;
  suggestions: { id: number; name: string; rating: number; number: string | null; team_id: number; team_name: string; color: string; logo: string | null; level: string; score: number }[];
}

export const INVITE_KEY = "lateice.invite";
const AuthCtx = createContext<{ ready: boolean; token: string }>({ ready: false, token: "" });

/** Keeps the Supabase session token in sync with the API client. */
export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState({ ready: false, token: "" });
  useEffect(() => {
    const sb = supabase();
    let alive = true;
    sb.auth.getSession().then(({ data }) => {
      if (!alive) return;
      const t = data.session?.access_token ?? "";
      setToken(t);
      setState({ ready: true, token: t });
    });
    const { data: sub } = sb.auth.onAuthStateChange((_event, session) => {
      const t = session?.access_token ?? "";
      setToken(t);
      setState((prev) => {
        if (prev.token !== t) queryClient.invalidateQueries();
        return { ready: true, token: t };
      });
    });
    return () => { alive = false; sub.subscription.unsubscribe(); };
  }, []);
  // Signed in after opening a team's invite link: use it once, then forget it.
  useEffect(() => {
    if (!state.token) return;
    let invite: string | null = null;
    try { invite = localStorage.getItem(INVITE_KEY); } catch { /* storage off */ }
    if (!invite) return;
    apiRequest("POST", "/api/invites/accept", { token: invite })
      .then(() => queryClient.invalidateQueries())
      .catch(() => {})
      .finally(() => { try { localStorage.removeItem(INVITE_KEY); } catch { /* storage off */ } });
  }, [state.token]);
  return <AuthCtx.Provider value={state}>{children}</AuthCtx.Provider>;
}

export const useAuth = () => useContext(AuthCtx);

export function useMe() {
  const { ready, token } = useAuth();
  const q = useQuery<Me | null>({
    queryKey: ["/api/me"],
    queryFn: getQueryFn({ on401: "returnNull" }),
    enabled: ready && !!token,
    // Drafts, claims and notices arrive from other people; keep this fresh.
    staleTime: 15_000,
    refetchOnWindowFocus: true,
    refetchOnMount: true,
    refetchInterval: 60_000,
  });
  const me = token ? q.data ?? null : null;
  return { me, ready, loading: !ready || (!!token && q.isLoading), refetch: q.refetch };
}

export async function signOut() {
  await supabase().auth.signOut();
  setToken(null);
  queryClient.clear();
}

/** Trimmed, lowercase email, or null if it doesn't look like one. */
export function normEmail(raw: string) {
  const e = raw.trim().toLowerCase();
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e) ? e : null;
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

export const POSITION_LABEL: Record<string, string> = { C: "Center", W: "Wing", F: "Forward", D: "Defense", G: "Goalie" };
/** Position filters. "F" covers center, wing and forwards who haven't said which. */
export function posMatch(filter: string, pos: string | null | undefined) {
  if (filter === "all") return true;
  if (filter === "skaters") return pos !== "G";
  if (filter === "F") return pos === "C" || pos === "W" || pos === "F";
  return pos === filter;
}
export const ROLE_LABEL: Record<string, string> = {
  assistant_captain: "Assistant captain", captain: "Captain", scorekeeper: "Scorekeeper", commissioner: "League commissioner",
  rink_manager: "Rink manager", support: "Support", admin: "Admin",
};
export const STATUS_LABEL: Record<string, string> = { active: "Active", available: "Active", ir: "Injured reserve", away: "Away" };
