import { Stack } from "expo-router";
import React from "react";
import { AuthProvider } from "../lib/auth";

export default function RootLayout() {
  return (
    <AuthProvider>
      <Stack screenOptions={{ headerStyle: { backgroundColor: "#0b2a43" }, headerTintColor: "#fff" }} />
    </AuthProvider>
  );
}
