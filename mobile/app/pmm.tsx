import { Stack, router, useFocusEffect } from "expo-router";
import React, { useCallback, useMemo, useState } from "react";
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
import { SelectSheet } from "../components/SelectSheet";
import { PackageCheckboxes } from "../components/PackageCheckboxes";
import { MediaAttach, type MediaItem } from "../components/MediaAttach";
import { api, type PmmSurvey, type Project } from "../lib/api";
import { useAuth } from "../lib/auth";
import { matchProjectsToPackages } from "../lib/packages";

const TYPES = ["Contractual Obligations", "Structure", "Road Safety", "Others"];
const STATUSES = ["open", "in_progress", "closed"];
const PRIORITIES = ["high", "medium", "low"];

export default function PmmScreen() {
  const { token, role } = useAuth();
  const [rows, setRows] = useState<PmmSurvey[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [q, setQ] = useState("");
  const [showAdd, setShowAdd] = useState(false);
  const [pkgs, setPkgs] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [sheet, setSheet] = useState<"type" | "status" | "priority" | null>(null);
  const [media, setMedia] = useState<MediaItem[]>([]);
  const [form, setForm] = useState({
    description: "",
    issue_type: "",
    status: "open",
    expected_resolution: "",
    concerned_authority: "",
    chainage_from: "",
    chainage_to: "",
    priority: "high",
    remarks: "",
    lengthKm: "",
  });

  const canRaise = role === "surveyor" || role === "admin";
  const canAct = role === "contractor" || role === "surveyor" || role === "admin";

  const load = useCallback(async () => {
    if (!token) return;
    try {
      const [list, proj] = await Promise.all([
        api.pmmList(token),
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

  const lengthKm = useMemo(() => {
    const a = Number(form.chainage_from);
    const b = Number(form.chainage_to);
    if (Number.isFinite(a) && Number.isFinite(b) && form.chainage_from && form.chainage_to) {
      return Math.abs(b - a).toFixed(2);
    }
    return form.lengthKm || "--";
  }, [form.chainage_from, form.chainage_to, form.lengthKm]);

  const filtered = rows.filter((r) => {
    if (!q.trim()) return true;
    const p = projects.find((x) => x.id === r.project_id);
    return `${r.id} ${r.status} ${p?.name || ""} ${r.remarks || ""}`.toLowerCase().includes(q.toLowerCase());
  });

  const save = async () => {
    if (!token) return;
    if (!pkgs.length) {
      setError("Select at least one package");
      return;
    }
    if (form.description.trim().length < 5) {
      setError("Description is required");
      return;
    }
    const matched = matchProjectsToPackages(projects, pkgs);
    const targets = matched.length ? matched : projects.slice(0, 1);
    if (!targets.length) {
      setError("No project found for package");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const mediaNote = media.map((m) => `[${m.kind}] ${m.uri}`).join("\n");
      for (const p of targets) {
        const detail = {
          packages: pkgs,
          description: form.description.trim(),
          issue_type: form.issue_type,
          expected_resolution: form.expected_resolution,
          concerned_authority: form.concerned_authority,
          chainage_from: form.chainage_from,
          chainage_to: form.chainage_to,
          total_length_km: lengthKm === "--" ? null : Number(lengthKm),
          priority: form.priority,
          media: media.map((m) => m.uri),
        };
        await api.raisePmm(token, {
          project_id: p.id,
          remarks: [form.remarks.trim(), mediaNote].filter(Boolean).join("\n") || undefined,
          lane_length_km: lengthKm === "--" ? undefined : Number(lengthKm),
          distress_json: JSON.stringify(detail),
          survey_date: new Date().toISOString().slice(0, 10),
        });
      }
      setShowAdd(false);
      setPkgs([]);
      setMedia([]);
      setForm({
        description: "",
        issue_type: "",
        status: "open",
        expected_resolution: "",
        concerned_authority: "",
        chainage_from: "",
        chainage_to: "",
        priority: "high",
        remarks: "",
        lengthKm: "",
      });
      await load();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };

  const setStatus = async (id: number, status: string) => {
    if (!token || !canAct) return;
    try {
      await api.updatePmmStatus(token, id, status);
      await load();
    } catch (e: any) {
      setError(e.message);
    }
  };

  return (
    <View style={st.page}>
      <Stack.Screen options={{ title: "PMM List" }} />
      <Text style={st.crumb}>Home › Priority Maintenance (PMM)</Text>
      <TextInput style={st.search} placeholder="Search" value={q} onChangeText={setQ} />
      {canRaise ? (
        <Pressable style={st.primary} onPress={() => setShowAdd((v) => !v)}>
          <Text style={st.primaryText}>{showAdd ? "Close form" : "+ Raise PMM"}</Text>
        </Pressable>
      ) : (
        <Text style={st.meta}>View / action only — GMC representative raises PMM.</Text>
      )}
      {showAdd ? (
        <ScrollView style={st.card} keyboardShouldPersistTaps="handled">
          <PackageCheckboxes selected={pkgs} onChange={setPkgs} />
          <Text style={st.label}>Description *</Text>
          <TextInput
            style={[st.search, { minHeight: 70 }]}
            value={form.description}
            onChangeText={(t) => setForm({ ...form, description: t })}
            multiline
            placeholder="Describe priority maintenance"
          />
          <Pressable style={st.select} onPress={() => setSheet("type")}>
            <Text style={form.issue_type ? st.val : st.ph}>{form.issue_type || "Select Issue Type *"}</Text>
          </Pressable>
          <Text style={st.label}>Expected Date of Resolution (YYYY-MM-DD)</Text>
          <TextInput
            style={st.search}
            value={form.expected_resolution}
            onChangeText={(t) => setForm({ ...form, expected_resolution: t })}
            placeholder="2026-08-20"
          />
          <Text style={st.label}>Concerned Authority</Text>
          <TextInput
            style={st.search}
            value={form.concerned_authority}
            onChangeText={(t) => setForm({ ...form, concerned_authority: t })}
          />
          <Text style={st.label}>Chainage From (Km)</Text>
          <TextInput
            style={st.search}
            value={form.chainage_from}
            onChangeText={(t) => setForm({ ...form, chainage_from: t })}
            keyboardType="decimal-pad"
          />
          <Text style={st.label}>Chainage To (Km)</Text>
          <TextInput
            style={st.search}
            value={form.chainage_to}
            onChangeText={(t) => setForm({ ...form, chainage_to: t })}
            keyboardType="decimal-pad"
          />
          <Text style={st.meta}>Lane / length affected (km): {lengthKm}</Text>
          <Pressable style={st.select} onPress={() => setSheet("priority")}>
            <Text style={st.val}>Priority: {form.priority}</Text>
          </Pressable>
          <TextInput
            style={st.search}
            placeholder="Remarks"
            value={form.remarks}
            onChangeText={(t) => setForm({ ...form, remarks: t })}
          />
          <MediaAttach items={media} onChange={setMedia} />
          <Pressable style={st.primary} disabled={busy} onPress={save}>
            <Text style={st.primaryText}>{busy ? "Saving…" : "Submit"}</Text>
          </Pressable>
        </ScrollView>
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
          let detail: { description?: string; issue_type?: string; packages?: string[] } = {};
          try {
            detail = item.remarks && item.remarks.startsWith("{") ? JSON.parse(item.remarks) : {};
            if ((item as PmmSurvey & { distress_json?: string }).distress_json) {
              detail = JSON.parse((item as any).distress_json || "{}");
            }
          } catch {
            /* ignore */
          }
          return (
            <View style={st.card}>
              <Text style={st.title}>
                #{index + 1} · {p?.name || `Package ${item.project_id}`}
              </Text>
              <Text style={st.meta}>Status: {item.status}</Text>
              <Text style={st.meta}>Survey: {item.survey_date || item.created_at?.slice(0, 10)}</Text>
              <Text style={st.meta}>Lane length: {item.lane_length_km ?? "—"} km</Text>
              {detail.description ? <Text numberOfLines={3}>{detail.description}</Text> : null}
              {item.remarks && !item.remarks.startsWith("{") ? <Text>{item.remarks}</Text> : null}
              {canAct ? (
                <View style={st.row}>
                  {[
                    ["in_progress", "In progress"],
                    ["completed", "Completed"],
                  ].map(([s, lab]) => (
                    <Pressable
                      key={s}
                      style={[st.chip, (item.status === s || (s === "completed" && item.status === "closed")) && st.chipOn]}
                      onPress={() => setStatus(item.id, s === "completed" ? "closed" : s)}
                    >
                      <Text
                        style={[
                          st.chipText,
                          (item.status === s || (s === "completed" && item.status === "closed")) && { color: "#fff" },
                        ]}
                      >
                        {lab}
                      </Text>
                    </Pressable>
                  ))}
                </View>
              ) : null}
            </View>
          );
        }}
        ListEmptyComponent={<Text style={st.meta}>No Records Found</Text>}
      />
      <Pressable style={st.ghost} onPress={() => router.back()}>
        <Text style={st.ghostText}>Back</Text>
      </Pressable>
      <SelectSheet
        visible={sheet === "type"}
        title="Issue Type"
        options={TYPES.map((t) => ({ id: t, label: t }))}
        value={form.issue_type}
        onClose={() => setSheet(null)}
        onConfirm={(id) => {
          setForm({ ...form, issue_type: id });
          setSheet(null);
        }}
      />
      <SelectSheet
        visible={sheet === "priority"}
        title="Priority"
        options={PRIORITIES.map((t) => ({ id: t, label: t }))}
        value={form.priority}
        onClose={() => setSheet(null)}
        onConfirm={(id) => {
          setForm({ ...form, priority: id });
          setSheet(null);
        }}
      />
      <SelectSheet
        visible={sheet === "status"}
        title="Status"
        options={STATUSES.map((t) => ({ id: t, label: t }))}
        value={form.status}
        onClose={() => setSheet(null)}
        onConfirm={(id) => {
          setForm({ ...form, status: id });
          setSheet(null);
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
  card: { backgroundColor: "#fff", borderRadius: 12, padding: 14, marginBottom: 10, maxHeight: 520 },
  title: { fontWeight: "800", color: "#111", marginBottom: 4 },
  meta: { color: "#667", marginBottom: 3 },
  err: { color: "#b91c1c", marginBottom: 8 },
  select: { borderWidth: 1, borderColor: "#d5dbe3", borderRadius: 10, padding: 12, marginBottom: 10, backgroundColor: "#fff" },
  label: { fontWeight: "700", color: "#334", marginBottom: 6 },
  val: { color: "#111", fontWeight: "600" },
  ph: { color: "#8b97a8" },
  ghost: {
    borderWidth: 1,
    borderColor: "#1a4b8c",
    borderRadius: 12,
    padding: 12,
    alignItems: "center",
    backgroundColor: "#fff",
  },
  ghostText: { color: "#1a4b8c", fontWeight: "700" },
  row: { flexDirection: "row", flexWrap: "wrap", gap: 6, marginTop: 8 },
  chip: { borderWidth: 1, borderColor: "#1a4b8c", borderRadius: 8, paddingHorizontal: 10, paddingVertical: 6 },
  chipOn: { backgroundColor: "#1a4b8c" },
  chipText: { color: "#1a4b8c", fontSize: 12, fontWeight: "700" },
});
