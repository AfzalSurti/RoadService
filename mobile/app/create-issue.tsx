import { Stack, router } from "expo-router";
import React, { useEffect, useState } from "react";
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { CameraCapture, type CapturedPhoto } from "../components/CameraCapture";
import { api } from "../lib/api";
import { useAuth } from "../lib/auth";

const ISSUE_TYPES = [
  "pothole",
  "damaged_road",
  "broken_drainage",
  "encroachment",
  "road_furniture",
  "pavement",
  "highway",
  "vehicle_breakdown",
  "unwanted_material",
  "other",
];

const WORK_CATEGORIES = [
  "pavement",
  "highway",
  "road_furniture",
  "encroachment",
  "drainage",
  "safety",
  "other",
];

export default function CreateIssueScreen() {
  const { token } = useAuth();
  const [projects, setProjects] = useState<any[]>([]);
  const [projectId, setProjectId] = useState<number | null>(null);
  const [issueType, setIssueType] = useState("pothole");
  const [workCategory, setWorkCategory] = useState("pavement");
  const [description, setDescription] = useState("");
  const [deadlineDays, setDeadlineDays] = useState("10");
  const [chainage, setChainage] = useState("");
  const [photo, setPhoto] = useState<CapturedPhoto | null>(null);
  const [showCamera, setShowCamera] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!token) return;
    api.projects(token).then((p) => {
      setProjects(p);
      if (p[0]) setProjectId(p[0].id);
    });
  }, [token]);

  if (showCamera) {
    return (
      <CameraCapture
        onCapture={(p) => {
          setPhoto(p);
          setShowCamera(false);
        }}
      />
    );
  }

  const submit = async () => {
    if (!token || !projectId || !photo) {
      setError("Project and camera photo with GPS are required");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const form = new FormData();
      form.append("project_id", String(projectId));
      form.append("issue_type", issueType);
      form.append("work_category", workCategory);
      form.append("description", description);
      form.append("before_lat", String(photo.lat));
      form.append("before_lng", String(photo.lng));
      form.append("deadline_days", deadlineDays);
      if (chainage) form.append("chainage", chainage);
      form.append("photo", {
        uri: photo.uri,
        name: "before.jpg",
        type: "image/jpeg",
      } as any);
      await api.createIssue(token, form);
      router.replace("/home");
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <ScrollView contentContainerStyle={styles.page}>
      <Stack.Screen options={{ title: "New issue" }} />

      <Text style={styles.label}>Project</Text>
      <View style={styles.chips}>
        {projects.map((p) => (
          <Pressable
            key={p.id}
            style={[styles.chip, projectId === p.id && styles.chipActive]}
            onPress={() => setProjectId(p.id)}
          >
            <Text style={[styles.chipText, projectId === p.id && styles.chipTextActive]}>{p.name}</Text>
          </Pressable>
        ))}
        {!projects.length ? <Text style={styles.hint}>No assigned projects.</Text> : null}
      </View>

      <Text style={styles.label}>Issue type</Text>
      <View style={styles.chips}>
        {ISSUE_TYPES.map((t) => (
          <Pressable
            key={t}
            style={[styles.chip, issueType === t && styles.chipActive]}
            onPress={() => setIssueType(t)}
          >
            <Text style={[styles.chipText, issueType === t && styles.chipTextActive]}>{t}</Text>
          </Pressable>
        ))}
      </View>

      <Text style={styles.label}>Work category</Text>
      <View style={styles.chips}>
        {WORK_CATEGORIES.map((t) => (
          <Pressable
            key={t}
            style={[styles.chip, workCategory === t && styles.chipActive]}
            onPress={() => setWorkCategory(t)}
          >
            <Text style={[styles.chipText, workCategory === t && styles.chipTextActive]}>{t}</Text>
          </Pressable>
        ))}
      </View>

      <TextInput style={styles.input} value={chainage} onChangeText={setChainage} placeholder="Chainage" />
      <TextInput
        style={styles.input}
        value={deadlineDays}
        onChangeText={setDeadlineDays}
        placeholder="Deadline days"
        keyboardType="number-pad"
      />
      <TextInput
        style={[styles.input, { height: 100 }]}
        value={description}
        onChangeText={setDescription}
        placeholder="Description"
        multiline
      />
      <Pressable style={styles.secondary} onPress={() => setShowCamera(true)}>
        <Text style={styles.secondaryText}>{photo ? "Retake camera photo" : "Open camera (required)"}</Text>
      </Pressable>
      {photo ? (
        <Text style={styles.hint}>
          GPS locked: {photo.lat.toFixed(5)}, {photo.lng.toFixed(5)}
        </Text>
      ) : null}
      {error ? <Text style={styles.error}>{error}</Text> : null}
      <Pressable style={styles.primary} onPress={submit} disabled={busy}>
        <Text style={styles.primaryText}>{busy ? "Submitting…" : "Submit issue"}</Text>
      </Pressable>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  page: { padding: 16, backgroundColor: "#eef2f6" },
  label: { fontWeight: "700", marginBottom: 8, color: "#0b2a43" },
  hint: { color: "#5b6b7c", marginBottom: 12 },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginBottom: 14 },
  chip: {
    backgroundColor: "#fff",
    borderWidth: 1,
    borderColor: "#d5dee8",
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  chipActive: { backgroundColor: "#0f4c81", borderColor: "#0f4c81" },
  chipText: { color: "#152033", fontSize: 12, fontWeight: "600" },
  chipTextActive: { color: "#fff" },
  input: {
    backgroundColor: "#fff",
    borderWidth: 1,
    borderColor: "#d5dee8",
    borderRadius: 10,
    padding: 12,
    marginBottom: 10,
  },
  primary: {
    backgroundColor: "#0f4c81",
    padding: 14,
    borderRadius: 12,
    alignItems: "center",
    marginTop: 8,
  },
  primaryText: { color: "#fff", fontWeight: "700" },
  secondary: {
    backgroundColor: "#fff",
    borderWidth: 1,
    borderColor: "#0f4c81",
    padding: 14,
    borderRadius: 12,
    alignItems: "center",
  },
  secondaryText: { color: "#0f4c81", fontWeight: "700" },
  error: { color: "#be123c", marginTop: 8 },
});
