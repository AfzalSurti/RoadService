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
import { api, type PmmSurvey, type Project } from "../lib/api";
import { useAuth } from "../lib/auth";

export default function PmmScreen() {
  const { token } = useAuth();
  const [rows, setRows] = useState<PmmSurvey[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [q, setQ] = useState("");
  const [showAdd, setShowAdd] = useState(false);
  const [projectId, setProjectId] = useState<number | null>(null);
  const [remarks, setRemarks] = useState("");
  const [lengthKm, setLengthKm] = useState("");
  const [busy, setBusy] = useState(false);
  const [sheet, setSheet] = useState(false);

  const load = useCallback(async () => {
    if (!token) return;
    try {
      const [list, proj] = await Promise.all([
        api.pmmList(token),
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

  const filtered = rows.filter((r) => {
    if (!q.trim()) return true;
    const p = projects.find((x) => x.id === r.project_id);
    return `${r.id} ${r.status} ${p?.name || ""} ${r.remarks || ""}`.toLowerCase().includes(q.toLowerCase());
  });

  const save = async () => {
    if (!token || !projectId) return;
    setBusy(true);
    try {
      await api.raisePmm(token, {
        project_id: projectId,
        remarks: remarks.trim() || undefined,
        lane_length_km: lengthKm ? Number(lengthKm) : undefined,
      });
      setShowAdd(false);
      setRemarks("");
      await load();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <View style={st.page}>
      <Stack.Screen options={{ title: "PMM List" }} />
      <Text style={st.crumb}>Home › Priority Maintenance (PMM)</Text>
      <TextInput style={st.search} placeholder="Search" value={q} onChangeText={setQ} />
      <Pressable style={st.primary} onPress={() => setShowAdd((v) => !v)}>
        <Text style={st.primaryText}>{showAdd ? "Close form" : "+ Add PMM survey"}</Text>
      </Pressable>
      {showAdd ? (
        <View style={st.card}>
          <Pressable style={st.select} onPress={() => setSheet(true)}>
            <Text>{projects.find((p) => p.id === projectId)?.name || "Select project"}</Text>
          </Pressable>
          <TextInput
            style={st.search}
            placeholder="Lane length surveyed (km)"
            value={lengthKm}
            onChangeText={setLengthKm}
            keyboardType="decimal-pad"
          />
          <TextInput style={st.search} placeholder="Remarks" value={remarks} onChangeText={setRemarks} />
          <Pressable style={st.primary} disabled={busy} onPress={save}>
            <Text style={st.primaryText}>{busy ? "Saving…" : "Save"}</Text>
          </Pressable>
        </View>
      ) : null}
      {error ? <Text style={st.err}>{error}</Text> : null}
      <FlatList
        data={filtered}
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
        renderItem={({ item, index }) => {
          const p = projects.find((x) => x.id === item.project_id);
          return (
            <View style={st.card}>
              <Text style={st.title}>
                #{index + 1} · {p?.ucc || p?.name || `Project ${item.project_id}`}
              </Text>
              <Text style={st.meta}>Status: {item.status}</Text>
              <Text style={st.meta}>Survey: {item.survey_date || item.created_at?.slice(0, 10)}</Text>
              <Text style={st.meta}>Lane length: {item.lane_length_km ?? "—"} km</Text>
              {item.remarks ? <Text>{item.remarks}</Text> : null}
            </View>
          );
        }}
        ListEmptyComponent={<Text style={st.meta}>No Records Found</Text>}
      />
      <Pressable style={st.ghost} onPress={() => router.back()}>
        <Text style={st.ghostText}>Back</Text>
      </Pressable>
      <SelectSheet
        visible={sheet}
        title="Project"
        options={projects.map((p) => ({
          id: String(p.id),
          label: p.ucc || p.name,
          hint: p.name,
        }))}
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
  crumb: { color: "#667", marginBottom: 8 },
  search: {
    borderWidth: 1,
    borderColor: "#d5dbe3",
    borderRadius: 10,
    padding: 12,
    backgroundColor: "#fff",
    marginBottom: 10,
  },
  primary: { backgroundColor: "#1a4b8c", borderRadius: 12, padding: 14, alignItems: "center", marginBottom: 10 },
  primaryText: { color: "#fff", fontWeight: "800" },
  card: { backgroundColor: "#fff", borderRadius: 12, padding: 14, marginBottom: 10 },
  title: { fontWeight: "800", color: "#111", marginBottom: 4 },
  meta: { color: "#667", marginBottom: 3 },
  err: { color: "#b91c1c", marginBottom: 8 },
  select: { borderWidth: 1, borderColor: "#d5dbe3", borderRadius: 10, padding: 12, marginBottom: 10 },
  ghost: { borderWidth: 1, borderColor: "#1a4b8c", borderRadius: 12, padding: 12, alignItems: "center", backgroundColor: "#fff" },
  ghostText: { color: "#1a4b8c", fontWeight: "700" },
});
