import { Stack, router } from "expo-router";
import * as Location from "expo-location";
import React, { useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { api } from "../lib/api";
import { useAuth } from "../lib/auth";

export default function AttendanceScreen() {
  const { token } = useAuth();
  const [msg, setMsg] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const punch = async () => {
    if (!token) return;
    setBusy(true);
    setError(null);
    setMsg(null);
    try {
      await Location.requestForegroundPermissionsAsync();
      let lat: number | undefined;
      let lng: number | undefined;
      try {
        const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
        lat = loc.coords.latitude;
        lng = loc.coords.longitude;
      } catch {
        const last = await Location.getLastKnownPositionAsync();
        lat = last?.coords.latitude;
        lng = last?.coords.longitude;
      }
      const row = await api.punchAttendance(token, { latitude: lat, longitude: lng });
      setMsg(`Punched present at ${row.in_time || "now"}${lat != null ? ` · GPS ${lat.toFixed(4)}, ${lng?.toFixed(4)}` : ""}`);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Punch failed");
    } finally {
      setBusy(false);
    }
  };

  return (
    <View style={styles.page}>
      <Stack.Screen options={{ title: "Attendance" }} />
      <Text style={styles.hint}>
        Punch stores on the same attendance register as the NHIPMPL portal (this project).
      </Text>
      {error ? <Text style={styles.error}>{error}</Text> : null}
      {msg ? <Text style={styles.ok}>{msg}</Text> : null}
      <Pressable style={styles.primary} onPress={punch} disabled={busy}>
        <Text style={styles.primaryText}>{busy ? "Punching…" : "Punch in (GPS)"}</Text>
      </Pressable>
      <Pressable style={styles.link} onPress={() => router.back()}>
        <Text style={styles.linkText}>Back</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: "#0a0c10", padding: 16 },
  hint: { color: "#8b9bb0", marginBottom: 16 },
  error: { color: "#fb7185", marginBottom: 12 },
  ok: { color: "#86efac", marginBottom: 12 },
  primary: { backgroundColor: "#3b9eff", padding: 16, borderRadius: 12, alignItems: "center" },
  primaryText: { color: "#041018", fontWeight: "700" },
  link: { alignItems: "center", padding: 16 },
  linkText: { color: "#93c5fd" },
});
