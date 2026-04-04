"use client";

import { createContext, useContext, useEffect, useState, ReactNode } from "react";
import { onAuthStateChanged, User, signOut, getIdTokenResult } from "firebase/auth";
import { doc, onSnapshot } from "firebase/firestore";
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
    let unsubscribeDoc: (() => void) | null = null;

    const unsub = onAuthStateChanged(auth, async (firebaseUser) => {
      if (unsubscribeDoc) {
        unsubscribeDoc();
        unsubscribeDoc = null;
      }
      
      setUser(firebaseUser);
      
      if (firebaseUser) {
        const tokenResult = await getIdTokenResult(firebaseUser, true);
        const hasAdminClaim = !!tokenResult.claims.admin;
        
        const userEmail = (firebaseUser.email || "").toLowerCase().trim();
        const isEmailAdmin = ADMIN_EMAILS.some(e => e.toLowerCase().trim() === userEmail);
        
        const adminStatus = hasAdminClaim || isEmailAdmin;
        setIsAdmin(adminStatus);

        unsubscribeDoc = onSnapshot(
          doc(db, "users", firebaseUser.uid),
          (snap) => {
            if (snap.exists()) {
              setUserData(snap.data() as UserDoc);
            } else {
              setUserData(null);
            }
          },
          (err) => {
            console.error("Error listening to user data:", err);
          }
        );
      } else {
        setUserData(null);
        setIsAdmin(false);
      }
      setLoading(false);
    });

    return () => {
      if (unsubscribeDoc) unsubscribeDoc();
      unsub();
    };
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
