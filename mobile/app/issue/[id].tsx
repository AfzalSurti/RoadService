import { Stack, useLocalSearchParams, router } from "expo-router";
import React, { useEffect, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { CameraCapture, type CapturedPhoto } from "../../components/CameraCapture";
import { api, type Issue } from "../../lib/api";
import { useAuth } from "../../lib/auth";

export default function IssueDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { token, role } = useAuth();
  const [issue, setIssue] = useState<Issue | null>(null);
  const [mode, setMode] = useState<"none" | "complete" | "approve" | "reject">("none");
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);

  const load = async () => {
    if (!token) return;
    const list = await api.issues(token);
    setIssue(list.find((i) => String(i.id) === String(id)) || null);
  };

  useEffect(() => {
    load().catch((e) => setError(e.message));
  }, [token, id]);

  const onPhoto = async (photo: CapturedPhoto) => {
    if (!token || !issue) return;
    try {
      const form = new FormData();
      form.append("photo", { uri: photo.uri, name: "capture.jpg", type: "image/jpeg" } as any);
      if (mode === "complete") {
        form.append("completion_lat", String(photo.lat));
        form.append("completion_lng", String(photo.lng));
        await api.completeIssue(token, issue.id, form);
      } else if (mode === "approve") {
        form.append("verification_lat", String(photo.lat));
        form.append("verification_lng", String(photo.lng));
        await api.approveIssue(token, issue.id, form);
      } else if (mode === "reject") {
        form.append("verification_lat", String(photo.lat));
        form.append("verification_lng", String(photo.lng));
        form.append("reason", reason || "Rework required");
        await api.rejectIssue(token, issue.id, form);
      }
      setMode("none");
      router.replace("/home");
    } catch (e: any) {
      setError(e.message);
      setMode("none");
    }
  };

  if (mode !== "none") {
    return <CameraCapture onCapture={onPhoto} />;
  }

  if (!issue) {
    return (
      <View style={styles.page}>
        <Text>{error || "Loading…"}</Text>
      </View>
    );
  }

  return (
    <ScrollView contentContainerStyle={styles.page}>
      <Stack.Screen options={{ title: `Issue #${issue.id}` }} />
      <Text style={styles.title}>
        {issue.issue_type} · {issue.status}
      </Text>
      <Text style={styles.meta}>
        Deadline {issue.deadline_date} · {issue.remaining_days} days left
      </Text>
      <Text style={{ marginBottom: 16 }}>{issue.description}</Text>
      {error ? <Text style={styles.error}>{error}</Text> : null}

      {role === "contractor" && issue.status === "open" ? (
        <Pressable
          style={styles.primary}
          onPress={async () => {
            await api.startIssue(token!, issue.id);
            await load();
          }}
        >
          <Text style={styles.primaryText}>Start work</Text>
        </Pressable>
      ) : null}

      {role === "contractor" && issue.status === "under_review" ? (
        <Pressable
          style={styles.primary}
          onPress={async () => {
            await api.reworkStart(token!, issue.id);
            await load();
          }}
        >
          <Text style={styles.primaryText}>Start rework</Text>
        </Pressable>
      ) : null}

      {role === "contractor" && issue.status === "in_progress" ? (
        <Pressable style={styles.primary} onPress={() => setMode("complete")}>
          <Text style={styles.primaryText}>Complete (camera + GPS)</Text>
        </Pressable>
      ) : null}

      {role === "surveyor" && (issue.status === "completed" || issue.status === "verification_pending") ? (
        <View>
          <Pressable style={styles.primary} onPress={() => setMode("approve")}>
            <Text style={styles.primaryText}>Approve (camera + GPS)</Text>
          </Pressable>
          <TextInput
            style={styles.input}
            placeholder="Rejection reason"
            value={reason}
            onChangeText={setReason}
          />
          <Pressable style={styles.danger} onPress={() => setMode("reject")}>
            <Text style={styles.primaryText}>Reject / rework</Text>
          </Pressable>
        </View>
      ) : null}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  page: { padding: 16, backgroundColor: "#eef2f6", flexGrow: 1 },
  title: { fontSize: 20, fontWeight: "800", color: "#0b2a43" },
  meta: { color: "#5b6b7c", marginBottom: 8 },
  primary: { backgroundColor: "#0f4c81", padding: 14, borderRadius: 12, alignItems: "center", marginBottom: 10 },
  danger: { backgroundColor: "#be123c", padding: 14, borderRadius: 12, alignItems: "center" },
  primaryText: { color: "#fff", fontWeight: "700" },
  input: {
    backgroundColor: "#fff",
    borderWidth: 1,
    borderColor: "#d5dee8",
    borderRadius: 10,
    padding: 12,
    marginBottom: 10,
  },
  error: { color: "#be123c", marginBottom: 8 },
});
