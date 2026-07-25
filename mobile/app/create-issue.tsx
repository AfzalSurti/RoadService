import { Stack, router } from "expo-router";
import React, { useEffect, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { CameraCapture, type CapturedPhoto } from "../components/CameraCapture";
import { api } from "../lib/api";
import { useAuth } from "../lib/auth";

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
      <Text style={styles.label}>Project ID: {projectId ?? "—"}</Text>
      <Text style={styles.hint}>Projects: {projects.map((p) => p.name).join(", ") || "none"}</Text>
      <TextInput style={styles.input} value={issueType} onChangeText={setIssueType} placeholder="Issue type" />
      <TextInput style={styles.input} value={workCategory} onChangeText={setWorkCategory} placeholder="Work category" />
      <TextInput style={styles.input} value={chainage} onChangeText={setChainage} placeholder="Chainage" />
      <TextInput style={styles.input} value={deadlineDays} onChangeText={setDeadlineDays} placeholder="Deadline days" keyboardType="number-pad" />
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
  label: { fontWeight: "700", marginBottom: 4 },
  hint: { color: "#5b6b7c", marginBottom: 12 },
  input: {
    backgroundColor: "#fff",
    borderWidth: 1,
    borderColor: "#d5dee8",
    borderRadius: 10,
    padding: 12,
    marginBottom: 10,
  },
  primary: { backgroundColor: "#0f4c81", padding: 14, borderRadius: 12, alignItems: "center", marginTop: 8 },
  primaryText: { color: "#fff", fontWeight: "700" },
  secondary: { backgroundColor: "#fff", borderWidth: 1, borderColor: "#0f4c81", padding: 14, borderRadius: 12, alignItems: "center" },
  secondaryText: { color: "#0f4c81", fontWeight: "700" },
  error: { color: "#be123c", marginTop: 8 },
});
