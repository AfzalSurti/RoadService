import { Stack, router, useFocusEffect } from "expo-router";
import React, { useCallback, useState } from "react";
import {
  FlatList,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { SelectSheet } from "../components/SelectSheet";
import { api, type Project, type RoadWarning } from "../lib/api";
import { useAuth } from "../lib/auth";

export default function WarningsScreen() {
  const { token } = useAuth();
  const [rows, setRows] = useState<RoadWarning[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [show, setShow] = useState(false);
  const [projectId, setProjectId] = useState<number | null>(null);
  const [title, setTitle] = useState("");
  const [chainage, setChainage] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [sheet, setSheet] = useState(false);

  const load = useCallback(async () => {
    if (!token) return;
    try {
      const [list, proj] = await Promise.all([
        api.warnings(token),
        api.fieldProjects(token).catch(() => api.projects(token)),
      ]);
      setRows(list);
      setProjects(proj);
      if (proj[0] && !projectId) setProjectId(proj[0].id);
      setError(null);
    } catch (e: any) {
      setError(e.message);
    }
  }, [token, projectId]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  const save = async () => {
    if (!token || !projectId || title.trim().length < 3) {
      setError("Project and title are required");
      return;
    }
    setBusy(true);
    try {
      await api.raiseWarning(token, {
        project_id: projectId,
        title: title.trim(),
        chainage: chainage.trim() || undefined,
        note: note.trim() || undefined,
      });
      setShow(false);
      setTitle("");
      setChainage("");
      setNote("");
      await load();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <View style={st.page}>
      <Stack.Screen options={{ title: "Road Warnings" }} />
      <Pressable style={st.primary} onPress={() => setShow((v) => !v)}>
        <Text style={st.primaryText}>{show ? "Close" : "+ Raise warning"}</Text>
      </Pressable>
      {show ? (
        <View style={st.card}>
          <Pressable style={st.select} onPress={() => setSheet(true)}>
            <Text>{projects.find((p) => p.id === projectId)?.name || "Select project"}</Text>
          </Pressable>
          <TextInput style={st.input} placeholder="Warning title" value={title} onChangeText={setTitle} />
          <TextInput style={st.input} placeholder="Chainage" value={chainage} onChangeText={setChainage} />
          <TextInput style={[st.input, { minHeight: 70 }]} placeholder="Note" value={note} onChangeText={setNote} multiline />
          <Pressable style={st.primary} disabled={busy} onPress={save}>
            <Text style={st.primaryText}>{busy ? "Saving…" : "Save"}</Text>
          </Pressable>
        </View>
      ) : null}
      {error ? <Text style={st.err}>{error}</Text> : null}
      <FlatList
        data={rows}
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
            <Text style={st.title}>{item.title}</Text>
            <Text style={st.meta}>
              {item.status}
              {item.chainage ? ` · Ch. ${item.chainage}` : ""}
            </Text>
            {item.note ? <Text>{item.note}</Text> : null}
          </View>
        )}
        ListEmptyComponent={<Text style={st.meta}>No road warnings yet.</Text>}
      />
      <Pressable style={st.ghost} onPress={() => router.back()}>
        <Text style={st.ghostText}>Back</Text>
      </Pressable>
      <SelectSheet
        visible={sheet}
        title="Project"
        options={projects.map((p) => ({ id: String(p.id), label: p.ucc || p.name, hint: p.name }))}
        value={projectId ? String(projectId) : null}
        onClose={() => setSheet(false)}
        onConfirm={(id) => {
          setProjectId(Number(id));
          setSheet(false);
        }}
      />
    </View>
  );
}

const st = StyleSheet.create({
  page: { flex: 1, backgroundColor: "#eef2f6", padding: 14 },
  primary: { backgroundColor: "#1a4b8c", borderRadius: 12, padding: 14, alignItems: "center", marginBottom: 10 },
  primaryText: { color: "#fff", fontWeight: "800" },
  card: { backgroundColor: "#fff", borderRadius: 12, padding: 14, marginBottom: 10 },
  title: { fontWeight: "800", color: "#111", marginBottom: 4 },
  meta: { color: "#667", marginBottom: 4 },
  err: { color: "#b91c1c", marginBottom: 8 },
  input: { borderWidth: 1, borderColor: "#d5dbe3", borderRadius: 10, padding: 12, marginBottom: 8, backgroundColor: "#fff" },
  select: { borderWidth: 1, borderColor: "#d5dbe3", borderRadius: 10, padding: 12, marginBottom: 8 },
  ghost: { borderWidth: 1, borderColor: "#1a4b8c", borderRadius: 12, padding: 12, alignItems: "center", backgroundColor: "#fff" },
  ghostText: { color: "#1a4b8c", fontWeight: "700" },
});
