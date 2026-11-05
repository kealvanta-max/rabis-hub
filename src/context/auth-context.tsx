"use client";

import { createContext, useContext, useEffect, useState, ReactNode } from "react";
import { onAuthStateChanged, User, signOut, getIdTokenResult } from "firebase/auth";
import { doc, onSnapshot } from "firebase/firestore";
import { auth, db, isFirebaseConfigured } from "@/lib/firebase";
import type { UserDoc } from "@/lib/types";

interface AuthState {
  user: User | null;
  userData: UserDoc | null;
  isAdmin: boolean;
  loading: boolean;
  /** True while the Firestore user document is still loading after sign-in. */
  profileLoading: boolean;
  logout: () => Promise<void>;
  /** Re-read the Firestore profile (recovery when the document failed to load). */
  refreshProfile: () => Promise<void>;
}

const AuthContext = createContext<AuthState>({
  user: null,
  userData: null,
  isAdmin: false,
  loading: true,
  profileLoading: false,
  logout: async () => { },
  refreshProfile: async () => { },
});

// Admin emails are primarily handled via Firebase Custom Claims on the backend.
// The env fallback covers local development before claims have synced.
const ADMIN_EMAILS = (process.env.NEXT_PUBLIC_ADMIN_EMAIL || "")
  .split(",")
  .map((email) => email.trim().toLowerCase())
  .filter(Boolean);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [userData, setUserData] = useState<UserDoc | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [loading, setLoading] = useState(true);
  const [profileLoading, setProfileLoading] = useState(false);

  useEffect(() => {
    // Without a Firebase project we must not call onAuthStateChanged: it would
    // spam network errors and the app would stay stuck on the loading spinner.
    if (!isFirebaseConfigured) {
      setLoading(false);
      return;
    }

    let unsubscribeDoc: (() => void) | null = null;
    let cancelled = false;

    const unsub = onAuthStateChanged(
      auth,
      async (firebaseUser) => {
        if (cancelled) return;

        if (unsubscribeDoc) {
          unsubscribeDoc();
          unsubscribeDoc = null;
        }

        setUser(firebaseUser);

        if (firebaseUser) {
          setProfileLoading(true);
          let hasAdminClaim = false;
          try {
            const tokenResult = await getIdTokenResult(firebaseUser, true);
            hasAdminClaim = Boolean(tokenResult.claims.admin);
          } catch (error) {
            // Refresh can fail offline – fall back to the cached token.
            try {
              const cached = await getIdTokenResult(firebaseUser);
              hasAdminClaim = Boolean(cached.claims.admin);
            } catch {
              hasAdminClaim = false;
            }
            console.warn("Could not refresh auth token:", error);
          }

          if (cancelled) return;

          const userEmail = (firebaseUser.email || "").toLowerCase().trim();
          setIsAdmin(hasAdminClaim || ADMIN_EMAILS.includes(userEmail));

          unsubscribeDoc = onSnapshot(
            doc(db, "users", firebaseUser.uid),
            (snap) => {
              setUserData(snap.exists() ? (snap.data() as UserDoc) : null);
              setProfileLoading(false);
            },
            (error) => {
              console.error("Error listening to user data:", error);
              setUserData(null);
              setProfileLoading(false);
            }
          );
        } else {
          setUserData(null);
          setIsAdmin(false);
          setProfileLoading(false);
        }

        setLoading(false);
      },
      (error) => {
        console.error("Auth state error:", error);
        setUser(null);
        setUserData(null);
        setIsAdmin(false);
        setLoading(false);
      }
    );

    return () => {
      cancelled = true;
      if (unsubscribeDoc) unsubscribeDoc();
      unsub();
    };
  }, []);

  /** Re-read the profile document on demand (used by the "profile missing" recovery card). */
  const refreshProfile = async () => {
    if (!user) return;
    setProfileLoading(true);
    try {
      const { getDoc } = await import("firebase/firestore");
      const snap = await getDoc(doc(db, "users", user.uid));
      setUserData(snap.exists() ? (snap.data() as UserDoc) : null);
    } catch (error) {
      console.error("Profile refresh failed:", error);
    } finally {
      setProfileLoading(false);
    }
  };

  const logout = async () => {
    try {
      await signOut(auth);
    } catch (error) {
      console.error("Sign out failed:", error);
    }
    setUser(null);
    setUserData(null);
    setIsAdmin(false);
    setProfileLoading(false);
  };

  return (
    <AuthContext.Provider value={{ user, userData, isAdmin, loading, profileLoading, logout, refreshProfile }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
