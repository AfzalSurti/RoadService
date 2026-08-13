import { Stack, router } from "expo-router";
import * as Location from "expo-location";
import React, { useState } from "react";
import { Modal, Pressable, StyleSheet, Text, View } from "react-native";
import { CameraCapture, type CapturedPhoto } from "../components/CameraCapture";
import { api } from "../lib/api";
import { useAuth } from "../lib/auth";

type PunchKind = "in" | "out";

export default function AttendanceScreen() {
  const { token } = useAuth();
  const [msg, setMsg] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [selfieFor, setSelfieFor] = useState<PunchKind | null>(null);

  const finishPunch = async (kind: PunchKind, selfie: CapturedPhoto) => {
    if (!token) return;
    setBusy(true);
    setError(null);
    setMsg(null);
    setSelfieFor(null);
    try {
      await Location.requestForegroundPermissionsAsync();
      let lat = selfie.lat;
      let lng = selfie.lng;
      try {
        const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
        lat = loc.coords.latitude;
        lng = loc.coords.longitude;
      } catch {
        /* keep selfie GPS */
      }
      const row = await api.punchAttendance(token, {
        latitude: lat,
        longitude: lng,
        punch_type: kind,
        selfie_uri: selfie.uri,
      });
      const time = kind === "in" ? row.in_time : row.out_time;
      setMsg(
        `Punch ${kind} recorded at ${time || "now"} · selfie + GPS ${lat.toFixed(4)}, ${lng.toFixed(4)}`
      );
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
        Punch in and punch out with a selfie. Same attendance register as the NHIPMPL portal.
      </Text>
      {error ? <Text style={styles.error}>{error}</Text> : null}
      {msg ? <Text style={styles.ok}>{msg}</Text> : null}
      <Pressable
        style={styles.primary}
        onPress={() => setSelfieFor("in")}
        disabled={busy || !!selfieFor}
      >
        <Text style={styles.primaryText}>{busy ? "Saving…" : "Punch in (selfie + GPS)"}</Text>
      </Pressable>
      <Pressable
        style={[styles.primary, styles.out]}
        onPress={() => setSelfieFor("out")}
        disabled={busy || !!selfieFor}
      >
        <Text style={styles.primaryText}>Punch out (selfie + GPS)</Text>
      </Pressable>
      <Pressable style={styles.link} onPress={() => router.back()}>
        <Text style={styles.linkText}>Back</Text>
      </Pressable>

      <Modal visible={!!selfieFor} animationType="slide">
        <View style={{ flex: 1, backgroundColor: "#0b2a43" }}>
          <Text style={styles.modalTitle}>
            {selfieFor === "in" ? "Selfie for punch in" : "Selfie for punch out"}
          </Text>
          <CameraCapture
            facing="front"
            hint="Face the camera, then capture selfie + GPS."
            onCapture={(p) => selfieFor && finishPunch(selfieFor, p)}
            onCancel={() => setSelfieFor(null)}
          />
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: "#0a0c10", padding: 16 },
  hint: { color: "#8b9bb0", marginBottom: 16 },
  error: { color: "#fb7185", marginBottom: 12 },
  ok: { color: "#86efac", marginBottom: 12 },
  primary: { backgroundColor: "#3b9eff", padding: 16, borderRadius: 12, alignItems: "center", marginBottom: 12 },
  out: { backgroundColor: "#0f4c81" },
  primaryText: { color: "#fff", fontWeight: "700" },
  link: { alignItems: "center", padding: 16 },
  linkText: { color: "#93c5fd" },
  modalTitle: { color: "#e8eef6", textAlign: "center", paddingTop: 48, paddingBottom: 8, fontWeight: "700" },
});
