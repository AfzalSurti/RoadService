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
import { MediaAttach, type MediaItem } from "../components/MediaAttach";
import { api, type Project, type SiteNcr } from "../lib/api";
import { useAuth } from "../lib/auth";
import { useTheme } from "../lib/theme";

const CATS = ["Highway", "Structure", "Drainage", "Safety", "Others"];
const SIDES = ["LHS", "RHS", "Median"];

export default function NcrScreen() {
  const { token, role } = useAuth();
  const { colors } = useTheme();
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
  const [media, setMedia] = useState<MediaItem[]>([]);
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

  const canRaise = role === "surveyor" || role === "admin";
  const canAct = role === "contractor" || role === "surveyor" || role === "admin";

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
      const mediaNote = media
        .map((m) => `[${m.kind}] ${m.uri}${m.lat != null ? ` @${m.lat.toFixed(5)},${m.lng?.toFixed(5)}` : ""}`)
        .join("\n");
      const description = [form.description.trim(), mediaNote ? `Media:\n${mediaNote}` : ""]
        .filter(Boolean)
        .join("\n\n");
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
        description,
        rectification_duration: form.rectification_duration || undefined,
        block_succeeding_rfis: form.block,
      });
      setStep("list");
      setMedia([]);
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
      <View style={[st.page, { backgroundColor: colors.bg }]}>
        <Stack.Screen options={{ title: "Raise NCR" }} />
        <Text style={[st.h, { color: colors.text }]}>Select project / UCC</Text>
        <Pressable
          style={[st.select, { backgroundColor: colors.card, borderColor: colors.border }]}
          onPress={() => setSheet("project")}
        >
          <Text style={selected ? [st.val, { color: colors.text }] : [st.ph, { color: colors.muted }]}>
            {selected ? `${selected.ucc || selected.name}` : "Search UCC"}
          </Text>
        </Pressable>
        {selected?.description || selected?.name ? (
          <Text style={[st.meta, { color: colors.muted }]}>{selected.description || selected.name}</Text>
        ) : null}
        {error ? <Text style={[st.err, { color: colors.danger }]}>{error}</Text> : null}
        <View style={st.row}>
          <Pressable
            style={[st.ghost, { borderColor: colors.primary, backgroundColor: colors.card }]}
            onPress={() => setStep("list")}
          >
            <Text style={[st.ghostText, { color: colors.primary }]}>Cancel</Text>
          </Pressable>
          <Pressable
            style={[st.primary, { backgroundColor: colors.primary }, !projectId && st.off]}
            disabled={!projectId}
            onPress={() => setStep("form")}
          >
            <Text style={[st.primaryText, { color: colors.primaryText }]}>Done</Text>
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
      <ScrollView contentContainerStyle={[st.page, { backgroundColor: colors.bg }]}>
        <Stack.Screen options={{ title: "Raise New NCR" }} />
        <Text style={[st.projectLine, { color: colors.text }]}>
          {selected?.ucc || `N/${projectId}`} — {selected?.name}
        </Text>
        <Text style={[st.label, { color: colors.text }]}>Do you have a Reference RFI ID?</Text>
        <View style={st.row}>
          <Pressable
            style={[st.pill, { borderColor: colors.border }, hasRef && { backgroundColor: colors.primary, borderColor: colors.primary }]}
            onPress={() => setHasRef(true)}
          >
            <Text style={[st.pillText, { color: colors.text }, hasRef && { color: colors.primaryText }]}>Yes</Text>
          </Pressable>
          <Pressable
            style={[st.pill, { borderColor: colors.border }, !hasRef && { backgroundColor: colors.primary, borderColor: colors.primary }]}
            onPress={() => setHasRef(false)}
          >
            <Text style={[st.pillText, { color: colors.text }, !hasRef && { color: colors.primaryText }]}>No</Text>
          </Pressable>
        </View>
        {hasRef && params.rfiId ? <Text style={st.ok}>Linked RFI #{params.rfiId}</Text> : null}

        <Text style={[st.label, { color: colors.text }]}>NCR Chainage start (KM + m)</Text>
        <View style={st.row}>
          <TextInput
            style={[st.input, { backgroundColor: colors.inputBg, borderColor: colors.border, color: colors.text }]}
            placeholder="KM"
            placeholderTextColor={colors.muted}
            value={form.startKm}
            onChangeText={(t) => setForm({ ...form, startKm: t })}
            keyboardType="decimal-pad"
          />
          <TextInput
            style={[st.input, { backgroundColor: colors.inputBg, borderColor: colors.border, color: colors.text }]}
            placeholder="+ m"
            placeholderTextColor={colors.muted}
            value={form.startM}
            onChangeText={(t) => setForm({ ...form, startM: t })}
            keyboardType="decimal-pad"
          />
        </View>
        <Text style={[st.label, { color: colors.text }]}>NCR Chainage end (KM + m)</Text>
        <View style={st.row}>
          <TextInput
            style={[st.input, { backgroundColor: colors.inputBg, borderColor: colors.border, color: colors.text }]}
            placeholder="KM"
            placeholderTextColor={colors.muted}
            value={form.endKm}
            onChangeText={(t) => setForm({ ...form, endKm: t })}
            keyboardType="decimal-pad"
          />
          <TextInput
            style={[st.input, { backgroundColor: colors.inputBg, borderColor: colors.border, color: colors.text }]}
            placeholder="+ m"
            placeholderTextColor={colors.muted}
            value={form.endM}
            onChangeText={(t) => setForm({ ...form, endM: t })}
            keyboardType="decimal-pad"
          />
        </View>

        <Pressable
          style={[st.select, { backgroundColor: colors.card, borderColor: colors.border }]}
          onPress={() => setSheet("category")}
        >
          <Text style={form.category ? [st.val, { color: colors.text }] : [st.ph, { color: colors.muted }]}>
            {form.category || "Category"}
          </Text>
        </Pressable>
        <TextInput
          style={[st.input, { backgroundColor: colors.inputBg, borderColor: colors.border, color: colors.text }]}
          placeholder="Sub Category"
          placeholderTextColor={colors.muted}
          value={form.sub_category}
          onChangeText={(t) => setForm({ ...form, sub_category: t })}
        />
        <TextInput
          style={[st.input, { backgroundColor: colors.inputBg, borderColor: colors.border, color: colors.text }]}
          placeholder="Item"
          placeholderTextColor={colors.muted}
          value={form.item}
          onChangeText={(t) => setForm({ ...form, item: t })}
        />
        <TextInput
          style={[st.input, { backgroundColor: colors.inputBg, borderColor: colors.border, color: colors.text }]}
          placeholder="Layer"
          placeholderTextColor={colors.muted}
          value={form.layer}
          onChangeText={(t) => setForm({ ...form, layer: t })}
        />
        <Pressable
          style={[st.select, { backgroundColor: colors.card, borderColor: colors.border }]}
          onPress={() => setSheet("side")}
        >
          <Text style={form.side ? [st.val, { color: colors.text }] : [st.ph, { color: colors.muted }]}>
            {form.side || "Side"}
          </Text>
        </Pressable>
        <TextInput
          style={[
            st.input,
            { minHeight: 90, backgroundColor: colors.inputBg, borderColor: colors.border, color: colors.text },
          ]}
          placeholder="Enter description"
          placeholderTextColor={colors.muted}
          value={form.description}
          onChangeText={(t) => setForm({ ...form, description: t })}
          multiline
        />
        <TextInput
          style={[st.input, { backgroundColor: colors.inputBg, borderColor: colors.border, color: colors.text }]}
          placeholder="Rectification Duration"
          placeholderTextColor={colors.muted}
          value={form.rectification_duration}
          onChangeText={(t) => setForm({ ...form, rectification_duration: t })}
        />
        <Text style={[st.label, { color: colors.text }]}>Site photos / video</Text>
        <MediaAttach items={media} onChange={setMedia} />
        <Pressable style={st.checkRow} onPress={() => setForm({ ...form, block: !form.block })}>
          <View style={[st.box, { borderColor: colors.border }, form.block && st.boxOn]}>
            {form.block ? <Text>✓</Text> : null}
          </View>
          <Text style={[st.meta, { color: colors.muted }]}>
            RFIs for succeeding work at the same location not allowed
          </Text>
        </Pressable>
        {error ? <Text style={[st.err, { color: colors.danger }]}>{error}</Text> : null}
        <View style={st.row}>
          <Pressable
            style={[st.ghost, { borderColor: colors.primary, backgroundColor: colors.card }]}
            onPress={() => setStep("list")}
          >
            <Text style={[st.ghostText, { color: colors.primary }]}>Cancel</Text>
          </Pressable>
          <Pressable style={[st.primary, { backgroundColor: colors.primary }]} disabled={busy} onPress={save}>
            <Text style={[st.primaryText, { color: colors.primaryText }]}>
              {busy ? "Saving…" : "Save as Draft"}
            </Text>
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
    <View style={[st.page, { backgroundColor: colors.bg }]}>
      <Stack.Screen options={{ title: "Issuance Of NCR" }} />
      <View style={st.kpiGrid}>
        {kpis.map((k) => (
          <View key={k.label} style={[st.kpi, { backgroundColor: colors.card }, k.dark && st.kpiDark]}>
            <Text style={[st.kpiVal, { color: colors.primary }, k.dark && { color: "#fff" }]}>{k.value}</Text>
            <Text style={[st.kpiLab, { color: colors.muted }, k.dark && { color: "#cfe0f5" }]}>{k.label}</Text>
          </View>
        ))}
      </View>
      {canRaise ? (
        <Pressable style={[st.primary, { backgroundColor: colors.primary }]} onPress={() => setStep("project")}>
          <Text style={[st.primaryText, { color: colors.primaryText }]}>+ Raise New NCR</Text>
        </Pressable>
      ) : (
        <Text style={[st.meta, { color: colors.muted }]}>
          Contractor: view NCRs and update status. Only GMC representative can raise.
        </Text>
      )}
      {error ? <Text style={[st.err, { color: colors.danger }]}>{error}</Text> : null}
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
          <View style={[st.card, { backgroundColor: colors.card }]}>
            <Text style={[st.val, { color: colors.text }]}>{item.ncr_no}</Text>
            <Text style={[st.meta, { color: colors.muted }]}>
              {item.status} · {item.stage || "Raised"}
              {item.chainage_start ? ` · ${item.chainage_start}` : ""}
              {item.chainage_end ? ` to ${item.chainage_end}` : ""}
            </Text>
            <Text style={{ color: colors.text }} numberOfLines={2}>
              {item.description}
            </Text>
            {canAct ? (
              <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6, marginTop: 8 }}>
                {(
                  [
                    ["in_progress", "In progress"],
                    ["closed", "Completed"],
                  ] as const
                ).map(([s, lab]) => (
                  <Pressable
                    key={s}
                    style={{
                      borderWidth: 1,
                      borderColor: colors.primary,
                      borderRadius: 8,
                      paddingHorizontal: 10,
                      paddingVertical: 6,
                      backgroundColor:
                        item.status === s || (s === "closed" && item.status === "closed")
                          ? colors.primary
                          : colors.card,
                    }}
                    onPress={async () => {
                      if (!token) return;
                      try {
                        await api.updateNcrStatus(
                          token,
                          item.id,
                          s === "closed" ? "closed" : "open",
                          s === "in_progress" ? "In progress" : "Completed"
                        );
                        await load();
                      } catch (e: any) {
                        setError(e.message);
                      }
                    }}
                  >
                    <Text
                      style={{
                        color:
                          item.status === s || item.stage === lab ? colors.primaryText : colors.primary,
                        fontWeight: "700",
                        fontSize: 12,
                      }}
                    >
                      {lab}
                    </Text>
                  </Pressable>
                ))}
              </View>
            ) : null}
          </View>
        )}
        ListEmptyComponent={<Text style={[st.meta, { color: colors.muted }]}>No Data Found.</Text>}
      />
      <Pressable
        style={[st.ghost, { borderColor: colors.primary, backgroundColor: colors.card }]}
        onPress={() => router.back()}
      >
        <Text style={[st.ghostText, { color: colors.primary }]}>Back</Text>
      </Pressable>
    </View>
  );
}

