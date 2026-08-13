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
import { api, type CriticalIssue, type Project } from "../lib/api";
import { useAuth } from "../lib/auth";
import { matchProjectsToPackages } from "../lib/packages";

const TYPES = ["Contractual Obligations", "Structure", "Road Safety", "Others"];
const STATUSES = ["new", "ongoing", "resolved"];
const PRIORITIES = ["high", "medium", "low"];

export default function CriticalScreen() {
  const { token, role } = useAuth();
  const [rows, setRows] = useState<CriticalIssue[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [step, setStep] = useState<"list" | "form">("list");
  const [pkgs, setPkgs] = useState<string[]>([]);
  const [sheet, setSheet] = useState<"type" | "status" | "priority" | null>(null);
  const [busy, setBusy] = useState(false);
  const [media, setMedia] = useState<MediaItem[]>([]);
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

  const canRaise = role === "surveyor" || role === "admin";
  const canAct = role === "contractor" || role === "surveyor" || role === "admin";

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
    if (!token) return;
    if (!pkgs.length) {
      setError("Select at least one package");
      return;
    }
    if (form.description.trim().length < 5 || !form.issue_type || !form.concerned_authority.trim()) {
      setError("Description, issue type and concerned authority are required");
      return;
    }
    const matched = matchProjectsToPackages(projects, pkgs);
    const targets = matched.length ? matched : projects.slice(0, 1);
    if (!targets.length) {
      setError("No project for selected package");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const mediaNote = media
        .map((m) => `[${m.kind}] ${m.uri}${m.lat != null ? ` @${m.lat.toFixed(5)},${m.lng?.toFixed(5)}` : ""}`)
        .join("\n");
      for (const p of targets) {
        await api.raiseCritical(token, {
          project_id: p.id,
          description: form.description.trim(),
          issue_type: form.issue_type,
          status: form.status,
          expected_resolution: form.expected_resolution || undefined,
          concerned_authority: form.concerned_authority.trim(),
          chainage_from: form.chainage_from || undefined,
          chainage_to: form.chainage_to || undefined,
          total_length_km: lengthKm === "--" ? undefined : Number(lengthKm),
          priority: form.priority,
          remarks: [`Packages: ${pkgs.join(", ")}`, form.remarks.trim(), mediaNote].filter(Boolean).join("\n") || undefined,
        });
      }
      setStep("list");
      setPkgs([]);
      setMedia([]);
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

  const setStatus = async (id: number, status: string) => {
    if (!token || !canAct) return;
    try {
      await api.updateCriticalStatus(token, id, status);
      await load();
    } catch (e: any) {
      setError(e.message);
    }
  };

  if (step === "form") {
    return (
      <ScrollView contentContainerStyle={st.page} keyboardShouldPersistTaps="handled">
        <Stack.Screen options={{ title: "Raise Critical Issue" }} />
        <PackageCheckboxes selected={pkgs} onChange={setPkgs} label="Select package(s) *" />
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
        <MediaAttach items={media} onChange={setMedia} />
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
      {canRaise ? (
        <Pressable style={st.primary} onPress={() => setStep("form")}>
          <Text style={st.primaryText}>Raise Critical Issue</Text>
        </Pressable>
      ) : (
        <Text style={st.meta}>View / update status — only GMC representative can raise.</Text>
      )}
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
            {item.remarks ? (
              <Text style={st.meta} numberOfLines={2}>
                {item.remarks}
              </Text>
            ) : null}
            {canAct ? (
              <View style={st.chips}>
                {[
                  ["ongoing", "In progress"],
                  ["resolved", "Completed"],
                ].map(([s, lab]) => (
                  <Pressable
                    key={s}
                    style={[st.chip, item.status === s && st.chipOn]}
                    onPress={() => setStatus(item.id, s)}
                  >
                    <Text style={[st.chipText, item.status === s && { color: "#fff" }]}>{lab}</Text>
                  </Pressable>
                ))}
              </View>
            ) : null}
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
  primary: {
    backgroundColor: "#1a4b8c",
    borderRadius: 12,
    padding: 14,
    alignItems: "center",
    marginBottom: 10,
    flex: 1,
  },
  primaryText: { color: "#fff", fontWeight: "800", textAlign: "center" },
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
  select: {
    borderWidth: 1,
    borderColor: "#d5dbe3",
    borderRadius: 10,
    padding: 12,
    marginBottom: 10,
    backgroundColor: "#fff",
  },
  ph: { color: "#8b97a8" },
  input: {
    borderWidth: 1,
    borderColor: "#d5dbe3",
    borderRadius: 10,
    padding: 12,
    backgroundColor: "#fff",
    marginBottom: 10,
    color: "#111",
  },
  row: { flexDirection: "row", gap: 8 },
  label: { fontWeight: "700", color: "#334", marginBottom: 6 },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: 6, marginTop: 8 },
  chip: { borderWidth: 1, borderColor: "#1a4b8c", borderRadius: 8, paddingHorizontal: 10, paddingVertical: 6 },
  chipOn: { backgroundColor: "#1a4b8c" },
  chipText: { color: "#1a4b8c", fontSize: 12, fontWeight: "700" },
});
