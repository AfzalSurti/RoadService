import * as DocumentPicker from "expo-document-picker";
import { Stack, router, useFocusEffect } from "expo-router";
import React, { useCallback, useState } from "react";
import {
  FlatList,
  Linking,
  Modal,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { api, mediaUrl, type Project, type SiteRfi } from "../lib/api";
import { useAuth } from "../lib/auth";
import { useTheme } from "../lib/theme";

export default function RfiScreen() {
  const { token, role } = useAuth();
  const { colors } = useTheme();
  const [rows, setRows] = useState<SiteRfi[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [showRaise, setShowRaise] = useState(false);
  const [busy, setBusy] = useState(false);
  const [selected, setSelected] = useState<SiteRfi | null>(null);
  const [answer, setAnswer] = useState("");
  const [vendors, setVendors] = useState<{ id: number; name: string; project_id: number | null }[]>([]);
  const [agencySearch, setAgencySearch] = useState("");
  const [pdf, setPdf] = useState<{ uri: string; name: string; mimeType?: string | null } | null>(null);
  const [form, setForm] = useState({
    agency_name: "",
    project_id: "",
    subject: "",
    description: "",
    chainage: "",
    priority: "medium",
  });

  // GMC representative (surveyor): view only. Contractor + NHIPMPL (government) can raise.
  const canRaise = role === "contractor" || role === "government";
  const canAnswer = role === "surveyor" || role === "government";

  const load = useCallback(async () => {
    if (!token) return;
    try {
      const [list, proj] = await Promise.all([api.rfis(token), api.projects(token)]);
      setRows(list);
      setProjects(proj);
      if (canRaise) api.vendors(token).then(setVendors).catch(() => setVendors([]));
      setError(null);
      if (!form.project_id && proj[0]) {
        setForm((f) => ({ ...f, project_id: String(proj[0].id) }));
      }
    } catch (e: any) {
      setError(e.message);
    }
  }, [token, form.project_id]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  const raise = async () => {
    if (!token) return;
    if (role === "contractor" && !form.agency_name.trim()) {
      setFormError("Select the agency name");
      return;
    }
    if (!form.project_id || form.subject.trim().length < 3 || form.description.trim().length < 5) {
      setFormError("Project, subject and description are required");
      return;
    }
    if (role === "contractor" && !form.chainage.trim()) {
      setFormError("Chainage is required");
      return;
    }
    setFormError(null);
    setBusy(true);
    setError(null);
    try {
      await api.raiseRfi(token, {
        project_id: Number(form.project_id),
        subject: form.subject.trim(),
        description: form.description.trim(),
        chainage: form.chainage.trim() || undefined,
        priority: form.priority,
        agency_name: form.agency_name.trim() || undefined,
        attachment: pdf,
      });
      setShowRaise(false);
      setForm((f) => ({ ...f, agency_name: "", subject: "", description: "", chainage: "" }));
      setAgencySearch("");
      setPdf(null);
      await load();
    } catch (e: any) {
      setFormError(e.message);
    } finally {
      setBusy(false);
    }
  };

  const pickPdf = async () => {
    const res = await DocumentPicker.getDocumentAsync({ type: "application/pdf", copyToCacheDirectory: true });
    if (res.canceled || !res.assets?.length) return;
    const a = res.assets[0];
    setPdf({ uri: a.uri, name: a.name || "attachment.pdf", mimeType: a.mimeType });
  };

  // Agencies (vendors) of the contractor's packages; picking one also picks its package.
  const projectIds = new Set(projects.map((p) => p.id));
  const agencyOptions = (() => {
    const q = agencySearch.trim().toLowerCase();
    const seen = new Set<string>();
    return vendors
      .filter((v) => v.project_id == null || projectIds.has(v.project_id))
      .filter((v) => !q || v.name.toLowerCase().includes(q))
      .filter((v) => {
        const k = v.name.trim().toLowerCase();
        if (!k || seen.has(k)) return false;
        seen.add(k);
        return true;
      })
      .slice(0, 8);
  })();
  const typedAgency = agencySearch.trim();
  const typedIsListed = agencyOptions.some((v) => v.name.trim().toLowerCase() === typedAgency.toLowerCase());

  return (
    <View style={[styles.page, { backgroundColor: colors.bg }]}>
      <Stack.Screen options={{ title: role === "contractor" ? "RFI Raised" : "Request For Inspection" }} />
      <View style={styles.row}>
        <Pressable style={styles.secondary} onPress={() => router.back()}>
          <Text style={styles.secondaryText}>Back</Text>
        </Pressable>
        {canRaise ? (
          <Pressable
            style={styles.primary}
            onPress={() => {
              setFormError(null);
              setShowRaise(true);
            }}
          >
            <Text style={styles.primaryText}>{role === "contractor" ? "Raise RFI" : "Raise new RFI"}</Text>
          </Pressable>
        ) : null}
      </View>
      {role === "surveyor" ? (
        <View style={styles.kpiRow}>
          {[
            ["All RFI", rows.length],
            ["Open", rows.filter((r) => r.status === "open").length],
            ["Answered", rows.filter((r) => r.status === "answered").length],
            ["Closed", rows.filter((r) => r.status === "closed").length],
          ].map(([lab, val]) => (
            <View key={String(lab)} style={styles.kpi}>
              <Text style={styles.kpiVal}>{val}</Text>
              <Text style={styles.kpiLab}>{lab}</Text>
            </View>
          ))}
        </View>
      ) : null}
      {error ? <Text style={styles.error}>{error}</Text> : null}

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
          <Pressable style={styles.card} onPress={() => setSelected(item)}>
            <Text style={styles.cardTitle}>
              {item.rfi_no} · {item.status}
            </Text>
            <Text style={styles.meta}>
              {item.priority} {item.chainage ? `· Ch. ${item.chainage}` : ""}
            </Text>
            <Text style={styles.meta}>
              {item.inspection_date ? `Scheduled ${item.inspection_date}` : item.created_at?.slice(0, 16)}
              {item.category ? ` · ${item.category}` : ""}
            </Text>
            <Text numberOfLines={2} style={{ color: "#e8eef6" }}>
              {item.subject}
            </Text>
          </Pressable>
        )}
        ListEmptyComponent={<Text style={styles.meta}>No RFIs yet.</Text>}
      />

      <Modal visible={!!selected} animationType="slide" transparent>
        <View style={styles.modalBg}>
          <ScrollView style={styles.modalCard}>
            {selected ? (
              <>
                <Text style={styles.cardTitle}>{selected.rfi_no}</Text>
                <Text style={styles.meta}>{selected.status}</Text>
                <Text style={[styles.cardTitle, { fontSize: 16 }]}>{selected.subject}</Text>
                <Text style={{ color: "#e8eef6", marginVertical: 8 }}>{selected.description}</Text>
                {selected.agency_name ? <Text style={styles.meta}>Agency: {selected.agency_name}</Text> : null}
                {selected.chainage ? <Text style={styles.meta}>Chainage: {selected.chainage}</Text> : null}
                {selected.attachment_path ? (
                  <Pressable onPress={() => Linking.openURL(mediaUrl(selected.attachment_path || ""))}>
                    <Text style={{ color: "#3b9eff", marginBottom: 4 }}>Open attached PDF</Text>
                  </Pressable>
                ) : null}
                {selected.ae_name ? <Text style={styles.meta}>AE: {selected.ae_name}</Text> : null}
                {selected.contractor_name ? (
                  <Text style={styles.meta}>Contractor: {selected.contractor_name}</Text>
                ) : null}
                {selected.answer_text ? (
                  <Text style={{ color: "#86efac", marginBottom: 8 }}>
                    Answer: {selected.answer_text}
                  </Text>
                ) : null}
                {canAnswer && selected.can_answer ? (
                  <>
                    <TextInput
                      style={styles.input}
                      placeholder="Answer"
                      placeholderTextColor="#8b9bb0"
                      value={answer}
                      onChangeText={setAnswer}
                      multiline
                    />
                    <Pressable
                      style={styles.primary}
                      disabled={busy}
                      onPress={async () => {
                        if (!token || answer.trim().length < 3) return;
                        setBusy(true);
                        try {
                          const updated = await api.answerRfi(token, selected.id, {
                            answer_text: answer.trim(),
                          });
                          setSelected(updated);
                          setAnswer("");
                          await load();
                        } catch (e: any) {
                          setError(e.message);
                        } finally {
                          setBusy(false);
                        }
                      }}
                    >
                      <Text style={styles.primaryText}>Submit answer</Text>
                    </Pressable>
                  </>
                ) : null}
                {role === "surveyor" ? (
                  <Pressable
                    style={[styles.primary, { marginTop: 8 }]}
                    onPress={() => {
                      const id = selected.id;
                      const pid = selected.project_id;
                      setSelected(null);
                      router.push(`/ncr?rfiId=${id}&projectId=${pid}`);
                    }}
                  >
                    <Text style={styles.primaryText}>Raise NCR</Text>
                  </Pressable>
                ) : null}
                {selected.can_close ? (
                  <Pressable
                    style={[styles.secondary, { marginTop: 8 }]}
                    disabled={busy}
                    onPress={async () => {
                      if (!token) return;
                      setBusy(true);
                      try {
                        const updated = await api.closeRfi(token, selected.id);
                        setSelected(updated);
                        await load();
                      } catch (e: any) {
                        setError(e.message);
                      } finally {
                        setBusy(false);
                      }
                    }}
                  >
                    <Text style={styles.secondaryText}>Close RFI</Text>
                  </Pressable>
                ) : null}
                <Pressable style={[styles.secondary, { marginTop: 12 }]} onPress={() => setSelected(null)}>
                  <Text style={styles.secondaryText}>Close</Text>
                </Pressable>
              </>
            ) : null}
          </ScrollView>
        </View>
      </Modal>

      <Modal visible={showRaise} animationType="slide" transparent>
        <View style={styles.modalBg}>
          <ScrollView style={styles.modalCard}>
            <Text style={styles.cardTitle}>Raise new RFI</Text>
            {formError ? <Text style={styles.error}>{formError}</Text> : null}
            <Text style={styles.meta}>Agency name{role === "contractor" ? " *" : ""}</Text>
            {form.agency_name ? (
              <Pressable
                style={[styles.chip, styles.chipOn]}
                onPress={() => {
                  setForm({ ...form, agency_name: "" });
                  setAgencySearch("");
                }}
              >
                <Text style={{ color: "#e8eef6", fontWeight: "700" }}>{form.agency_name}</Text>
                <Text style={styles.meta}>Tap to change</Text>
              </Pressable>
            ) : (
              <>
                <TextInput
                  style={styles.input}
                  placeholder="Search agency name"
                  placeholderTextColor="#8b9bb0"
                  value={agencySearch}
                  onChangeText={setAgencySearch}
                />
                {agencyOptions.map((v) => (
                  <Pressable
                    key={v.id}
                    style={styles.chip}
                    onPress={() =>
                      setForm({
                        ...form,
                        agency_name: v.name.trim(),
                        project_id: v.project_id ? String(v.project_id) : form.project_id,
                      })
                    }
                  >
                    <Text style={{ color: "#e8eef6" }}>{v.name}</Text>
                    {v.project_id ? (
                      <Text style={styles.meta}>{projects.find((p) => p.id === v.project_id)?.name || ""}</Text>
                    ) : null}
                  </Pressable>
                ))}
                {typedAgency && !typedIsListed ? (
                  <Pressable style={styles.chip} onPress={() => setForm({ ...form, agency_name: typedAgency })}>
                    <Text style={{ color: "#3b9eff" }}>Use “{typedAgency}”</Text>
                  </Pressable>
                ) : null}
              </>
            )}
            <Text style={styles.meta}>Project</Text>
            {projects.map((p) => (
              <Pressable
                key={p.id}
                style={[
                  styles.chip,
                  form.project_id === String(p.id) ? styles.chipOn : null,
                ]}
                onPress={() => setForm({ ...form, project_id: String(p.id) })}
              >
                <Text style={{ color: "#e8eef6" }}>{p.name}</Text>
              </Pressable>
            ))}
            <TextInput
              style={styles.input}
              placeholder="Subject"
              placeholderTextColor="#8b9bb0"
              value={form.subject}
              onChangeText={(t) => setForm({ ...form, subject: t })}
            />
            <TextInput
              style={[styles.input, { minHeight: 90 }]}
              placeholder="Description / inspection required"
              placeholderTextColor="#8b9bb0"
              value={form.description}
              onChangeText={(t) => setForm({ ...form, description: t })}
              multiline
            />
            <TextInput
              style={styles.input}
              placeholder={role === "contractor" ? "Chainage * (e.g. 92+500 to 94+500)" : "Chainage (optional)"}
              placeholderTextColor="#8b9bb0"
              value={form.chainage}
              onChangeText={(t) => setForm({ ...form, chainage: t })}
            />
            <Text style={styles.meta}>Attachment (PDF)</Text>
            <Pressable style={[styles.chip, { marginBottom: 10 }]} onPress={pickPdf}>
              <Text style={{ color: pdf ? "#e8eef6" : "#3b9eff" }}>{pdf ? `📎 ${pdf.name}` : "+ Attach PDF"}</Text>
            </Pressable>
            {pdf ? (
              <Pressable onPress={() => setPdf(null)} style={{ marginBottom: 10 }}>
                <Text style={styles.meta}>Remove PDF</Text>
              </Pressable>
            ) : null}
            <Pressable style={styles.primary} disabled={busy} onPress={raise}>
              <Text style={styles.primaryText}>{busy ? "Submitting…" : "Submit RFI"}</Text>
            </Pressable>
            <Pressable style={[styles.secondary, { marginTop: 8 }]} onPress={() => setShowRaise(false)}>
              <Text style={styles.secondaryText}>Cancel</Text>
            </Pressable>
          </ScrollView>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, padding: 16 },
  row: { flexDirection: "row", gap: 8, marginBottom: 12 },
  primary: {
    flex: 1,
    backgroundColor: "#3b9eff",
    padding: 14,
    borderRadius: 12,
    alignItems: "center",
  },
  primaryText: { color: "#041018", fontWeight: "700" },
  secondary: {
    flex: 1,
    borderWidth: 1,
    borderColor: "#243041",
    padding: 14,
    borderRadius: 12,
    alignItems: "center",
    backgroundColor: "#12161d",
  },
  secondaryText: { color: "#e8eef6", fontWeight: "600" },
  card: {
    backgroundColor: "#12161d",
    borderRadius: 12,
    padding: 14,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: "#243041",
  },
  cardTitle: { fontWeight: "700", marginBottom: 4, color: "#e8eef6", fontSize: 16 },
  meta: { color: "#8b9bb0", marginBottom: 4 },
  error: { color: "#fb7185", marginBottom: 8 },
  modalBg: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.6)",
    justifyContent: "flex-end",
  },
  modalCard: {
    maxHeight: "85%",
    backgroundColor: "#12161d",
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    padding: 16,
  },
  input: {
    borderWidth: 1,
    borderColor: "#243041",
    borderRadius: 10,
    padding: 12,
    color: "#e8eef6",
    marginBottom: 10,
    backgroundColor: "#0a0c10",
  },
  chip: {
    borderWidth: 1,
    borderColor: "#243041",
    borderRadius: 10,
    padding: 10,
    marginBottom: 6,
  },
  chipOn: { borderColor: "#3b9eff", backgroundColor: "#0b2a43" },
  kpiRow: { flexDirection: "row", gap: 6, marginBottom: 12 },
  kpi: {
    flex: 1,
    backgroundColor: "#12161d",
    borderRadius: 10,
    paddingVertical: 8,
    alignItems: "center",
    borderWidth: 1,
    borderColor: "#243041",
  },
  kpiVal: { color: "#e8eef6", fontWeight: "800" },
  kpiLab: { color: "#8b9bb0", fontSize: 10 },
});
