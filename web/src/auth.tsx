import React, { createContext, useContext, useMemo, useState, type ReactNode } from "react";
import { api } from "./api";
import type { Role } from "./types";

type AuthState = {
  token: string | null;
  role: Role | null;
  fullName: string | null;
  userId: number | null;
  isReadonly: boolean;
  login: (email: string, password: string) => Promise<void>;
  logout: () => void;
};

const KEY = "roadservice_web_auth";
const AuthContext = createContext<AuthState | null>(null);

function loadStored() {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as { token: string; role: Role; full_name: string; user_id: number }) : null;
  } catch {
    return null;
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const stored = loadStored();
  const [token, setToken] = useState<string | null>(stored?.token ?? null);
  const [role, setRole] = useState<Role | null>(stored?.role ?? null);
  const [fullName, setFullName] = useState<string | null>(stored?.full_name ?? null);
  const [userId, setUserId] = useState<number | null>(stored?.user_id ?? null);

  const value = useMemo<AuthState>(
    () => ({
      token,
      role,
      fullName,
      userId,
      isReadonly: role === "government",
      login: async (email, password) => {
        const data = await api.login(email, password);
        if (data.role === "surveyor") {
          throw new Error("Surveyor accounts use the mobile app only.");
        }
        localStorage.setItem(
          KEY,
          JSON.stringify({
            token: data.access_token,
            role: data.role,
            full_name: data.full_name,
            user_id: data.user_id,
          })
        );
        setToken(data.access_token);
        setRole(data.role);
        setFullName(data.full_name);
        setUserId(data.user_id);
      },
      logout: () => {
        localStorage.removeItem(KEY);
        setToken(null);
        setRole(null);
        setFullName(null);
        setUserId(null);
      },
    }),
    [token, role, fullName, userId]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth outside AuthProvider");
  return ctx;
}
