import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "";

/**
 * `true` when the required NEXT_PUBLIC_SUPABASE_* variables are present.
 *
 * The client is always created (with inert placeholder credentials) so a
 * missing env var can never crash the bundle — UI code uses this flag to show
 * a helpful "not configured" message instead of a blank screen.
 */
export const isSupabaseConfigured = Boolean(url && anonKey);

const FALLBACK_URL = "https://placeholder.supabase.co";
const FALLBACK_ANON_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.placeholder.placeholder";

export const supabase: SupabaseClient = createClient(
  isSupabaseConfigured ? url : FALLBACK_URL,
  isSupabaseConfigured ? anonKey : FALLBACK_ANON_KEY,
  {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
    },
  }
);

if (!isSupabaseConfigured && typeof window !== "undefined") {
  console.warn(
    "[Rabi's Saving Hub] Supabase is not configured. Add NEXT_PUBLIC_SUPABASE_URL and " +
      "NEXT_PUBLIC_SUPABASE_ANON_KEY (see .env.example) to enable sign-in, dashboards and admin tools."
  );
}