const st = StyleSheet.create({
  page: { flexGrow: 1, padding: 14 },
  h: { fontSize: 18, fontWeight: "800", marginBottom: 10 },
  kpiGrid: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginBottom: 12 },
  kpi: {
    width: "31%",
    borderRadius: 10,
    padding: 10,
    alignItems: "center",
  },
  kpiDark: { backgroundColor: "#12355a" },
  kpiVal: { fontWeight: "800", fontSize: 18 },
  kpiLab: { fontSize: 11, textAlign: "center" },
  primary: {
    borderRadius: 12,
    padding: 14,
    alignItems: "center",
    marginBottom: 12,
    flex: 1,
  },
  primaryText: { fontWeight: "800" },
  off: { backgroundColor: "#cfd6df" },
  ghost: {
    flex: 1,
    borderWidth: 1,
    borderRadius: 12,
    padding: 14,
    alignItems: "center",
    marginBottom: 12,
  },
  ghostText: { fontWeight: "700" },
  card: { borderRadius: 12, padding: 14, marginBottom: 10 },
  val: { fontWeight: "800", marginBottom: 4 },
  meta: { marginBottom: 4 },
  err: { marginBottom: 8 },
  ok: { color: "#157347", marginBottom: 8 },
  select: {
    borderWidth: 1,
    borderRadius: 10,
    padding: 12,
    marginBottom: 10,
  },
  ph: {},
  input: {
    flex: 1,
    borderWidth: 1,
    borderRadius: 10,
    padding: 12,
    marginBottom: 10,
  },
  row: { flexDirection: "row", gap: 8 },
  label: { fontWeight: "700", marginBottom: 6 },
  projectLine: { fontWeight: "700", marginBottom: 12 },
  checkRow: { flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 12 },
  box: { width: 20, height: 20, borderWidth: 1, alignItems: "center", justifyContent: "center" },
  boxOn: { backgroundColor: "#dbeafe" },
  pill: { borderWidth: 1, borderRadius: 18, paddingHorizontal: 16, paddingVertical: 8, marginBottom: 10 },
  pillText: { fontWeight: "700" },
});
