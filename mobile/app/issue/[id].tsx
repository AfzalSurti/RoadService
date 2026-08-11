import { Stack, useLocalSearchParams, router } from "expo-router";
import React, { useEffect, useState } from "react";
import { Image, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { CameraCapture, type CapturedPhoto } from "../../components/CameraCapture";
import { api, API_URL, type Issue } from "../../lib/api";
import { useAuth } from "../../lib/auth";
import { enqueueOfflineJob, isNetworkError } from "../../lib/offline";

function mediaUrl(path?: string | null) {
  if (!path) return "";
  if (path.startsWith("http")) return path;
  return `${API_URL}/uploads/${path.split(/[/\\]/).pop()}`;
}

export default function IssueDetailScreen() {
  const { id, action } = useLocalSearchParams<{ id: string; action?: string }>();
  const { token, role } = useAuth();
  const [issue, setIssue] = useState<Issue | null>(null);
  const [mode, setMode] = useState<"none" | "complete" | "approve" | "reject">("none");
  const [pendingAction, setPendingAction] = useState<"complete" | "approve" | "reject">("complete");
  const [pendingPhoto, setPendingPhoto] = useState<CapturedPhoto | null>(null);
  const [busy, setBusy] = useState(false);
  const [reason, setReason] = useState("");
  const [comments, setComments] = useState("");
  const [remarks, setRemarks] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  const load = async () => {
    if (!token) return;
    const full = await api.issue(token, Number(id));
    setIssue(full);
  };

  useEffect(() => {
    load().catch((e) => setError(e.message));
  }, [token, id]);

  useEffect(() => {
    if (action === "submit") setMode("none");
  }, [action]);

  const onPhoto = (photo: CapturedPhoto) => {
    setPendingPhoto(photo);
    setMode("none");
    setError(null);
    setInfo(`Photo + GPS ready: ${photo.lat.toFixed(5)}, ${photo.lng.toFixed(5)}`);
  };

  const submitPhoto = async () => {
    if (!token || !issue || !pendingPhoto) return;
    setBusy(true);
    setError(null);
    try {
      const photo = pendingPhoto;
      const uri = photo.uri.startsWith("file://") ? photo.uri : `file://${photo.uri}`;
      const form = new FormData();
      form.append("photo", { uri, name: "capture.jpg", type: "image/jpeg" } as any);
      const capturedAt = new Date().toISOString();
      if (pendingAction === "complete" || issue.status === "in_progress") {
        const fields = {
          completion_lat: String(photo.lat),
          completion_lng: String(photo.lng),
          completion_remarks: [remarks.trim(), `Captured at ${capturedAt}`, `GPS ${photo.lat}, ${photo.lng}`]
            .filter(Boolean)
            .join("\n"),
        };
        try {
          for (const [k, v] of Object.entries(fields)) form.append(k, v);
          await api.completeIssue(token, issue.id, form);
        } catch (e) {
          if (isNetworkError(e)) {
            await enqueueOfflineJob({
              type: "complete",
              issueId: issue.id,
              photoUri: uri,
              fields,
            });
            setInfo("Saved offline — will sync when network returns");
            router.replace("/home");
            return;
          }
          throw e;
        }
      } else if (issue.status === "completed" || issue.status === "verification_pending") {
        form.append("verification_lat", String(photo.lat));
        form.append("verification_lng", String(photo.lng));
        if (pendingAction === "reject") {
          form.append("reason", reason || "Rework required");
          if (comments.trim()) form.append("comments", comments.trim());
          await api.rejectIssue(token, issue.id, form);
        } else {
          await api.approveIssue(token, issue.id, form);
        }
      }
      setPendingPhoto(null);
      router.replace("/home");
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };

  if (mode !== "none") {
    return (
      <CameraCapture
        onCapture={onPhoto}
        onCancel={() => setMode("none")}
      />
    );
  }

  if (!issue) {
    return (
      <View style={styles.page}>
        <Text style={{ color: "#e8eef6" }}>{error || "Loading…"}</Text>
      </View>
    );
  }

  const latestRejection = [...(issue.rejection_history || [])].sort((a, b) => b.id - a.id)[0];
  const showSubmitFocus = action === "submit" && issue.status === "in_progress";

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
      {info ? <Text style={styles.info}>{info}</Text> : null}

      <View style={styles.photoGrid}>
        <Text style={styles.section}>Photos</Text>
        {issue.before_photo_path ? (
          <>
            <Text style={styles.meta}>GMC representative (before)</Text>
            <Image source={{ uri: mediaUrl(issue.before_photo_path) }} style={styles.photo} />
          </>
        ) : null}
        {issue.completion_photo_path ? (
          <>
            <Text style={styles.meta}>Contractor (submit)</Text>
            <Image source={{ uri: mediaUrl(issue.completion_photo_path) }} style={styles.photo} />
          </>
        ) : null}
        {issue.verification_photo_path ? (
          <>
            <Text style={styles.meta}>Final (closed)</Text>
            <Image source={{ uri: mediaUrl(issue.verification_photo_path) }} style={styles.photo} />
          </>
        ) : null}
      </View>

      {(issue.status === "under_review" || action === "rejection") && latestRejection ? (
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
        <View style={showSubmitFocus ? styles.focusBox : undefined}>
          <TextInput
            style={styles.input}
            placeholder="Description / remarks"
            placeholderTextColor="#8b9bb0"
            value={remarks}
            onChangeText={setRemarks}
            multiline
          />
          <Pressable
            style={styles.primary}
            onPress={() => {
              setPendingAction("complete");
              setMode("complete");
            }}
          >
            <Text style={styles.primaryText}>
              {pendingPhoto ? "Retake camera photo" : "Open camera (photo + GPS)"}
            </Text>
          </Pressable>
          {pendingPhoto ? (
            <Text style={styles.info}>
              GPS locked: {pendingPhoto.lat.toFixed(5)}, {pendingPhoto.lng.toFixed(5)}
            </Text>
          ) : null}
          <Pressable
            style={[styles.primary, !pendingPhoto || busy ? { opacity: 0.5 } : null]}
            disabled={!pendingPhoto || busy}
            onPress={submitPhoto}
          >
            <Text style={styles.primaryText}>{busy ? "Submitting…" : "Submit rectification"}</Text>
          </Pressable>
          <Text style={styles.meta}>Capture first, then tap Submit. Offline photos queue and sync later.</Text>
        </View>
      ) : null}

      {role === "surveyor" &&
      (issue.status === "completed" || issue.status === "verification_pending") ? (
        <View>
          <Text style={styles.meta}>Verify within 24 hours of completion</Text>
          <Pressable
            style={styles.primary}
            onPress={() => {
              setPendingAction("approve");
              setMode("approve");
            }}
          >
            <Text style={styles.primaryText}>
              {pendingPhoto && pendingAction === "approve" ? "Retake photo" : "Open camera to approve"}
            </Text>
          </Pressable>
          <TextInput
            style={styles.input}
            placeholder="Rejection reason"
            placeholderTextColor="#8b9bb0"
            value={reason}
            onChangeText={setReason}
          />
          <TextInput
            style={styles.input}
            placeholder="Comments for contractor"
            placeholderTextColor="#8b9bb0"
            value={comments}
            onChangeText={setComments}
            multiline
          />
          <Pressable
            style={styles.danger}
            onPress={() => {
              setPendingAction("reject");
              setMode("reject");
            }}
          >
            <Text style={styles.primaryText}>
              {pendingPhoto && pendingAction === "reject" ? "Retake reject photo" : "Open camera to reject"}
            </Text>
          </Pressable>
          {pendingPhoto ? (
            <>
              <Text style={styles.info}>
                GPS locked: {pendingPhoto.lat.toFixed(5)}, {pendingPhoto.lng.toFixed(5)}
              </Text>
              <Pressable
                style={[styles.primary, busy ? { opacity: 0.5 } : null]}
                disabled={busy}
                onPress={submitPhoto}
              >
                <Text style={styles.primaryText}>
                  {busy
                    ? "Submitting…"
                    : pendingAction === "reject"
                      ? "Submit rejection"
                      : "Submit approval"}
                </Text>
              </Pressable>
            </>
          ) : null}
        </View>
      ) : null}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  page: { padding: 16, backgroundColor: "#0a0c10", flexGrow: 1 },
  title: { fontSize: 20, fontWeight: "800", color: "#e8eef6" },
  meta: { color: "#8b9bb0", marginBottom: 8 },
  section: { color: "#e8eef6", fontWeight: "700", marginBottom: 8, marginTop: 4 },
  photoGrid: { marginBottom: 16 },
  photo: { width: "100%", height: 180, borderRadius: 12, marginBottom: 10, backgroundColor: "#1c2430" },
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
  info: { color: "#fbbf24", marginBottom: 8 },
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
  focusBox: {
    borderWidth: 1,
    borderColor: "#3b9eff",
    borderRadius: 12,
    padding: 10,
    marginBottom: 8,
  },
});
