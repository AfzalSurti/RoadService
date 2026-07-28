import { Stack, router } from "expo-router";
import React, { useEffect, useMemo, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { CameraCapture, type CapturedPhoto } from "../components/CameraCapture";
import { api } from "../lib/api";
import { useAuth } from "../lib/auth";
import { enqueueOfflineJob, isNetworkError } from "../lib/offline";

type DefectType = { id: string; label: string; category_id: string };
type Category = { id: string; name: string };

export default function CreateIssueScreen() {
  const { token } = useAuth();
  const [projects, setProjects] = useState<any[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [types, setTypes] = useState<DefectType[]>([]);
  const [projectId, setProjectId] = useState<number | null>(null);
  const [categoryId, setCategoryId] = useState<string>("ATMS");
  const [issueTypeId, setIssueTypeId] = useState<string>("ATMS-1");
  const [description, setDescription] = useState("");
  const [deadlineDays, setDeadlineDays] = useState("10");
  const [chainage, setChainage] = useState("");
  const [photo, setPhoto] = useState<CapturedPhoto | null>(null);
  const [showCamera, setShowCamera] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!token) return;
    Promise.all([api.projects(token), api.catalog(token)]).then(([p, catalog]) => {
      setProjects(p);
      if (p[0]) setProjectId(p[0].id);
      setCategories(catalog.categories);
      setTypes(catalog.types);
      if (catalog.categories[0]) setCategoryId(catalog.categories[0].id);
      const first = catalog.types.find((t) => t.category_id === catalog.categories[0]?.id);
      if (first) setIssueTypeId(first.id);
    });
  }, [token]);

  const filteredTypes = useMemo(
    () => types.filter((t) => t.category_id === categoryId),
    [types, categoryId]
  );

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
      form.append("issue_type", issueTypeId);
      form.append("work_category", categoryId);
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
      try {
        await api.createIssue(token, form);
      } catch (e) {
        if (isNetworkError(e)) {
          const fields: Record<string, string> = {
            project_id: String(projectId),
            issue_type: issueTypeId,
            work_category: categoryId,
            description,
            before_lat: String(photo.lat),
            before_lng: String(photo.lng),
            deadline_days: deadlineDays,
          };
          if (chainage) fields.chainage = chainage;
          await enqueueOfflineJob({
            type: "create",
            photoUri: photo.uri,
            fields,
          });
          router.replace("/home");
          return;
        }
        throw e;
      }
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
      </View>

      <Text style={styles.label}>Category</Text>
      <View style={styles.chips}>
        {categories.map((c) => (
          <Pressable
            key={c.id}
            style={[styles.chip, categoryId === c.id && styles.chipActive]}
            onPress={() => {
              setCategoryId(c.id);
              const first = types.find((t) => t.category_id === c.id);
              if (first) setIssueTypeId(first.id);
            }}
          >
            <Text style={[styles.chipText, categoryId === c.id && styles.chipTextActive]}>{c.name}</Text>
          </Pressable>
        ))}
      </View>

      <Text style={styles.label}>Issue type</Text>
      <View style={styles.chips}>
        {filteredTypes.map((t) => (
          <Pressable
            key={t.id}
            style={[styles.chip, issueTypeId === t.id && styles.chipActive]}
            onPress={() => setIssueTypeId(t.id)}
          >
            <Text style={[styles.chipText, issueTypeId === t.id && styles.chipTextActive]}>
              {t.id} · {t.label}
            </Text>
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
  page: { padding: 16, backgroundColor: "#0a0c10" },
  label: { fontWeight: "700", marginBottom: 8, color: "#e8eef6" },
  hint: { color: "#8b9bb0", marginBottom: 12 },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginBottom: 14 },
  chip: {
    backgroundColor: "#12161d",
    borderWidth: 1,
    borderColor: "#243041",
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  chipActive: { backgroundColor: "#3b9eff", borderColor: "#3b9eff" },
  chipText: { color: "#e8eef6", fontSize: 12, fontWeight: "600" },
  chipTextActive: { color: "#041018" },
  input: {
    backgroundColor: "#12161d",
    borderWidth: 1,
    borderColor: "#243041",
    borderRadius: 10,
    padding: 12,
    marginBottom: 10,
    color: "#e8eef6",
  },
  primary: {
    backgroundColor: "#3b9eff",
    padding: 14,
    borderRadius: 12,
    alignItems: "center",
    marginTop: 8,
  },
  primaryText: { color: "#041018", fontWeight: "700" },
  secondary: {
    backgroundColor: "#12161d",
    borderWidth: 1,
    borderColor: "#3b9eff",
    padding: 14,
    borderRadius: 12,
    alignItems: "center",
  },
  secondaryText: { color: "#3b9eff", fontWeight: "700" },
  error: { color: "#fb7185", marginTop: 8 },
});
