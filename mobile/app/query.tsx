import { Stack, router, useFocusEffect } from "expo-router";
import React, { useCallback, useState } from "react";
import {
  FlatList,
  Modal,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { api, type PortalQueryTicket, type Project } from "../lib/api";
import { useAuth } from "../lib/auth";
import { useTheme } from "../lib/theme";

const MODULES = [
  "attendance",
  "incidents",
  "its",
  "civil_assets",
  "vendors",
  "staff_details",
  "other",
];

/**
 * Query Raise for contractor + GMC representative (surveyor).
 * Resolve is portal-only for GMC MIS Expert (admin).
 */
export default function QueryScreen() {
  const { token, role } = useAuth();
  const { colors } = useTheme();
  const [rows, setRows] = useState<PortalQueryTicket[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [showRaise, setShowRaise] = useState(false);
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState({
    project_id: "",
    subject: "",
    description: "",
    module_area: "other",
    priority: "medium",
  });

  const canRaise = role === "contractor" || role === "surveyor";

  const load = useCallback(async () => {
    if (!token) return;
    try {
      const [list, proj] = await Promise.all([api.queries(token), api.projects(token)]);
      setRows(list);
      setProjects(proj);
      if (!form.project_id && proj[0]) {
        setForm((f) => ({ ...f, project_id: String(proj[0].id) }));
      }
      setError(null);
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
    if (!token || !canRaise) return;
    if (!form.project_id || form.subject.trim().length < 3 || form.description.trim().length < 5) {
      setError("Project, subject and description are required");
      return;
    }
    setBusy(true);
    setError(null);
    setMsg(null);
    try {
      const fd = new FormData();
      fd.append("project_id", form.project_id);
      fd.append("subject", form.subject.trim());
      fd.append("description", form.description.trim());
      fd.append("module_area", form.module_area);
      fd.append("priority", form.priority);
      const created = await api.raiseQuery(token, fd);
      setShowRaise(false);
      setForm((f) => ({ ...f, subject: "", description: "" }));
      setMsg(`Ticket ${created.ticket_no} raised · status: ${created.status}`);
      await load();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <View style={[st.page, { backgroundColor: colors.bg }]}>
      <Stack.Screen options={{ title: "Query Raise" }} />
      <Text style={[st.hint, { color: colors.muted }]}>
        Raise a portal query / ticket. Status only here — resolve is done by GMC MIS Expert on the
        web portal.
      </Text>
      {canRaise ? (
        <Pressable style={[st.primary, { backgroundColor: colors.primary }]} onPress={() => setShowRaise(true)}>
          <Text style={[st.primaryText, { color: colors.primaryText }]}>Raise query</Text>
        </Pressable>
      ) : null}
      {error ? <Text style={[st.err, { color: colors.danger }]}>{error}</Text> : null}
      {msg ? <Text style={st.ok}>{msg}</Text> : null}
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
          <View style={[st.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <Text style={[st.title, { color: colors.text }]}>{item.ticket_no}</Text>
            <Text style={[st.meta, { color: colors.muted }]}>
              Status: {item.status} · {item.module_area} · Client #{item.raised_by_id}
            </Text>
            <Text style={[st.subject, { color: colors.text }]}>{item.subject}</Text>
            <Text style={{ color: colors.text }} numberOfLines={2}>
              {item.description}
            </Text>
          </View>
        )}
        ListEmptyComponent={<Text style={[st.meta, { color: colors.muted }]}>No queries yet.</Text>}
      />
      <Pressable style={[st.ghost, { borderColor: colors.primary, backgroundColor: colors.card }]} onPress={() => router.back()}>
        <Text style={[st.ghostText, { color: colors.primary }]}>Back</Text>
      </Pressable>

      <Modal visible={showRaise} animationType="slide">
        <ScrollView
          contentContainerStyle={[st.modal, { backgroundColor: colors.bg }]}
          keyboardShouldPersistTaps="handled"
        >
          <Text style={[st.title, { color: colors.text }]}>New query</Text>
          <Text style={[st.label, { color: colors.text }]}>Project</Text>
          {projects.map((p) => (
            <Pressable
              key={p.id}
              style={[
                st.select,
                { backgroundColor: colors.card, borderColor: colors.border },
                form.project_id === String(p.id) && { borderColor: colors.primary, backgroundColor: colors.inputBg },
              ]}
              onPress={() => setForm({ ...form, project_id: String(p.id) })}
            >
              <Text style={{ color: colors.text }}>{p.name}</Text>
            </Pressable>
          ))}
          <Text style={[st.label, { color: colors.text }]}>Module</Text>
          <View style={st.pills}>
            {MODULES.map((m) => (
              <Pressable
                key={m}
                style={[
                  st.pill,
                  { borderColor: colors.primary },
                  form.module_area === m && { backgroundColor: colors.primary },
                ]}
                onPress={() => setForm({ ...form, module_area: m })}
              >
                <Text
                  style={[
                    st.pillText,
                    { color: colors.primary },
                    form.module_area === m && { color: colors.primaryText },
                  ]}
                >
                  {m}
                </Text>
              </Pressable>
            ))}
          </View>
          <TextInput
            style={[st.input, { backgroundColor: colors.inputBg, borderColor: colors.border, color: colors.text }]}
            placeholder="Subject"
            placeholderTextColor={colors.muted}
            value={form.subject}
            onChangeText={(t) => setForm({ ...form, subject: t })}
          />
          <TextInput
            style={[
              st.input,
              { minHeight: 90, backgroundColor: colors.inputBg, borderColor: colors.border, color: colors.text },
            ]}
            placeholder="Description"
            placeholderTextColor={colors.muted}
            multiline
            value={form.description}
            onChangeText={(t) => setForm({ ...form, description: t })}
          />
          {error ? <Text style={[st.err, { color: colors.danger }]}>{error}</Text> : null}
          <Pressable style={[st.primary, { backgroundColor: colors.primary }]} disabled={busy} onPress={raise}>
            <Text style={[st.primaryText, { color: colors.primaryText }]}>
              {busy ? "Submitting…" : "Submit"}
            </Text>
          </Pressable>
          <Pressable
            style={[st.ghost, { borderColor: colors.primary, backgroundColor: colors.card }]}
            onPress={() => setShowRaise(false)}
          >
            <Text style={[st.ghostText, { color: colors.primary }]}>Cancel</Text>
          </Pressable>
        </ScrollView>
      </Modal>
    </View>
  );
}

const st = StyleSheet.create({
  page: { flex: 1, padding: 14 },
  hint: { marginBottom: 12, lineHeight: 18 },
  primary: { borderRadius: 12, padding: 14, alignItems: "center", marginBottom: 10 },
  primaryText: { fontWeight: "800" },
  card: { borderRadius: 12, padding: 14, marginBottom: 10, borderWidth: 1 },
  title: { fontWeight: "800", marginBottom: 4, fontSize: 16 },
  subject: { fontWeight: "700", marginBottom: 4 },
  meta: { marginBottom: 4 },
  err: { marginBottom: 8 },
  ok: { color: "#15803d", marginBottom: 8 },
  ghost: {
    borderWidth: 1,
    borderRadius: 12,
    padding: 12,
    alignItems: "center",
    marginTop: 8,
  },
  ghostText: { fontWeight: "700" },
  modal: { padding: 16, paddingTop: 48, flexGrow: 1 },
  label: { fontWeight: "700", marginBottom: 6, marginTop: 8 },
  input: {
    borderWidth: 1,
    borderRadius: 10,
    padding: 12,
    marginBottom: 10,
  },
  select: {
    borderWidth: 1,
    borderRadius: 10,
    padding: 12,
    marginBottom: 6,
  },
  pills: { flexDirection: "row", flexWrap: "wrap", gap: 6, marginBottom: 10 },
  pill: {
    borderWidth: 1,
    borderRadius: 16,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  pillText: { fontSize: 12, fontWeight: "600" },
});
