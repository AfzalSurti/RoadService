import { Stack, router, useFocusEffect } from "expo-router";
import React, { useCallback, useState } from "react";
import {
  FlatList,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { MediaAttach, type MediaItem } from "../components/MediaAttach";
import { PackageCheckboxes } from "../components/PackageCheckboxes";
import { api, type Project, type RoadWarning } from "../lib/api";
import { useAuth } from "../lib/auth";
import { useTheme } from "../lib/theme";
import { matchProjectsToPackages } from "../lib/packages";

export default function WarningsScreen() {
  const { token, role } = useAuth();
  const { colors } = useTheme();
  const [rows, setRows] = useState<RoadWarning[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [show, setShow] = useState(false);
  const [pkgs, setPkgs] = useState<string[]>([]);
  const [title, setTitle] = useState("");
  const [chainage, setChainage] = useState("");
  const [note, setNote] = useState("");
  const [media, setMedia] = useState<MediaItem[]>([]);
  const [busy, setBusy] = useState(false);

  const canRaise = role === "surveyor" || role === "admin";

  const load = useCallback(async () => {
    if (!token) return;
    try {
      const [list, proj] = await Promise.all([
        api.warnings(token),
        api.fieldProjects(token).catch(() => api.projects(token)),
      ]);
      setRows(list);
      setProjects(proj);
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

  const save = async () => {
    if (!token || title.trim().length < 3) {
      setError("Title is required");
      return;
    }
    if (!pkgs.length) {
      setError("Select at least one package");
      return;
    }
    const matched = matchProjectsToPackages(projects, pkgs);
    const targets =
      matched.length > 0
        ? matched
        : projects[0]
          ? [{ ...projects[0], name: pkgs[0] }]
          : [];
    if (!targets.length) {
      setError("No projects available for selected packages");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const mediaNote = media
        .map((m) => `[${m.kind}] ${m.uri}${m.lat != null ? ` @${m.lat.toFixed(5)},${m.lng?.toFixed(5)}` : ""}`)
        .join("\n");
      for (const p of targets) {
        const pkgLabel = pkgs.find((x) => p.name.includes(x.split(" - ")[0])) || pkgs.join(", ");
        await api.raiseWarning(token, {
          project_id: p.id,
          title: title.trim(),
          chainage: chainage.trim() || undefined,
          note: [`Package: ${pkgLabel}`, note.trim(), mediaNote].filter(Boolean).join("\n"),
        });
      }
      setShow(false);
      setTitle("");
      setChainage("");
      setNote("");
      setPkgs([]);
      setMedia([]);
      await load();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <View style={[st.page, { backgroundColor: colors.bg }]}>
      <Stack.Screen options={{ title: "Road Warnings" }} />
      {canRaise ? (
        <Pressable style={st.primary} onPress={() => setShow((v) => !v)}>
          <Text style={st.primaryText}>{show ? "Close" : "+ Raise warning"}</Text>
        </Pressable>
      ) : null}
      {show ? (
        <ScrollView style={st.card} keyboardShouldPersistTaps="handled">
          <PackageCheckboxes selected={pkgs} onChange={setPkgs} />
          <TextInput style={st.input} placeholder="Warning title" value={title} onChangeText={setTitle} />
          <TextInput style={st.input} placeholder="Chainage" value={chainage} onChangeText={setChainage} />
          <TextInput
            style={[st.input, { minHeight: 70 }]}
            placeholder="Note"
            value={note}
            onChangeText={setNote}
            multiline
          />
          <MediaAttach items={media} onChange={setMedia} />
          <Pressable style={st.primary} disabled={busy} onPress={save}>
            <Text style={st.primaryText}>{busy ? "Saving…" : "Save"}</Text>
          </Pressable>
        </ScrollView>
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
    </View>
  );
}

const st = StyleSheet.create({
  page: { flex: 1, padding: 14 },
  primary: { backgroundColor: "#1a4b8c", borderRadius: 12, padding: 14, alignItems: "center", marginBottom: 10 },
  primaryText: { color: "#fff", fontWeight: "800" },
  card: { backgroundColor: "#fff", borderRadius: 12, padding: 14, marginBottom: 10 },
  title: { fontWeight: "800", color: "#111", marginBottom: 4 },
  meta: { color: "#667", marginBottom: 4 },
  err: { color: "#b91c1c", marginBottom: 8 },
  input: {
    borderWidth: 1,
    borderColor: "#d5dbe3",
    borderRadius: 10,
    padding: 12,
    marginBottom: 8,
    backgroundColor: "#fff",
  },
  ghost: {
    borderWidth: 1,
    borderColor: "#1a4b8c",
    borderRadius: 12,
    padding: 12,
    alignItems: "center",
    backgroundColor: "#fff",
  },
  ghostText: { color: "#1a4b8c", fontWeight: "700" },
});
