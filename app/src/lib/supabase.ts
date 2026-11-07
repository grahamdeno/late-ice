"use client";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

// Browser client. Used only for email-code and passkey sign-in; all data goes through /api.
let client: SupabaseClient | null = null;
export function supabase() {
  if (!client) {
    client = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
      auth: { persistSession: true, autoRefreshToken: true, storageKey: "lateice.auth", experimental: { passkey: true } } as any,
    });
  }
  return client;
}

/** Face ID, Touch ID, Windows Hello or a security key: the browser has to offer one. */
export function passkeysSupported() {
  return typeof window !== "undefined" && !!(window as any).PublicKeyCredential;
}

/** Plain words for the common passkey failures. */
export function passkeyError(message?: string | null) {
  const m = String(message ?? "");
  if (/cancel|abort|not allowed|NotAllowed/i.test(m)) return "That was canceled. You can try again, or use the email code.";
  if (/disabled/i.test(m)) return "Passkeys aren't turned on yet. Use the email code for now.";
  if (/not found|no credential|no passkey/i.test(m)) return "No passkey found for this device. Sign in with the email code, then add one in Settings.";
  return "Couldn't use a passkey. Use the email code instead.";
}
