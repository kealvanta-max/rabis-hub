"use client";

import { createContext, useContext, useEffect, useState, ReactNode } from "react";
import { onAuthStateChanged, User, signOut } from "firebase/auth";
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

const ADMIN_EMAILS = ["rabisavinghub@gmail.com"];
if (process.env.NEXT_PUBLIC_ADMIN_EMAIL) {
  ADMIN_EMAILS.push(...process.env.NEXT_PUBLIC_ADMIN_EMAIL.split(",").map(e => e.trim()));
}
export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [userData, setUserData] = useState<UserDoc | null>(null);
  const [loading, setLoading] = useState(true);

  const isAdmin = user ? ADMIN_EMAILS.includes(user.email || "") : false;

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (firebaseUser) => {
      setUser(firebaseUser);
      if (firebaseUser) {
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
      }
      setLoading(false);
    });
    return () => unsub();
  }, []);

  const logout = async () => {
    await signOut(auth);
    setUser(null);
    setUserData(null);
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
