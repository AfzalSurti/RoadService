import * as Location from "expo-location";
import { Stack, router } from "expo-router";
import React, { useEffect, useMemo, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { CameraCapture, type CapturedPhoto } from "../components/CameraCapture";
import { MediaAttach, type MediaItem } from "../components/MediaAttach";
import { SelectSheet } from "../components/SelectSheet";
import { api, type Project } from "../lib/api";
import { useAuth } from "../lib/auth";
import { enqueueOfflineJob, isNetworkError } from "../lib/offline";

type DefectType = { id: string; label: string; category_id: string };
type Category = { id: string; name: string };

const LANES = ["2L PS", "2L/4L", "4L", "4L PS", "4L/6L", "6L", "6L/8L", "8L"];
const SIDES = ["LHS", "RHS", "Median"];
const CARRIAGEWAYS = ["Main Carriageway", "Service Road", "Ramps", "Sliproad"];

function fmtChain(km: string, m: string) {
  const a = km.trim();
  const b = m.trim();
  if (!a && !b) return "";
  return `${a || "0"}+${b || "0"}`;
}

export default function CreateIssueScreen() {
  const { token } = useAuth();
  const [projects, setProjects] = useState<Project[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [types, setTypes] = useState<DefectType[]>([]);
  const [projectId, setProjectId] = useState<number | null>(null);
  const [categoryId, setCategoryId] = useState<string>("");
  const [issueTypeId, setIssueTypeId] = useState<string>("");
  const [lane, setLane] = useState("");
  const [side, setSide] = useState("");
  const [carriageway, setCarriageway] = useState("");
  const [description, setDescription] = useState("");
  const [voiceNote, setVoiceNote] = useState("");
  const [startKm, setStartKm] = useState("");
  const [startM, setStartM] = useState("");
  const [endKm, setEndKm] = useState("");
  const [endM, setEndM] = useState("");
  const [photo, setPhoto] = useState<CapturedPhoto | null>(null);
  const [media, setMedia] = useState<MediaItem[]>([]);
  const [captureMode, setCaptureMode] = useState<"photo" | null>(null);
  const [coords, setCoords] = useState<{ lat: number; lng: number } | null>(null);
  const [isCritical, setIsCritical] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [sheet, setSheet] = useState<"project" | "category" | "type" | "lane" | null>(null);

  useEffect(() => {
    if (!token) return;
    Promise.all([api.projects(token), api.catalog(token)]).then(([p, catalog]) => {
      setProjects(p);
      if (p[0]) setProjectId(p[0].id);
      setCategories(catalog.categories);
      setTypes(catalog.types);
    });
  }, [token]);

  const selectedProject = projects.find((p) => p.id === projectId);
  const selectedType = types.find((t) => t.id === issueTypeId);
  const filteredTypes = useMemo(
    () => types.filter((t) => !categoryId || t.category_id === categoryId),
    [types, categoryId]
  );

  const refreshGps = async () => {
    try {
      const perm = await Location.requestForegroundPermissionsAsync();
      if (!perm.granted) {
        setError("Location permission is required to pin defect location");
        return;
      }
      const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
      setCoords({ lat: loc.coords.latitude, lng: loc.coords.longitude });
    } catch {
      setError("Could not read GPS. Keep location on and retry.");
    }
  };

  useEffect(() => {
    if (photo && !coords) setCoords({ lat: photo.lat, lng: photo.lng });
  }, [photo, coords]);

  if (captureMode === "photo") {
    return (
      <CameraCapture
        onCapture={(p) => {
          setPhoto(p);
          setCaptureMode(null);
        }}
        onCancel={() => setCaptureMode(null)}
      />
    );
  }

  const submit = async () => {
    if (!token || !projectId || !photo) {
      setError("Project and on-site camera photo with GPS are required");
      return;
    }
    if (!issueTypeId || !categoryId) {
      setError("Select defect category and type");
      return;
    }
    if (!description.trim() || description.trim().length < 5) {
      setError("Enter remarks (at least 5 characters)");
      return;
    }
    if (!coords) {
      setError("Defect location (lat/long) is required");
      return;
    }
    setBusy(true);
    setError(null);
    const start = fmtChain(startKm, startM);
    const end = fmtChain(endKm, endM);
    const chainage = start && end ? `${start} to ${end}` : start || end;
    try {
      const form = new FormData();
      form.append("project_id", String(projectId));
      form.append("issue_type", issueTypeId);
      form.append("work_category", categoryId);
      form.append("description", description.trim());
      form.append("before_lat", String(coords.lat));
      form.append("before_lng", String(coords.lng));
      form.append("deadline_days", "10");
      form.append("priority", isCritical ? "high" : "medium");
      form.append("is_critical", isCritical ? "true" : "false");
      if (chainage) form.append("chainage", chainage);
      if (start) form.append("start_chainage", start);
      if (end) form.append("end_chainage", end);
      if (lane) form.append("lane", lane);
      if (side) form.append("side", side);
      if (carriageway) form.append("carriageway", carriageway);
      if (voiceNote.trim()) form.append("voice_note", voiceNote.trim());
      const uri = photo.uri.startsWith("file://") ? photo.uri : `file://${photo.uri}`;
      form.append("photo", { uri, name: "before.jpg", type: "image/jpeg" } as any);
      try {
        await api.createIssue(token, form);
      } catch (e) {
        if (isNetworkError(e)) {
          const fields: Record<string, string> = {
            project_id: String(projectId),
            issue_type: issueTypeId,
            work_category: categoryId,
            description: description.trim(),
            before_lat: String(coords.lat),
            before_lng: String(coords.lng),
            deadline_days: "10",
            priority: isCritical ? "high" : "medium",
            is_critical: isCritical ? "true" : "false",
          };
          if (chainage) fields.chainage = chainage;
          if (start) fields.start_chainage = start;
          if (end) fields.end_chainage = end;
          if (lane) fields.lane = lane;
          if (side) fields.side = side;
          if (carriageway) fields.carriageway = carriageway;
          if (voiceNote.trim()) fields.voice_note = voiceNote.trim();
          await enqueueOfflineJob({ type: "create", photoUri: uri, fields });
          router.replace("/home");
          return;
        }
        throw e;
      }
      router.replace("/home");
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };

  const ready = !!(projectId && photo && description.trim().length >= 5 && issueTypeId && coords);

  return (
    <ScrollView contentContainerStyle={s.page}>
      <Stack.Screen options={{ title: "Raise Defect", headerStyle: { backgroundColor: "#0b2a43" } }} />

      <View style={s.card}>
        <Text style={s.sec}>① Project Details</Text>
        <Pressable style={s.select} onPress={() => setSheet("project")}>
          <Text style={selectedProject ? s.selectVal : s.ph}>
            {selectedProject
              ? `${selectedProject.ucc || `N/${String(selectedProject.id).padStart(5, "0")}/MH`} · ${selectedProject.name}`
              : "Select project / UCC"}
          </Text>
        </Pressable>
        <View style={s.photoRow}>
          <Pressable style={s.photoBtn} onPress={() => setCaptureMode("photo")}>
            <Text style={s.photoIcon}>📷</Text>
            <Text style={s.photoLab}>{photo ? "Retake photo" : "Site photo"}</Text>
          </Pressable>
        </View>
        {photo ? (
          <Text style={s.ok}>
            Photo captured · GPS {photo.lat.toFixed(5)}, {photo.lng.toFixed(5)}
          </Text>
        ) : (
          <Text style={s.hint}>Capture on-site photo. Gallery upload is disabled.</Text>
        )}
        <MediaAttach
          items={media}
          onChange={setMedia}
          maxItems={3}
        />
        <Text style={s.label}>Remarks</Text>
        <TextInput
          style={[s.input, { minHeight: 80 }]}
          value={description}
          onChangeText={setDescription}
          placeholder="Enter remarks after capture"
          placeholderTextColor="#8b97a8"
          multiline
        />
      </View>

      <View style={s.card}>
        <Text style={s.sec}>② Defect Location</Text>
        <View style={s.mapBox}>
          <Text style={s.pin}>📍</Text>
          {coords ? (
            <>
              <Text style={s.mapTitle}>Pinned from device GPS</Text>
              <Text style={s.mapMeta}>
                Lat {coords.lat.toFixed(6)} · Long {coords.lng.toFixed(6)}
              </Text>
            </>
          ) : (
            <Text style={s.mapMeta}>Location is taken from lat/long after photo or Refresh GPS</Text>
          )}
          <Pressable style={s.ghost} onPress={refreshGps}>
            <Text style={s.ghostText}>Refresh GPS</Text>
          </Pressable>
        </View>
        <Text style={s.label}>Start chainage</Text>
        <View style={s.row}>
          <TextInput style={[s.input, s.half]} value={startKm} onChangeText={setStartKm} placeholder="KM" keyboardType="decimal-pad" placeholderTextColor="#8b97a8" />
          <TextInput style={[s.input, s.half]} value={startM} onChangeText={setStartM} placeholder="+ m" keyboardType="decimal-pad" placeholderTextColor="#8b97a8" />
        </View>
        <Text style={s.label}>End chainage</Text>
        <View style={s.row}>
          <TextInput style={[s.input, s.half]} value={endKm} onChangeText={setEndKm} placeholder="KM" keyboardType="decimal-pad" placeholderTextColor="#8b97a8" />
          <TextInput style={[s.input, s.half]} value={endM} onChangeText={setEndM} placeholder="+ m" keyboardType="decimal-pad" placeholderTextColor="#8b97a8" />
        </View>
      </View>

      <View style={s.card}>
        <Text style={s.sec}>③ Defect Details</Text>
        <Pressable style={s.select} onPress={() => setSheet("category")}>
          <Text style={categoryId ? s.selectVal : s.ph}>
            {categories.find((c) => c.id === categoryId)?.name || "Category"}
          </Text>
        </Pressable>
        <Pressable style={s.select} onPress={() => setSheet("type")}>
          <Text style={selectedType ? s.selectVal : s.ph}>{selectedType?.label || "Defect Type"}</Text>
        </Pressable>
        <Pressable style={s.select} onPress={() => setSheet("lane")}>
          <Text style={lane ? s.selectVal : s.ph}>{lane || "Lane"}</Text>
        </Pressable>

        <Text style={s.label}>Side</Text>
        <View style={s.pills}>
          {SIDES.map((x) => (
            <Pressable key={x} style={[s.pill, side === x && s.pillOn]} onPress={() => setSide(x)}>
              <Text style={[s.pillText, side === x && s.pillTextOn]}>{x}</Text>
            </Pressable>
          ))}
        </View>
        <Text style={s.label}>Carriageway</Text>
        <View style={s.pills}>
          {CARRIAGEWAYS.map((x) => (
            <Pressable key={x} style={[s.pill, carriageway === x && s.pillOn]} onPress={() => setCarriageway(x)}>
              <Text style={[s.pillText, carriageway === x && s.pillTextOn]}>{x}</Text>
            </Pressable>
          ))}
        </View>
      </View>

      <Pressable style={[s.critical, isCritical && s.criticalOn]} onPress={() => setIsCritical((v) => !v)}>
        <Text style={[s.critText, isCritical && { color: "#fff" }]}>
          {isCritical
            ? "This defect is marked as critical and Life Threatening"
            : "Mark this defect as critical and life threatening"}
        </Text>
        <View style={[s.check, isCritical && s.checkOn]}>{isCritical ? <Text style={{ color: "#b91c1c" }}>✓</Text> : null}</View>
      </Pressable>

      <View style={s.card}>
        <Text style={s.sec}>Voice Notes ({voiceNote.trim() ? 1 : 0}) — optional</Text>
        <Text style={{ color: "#8b97a8", marginBottom: 8, fontSize: 13 }}>
          Optional. You can raise the defect without a voice note.
        </Text>
        <TextInput
          style={[s.input, { minHeight: 70 }]}
          value={voiceNote}
          onChangeText={setVoiceNote}
          placeholder="Optional: voice-note transcript / extra site note"
          placeholderTextColor="#8b97a8"
          multiline
        />
      </View>

      {error ? <Text style={s.err}>{error}</Text> : null}
      <Pressable style={[s.raise, !ready && s.raiseOff]} onPress={submit} disabled={busy || !ready}>
        <Text style={s.raiseText}>{busy ? "Raising…" : "Raise Defect"}</Text>
      </Pressable>

      <SelectSheet
        visible={sheet === "project"}
        title="Select Project"
        searchPlaceholder="Search UCC / project"
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
      <SelectSheet
        visible={sheet === "category"}
        title="Category"
        searchPlaceholder="Search category"
        options={categories.map((c) => ({ id: c.id, label: c.name }))}
        value={categoryId}
        onClose={() => setSheet(null)}
        onConfirm={(id) => {
          setCategoryId(id);
          const first = types.find((t) => t.category_id === id);
          setIssueTypeId(first?.id || "");
          setSheet(null);
        }}
      />
      <SelectSheet
        visible={sheet === "type"}
        title="Defect Type"
        searchPlaceholder="Search Defect Type"
        options={filteredTypes.map((t) => ({ id: t.id, label: t.label }))}
        value={issueTypeId}
        onClose={() => setSheet(null)}
        onConfirm={(id) => {
          setIssueTypeId(id);
          const t = types.find((x) => x.id === id);
          if (t) setCategoryId(t.category_id);
          setSheet(null);
        }}
      />
      <SelectSheet
        visible={sheet === "lane"}
        title="Lane"
        searchPlaceholder="Search"
        options={LANES.map((l) => ({ id: l, label: l }))}
        value={lane}
        onClose={() => setSheet(null)}
        onConfirm={(id) => {
          setLane(id);
          setSheet(null);
        }}
      />
    </ScrollView>
  );
}

const s = StyleSheet.create({
  page: { padding: 14, paddingBottom: 40, backgroundColor: "#eef2f6" },
  card: { backgroundColor: "#fff", borderRadius: 14, padding: 14, marginBottom: 12 },
  sec: { fontWeight: "800", color: "#12355a", marginBottom: 10, fontSize: 16 },
  label: { fontWeight: "700", color: "#334", marginBottom: 6, marginTop: 4 },
  hint: { color: "#667", fontSize: 12, marginTop: 6 },
  ok: { color: "#157347", fontSize: 12, marginTop: 6 },
  select: {
    borderWidth: 1,
    borderColor: "#d5dbe3",
    borderRadius: 10,
    padding: 12,
    marginBottom: 10,
    backgroundColor: "#f8fafc",
  },
  selectVal: { color: "#111", fontWeight: "600" },
  ph: { color: "#8b97a8" },
  input: {
    borderWidth: 1,
    borderColor: "#d5dbe3",
    borderRadius: 10,
    padding: 12,
    color: "#111",
    backgroundColor: "#f8fafc",
    marginBottom: 8,
  },
  row: { flexDirection: "row", gap: 8 },
  half: { flex: 1 },
  photoRow: { flexDirection: "row", gap: 10 },
  photoBtn: {
    flex: 1,
    borderWidth: 1,
    borderColor: "#1a4b8c",
    borderRadius: 12,
    padding: 14,
    alignItems: "center",
    backgroundColor: "#f3f7fc",
  },
  photoIcon: { fontSize: 22, marginBottom: 4 },
  photoLab: { color: "#1a4b8c", fontWeight: "700", fontSize: 13 },
  mapBox: {
    backgroundColor: "#dce8d4",
    borderRadius: 12,
    padding: 16,
    alignItems: "center",
    marginBottom: 10,
  },
  pin: { fontSize: 28, marginBottom: 4 },
  mapTitle: { fontWeight: "800", color: "#1a2a1a" },
  mapMeta: { color: "#445544", textAlign: "center", marginTop: 4 },
  ghost: { marginTop: 10, paddingVertical: 8, paddingHorizontal: 14, borderRadius: 16, backgroundColor: "#fff" },
  ghostText: { color: "#1a4b8c", fontWeight: "700" },
  pills: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginBottom: 8 },
  pill: {
    borderWidth: 1,
    borderColor: "#c5ccd6",
    borderRadius: 20,
    paddingHorizontal: 12,
    paddingVertical: 8,
    backgroundColor: "#fff",
  },
  pillOn: { backgroundColor: "#1a4b8c", borderColor: "#1a4b8c" },
  pillText: { color: "#334", fontWeight: "600", fontSize: 13 },
  pillTextOn: { color: "#fff" },
  critical: {
    backgroundColor: "#fff",
    borderRadius: 10,
    padding: 14,
    marginBottom: 12,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    borderWidth: 1,
    borderColor: "#e5e7eb",
  },
  criticalOn: { backgroundColor: "#dc2626", borderColor: "#dc2626" },
  critText: { flex: 1, color: "#334", fontWeight: "600" },
  check: {
    width: 22,
    height: 22,
    borderRadius: 4,
    borderWidth: 2,
    borderColor: "#9ca3af",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#fff",
  },
  checkOn: { borderColor: "#fff" },
  err: { color: "#b91c1c", marginBottom: 8 },
  raise: {
    backgroundColor: "#1a4b8c",
    borderRadius: 24,
    paddingVertical: 16,
    alignItems: "center",
  },
  raiseOff: { backgroundColor: "#cfd6df" },
  raiseText: { color: "#fff", fontWeight: "800", fontSize: 16 },
});
