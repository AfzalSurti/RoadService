import { Stack, router, useFocusEffect } from "expo-router";
import React, { useCallback, useState } from "react";
import { FlatList, Pressable, StyleSheet, Text, View } from "react-native";
import { api } from "../lib/api";
import { useAuth } from "../lib/auth";

type Note = {
  id: number;
  title: string;
  message: string;
  is_read: boolean;
  created_at: string;
  issue_id?: number | null;
};

export default function NotificationsScreen() {
  const { token } = useAuth();
  const [items, setItems] = useState<Note[]>([]);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!token) return;
    try {
      setItems(await api.notifications(token));
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
      <Stack.Screen options={{ title: "Notifications" }} />
      <Pressable
        style={styles.markAll}
        onPress={async () => {
          if (!token) return;
          await api.markAllNotificationsRead(token);
          await load();
        }}
      >
        <Text style={styles.markAllText}>Mark all read</Text>
      </Pressable>
      {error ? <Text style={styles.error}>{error}</Text> : null}
      <FlatList
        data={items}
        keyExtractor={(n) => String(n.id)}
        renderItem={({ item }) => (
          <Pressable
            style={[styles.card, !item.is_read && styles.unread]}
            onPress={async () => {
              if (!token) return;
              if (!item.is_read) await api.markNotificationRead(token, item.id);
              if (item.issue_id) router.push(`/issue/${item.issue_id}`);
              else load();
            }}
          >
            <Text style={styles.title}>{item.title}</Text>
            <Text style={styles.msg}>{item.message}</Text>
            <Text style={styles.meta}>
              {new Date(item.created_at).toLocaleString()}
              {item.issue_id ? ` · #${item.issue_id}` : ""}
            </Text>
          </Pressable>
        )}
        ListEmptyComponent={<Text style={styles.meta}>No notifications.</Text>}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: "#0a0c10", padding: 16 },
  markAll: { alignSelf: "flex-end", marginBottom: 10 },
  markAllText: { color: "#3b9eff", fontWeight: "600" },
  card: {
    backgroundColor: "#12161d",
    borderRadius: 12,
    padding: 14,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: "#243041",
  },
  unread: { borderColor: "rgba(59,158,255,0.5)", backgroundColor: "rgba(59,158,255,0.08)" },
  title: { color: "#e8eef6", fontWeight: "700", marginBottom: 4 },
  msg: { color: "#c9d6e5", marginBottom: 6 },
  meta: { color: "#8b9bb0" },
  error: { color: "#fb7185", marginBottom: 8 },
});
