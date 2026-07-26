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
  const [comments, setComments] = useState("");
  const [remarks, setRemarks] = useState("");
  const [error, setError] = useState<string | null>(null);

  const load = async () => {
    if (!token) return;
    const full = await api.issue(token, Number(id));
    setIssue(full);
  };

  useEffect(() => {
    load().catch((e) => setError(e.message));
  }, [token, id]);

  const onPhoto = async (photo: CapturedPhoto) => {
    if (!token || !issue) return;
    try {
      const form = new FormData();
      form.append("photo", { uri: photo.uri, name: "capture.jpg", type: "image/jpeg" } as any);
      const capturedAt = new Date().toISOString();
      if (mode === "complete") {
        form.append("completion_lat", String(photo.lat));
        form.append("completion_lng", String(photo.lng));
        form.append(
          "completion_remarks",
          [remarks.trim(), `Captured at ${capturedAt}`, `GPS ${photo.lat}, ${photo.lng}`]
            .filter(Boolean)
            .join("\n")
        );
        await api.completeIssue(token, issue.id, form);
      } else if (mode === "approve") {
        form.append("verification_lat", String(photo.lat));
        form.append("verification_lng", String(photo.lng));
        await api.approveIssue(token, issue.id, form);
      } else if (mode === "reject") {
        form.append("verification_lat", String(photo.lat));
        form.append("verification_lng", String(photo.lng));
        form.append("reason", reason || "Rework required");
        if (comments.trim()) form.append("comments", comments.trim());
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

  const latestRejection = [...(issue.rejection_history || [])].sort((a, b) => b.id - a.id)[0];

  return (
    <ScrollView contentContainerStyle={styles.page}>
      <Stack.Screen options={{ title: `Issue #${issue.id}` }} />
      <Text style={styles.title}>
        {issue.issue_type} · {issue.status === "open" ? "To Do" : issue.status}
      </Text>
      <Text style={styles.meta}>
        Deadline {issue.deadline_date} · {issue.remaining_days} days left
      </Text>
      <Text style={{ marginBottom: 16, color: "#e8eef6" }}>{issue.description}</Text>
      {error ? <Text style={styles.error}>{error}</Text> : null}

      {issue.status === "under_review" && latestRejection ? (
        <View style={styles.rejectBox}>
          <Text style={styles.rejectTitle}>Rework comments</Text>
          <Text style={styles.rejectText}>Reason: {latestRejection.reason}</Text>
          {latestRejection.comments ? (
            <Text style={styles.rejectText}>{latestRejection.comments}</Text>
          ) : null}
        </View>
      ) : null}

      {role === "contractor" && issue.status === "open" ? (
        <Pressable
          style={styles.primary}
          onPress={async () => {
            await api.startIssue(token!, issue.id);
            await load();
          }}
        >
          <Text style={styles.primaryText}>Mark In Progress</Text>
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
        <View>
          <TextInput
            style={styles.input}
            placeholder="Description / remarks"
            value={remarks}
            onChangeText={setRemarks}
            multiline
          />
          <Pressable style={styles.primary} onPress={() => setMode("complete")}>
            <Text style={styles.primaryText}>Submit (camera + GPS + date)</Text>
          </Pressable>
        </View>
      ) : null}

      {role === "surveyor" &&
      (issue.status === "completed" || issue.status === "verification_pending") ? (
        <View>
          <Text style={styles.meta}>Verify within 24 hours of completion</Text>
          <Pressable style={styles.primary} onPress={() => setMode("approve")}>
            <Text style={styles.primaryText}>Approve & close (camera + GPS)</Text>
          </Pressable>
          <TextInput
            style={styles.input}
            placeholder="Rejection reason"
            value={reason}
            onChangeText={setReason}
          />
          <TextInput
            style={styles.input}
            placeholder="Comments for contractor"
            value={comments}
            onChangeText={setComments}
            multiline
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
  page: { padding: 16, backgroundColor: "#0a0c10", flexGrow: 1 },
  title: { fontSize: 20, fontWeight: "800", color: "#e8eef6" },
  meta: { color: "#8b9bb0", marginBottom: 8 },
  primary: {
    backgroundColor: "#3b9eff",
    padding: 14,
    borderRadius: 12,
    alignItems: "center",
    marginBottom: 10,
  },
  danger: { backgroundColor: "#be123c", padding: 14, borderRadius: 12, alignItems: "center" },
  primaryText: { color: "#041018", fontWeight: "700" },
  input: {
    backgroundColor: "#12161d",
    borderWidth: 1,
    borderColor: "#243041",
    borderRadius: 10,
    padding: 12,
    marginBottom: 10,
    color: "#e8eef6",
  },
  error: { color: "#fb7185", marginBottom: 8 },
  rejectBox: {
    backgroundColor: "#2a1014",
    borderColor: "#7f1d1d",
    borderWidth: 1,
    borderRadius: 12,
    padding: 12,
    marginBottom: 12,
  },
  rejectTitle: { color: "#fda4af", fontWeight: "700", marginBottom: 6 },
  rejectText: { color: "#e8eef6", marginBottom: 4 },
});
