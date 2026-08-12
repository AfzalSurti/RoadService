import { Stack, router, useFocusEffect, useLocalSearchParams } from "expo-router";
import React, { useCallback, useEffect, useMemo, useState } from "react";
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
import { api, type Project, type SiteNcr } from "../lib/api";
import { useAuth } from "../lib/auth";

const CATS = ["Highway", "Structure", "Drainage", "Safety", "Others"];
const SIDES = ["LHS", "RHS", "Median"];

export default function NcrScreen() {
  const { token } = useAuth();
  const params = useLocalSearchParams<{ rfiId?: string; projectId?: string }>();
  const [rows, setRows] = useState<SiteNcr[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [step, setStep] = useState<"list" | "project" | "form">("list");
  const [busy, setBusy] = useState(false);
  const [projectId, setProjectId] = useState<number | null>(null);
  const [hasRef, setHasRef] = useState(false);
  const [sheet, setSheet] = useState<"project" | "category" | "side" | null>(null);
  const [form, setForm] = useState({
    startKm: "",
    startM: "",
    endKm: "",
    endM: "",
    category: "",
    sub_category: "",
    item: "",
    layer: "",
    side: "",
    description: "",
    rectification_duration: "",
    block: false,
  });

  const load = useCallback(async () => {
    if (!token) return;
    try {
      const [list, proj] = await Promise.all([api.ncrs(token), api.fieldProjects(token).catch(() => api.projects(token))]);
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

  useEffect(() => {
    if (params.projectId) {
      setProjectId(Number(params.projectId));
      setHasRef(!!params.rfiId);
      setStep("form");
    }
  }, [params.projectId, params.rfiId]);

  const selected = projects.find((p) => p.id === projectId);
  const counts = useMemo(() => {
    const open = rows.filter((r) => r.status === "open").length;
    return {
      total: rows.length,
      open,
      closed: rows.filter((r) => r.status === "closed").length,
      atr: rows.filter((r) => r.stage === "Pending ATR Submission").length,
      verify: rows.filter((r) => r.stage === "Pending ATR Verification").length,
      clar: rows.filter((r) => r.stage === "Pending Clarification").length,
    };
  }, [rows]);

  const save = async () => {
    if (!token || !projectId) return;
    if (form.description.trim().length < 5) {
      setError("Enter NCR description");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const start = form.startKm || form.startM ? `${form.startKm || "0"}+${form.startM || "0"}` : undefined;
      const end = form.endKm || form.endM ? `${form.endKm || "0"}+${form.endM || "0"}` : undefined;
      await api.raiseNcr(token, {
        project_id: projectId,
        related_rfi_id: params.rfiId ? Number(params.rfiId) : undefined,
        chainage_start: start,
        chainage_end: end,
        category: form.category || undefined,
        sub_category: form.sub_category || undefined,
        item: form.item || undefined,
        layer: form.layer || undefined,
        side: form.side || undefined,
        description: form.description.trim(),
        rectification_duration: form.rectification_duration || undefined,
        block_succeeding_rfis: form.block,
      });
      setStep("list");
      setForm({
        startKm: "",
        startM: "",
        endKm: "",
        endM: "",
        category: "",
        sub_category: "",
        item: "",
        layer: "",
        side: "",
        description: "",
        rectification_duration: "",
        block: false,
      });
      await load();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };

  if (step === "project") {
    return (
      <View style={st.page}>
        <Stack.Screen options={{ title: "Raise NCR" }} />
        <Text style={st.h}>Select project / UCC</Text>
        <Pressable style={st.select} onPress={() => setSheet("project")}>
          <Text style={selected ? st.val : st.ph}>
            {selected ? `${selected.ucc || selected.name}` : "Search UCC"}
          </Text>
        </Pressable>
        {selected?.description || selected?.name ? (
          <Text style={st.meta}>{selected.description || selected.name}</Text>
        ) : null}
        {error ? <Text style={st.err}>{error}</Text> : null}
        <View style={st.row}>
          <Pressable style={st.ghost} onPress={() => setStep("list")}>
            <Text style={st.ghostText}>Cancel</Text>
          </Pressable>
          <Pressable
            style={[st.primary, !projectId && st.off]}
            disabled={!projectId}
            onPress={() => setStep("form")}
          >
            <Text style={st.primaryText}>Done</Text>
          </Pressable>
        </View>
        <SelectSheet
          visible={sheet === "project"}
          title="UCC"
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
        <Stack.Screen options={{ title: "Raise New NCR" }} />
        <Text style={st.projectLine}>
          {selected?.ucc || `N/${projectId}`} — {selected?.name}
        </Text>
        <Text style={st.label}>Do you have a Reference RFI ID?</Text>
        <View style={st.row}>
          <Pressable style={[st.pill, hasRef && st.pillOn]} onPress={() => setHasRef(true)}>
            <Text style={[st.pillText, hasRef && st.pillTextOn]}>Yes</Text>
          </Pressable>
          <Pressable style={[st.pill, !hasRef && st.pillOn]} onPress={() => setHasRef(false)}>
            <Text style={[st.pillText, !hasRef && st.pillTextOn]}>No</Text>
          </Pressable>
        </View>
        {hasRef && params.rfiId ? <Text style={st.ok}>Linked RFI #{params.rfiId}</Text> : null}

        <Text style={st.label}>NCR Chainage start (KM + m)</Text>
        <View style={st.row}>
          <TextInput style={st.input} placeholder="KM" value={form.startKm} onChangeText={(t) => setForm({ ...form, startKm: t })} keyboardType="decimal-pad" />
          <TextInput style={st.input} placeholder="+ m" value={form.startM} onChangeText={(t) => setForm({ ...form, startM: t })} keyboardType="decimal-pad" />
        </View>
        <Text style={st.label}>NCR Chainage end (KM + m)</Text>
        <View style={st.row}>
          <TextInput style={st.input} placeholder="KM" value={form.endKm} onChangeText={(t) => setForm({ ...form, endKm: t })} keyboardType="decimal-pad" />
          <TextInput style={st.input} placeholder="+ m" value={form.endM} onChangeText={(t) => setForm({ ...form, endM: t })} keyboardType="decimal-pad" />
        </View>

        <Pressable style={st.select} onPress={() => setSheet("category")}>
          <Text style={form.category ? st.val : st.ph}>{form.category || "Category"}</Text>
        </Pressable>
        <TextInput style={st.input} placeholder="Sub Category" value={form.sub_category} onChangeText={(t) => setForm({ ...form, sub_category: t })} />
        <TextInput style={st.input} placeholder="Item" value={form.item} onChangeText={(t) => setForm({ ...form, item: t })} />
        <TextInput style={st.input} placeholder="Layer" value={form.layer} onChangeText={(t) => setForm({ ...form, layer: t })} />
        <Pressable style={st.select} onPress={() => setSheet("side")}>
          <Text style={form.side ? st.val : st.ph}>{form.side || "Side"}</Text>
        </Pressable>
        <TextInput
          style={[st.input, { minHeight: 90 }]}
          placeholder="Enter description"
          value={form.description}
          onChangeText={(t) => setForm({ ...form, description: t })}
          multiline
        />
        <TextInput
          style={st.input}
          placeholder="Rectification Duration"
          value={form.rectification_duration}
          onChangeText={(t) => setForm({ ...form, rectification_duration: t })}
        />
        <Text style={st.note}>Site Photos to be uploaded through mobile app (use Raise Defect for photos).</Text>
        <Pressable style={st.checkRow} onPress={() => setForm({ ...form, block: !form.block })}>
          <View style={[st.box, form.block && st.boxOn]}>{form.block ? <Text>✓</Text> : null}</View>
          <Text style={st.meta}>RFIs for succeeding work at the same location not allowed</Text>
        </Pressable>
        {error ? <Text style={st.err}>{error}</Text> : null}
        <View style={st.row}>
          <Pressable style={st.ghost} onPress={() => setStep("list")}>
            <Text style={st.ghostText}>Cancel</Text>
          </Pressable>
          <Pressable style={st.primary} disabled={busy} onPress={save}>
            <Text style={st.primaryText}>{busy ? "Saving…" : "Save as Draft"}</Text>
          </Pressable>
        </View>
        <SelectSheet
          visible={sheet === "category"}
          title="Category"
          options={CATS.map((c) => ({ id: c, label: c }))}
          value={form.category}
          onClose={() => setSheet(null)}
          onConfirm={(id) => {
            setForm({ ...form, category: id });
            setSheet(null);
          }}
        />
        <SelectSheet
          visible={sheet === "side"}
          title="Side"
          options={SIDES.map((c) => ({ id: c, label: c }))}
          value={form.side}
          onClose={() => setSheet(null)}
          onConfirm={(id) => {
            setForm({ ...form, side: id });
            setSheet(null);
          }}
        />
      </ScrollView>
    );
  }

  const kpis = [
    { label: "Total NCRs", value: counts.total, dark: true },
    { label: "Open NCRs", value: counts.open },
    { label: "Closed NCRs", value: counts.closed },
    { label: "Pending ATR", value: counts.atr },
    { label: "ATR Verify", value: counts.verify },
    { label: "Clarification", value: counts.clar },
  ];

  return (
    <View style={st.page}>
      <Stack.Screen options={{ title: "Issuance Of NCR" }} />
      <View style={st.kpiGrid}>
        {kpis.map((k) => (
          <View key={k.label} style={[st.kpi, k.dark && st.kpiDark]}>
            <Text style={[st.kpiVal, k.dark && { color: "#fff" }]}>{k.value}</Text>
            <Text style={[st.kpiLab, k.dark && { color: "#cfe0f5" }]}>{k.label}</Text>
          </View>
        ))}
      </View>
      <Pressable style={st.primary} onPress={() => setStep("project")}>
        <Text style={st.primaryText}>+ Raise New NCR</Text>
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
            <Text style={st.val}>{item.ncr_no}</Text>
            <Text style={st.meta}>
              {item.status} · {item.stage || "Raised"}
              {item.chainage_start ? ` · ${item.chainage_start}` : ""}
              {item.chainage_end ? ` to ${item.chainage_end}` : ""}
            </Text>
            <Text numberOfLines={2}>{item.description}</Text>
          </View>
        )}
        ListEmptyComponent={<Text style={st.meta}>No Data Found.</Text>}
      />
      <Pressable style={st.ghost} onPress={() => router.back()}>
        <Text style={st.ghostText}>Back</Text>
      </Pressable>
    </View>
  );
}

const st = StyleSheet.create({
  page: { flexGrow: 1, backgroundColor: "#eef2f6", padding: 14 },
  h: { fontSize: 18, fontWeight: "800", color: "#12355a", marginBottom: 10 },
  kpiGrid: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginBottom: 12 },
  kpi: {
    width: "31%",
    backgroundColor: "#fff",
    borderRadius: 10,
    padding: 10,
    alignItems: "center",
  },
  kpiDark: { backgroundColor: "#12355a" },
  kpiVal: { fontWeight: "800", fontSize: 18, color: "#12355a" },
  kpiLab: { fontSize: 11, color: "#556", textAlign: "center" },
  primary: {
    backgroundColor: "#1a4b8c",
    borderRadius: 12,
    padding: 14,
    alignItems: "center",
    marginBottom: 12,
    flex: 1,
  },
  primaryText: { color: "#fff", fontWeight: "800" },
  off: { backgroundColor: "#cfd6df" },
  ghost: {
    flex: 1,
    borderWidth: 1,
    borderColor: "#1a4b8c",
    borderRadius: 12,
    padding: 14,
    alignItems: "center",
    marginBottom: 12,
    backgroundColor: "#fff",
  },
  ghostText: { color: "#1a4b8c", fontWeight: "700" },
  card: { backgroundColor: "#fff", borderRadius: 12, padding: 14, marginBottom: 10 },
  val: { fontWeight: "800", color: "#111", marginBottom: 4 },
  meta: { color: "#667", marginBottom: 4 },
  err: { color: "#b91c1c", marginBottom: 8 },
  ok: { color: "#157347", marginBottom: 8 },
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
    flex: 1,
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
  projectLine: { fontWeight: "700", color: "#12355a", marginBottom: 12 },
  note: { backgroundColor: "#fef9c3", padding: 10, borderRadius: 8, color: "#854d0e", marginBottom: 10 },
  checkRow: { flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 12 },
  box: { width: 20, height: 20, borderWidth: 1, borderColor: "#667", alignItems: "center", justifyContent: "center" },
  boxOn: { backgroundColor: "#dbeafe" },
  pill: { borderWidth: 1, borderColor: "#c5ccd6", borderRadius: 18, paddingHorizontal: 16, paddingVertical: 8, marginBottom: 10 },
  pillOn: { backgroundColor: "#1a4b8c", borderColor: "#1a4b8c" },
  pillText: { color: "#334", fontWeight: "700" },
  pillTextOn: { color: "#fff" },
});
