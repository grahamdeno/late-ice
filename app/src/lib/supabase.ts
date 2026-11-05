"use client";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

// Browser client. Used only for phone sign-in; all data goes through /api.
let client: SupabaseClient | null = null;
export function supabase() {
  if (!client) {
    client = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
      auth: { persistSession: true, autoRefreshToken: true, storageKey: "lateice.auth" },
    });
  }
  return client;
}
