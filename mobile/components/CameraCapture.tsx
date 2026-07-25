import { CameraView, useCameraPermissions } from "expo-camera";
import * as Location from "expo-location";
import React, { useRef, useState } from "react";
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from "react-native";

export type CapturedPhoto = {
  uri: string;
  lat: number;
  lng: number;
};

type Props = {
  onCapture: (photo: CapturedPhoto) => void;
};

/**
 * Camera-only capture. No gallery picker is exposed.
 * GPS is read at the moment of shutter press.
 */
export function CameraCapture({ onCapture }: Props) {
  const camRef = useRef<CameraView>(null);
  const [permission, requestPermission] = useCameraPermissions();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!permission) return <ActivityIndicator style={{ margin: 24 }} />;
  if (!permission.granted) {
    return (
      <View style={styles.center}>
        <Text style={styles.text}>Camera access is required (gallery upload is disabled).</Text>
        <Pressable style={styles.btn} onPress={requestPermission}>
          <Text style={styles.btnText}>Grant camera</Text>
        </Pressable>
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
      const photo = await camRef.current.takePictureAsync({ quality: 0.7 });
      const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High });
      if (!photo?.uri) throw new Error("Capture failed");
      onCapture({
        uri: photo.uri,
        lat: loc.coords.latitude,
        lng: loc.coords.longitude,
      });
    } catch (e: any) {
      setError(e.message || "Capture failed");
    } finally {
      setBusy(false);
    }
  };

  return (
    <View style={styles.wrap}>
      <CameraView ref={camRef} style={styles.camera} facing="back" />
      {error ? <Text style={styles.error}>{error}</Text> : null}
      <Pressable style={[styles.shutter, busy && { opacity: 0.5 }]} onPress={take} disabled={busy}>
        <Text style={styles.btnText}>{busy ? "Capturing…" : "Capture photo + GPS"}</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1, backgroundColor: "#0b2a43" },
  camera: { flex: 1 },
  shutter: {
    margin: 16,
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
  text: { color: "#152033", fontSize: 16 },
  error: { color: "#fecaca", textAlign: "center", padding: 8 },
});
