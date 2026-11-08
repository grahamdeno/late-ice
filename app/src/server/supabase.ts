import "server-only";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

// Service-role client: verifies sign-in tokens and reads/writes the private sheets bucket.
// Never imported by client code.
let admin: SupabaseClient | null = null;
export function supabaseAdmin() {
  if (!admin) {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!url || !key) throw new Error("Supabase server credentials are not set");
    admin = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
  }
  return admin;
}

export const SHEETS_BUCKET = "sheets";
