import AsyncStorage from "@react-native-async-storage/async-storage";
import React, { createContext, useContext, useEffect, useMemo, useState } from "react";

export type ThemeMode = "light" | "dark";

type ThemeColors = {
  bg: string;
  card: string;
  text: string;
  muted: string;
  border: string;
  primary: string;
  primaryText: string;
  danger: string;
  header: string;
  inputBg: string;
};

const light: ThemeColors = {
  bg: "#eef2f6",
  card: "#ffffff",
  text: "#0b2a43",
  muted: "#5b6b7c",
  border: "#d5dee8",
  primary: "#0f4c81",
  primaryText: "#ffffff",
  danger: "#be123c",
  header: "#0b2a43",
  inputBg: "#ffffff",
};

const dark: ThemeColors = {
  bg: "#0a0c10",
  card: "#121820",
  text: "#e8eef6",
  muted: "#8b9bb0",
  border: "#243044",
  primary: "#3b9eff",
  primaryText: "#041018",
  danger: "#fb7185",
  header: "#0b2a43",
  inputBg: "#1a222d",
};

type Ctx = {
  mode: ThemeMode;
  colors: ThemeColors;
  toggle: () => void;
  setMode: (m: ThemeMode) => void;
};

const ThemeContext = createContext<Ctx | null>(null);
const KEY = "invit.theme";

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [mode, setModeState] = useState<ThemeMode>("light");

  useEffect(() => {
    AsyncStorage.getItem(KEY).then((v) => {
      if (v === "dark" || v === "light") setModeState(v);
    });
  }, []);

  const setMode = (m: ThemeMode) => {
    setModeState(m);
    void AsyncStorage.setItem(KEY, m);
  };

  const value = useMemo(
    () => ({
      mode,
      colors: mode === "dark" ? dark : light,
      toggle: () => setMode(mode === "dark" ? "light" : "dark"),
      setMode,
    }),
    [mode]
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme() {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error("useTheme requires ThemeProvider");
  return ctx;
}
