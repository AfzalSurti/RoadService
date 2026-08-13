import { Stack } from "expo-router";
import React from "react";
import { AuthProvider } from "../lib/auth";
import { ThemeProvider } from "../lib/theme";

export default function RootLayout() {
  return (
    <ThemeProvider>
      <AuthProvider>
        <Stack screenOptions={{ headerStyle: { backgroundColor: "#0b2a43" }, headerTintColor: "#fff" }} />
      </AuthProvider>
    </ThemeProvider>
  );
}
