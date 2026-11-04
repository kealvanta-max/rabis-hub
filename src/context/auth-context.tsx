"use client";

import { createContext, useContext, useEffect, useState, ReactNode } from "react";
import type { RealtimeChannel } from "@supabase/supabase-js";
import { supabase, isSupabaseConfigured } from "@/lib/supabase";
import { mapProfileRow } from "@/lib/db";
import type { UserDoc } from "@/lib/types";

export interface AuthUser {
  uid: string;
  email: string | null;
  /** Name supplied at sign-up (kept for compatibility with older pages). */
  displayName: string | null;
}

interface AuthState {
  user: AuthUser | null;
  userData: UserDoc | null;
  isAdmin: boolean;
  loading: boolean;
  /** True while the profile row is still loading after sign-in. */
  profileLoading: boolean;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthState>({
  user: null,
  userData: null,
  isAdmin: false,
  loading: true,
  profileLoading: false,
  logout: async () => {},
});

// Admin rights live in `profiles.is_admin`. The env fallback covers the very
// first deployment, before the first admin has been promoted in the database.
const ADMIN_EMAILS = (process.env.NEXT_PUBLIC_ADMIN_EMAIL || "")
  .split(",")
  .map((email) => email.trim().toLowerCase())
  .filter(Boolean);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [userData, setUserData] = useState<UserDoc | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [loading, setLoading] = useState(true);
  const [profileLoading, setProfileLoading] = useState(false);

  useEffect(() => {
    // Without a Supabase project we must not call the auth API: it would spam
    // network errors and the app would stay stuck on the loading spinner.
    if (!isSupabaseConfigured) {
      setLoading(false);
      return;
    }

    let cancelled = false;
    let channel: RealtimeChannel | null = null;

    const applyProfile = (row: Record<string, unknown> | null, email: string | null) => {
      setUserData(row ? mapProfileRow<UserDoc>(row) : null);
      setIsAdmin(
        Boolean(row?.is_admin) || (email ? ADMIN_EMAILS.includes(email.toLowerCase()) : false)
      );
      setProfileLoading(false);
    };

    const syncSession = async (session: { user: { id: string; email?: string | null } } | null) => {
      if (cancelled) return;

      if (channel) {
        void supabase.removeChannel(channel);
        channel = null;
      }

      if (!session?.user) {
        setUser(null);
        setUserData(null);
        setIsAdmin(false);
        setProfileLoading(false);
        setLoading(false);
        return;
      }

      const authUser = session.user;
      const email = authUser.email ?? null;
      const displayName =
        ((authUser as { user_metadata?: { name?: string } }).user_metadata?.name ?? null) as
          | string
          | null;
      setUser({ uid: authUser.id, email, displayName });
      setProfileLoading(true);

      const { data, error } = await supabase
        .from("profiles")
        .select("*")
        .eq("id", authUser.id)
        .maybeSingle();

      if (cancelled) return;
      if (error) {
        console.error("Error loading profile:", error.message);
        applyProfile(null, email);
      } else {
        applyProfile((data as Record<string, unknown> | null) ?? null, email);
      }
      setLoading(false);

      // Live profile updates (admin approves the member, plan added, …).
      channel = supabase
        .channel(`profile:${authUser.id}`)
        .on(
          "postgres_changes",
          { event: "*", schema: "public", table: "profiles", filter: `id=eq.${authUser.id}` },
          (payload) => {
            if (payload.eventType === "DELETE") {
              applyProfile(null, email);
              return;
            }
            applyProfile(payload.new as Record<string, unknown>, email);
          }
        )
        .subscribe();
    };

    void supabase.auth.getSession().then(({ data }) => syncSession(data.session));

    const { data: listener } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === "INITIAL_SESSION") return; // handled by getSession above
      void syncSession(session);
    });

    return () => {
      cancelled = true;
      listener.subscription.unsubscribe();
      if (channel) void supabase.removeChannel(channel);
    };
  }, []);

  const logout = async () => {
    try {
      await supabase.auth.signOut();
    } catch (error) {
      console.error("Sign out failed:", error);
    }
    setUser(null);
    setUserData(null);
    setIsAdmin(false);
    setProfileLoading(false);
  };

  return (
    <AuthContext.Provider value={{ user, userData, isAdmin, loading, profileLoading, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
