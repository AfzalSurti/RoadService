import { Link, Stack, router, useFocusEffect } from "expo-router";
import React, { useCallback, useState } from "react";
import { FlatList, Pressable, RefreshControl, StyleSheet, Text, View } from "react-native";
import { api, type Issue } from "../lib/api";
import { useAuth } from "../lib/auth";
import { flushOfflineJobs, listOfflineJobs } from "../lib/offline";
import { roleLabel } from "../lib/roles";

export default function HomeScreen() {
  const { token, role, fullName, logout } = useAuth();
  const [issues, setIssues] = useState<Issue[]>([]);
  const [unread, setUnread] = useState(0);
  const [pendingOffline, setPendingOffline] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [busyId, setBusyId] = useState<number | null>(null);

  const load = useCallback(async () => {
    if (!token) return;
    try {
      const sync = await flushOfflineJobs(token);
      const [issueList, notes, offline] = await Promise.all([
        api.issues(token),
        api.notifications(token),
        listOfflineJobs(),
      ]);
      setIssues(issueList);
      setUnread(notes.filter((n) => !n.is_read).length);
      setPendingOffline(offline.length);
      if (sync.synced) {
        setError(null);
      } else if (sync.failed) {
        setError(`${sync.failed} offline item(s) still waiting for network`);
      } else {
        setError(null);
      }
    } catch (e: any) {
      setError(e.message);
      setPendingOffline((await listOfflineJobs()).length);
    }
  }, [token]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  const oneTapStart = async (item: Issue) => {
    if (!token) return;
    setBusyId(item.id);
    try {
      if (item.status === "under_review") await api.reworkStart(token, item.id);
      else await api.startIssue(token, item.id);
      await load();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusyId(null);
    }
  };

  return (
    <View style={styles.page}>
      <Stack.Screen options={{ title: "Issues" }} />
      <View style={styles.header}>
        <View>
          <Text style={styles.name}>{fullName}</Text>
          <Text style={styles.role}>
            {roleLabel(role)}
            {unread ? ` · ${unread} alerts` : ""}
          </Text>
        </View>
        <Pressable
          onPress={async () => {
            await logout();
            router.replace("/login");
          }}
        >
          <Text style={styles.link}>Sign out</Text>
        </Pressable>
      </View>

      <View style={styles.row}>
        <Link href="/notifications" asChild>
          <Pressable style={styles.secondary}>
            <Text style={styles.secondaryText}>Notifications{unread ? ` (${unread})` : ""}</Text>
          </Pressable>
        </Link>
      {role === "surveyor" ? (
          <Link href="/create-issue" asChild>
            <Pressable style={styles.primary}>
              <Text style={styles.primaryText}>Report issue</Text>
            </Pressable>
          </Link>
        ) : null}
        {role === "surveyor" ? (
          <Link href="/quantity" asChild>
            <Pressable style={styles.secondary}>
              <Text style={styles.secondaryText}>Quantity</Text>
            </Pressable>
          </Link>
        ) : null}
      </View>

      {pendingOffline ? (
        <Text style={styles.offline}>
          {pendingOffline} offline capture(s) saved — will sync when online
        </Text>
      ) : null}
      {error ? <Text style={styles.error}>{error}</Text> : null}

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
          <View style={styles.card}>
            <Link href={`/issue/${item.id}`} asChild>
              <Pressable>
                <Text style={styles.cardTitle}>
                  #{item.id} · {item.issue_type}
                </Text>
                <Text style={styles.meta}>
                  {item.status} · {item.remaining_days ?? "?"} days left
                </Text>
                <Text numberOfLines={2}>{item.description}</Text>
              </Pressable>
            </Link>
            {role === "contractor" ? (
              <View style={styles.actions}>
                {(item.status === "open" || item.status === "under_review") && (
                  <Pressable
                    style={styles.miniBtn}
                    disabled={busyId === item.id}
                    onPress={() => oneTapStart(item)}
                  >
                    <Text style={styles.miniText}>
                      {item.status === "under_review" ? "Start rework" : "Start work"}
                    </Text>
                  </Pressable>
                )}
                {item.status === "in_progress" && (
                  <Pressable
                    style={styles.miniBtn}
                    onPress={() => router.push(`/issue/${item.id}?action=submit`)}
                  >
                    <Text style={styles.miniText}>Submit</Text>
                  </Pressable>
                )}
                {item.status === "under_review" && (
                  <Pressable
                    style={[styles.miniBtn, styles.ghostBtn]}
                    onPress={() => router.push(`/issue/${item.id}?action=rejection`)}
                  >
                    <Text style={styles.ghostText}>View comments</Text>
                  </Pressable>
                )}
              </View>
            ) : null}
          </View>
        )}
        ListEmptyComponent={<Text style={styles.meta}>No issues yet.</Text>}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: "#0a0c10", padding: 16 },
  header: { flexDirection: "row", justifyContent: "space-between", marginBottom: 12 },
  name: { fontWeight: "700", fontSize: 18, color: "#e8eef6" },
  role: { color: "#8b9bb0" },
  link: { color: "#3b9eff", fontWeight: "600" },
  row: { flexDirection: "row", gap: 8, marginBottom: 12 },
  primary: {
    flex: 1,
    backgroundColor: "#3b9eff",
    padding: 14,
    borderRadius: 12,
    alignItems: "center",
  },
  primaryText: { color: "#041018", fontWeight: "700" },
  secondary: {
    flex: 1,
    borderWidth: 1,
    borderColor: "#243041",
    padding: 14,
    borderRadius: 12,
    alignItems: "center",
    backgroundColor: "#12161d",
  },
  secondaryText: { color: "#e8eef6", fontWeight: "600" },
  card: {
    backgroundColor: "#12161d",
    borderRadius: 12,
    padding: 14,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: "#243041",
  },
  cardTitle: { fontWeight: "700", marginBottom: 4, color: "#e8eef6" },
  meta: { color: "#8b9bb0", marginBottom: 4 },
  error: { color: "#fb7185", marginBottom: 8 },
  offline: { color: "#fbbf24", marginBottom: 8 },
  actions: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 10 },
  miniBtn: {
    backgroundColor: "#3b9eff",
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 10,
  },
  miniText: { color: "#041018", fontWeight: "700", fontSize: 13 },
  ghostBtn: { backgroundColor: "transparent", borderWidth: 1, borderColor: "#243041" },
  ghostText: { color: "#e8eef6", fontWeight: "600", fontSize: 13 },
});
