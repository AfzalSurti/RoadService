import { Stack, router, useFocusEffect } from "expo-router";
import React, { useCallback, useState } from "react";
import {
  FlatList,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { api, type Issue } from "../lib/api";
import { useAuth } from "../lib/auth";

/**
 * Contractor site work queue — view GMC-raised defects and set In progress / Completed.
 */
export default function SiteWorkScreen() {
  const { token } = useAuth();
  const [issues, setIssues] = useState<Issue[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [busyId, setBusyId] = useState<number | null>(null);

  const load = useCallback(async () => {
    if (!token) return;
    try {
      setIssues(await api.issues(token));
      setError(null);
    } catch (e: any) {
      setError(e.message);
    }
  }, [token]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  const setInProgress = async (item: Issue) => {
    if (!token) return;
    setBusyId(item.id);
    try {
      if (item.status === "under_review") await api.reworkStart(token, item.id);
      else if (item.status === "open") await api.startIssue(token, item.id);
      await load();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusyId(null);
    }
  };

  return (
    <View style={st.page}>
      <Stack.Screen options={{ title: "Site Work" }} />
      <Text style={st.hint}>
        Defects raised by GMC representative. Use In progress / Completed only — you cannot raise new
        defects here.
      </Text>
      {error ? <Text style={st.err}>{error}</Text> : null}
      <FlatList
        data={issues}
        keyExtractor={(i) => String(i.id)}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={async () => {
              setRefreshing(true);
              await load();
              setRefreshing(false);
            }}
          />
        }
        renderItem={({ item }) => (
          <View style={st.card}>
            <Pressable onPress={() => router.push(`/issue/${item.id}`)}>
              <Text style={st.title}>
                #{item.id} · {item.issue_type_label || item.issue_type}
              </Text>
              <Text style={st.meta}>Status: {item.status}</Text>
              <Text numberOfLines={2}>{item.description}</Text>
            </Pressable>
            <View style={st.row}>
              {(item.status === "open" || item.status === "under_review") && (
                <Pressable
                  style={st.chip}
                  disabled={busyId === item.id}
                  onPress={() => setInProgress(item)}
                >
                  <Text style={st.chipText}>In progress</Text>
                </Pressable>
              )}
              {item.status === "in_progress" && (
                <Pressable
                  style={[st.chip, st.chipOn]}
                  onPress={() => router.push(`/issue/${item.id}?action=submit`)}
                >
                  <Text style={[st.chipText, { color: "#fff" }]}>Completed</Text>
                </Pressable>
              )}
              {item.status === "in_progress" ? (
                <Text style={st.meta}>Current: In progress</Text>
              ) : null}
              {item.status === "completed" ||
              item.status === "verification_pending" ||
              item.status === "closed" ? (
                <Text style={st.ok}>Completed / {item.status}</Text>
              ) : null}
            </View>
          </View>
        )}
        ListEmptyComponent={<Text style={st.meta}>No site work items yet.</Text>}
      />
      <Pressable style={st.ghost} onPress={() => router.back()}>
        <Text style={st.ghostText}>Back</Text>
      </Pressable>
    </View>
  );
}

const st = StyleSheet.create({
  page: { flex: 1, backgroundColor: "#eef2f6", padding: 14 },
  hint: { color: "#556", marginBottom: 12, lineHeight: 18 },
  err: { color: "#b91c1c", marginBottom: 8 },
  ok: { color: "#15803d", fontWeight: "700", marginTop: 6 },
  card: { backgroundColor: "#fff", borderRadius: 12, padding: 14, marginBottom: 10 },
  title: { fontWeight: "800", color: "#111", marginBottom: 4 },
  meta: { color: "#667", marginBottom: 4 },
  row: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 10, alignItems: "center" },
  chip: {
    borderWidth: 1,
    borderColor: "#1a4b8c",
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  chipOn: { backgroundColor: "#1a4b8c" },
  chipText: { color: "#1a4b8c", fontWeight: "700", fontSize: 13 },
  ghost: {
    borderWidth: 1,
    borderColor: "#1a4b8c",
    borderRadius: 12,
    padding: 12,
    alignItems: "center",
    backgroundColor: "#fff",
    marginTop: 8,
  },
  ghostText: { color: "#1a4b8c", fontWeight: "700" },
});
