import { CameraView, useCameraPermissions } from "expo-camera";
import * as FileSystem from "expo-file-system";
import React, { useRef, useState } from "react";
import { Modal, Pressable, StyleSheet, Text, View } from "react-native";
import { CameraCapture, type CapturedPhoto } from "./CameraCapture";

void FileSystem.cacheDirectory;

export type MediaItem = {
  uri: string;
  kind: "photo" | "video";
  lat?: number;
  lng?: number;
};

type Props = {
  items: MediaItem[];
  onChange: (items: MediaItem[]) => void;
  maxItems?: number;
};

/**
 * Attach site photos and short videos (camera). Used on Warnings / Critical Issues.
 */
export function MediaAttach({ items, onChange, maxItems = 4 }: Props) {
  const [mode, setMode] = useState<"photo" | "video" | null>(null);
  const camRef = useRef<CameraView>(null);
  const [permission, requestPermission] = useCameraPermissions();
  const [recording, setRecording] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const addPhoto = (p: CapturedPhoto) => {
    onChange([...items, { uri: p.uri, kind: "photo", lat: p.lat, lng: p.lng }].slice(0, maxItems));
    setMode(null);
  };

  const startVideo = async () => {
    if (!camRef.current || recording) return;
    setErr(null);
    setRecording(true);
    try {
      const rec = await camRef.current.recordAsync({ maxDuration: 30 });
      if (rec?.uri) {
        onChange([...items, { uri: rec.uri, kind: "video" }].slice(0, maxItems));
        setMode(null);
      }
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : "Video failed");
    } finally {
      setRecording(false);
    }
  };

  const stopVideo = () => {
    camRef.current?.stopRecording();
  };

  return (
    <View style={styles.wrap}>
      <Text style={styles.label}>Photos & videos</Text>
      {items.map((m, i) => (
        <View key={`${m.uri}-${i}`} style={styles.row}>
          <Text style={styles.meta} numberOfLines={1}>
            {m.kind === "photo" ? "📷" : "🎥"} {m.uri.split("/").pop()}
          </Text>
          <Pressable onPress={() => onChange(items.filter((_, j) => j !== i))}>
            <Text style={styles.remove}>Remove</Text>
          </Pressable>
        </View>
      ))}
      {items.length < maxItems ? (
        <View style={styles.btns}>
          <Pressable
            style={styles.btn}
            onPress={() => {
              if (!permission?.granted) requestPermission();
              setMode("photo");
            }}
          >
            <Text style={styles.btnText}>Add photo</Text>
          </Pressable>
          <Pressable
            style={styles.btn}
            onPress={() => {
              if (!permission?.granted) requestPermission();
              setMode("video");
            }}
          >
            <Text style={styles.btnText}>Add video</Text>
          </Pressable>
        </View>
      ) : null}

      <Modal visible={mode === "photo"} animationType="slide">
        <CameraCapture onCapture={addPhoto} onCancel={() => setMode(null)} />
      </Modal>

      <Modal visible={mode === "video"} animationType="slide">
        <View style={styles.videoWrap}>
          <CameraView ref={camRef} style={styles.camera} facing="back" mode="video" />
          {err ? <Text style={styles.error}>{err}</Text> : null}
          <Text style={styles.hint}>{recording ? "Recording… tap Stop when done" : "Record up to 30s"}</Text>
          {!recording ? (
            <Pressable style={styles.shutter} onPress={startVideo}>
              <Text style={styles.btnText}>Start video</Text>
            </Pressable>
          ) : (
            <Pressable style={[styles.shutter, { backgroundColor: "#b91c1c" }]} onPress={stopVideo}>
              <Text style={styles.btnText}>Stop</Text>
            </Pressable>
          )}
          <Pressable style={styles.link} onPress={() => setMode(null)} disabled={recording}>
            <Text style={styles.linkText}>Cancel</Text>
          </Pressable>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { marginBottom: 12 },
  label: { fontWeight: "700", color: "#334", marginBottom: 8 },
  row: { flexDirection: "row", alignItems: "center", marginBottom: 6, gap: 8 },
  meta: { flex: 1, color: "#445" },
  remove: { color: "#b91c1c", fontWeight: "700" },
  btns: { flexDirection: "row", gap: 8 },
  btn: { flex: 1, backgroundColor: "#1a4b8c", padding: 12, borderRadius: 10, alignItems: "center" },
  btnText: { color: "#fff", fontWeight: "700" },
  videoWrap: { flex: 1, backgroundColor: "#0b2a43" },
  camera: { flex: 1 },
  shutter: {
    marginHorizontal: 16,
    marginBottom: 8,
    backgroundColor: "#0f4c81",
    padding: 16,
    borderRadius: 12,
    alignItems: "center",
  },
  hint: { color: "#cbd5e1", textAlign: "center", padding: 8 },
  error: { color: "#fecaca", textAlign: "center", padding: 8 },
  link: { alignItems: "center", padding: 12 },
  linkText: { color: "#93c5fd", fontWeight: "600" },
});
