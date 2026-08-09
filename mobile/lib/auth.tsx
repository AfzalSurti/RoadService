import React, { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { api, type TokenResponse } from "./api";
import { storageDelete, storageGet, storageSet } from "./storage";

type AuthState = {
  token: string | null;
  role: TokenResponse["role"] | null;
  fullName: string | null;
  userId: number | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
};

const AuthContext = createContext<AuthState | null>(null);
const KEY = "roadservice_auth";

export function AuthProvider({ children }: { children: ReactNode }) {
  const [token, setToken] = useState<string | null>(null);
  const [role, setRole] = useState<TokenResponse["role"] | null>(null);
  const [fullName, setFullName] = useState<string | null>(null);
  const [userId, setUserId] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const raw = await storageGet(KEY);
        if (raw) {
          const data = JSON.parse(raw) as TokenResponse;
          setToken(data.access_token);
          setRole(data.role);
          setFullName(data.full_name);
          setUserId(data.user_id);
        }
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const value = useMemo<AuthState>(
    () => ({
      token,
      role,
      fullName,
      userId,
      loading,
      login: async (email, password) => {
        const data = await api.login(email, password);
        await storageSet(KEY, JSON.stringify(data));
        setToken(data.access_token);
        setRole(data.role);
        setFullName(data.full_name);
        setUserId(data.user_id);
      },
      logout: async () => {
        await storageDelete(KEY);
        setToken(null);
        setRole(null);
        setFullName(null);
        setUserId(null);
      },
    }),
    [token, role, fullName, userId, loading]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth outside AuthProvider");
  return ctx;
}
