import { CameraView, useCameraPermissions } from "expo-camera";
import * as Location from "expo-location";
import React, { useEffect, useRef, useState } from "react";
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from "react-native";

export type CapturedPhoto = {
  uri: string;
  lat: number;
  lng: number;
};

type Props = {
  onCapture: (photo: CapturedPhoto) => void;
  onCancel?: () => void;
};

function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`${label} timed out`)), ms);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (err) => {
        clearTimeout(timer);
        reject(err);
      }
    );
  });
}

async function readGps(): Promise<{ lat: number; lng: number }> {
  const last = await Location.getLastKnownPositionAsync();
  try {
    const loc = await withTimeout(
      Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.Balanced,
      }),
      6000,
      "GPS"
    );
    return { lat: loc.coords.latitude, lng: loc.coords.longitude };
  } catch {
    if (last?.coords) {
      return { lat: last.coords.latitude, lng: last.coords.longitude };
    }
    throw new Error("Could not read GPS. Turn on location and try again.");
  }
}

/**
 * Camera-only capture. GPS is read with a short timeout so shutter never hangs.
 */
export function CameraCapture({ onCapture, onCancel }: Props) {
  const camRef = useRef<CameraView>(null);
  const [permission, requestPermission] = useCameraPermissions();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    Location.requestForegroundPermissionsAsync().catch(() => undefined);
  }, []);

  if (!permission) return <ActivityIndicator style={{ margin: 24 }} />;
  if (!permission.granted) {
    return (
      <View style={styles.center}>
        <Text style={styles.text}>Camera access is required (gallery upload is disabled).</Text>
        <Pressable style={styles.btn} onPress={requestPermission}>
          <Text style={styles.btnText}>Grant camera</Text>
        </Pressable>
        {onCancel ? (
          <Pressable style={styles.linkBtn} onPress={onCancel}>
            <Text style={styles.linkText}>Cancel</Text>
          </Pressable>
        ) : null}
      </View>
    );
  }

  const take = async () => {
    if (!camRef.current || busy) return;
    setBusy(true);
    setError(null);
    try {
      const locPerm = await Location.requestForegroundPermissionsAsync();
      if (!locPerm.granted) throw new Error("Location permission required for GPS tagging");

      const photo = await withTimeout(
        camRef.current.takePictureAsync({
          quality: 0.5,
          skipProcessing: true,
        }) as Promise<{ uri?: string } | undefined>,
        8000,
        "Camera"
      );
      if (!photo?.uri) throw new Error("Capture failed");

      const gps = await readGps();
      onCapture({
        uri: photo.uri,
        lat: gps.lat,
        lng: gps.lng,
      });
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : "Capture failed";
      setError(message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <View style={styles.wrap}>
      <CameraView ref={camRef} style={styles.camera} facing="back" />
      {error ? <Text style={styles.error}>{error}</Text> : null}
      <Text style={styles.hint}>
        {busy ? "Taking photo and reading GPS…" : "Tap once. Photo + GPS, then you can submit."}
      </Text>
      <Pressable style={[styles.shutter, busy && { opacity: 0.5 }]} onPress={take} disabled={busy}>
        <Text style={styles.btnText}>{busy ? "Capturing…" : "Capture photo + GPS"}</Text>
      </Pressable>
      {onCancel ? (
        <Pressable style={styles.linkBtn} onPress={onCancel} disabled={busy}>
          <Text style={styles.linkText}>Cancel</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1, backgroundColor: "#0b2a43" },
  camera: { flex: 1 },
  shutter: {
    marginHorizontal: 16,
    marginBottom: 8,
    backgroundColor: "#0f4c81",
    padding: 16,
    borderRadius: 12,
    alignItems: "center",
  },
  btn: {
    marginTop: 12,
    backgroundColor: "#0f4c81",
    padding: 14,
    borderRadius: 10,
  },
  btnText: { color: "#fff", fontWeight: "700" },
  center: { flex: 1, justifyContent: "center", padding: 24 },
  text: { color: "#e8eef6", fontSize: 16 },
  error: { color: "#fecaca", textAlign: "center", padding: 8 },
  hint: { color: "#cbd5e1", textAlign: "center", paddingHorizontal: 16, marginBottom: 8 },
  linkBtn: { alignItems: "center", padding: 12, marginBottom: 12 },
  linkText: { color: "#93c5fd", fontWeight: "600" },
});
