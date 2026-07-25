import { Link, Stack, router, useFocusEffect } from "expo-router";
import React, { useCallback, useState } from "react";
import { FlatList, Pressable, RefreshControl, StyleSheet, Text, View } from "react-native";
import { api, type Issue } from "../lib/api";
import { useAuth } from "../lib/auth";

export default function HomeScreen() {
  const { token, role, fullName, logout } = useAuth();
  const [issues, setIssues] = useState<Issue[]>([]);
  const [unread, setUnread] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    if (!token) return;
    try {
      const [issueList, notes] = await Promise.all([api.issues(token), api.notifications(token)]);
      setIssues(issueList);
      setUnread(notes.filter((n) => !n.is_read).length);
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

  return (
    <View style={styles.page}>
      <Stack.Screen options={{ title: "Issues" }} />
      <View style={styles.header}>
        <View>
          <Text style={styles.name}>{fullName}</Text>
          <Text style={styles.role}>
            {role}
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
      {role === "surveyor" ? (
        <Link href="/create-issue" asChild>
          <Pressable style={styles.primary}>
            <Text style={styles.primaryText}>Report new issue</Text>
          </Pressable>
        </Link>
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
          <Link href={`/issue/${item.id}`} asChild>
            <Pressable style={styles.card}>
              <Text style={styles.cardTitle}>
                #{item.id} · {item.issue_type}
              </Text>
              <Text style={styles.meta}>
                {item.status} · {item.remaining_days ?? "?"} days left
              </Text>
              <Text numberOfLines={2}>{item.description}</Text>
            </Pressable>
          </Link>
        )}
        ListEmptyComponent={<Text style={styles.meta}>No issues yet.</Text>}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: "#eef2f6", padding: 16 },
  header: { flexDirection: "row", justifyContent: "space-between", marginBottom: 12 },
  name: { fontWeight: "700", fontSize: 18, color: "#0b2a43" },
  role: { textTransform: "capitalize", color: "#5b6b7c" },
  link: { color: "#0f4c81", fontWeight: "600" },
  primary: {
    backgroundColor: "#0f4c81",
    padding: 14,
    borderRadius: 12,
    alignItems: "center",
    marginBottom: 12,
  },
  primaryText: { color: "#fff", fontWeight: "700" },
  card: {
    backgroundColor: "#fff",
    borderRadius: 12,
    padding: 14,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: "#d5dee8",
  },
  cardTitle: { fontWeight: "700", marginBottom: 4 },
  meta: { color: "#5b6b7c", marginBottom: 4 },
  error: { color: "#be123c", marginBottom: 8 },
});
