import { Stack, router, useFocusEffect } from "expo-router";
import * as Location from "expo-location";
import React, { useCallback, useState } from "react";
import { Modal, Pressable, StyleSheet, Text, View } from "react-native";
import { CameraCapture, type CapturedPhoto } from "../components/CameraCapture";
import { api } from "../lib/api";
import { useAuth } from "../lib/auth";

type PunchKind = "in" | "out";

type TodayStatus = {
  punched_in: boolean;
  punched_out: boolean;
  in_time?: string | null;
  out_time?: string | null;
};

export default function AttendanceScreen() {
  const { token } = useAuth();
  const [msg, setMsg] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [selfieFor, setSelfieFor] = useState<PunchKind | null>(null);
  const [today, setToday] = useState<TodayStatus>({ punched_in: false, punched_out: false });

  const loadToday = useCallback(async () => {
    if (!token) return;
    try {
      const row = await api.attendanceToday(token);
      setToday({
        punched_in: !!row?.in_time,
        punched_out: !!row?.out_time,
        in_time: row?.in_time,
        out_time: row?.out_time,
      });
    } catch {
      /* keep previous */
    }
  }, [token]);

  useFocusEffect(
    useCallback(() => {
      void loadToday();
    }, [loadToday])
  );

  const finishPunch = async (kind: PunchKind, selfie: CapturedPhoto) => {
    if (!token) return;
    if (kind === "in" && today.punched_in) {
      setError("Already punched in today. Punch out when you leave.");
      setSelfieFor(null);
      return;
    }
    if (kind === "out" && today.punched_out) {
      setError("Already punched out today.");
      setSelfieFor(null);
      return;
    }
    if (kind === "out" && !today.punched_in) {
      setError("Punch in first before punch out.");
      setSelfieFor(null);
      return;
    }
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
      await loadToday();
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
        One punch in and one punch out per day, each with a selfie + GPS. Same register as the NHIPMPL
        portal.
      </Text>
      {today.punched_in ? (
        <Text style={styles.ok}>
          Punched in{today.in_time ? ` at ${today.in_time}` : ""}
          {today.punched_out ? ` · Out ${today.out_time || ""}` : " · Not punched out yet"}
        </Text>
      ) : (
        <Text style={styles.hint}>Not punched in yet today.</Text>
      )}
      {error ? <Text style={styles.error}>{error}</Text> : null}
      {msg ? <Text style={styles.ok}>{msg}</Text> : null}
      <Pressable
        style={[styles.primary, (busy || today.punched_in) && styles.disabled]}
        onPress={() => setSelfieFor("in")}
        disabled={busy || !!selfieFor || today.punched_in}
      >
        <Text style={styles.primaryText}>
          {today.punched_in ? "Already punched in" : busy ? "Saving…" : "Punch in (selfie + GPS)"}
        </Text>
      </Pressable>
      <Pressable
        style={[styles.primary, styles.out, (busy || !today.punched_in || today.punched_out) && styles.disabled]}
        onPress={() => setSelfieFor("out")}
        disabled={busy || !!selfieFor || !today.punched_in || today.punched_out}
      >
        <Text style={styles.primaryText}>
          {today.punched_out
            ? "Already punched out"
            : !today.punched_in
              ? "Punch out (after punch in)"
              : "Punch out (selfie + GPS)"}
        </Text>
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
  disabled: { opacity: 0.45 },
  primaryText: { color: "#fff", fontWeight: "700" },
  link: { alignItems: "center", padding: 16 },
  linkText: { color: "#93c5fd" },
  modalTitle: { color: "#e8eef6", textAlign: "center", paddingTop: 48, paddingBottom: 8, fontWeight: "700" },
});
