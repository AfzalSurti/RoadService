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
import { api, type CriticalIssue, type Project } from "../lib/api";
import { useAuth } from "../lib/auth";

const TYPES = ["Contractual Obligations", "Structure", "Road Safety", "Others"];
const STATUSES = ["new", "ongoing", "resolved"];
const PRIORITIES = ["high", "medium", "low"];

export default function CriticalScreen() {
  const { token } = useAuth();
  const [rows, setRows] = useState<CriticalIssue[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [step, setStep] = useState<"list" | "ucc" | "form">("list");
  const [projectId, setProjectId] = useState<number | null>(null);
  const [sheet, setSheet] = useState<"ucc" | "type" | "status" | "priority" | null>(null);
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState({
    description: "",
    issue_type: "",
    status: "new",
    expected_resolution: "",
    concerned_authority: "",
    chainage_from: "",
    chainage_to: "",
    priority: "high",
    remarks: "",
  });

  const load = useCallback(async () => {
    if (!token) return;
    try {
      const [list, proj] = await Promise.all([
        api.criticalList(token),
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

  const selected = projects.find((p) => p.id === projectId);
  const summary = useMemo(
    () => ({
      total: rows.length,
      ongoing: rows.filter((r) => r.status === "ongoing").length,
      neu: rows.filter((r) => r.status === "new").length,
      resolved: rows.filter((r) => r.status === "resolved").length,
    }),
    [rows]
  );

  const lengthKm = useMemo(() => {
    const a = Number(form.chainage_from);
    const b = Number(form.chainage_to);
    if (Number.isFinite(a) && Number.isFinite(b) && form.chainage_from && form.chainage_to) {
      return Math.abs(b - a).toFixed(2);
    }
    return "--";
  }, [form.chainage_from, form.chainage_to]);

  const save = async () => {
    if (!token || !projectId) return;
    if (form.description.trim().length < 5 || !form.issue_type || !form.concerned_authority.trim()) {
      setError("Description, issue type and concerned authority are required");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await api.raiseCritical(token, {
        project_id: projectId,
        description: form.description.trim(),
        issue_type: form.issue_type,
        status: form.status,
        expected_resolution: form.expected_resolution || undefined,
        concerned_authority: form.concerned_authority.trim(),
        chainage_from: form.chainage_from || undefined,
        chainage_to: form.chainage_to || undefined,
        total_length_km: lengthKm === "--" ? undefined : Number(lengthKm),
        priority: form.priority,
        remarks: form.remarks.trim() || undefined,
      });
      setStep("list");
      setForm({
        description: "",
        issue_type: "",
        status: "new",
        expected_resolution: "",
        concerned_authority: "",
        chainage_from: "",
        chainage_to: "",
        priority: "high",
        remarks: "",
      });
      await load();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };

  if (step === "ucc") {
    return (
      <View style={st.page}>
        <Stack.Screen options={{ title: "Select UCC" }} />
        <Pressable style={st.select} onPress={() => setSheet("ucc")}>
          <Text style={selected ? st.val : st.ph}>{selected?.ucc || selected?.name || "Search UCC"}</Text>
        </Pressable>
        {selected ? <Text style={st.meta}>{selected.name}</Text> : null}
        {error ? <Text style={st.err}>{error}</Text> : null}
        <View style={st.row}>
          <Pressable style={st.ghost} onPress={() => setStep("list")}>
            <Text style={st.ghostText}>Cancel</Text>
          </Pressable>
          <Pressable style={[st.primary, !projectId && st.off]} disabled={!projectId} onPress={() => setStep("form")}>
            <Text style={st.primaryText}>Raise New Critical Issue</Text>
          </Pressable>
        </View>
        <SelectSheet
          visible={sheet === "ucc"}
          title="Select UCC"
          searchPlaceholder="Search UCC"
          options={projects.map((p) => ({
            id: String(p.id),
            label: p.ucc || `N/${String(p.id).padStart(5, "0")}/MH`,
            hint: p.name,
          }))}
          value={projectId ? String(projectId) : null}
          onClose={() => setSheet(null)}
          onConfirm={(id) => {
            setProjectId(Number(id));
            setSheet(null);
          }}
        />
      </View>
    );
  }

  if (step === "form") {
    return (
      <ScrollView contentContainerStyle={st.page}>
        <Stack.Screen options={{ title: "Raise Critical Issue" }} />
        <Text style={st.val}>{selected?.ucc || `N/${projectId}`}</Text>
        <Text style={st.meta}>{selected?.name}</Text>
        <Text style={st.label}>Issue Description *</Text>
        <TextInput
          style={[st.input, { minHeight: 80 }]}
          maxLength={500}
          value={form.description}
          onChangeText={(t) => setForm({ ...form, description: t })}
          placeholder="0/500"
          multiline
        />
        <Pressable style={st.select} onPress={() => setSheet("type")}>
          <Text style={form.issue_type ? st.val : st.ph}>{form.issue_type || "Select Issue Type *"}</Text>
        </Pressable>
        <Pressable style={st.select} onPress={() => setSheet("status")}>
          <Text style={st.val}>Issue Status: {form.status}</Text>
        </Pressable>
        <Text style={st.label}>Expected Date of Resolution * (YYYY-MM-DD)</Text>
        <TextInput
          style={st.input}
          value={form.expected_resolution}
          onChangeText={(t) => setForm({ ...form, expected_resolution: t })}
          placeholder="2026-08-20"
        />
        <Text style={st.label}>Concerned Authority *</Text>
        <TextInput
          style={st.input}
          value={form.concerned_authority}
          onChangeText={(t) => setForm({ ...form, concerned_authority: t })}
        />
        <Text style={st.label}>Chainage Affected From (Km) *</Text>
        <TextInput
          style={st.input}
          value={form.chainage_from}
          onChangeText={(t) => setForm({ ...form, chainage_from: t })}
          keyboardType="decimal-pad"
        />
        <Text style={st.label}>Chainage Affected To (Km) *</Text>
        <TextInput
          style={st.input}
          value={form.chainage_to}
          onChangeText={(t) => setForm({ ...form, chainage_to: t })}
          keyboardType="decimal-pad"
        />
        <Text style={st.meta}>Total Length Affected (Km): {lengthKm}</Text>
        <Pressable style={st.select} onPress={() => setSheet("priority")}>
          <Text style={st.val}>Priority: {form.priority}</Text>
        </Pressable>
        <TextInput
          style={[st.input, { minHeight: 80 }]}
          placeholder="Enter remarks"
          maxLength={500}
          value={form.remarks}
          onChangeText={(t) => setForm({ ...form, remarks: t })}
          multiline
        />
        {error ? <Text style={st.err}>{error}</Text> : null}
        <View style={st.row}>
          <Pressable style={st.ghost} onPress={() => setStep("list")}>
            <Text style={st.ghostText}>Cancel</Text>
          </Pressable>
          <Pressable style={st.primary} disabled={busy} onPress={save}>
            <Text style={st.primaryText}>{busy ? "Submitting…" : "Submit Issue"}</Text>
          </Pressable>
        </View>
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
          visible={sheet === "status"}
          title="Issue Status"
          options={STATUSES.map((t) => ({ id: t, label: t }))}
          value={form.status}
          onClose={() => setSheet(null)}
          onConfirm={(id) => {
            setForm({ ...form, status: id });
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
      </ScrollView>
    );
  }

  return (
    <View style={st.page}>
      <Stack.Screen options={{ title: "Critical Issues" }} />
      <View style={st.kpiGrid}>
        {[
          { label: "Total Issues", value: summary.total, dark: true },
          { label: "Ongoing Issues", value: summary.ongoing },
          { label: "New Issues", value: summary.neu },
          { label: "Resolved Issues", value: summary.resolved },
        ].map((k) => (
          <View key={k.label} style={[st.kpi, k.dark && st.kpiDark]}>
            <Text style={[st.kpiVal, k.dark && { color: "#fff" }]}>{k.value}</Text>
            <Text style={[st.kpiLab, k.dark && { color: "#cfe0f5" }]}>{k.label}</Text>
          </View>
        ))}
      </View>
      <Pressable style={st.primary} onPress={() => setStep("ucc")}>
        <Text style={st.primaryText}>Raise Critical Issue</Text>
      </Pressable>
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
            <Text style={st.val}>{item.issue_no}</Text>
            <Text style={st.meta}>
              {item.issue_type || "—"} · {item.status}
            </Text>
            <Text numberOfLines={2}>{item.description}</Text>
            <Text style={st.meta}>{item.concerned_authority}</Text>
          </View>
        )}
        ListEmptyComponent={<Text style={st.meta}>No critical issues yet.</Text>}
      />
      <Pressable style={st.ghost} onPress={() => router.back()}>
        <Text style={st.ghostText}>Back</Text>
      </Pressable>
    </View>
  );
}

const st = StyleSheet.create({
  page: { flexGrow: 1, backgroundColor: "#eef2f6", padding: 14 },
  kpiGrid: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginBottom: 12 },
  kpi: { width: "48%", backgroundColor: "#fff", borderRadius: 10, padding: 12, alignItems: "center" },
  kpiDark: { backgroundColor: "#12355a" },
  kpiVal: { fontWeight: "800", fontSize: 20, color: "#12355a" },
  kpiLab: { fontSize: 12, color: "#556", textAlign: "center" },
  primary: { backgroundColor: "#1a4b8c", borderRadius: 12, padding: 14, alignItems: "center", marginBottom: 10, flex: 1 },
  primaryText: { color: "#fff", fontWeight: "800", textAlign: "center" },
  off: { backgroundColor: "#cfd6df" },
  ghost: {
    flex: 1,
    borderWidth: 1,
    borderColor: "#1a4b8c",
    borderRadius: 12,
    padding: 14,
    alignItems: "center",
    marginBottom: 10,
    backgroundColor: "#fff",
  },
  ghostText: { color: "#1a4b8c", fontWeight: "700" },
  card: { backgroundColor: "#fff", borderRadius: 12, padding: 14, marginBottom: 10 },
  val: { fontWeight: "800", color: "#111", marginBottom: 4 },
  meta: { color: "#667", marginBottom: 6 },
  err: { color: "#b91c1c", marginBottom: 8 },
  select: { borderWidth: 1, borderColor: "#d5dbe3", borderRadius: 10, padding: 12, marginBottom: 10, backgroundColor: "#fff" },
  ph: { color: "#8b97a8" },
  input: { borderWidth: 1, borderColor: "#d5dbe3", borderRadius: 10, padding: 12, backgroundColor: "#fff", marginBottom: 10, color: "#111" },
  row: { flexDirection: "row", gap: 8 },
  label: { fontWeight: "700", color: "#334", marginBottom: 6 },
});
