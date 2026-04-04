"use client";

import { createContext, useContext, useEffect, useState, ReactNode } from "react";
import { onAuthStateChanged, User, signOut, getIdTokenResult } from "firebase/auth";
import { doc, getDoc } from "firebase/firestore";
import { auth, db } from "@/lib/firebase";
import type { UserDoc } from "@/lib/types";

interface AuthState {
  user: User | null;
  userData: UserDoc | null;
  isAdmin: boolean;
  loading: boolean;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthState>({
  user: null,
  userData: null,
  isAdmin: false,
  loading: true,
  logout: async () => {},
});

// Admin emails are now primarily handled via Firebase Custom Claims on the backend
// Use environmental fallback for local development if claims haven't synced yet
const ADMIN_EMAILS = (process.env.NEXT_PUBLIC_ADMIN_EMAIL || "").split(",").map(e => e.trim());

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [userData, setUserData] = useState<UserDoc | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (firebaseUser) => {
      setUser(firebaseUser);
      
      if (firebaseUser) {
        // Force-refresh the token to always get the latest custom claims from Firebase
        // This is critical after admin-setup.mjs grants custom claims
        const tokenResult = await getIdTokenResult(firebaseUser, true);
        const hasAdminClaim = !!tokenResult.claims.admin;
        
        // Fallback: also check the email list from environment variable
        const userEmail = (firebaseUser.email || "").toLowerCase().trim();
        const isEmailAdmin = ADMIN_EMAILS.some(e => e.toLowerCase().trim() === userEmail);
        
        const adminStatus = hasAdminClaim || isEmailAdmin;
        setIsAdmin(adminStatus);

        try {
          const snap = await getDoc(doc(db, "users", firebaseUser.uid));
          if (snap.exists()) {
            setUserData(snap.data() as UserDoc);
          }
        } catch (err) {
          console.error("Error fetching user data:", err);
        }
      } else {
        setUserData(null);
        setIsAdmin(false);
      }
      setLoading(false);
    });
    return () => unsub();
  }, []);

  const logout = async () => {
    await signOut(auth);
    setUser(null);
    setUserData(null);
    setIsAdmin(false);
  };

  return (
    <AuthContext.Provider value={{ user, userData, isAdmin, loading, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
