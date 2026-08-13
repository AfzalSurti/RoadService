import { CameraView, useCameraPermissions, useMicrophonePermissions } from "expo-camera";
import * as FileSystem from "expo-file-system";
import React, { useEffect, useRef, useState } from "react";
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
 * Attach site photos and proper video clips (with mic permission).
 */
export function MediaAttach({ items, onChange, maxItems = 4 }: Props) {
  const [mode, setMode] = useState<"photo" | "video" | null>(null);
  const camRef = useRef<CameraView>(null);
  const [permission, requestPermission] = useCameraPermissions();
  const [micPermission, requestMicPermission] = useMicrophonePermissions();
  const [recording, setRecording] = useState(false);
  const [ready, setReady] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    if (mode === "video") {
      setReady(false);
      const t = setTimeout(() => setReady(true), 600);
      return () => clearTimeout(t);
    }
  }, [mode]);

  const addPhoto = (p: CapturedPhoto) => {
    onChange([...items, { uri: p.uri, kind: "photo", lat: p.lat, lng: p.lng }].slice(0, maxItems));
    setMode(null);
  };

  const openVideo = async () => {
    setErr(null);
    if (!permission?.granted) {
      const cam = await requestPermission();
      if (!cam.granted) {
        setErr("Camera permission is required for video");
        return;
      }
    }
    if (!micPermission?.granted) {
      const mic = await requestMicPermission();
      if (!mic.granted) {
        setErr("Microphone permission is required to record video. Allow RECORD_AUDIO and try again.");
        return;
      }
    }
    setMode("video");
  };

  const startVideo = async () => {
    if (!camRef.current || recording || !ready) return;
    setErr(null);
    setRecording(true);
    try {
      const rec = await camRef.current.recordAsync({
        maxDuration: 60,
        mute: false,
      });
      if (rec?.uri) {
        onChange([...items, { uri: rec.uri, kind: "video" }].slice(0, maxItems));
        setMode(null);
      } else {
        setErr("Video capture returned empty file");
      }
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "Video failed";
      setErr(
        msg.includes("RECORD_AUDIO") || msg.includes("permissions")
          ? "Microphone permission missing. Rebuild the app and allow mic access."
          : msg
      );
    } finally {
      setRecording(false);
    }
  };

  const stopVideo = () => {
    try {
      camRef.current?.stopRecording();
    } catch {
      /* ignore */
    }
  };

  return (
    <View style={styles.wrap}>
      <Text style={styles.label}>Photos & videos</Text>
      {items.map((m, i) => (
        <View key={`${m.uri}-${i}`} style={styles.row}>
          <Text style={styles.meta} numberOfLines={1}>
            {m.kind === "photo" ? "📷 Photo" : "🎥 Video"} · {m.uri.split("/").pop()}
          </Text>
          <Pressable onPress={() => onChange(items.filter((_, j) => j !== i))}>
            <Text style={styles.remove}>Remove</Text>
          </Pressable>
        </View>
      ))}
      {err && mode === null ? <Text style={styles.errorInline}>{err}</Text> : null}
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
          <Pressable style={styles.btn} onPress={() => void openVideo()}>
            <Text style={styles.btnText}>Add video</Text>
          </Pressable>
        </View>
      ) : null}

      <Modal visible={mode === "photo"} animationType="slide">
        <CameraCapture onCapture={addPhoto} onCancel={() => setMode(null)} />
      </Modal>

      <Modal visible={mode === "video"} animationType="slide">
        <View style={styles.videoWrap}>
          <CameraView
            ref={camRef}
            style={styles.camera}
            facing="back"
            mode="video"
            mute={false}
            videoQuality="720p"
          />
          {err ? <Text style={styles.error}>{err}</Text> : null}
          <Text style={styles.hint}>
            {!ready
              ? "Preparing camera…"
              : recording
                ? "Recording video… tap Stop when done (max 60s)"
                : "Record a proper video clip (audio on)"}
          </Text>
          {!recording ? (
            <Pressable
              style={[styles.shutter, !ready && { opacity: 0.5 }]}
              onPress={() => void startVideo()}
              disabled={!ready}
            >
              <Text style={styles.btnText}>Start video</Text>
            </Pressable>
          ) : (
            <Pressable style={[styles.shutter, { backgroundColor: "#b91c1c" }]} onPress={stopVideo}>
              <Text style={styles.btnText}>Stop</Text>
            </Pressable>
          )}
          <Pressable
            style={styles.link}
            onPress={() => {
              if (recording) stopVideo();
              setMode(null);
              setErr(null);
            }}
            disabled={recording}
          >
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
  errorInline: { color: "#b91c1c", marginBottom: 8 },
  link: { alignItems: "center", padding: 12 },
  linkText: { color: "#93c5fd", fontWeight: "600" },
});
