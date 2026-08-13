import { Link, Stack, router, useFocusEffect } from "expo-router";
import React, { useCallback, useState } from "react";
import {
  FlatList,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { api, type Issue, type SiteRfi } from "../lib/api";
import { useAuth } from "../lib/auth";
import { flushOfflineJobs, listOfflineJobs } from "../lib/offline";
import { roleLabel } from "../lib/roles";
import { useTheme } from "../lib/theme";

const QUICK_LINKS: { label: string; href: string; icon: string }[] = [
  { label: "Road\nMaintenance", href: "/create-issue", icon: "🛣" },
  { label: "RFI", href: "/rfi", icon: "📄" },
  { label: "Attendance", href: "/attendance", icon: "👤" },
  { label: "Road\nWarnings", href: "/warnings", icon: "⚠" },
  { label: "NCR", href: "/ncr", icon: "📋" },
  { label: "PMM", href: "/pmm", icon: "📊" },
  { label: "Critical\nIssues", href: "/critical", icon: "🚨" },
];

function firstName(full?: string | null) {
  if (!full) return "there";
  return full.split(" ")[0];
}

function SurveyorHome() {
  const { token, fullName, logout } = useAuth();
  const { mode, toggle } = useTheme();
  const [issues, setIssues] = useState<Issue[]>([]);
  const [rfis, setRfis] = useState<SiteRfi[]>([]);
  const [unread, setUnread] = useState(0);
  const [pendingOffline, setPendingOffline] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    if (!token) return;
    try {
      const sync = await flushOfflineJobs(token);
      const [issueList, notes, offline, rfiList] = await Promise.all([
        api.issues(token),
        api.notifications(token),
        listOfflineJobs(),
        api.rfis(token).catch(() => [] as SiteRfi[]),
      ]);
      setIssues(issueList);
      setRfis(rfiList);
      setUnread(notes.filter((n) => !n.is_read).length);
      setPendingOffline(offline.length);
      setError(sync.failed ? `${sync.failed} offline item(s) still waiting for network` : null);
    } catch (e: any) {
      setError(e.message);
      setPendingOffline((await listOfflineJobs()).length);
    }
  }, [token]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  const open = rfis.filter((r) => r.status === "open").length;
  const pending = rfis.filter((r) => r.status === "answered").length;
  const approved = rfis.filter((r) => r.status === "closed").length;
  const issueOpen = issues.filter((i) => i.status === "open" || i.status === "in_progress").length;
  const kpis = [
    { label: "Total Inspections", value: rfis.length || issues.length, dark: true },
    { label: "Open", value: open || issueOpen },
    { label: "Pending", value: pending },
    { label: "Approved", value: approved },
    { label: "Rejected", value: issues.filter((i) => i.status === "under_review").length },
    { label: "Scheduled", value: rfis.filter((r) => r.status === "open").length },
  ];

  return (
    <View style={dash.page}>
      <Stack.Screen options={{ title: "Home", headerStyle: { backgroundColor: "#0b2a43" } }} />
      <ScrollView
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
      >
        <View style={dash.top}>
          <View>
            <Text style={dash.hi}>Hi, {firstName(fullName)}</Text>
            <Text style={dash.sub}>GMC representative</Text>
          </View>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
            <Pressable onPress={toggle}>
              <Text style={dash.signOut}>{mode === "dark" ? "Light" : "Dark"}</Text>
            </Pressable>
            <View style={dash.avatar}>
              <Text style={{ fontSize: 22 }}>👤</Text>
            </View>
            <Pressable
              onPress={async () => {
                await logout();
                router.replace("/login");
              }}
            >
              <Text style={dash.signOut}>Sign out</Text>
            </Pressable>
          </View>
        </View>

        <Pressable style={dash.noteBanner} onPress={() => router.push("/notifications")}>
          <Text style={dash.noteText}>
            You have {unread} new notification{unread === 1 ? "" : "s"}
          </Text>
          <Text style={dash.noteLink}>View all</Text>
        </Pressable>

        {pendingOffline ? (
          <Text style={dash.warn}>{pendingOffline} offline capture(s) saved — will sync when online</Text>
        ) : null}
        {error ? <Text style={dash.err}>{error}</Text> : null}

        <View style={dash.kpiGrid}>
          {kpis.map((k) => (
            <View key={k.label} style={[dash.kpi, k.dark && dash.kpiDark]}>
              <Text style={[dash.kpiVal, k.dark && { color: "#fff" }]}>{k.value}</Text>
              <Text style={[dash.kpiLab, k.dark && { color: "#cfe0f5" }]}>{k.label}</Text>
            </View>
          ))}
        </View>

        <Text style={dash.section}>QuickLinks</Text>
        <View style={dash.links}>
          {QUICK_LINKS.map((item) => (
            <Pressable key={item.href} style={dash.linkItem} onPress={() => router.push(item.href as any)}>
              <View style={dash.circle}>
                <Text style={dash.circleIcon}>{item.icon}</Text>
              </View>
              <Text style={dash.linkLabel}>{item.label}</Text>
            </Pressable>
          ))}
        </View>

        <View style={dash.tabs}>
          <Text style={dash.tabOn}>Home</Text>
          <Pressable onPress={() => router.push("/notifications")}>
            <Text style={dash.tab}>Alerts</Text>
          </Pressable>
        </View>
      </ScrollView>
    </View>
  );
}

export default function HomeScreen() {
  const { token, role, fullName, logout } = useAuth();
  const { mode, toggle } = useTheme();
  const [issues, setIssues] = useState<Issue[]>([]);
  const [unread, setUnread] = useState(0);
  const [pendingOffline, setPendingOffline] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [busyId, setBusyId] = useState<number | null>(null);

  const load = useCallback(async () => {
    if (!token) return;
    try {
      const sync = await flushOfflineJobs(token);
      const [issueList, notes, offline] = await Promise.all([
        api.issues(token),
        api.notifications(token),
        listOfflineJobs(),
      ]);
      setIssues(issueList);
      setUnread(notes.filter((n) => !n.is_read).length);
      setPendingOffline(offline.length);
      if (sync.synced) {
        setError(null);
      } else if (sync.failed) {
        setError(`${sync.failed} offline item(s) still waiting for network`);
      } else {
        setError(null);
      }
    } catch (e: any) {
      setError(e.message);
      setPendingOffline((await listOfflineJobs()).length);
    }
  }, [token]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  const oneTapStart = async (item: Issue) => {
    if (!token) return;
    setBusyId(item.id);
    try {
      if (item.status === "under_review") await api.reworkStart(token, item.id);
      else await api.startIssue(token, item.id);
      await load();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusyId(null);
    }
  };

  if (role === "surveyor") {
    return <SurveyorHome />;
  }

  return (
    <View style={styles.page}>
      <Stack.Screen options={{ title: role === "contractor" ? "Site work" : "Issues" }} />
      <View style={styles.header}>
        <View>
          <Text style={styles.name}>{fullName}</Text>
          <Text style={styles.role}>
            {roleLabel(role)}
            {role === "contractor" ? " · Rectify site defects" : ""}
            {unread ? ` · ${unread} alerts` : ""}
          </Text>
        </View>
        <View style={{ flexDirection: "row", gap: 12, alignItems: "center" }}>
          <Pressable onPress={toggle}>
            <Text style={styles.link}>{mode === "dark" ? "Light" : "Dark"}</Text>
          </Pressable>
          <Pressable
            onPress={async () => {
              await logout();
              router.replace("/login");
            }}
          >
            <Text style={styles.link}>Sign out</Text>
          </Pressable>
        </View>
      </View>

      <View style={styles.row}>
        <Link href="/notifications" asChild>
          <Pressable style={styles.secondary}>
            <Text style={styles.secondaryText}>Notifications{unread ? ` (${unread})` : ""}</Text>
          </Pressable>
        </Link>
        {role === "contractor" ? (
          <Link href="/rfi" asChild>
            <Pressable style={styles.primary}>
              <Text style={styles.primaryText}>RFI Raised</Text>
            </Pressable>
          </Link>
        ) : null}
        {role === "contractor" ? (
          <Link href="/attendance" asChild>
            <Pressable style={styles.secondary}>
              <Text style={styles.secondaryText}>Attendance</Text>
            </Pressable>
          </Link>
        ) : null}
      </View>
      {role === "contractor" ? (
        <Text style={styles.hint}>
          Site only: when GMC raises a defect, Start work / Start rework → Submit rectification. Use
          RFI Raised for site clarifications.
        </Text>
      ) : null}

      {pendingOffline ? (
        <Text style={styles.offline}>
          {pendingOffline} offline capture(s) saved — will sync when online
        </Text>
      ) : null}
      {error ? <Text style={styles.error}>{error}</Text> : null}

      <FlatList
        data={issues}
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
          <View style={styles.card}>
            <Link href={`/issue/${item.id}`} asChild>
              <Pressable>
                <Text style={styles.cardTitle}>
                  #{item.id} · {item.issue_type}
                </Text>
                <Text style={styles.meta}>
                  {item.status} · {item.remaining_days ?? "?"} days left
                </Text>
                <Text numberOfLines={2}>{item.description}</Text>
              </Pressable>
            </Link>
            {role === "contractor" ? (
              <View style={styles.actions}>
                {(item.status === "under_review" || item.status === "open") && (
                  <Pressable
                    style={styles.miniBtn}
                    disabled={busyId === item.id}
                    onPress={() => oneTapStart(item)}
                  >
                    <Text style={styles.miniText}>
                      {item.status === "under_review" ? "Start rework / rectify" : "Start rectification"}
                    </Text>
                  </Pressable>
                )}
                {item.status === "in_progress" && (
                  <Pressable
                    style={styles.miniBtn}
                    onPress={() => router.push(`/issue/${item.id}?action=submit`)}
                  >
                    <Text style={styles.miniText}>Submit rectification</Text>
                  </Pressable>
                )}
                {item.status === "under_review" && (
                  <Pressable
                    style={[styles.miniBtn, styles.ghostBtn]}
                    onPress={() => router.push(`/issue/${item.id}?action=rejection`)}
                  >
                    <Text style={styles.ghostText}>View rejection notes</Text>
                  </Pressable>
                )}
              </View>
            ) : null}
          </View>
        )}
        ListEmptyComponent={<Text style={styles.meta}>No issues yet.</Text>}
      />
    </View>
  );
}

const dash = StyleSheet.create({
  page: { flex: 1, backgroundColor: "#eef2f6" },
  top: {
    backgroundColor: "#0b2a43",
    paddingHorizontal: 18,
    paddingTop: 8,
    paddingBottom: 18,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  hi: { color: "#fff", fontSize: 22, fontWeight: "800" },
  sub: { color: "#9cb4cc", marginTop: 2 },
  avatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: "#f5c518",
    alignItems: "center",
    justifyContent: "center",
  },
  signOut: { color: "#8ec5ff", fontWeight: "600" },
  noteBanner: {
    margin: 14,
    backgroundColor: "#fff",
    borderRadius: 12,
    padding: 14,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  noteText: { color: "#223", fontWeight: "600", flex: 1 },
  noteLink: { color: "#1a4b8c", fontWeight: "700" },
  warn: { color: "#b45309", marginHorizontal: 14, marginBottom: 8 },
  err: { color: "#b91c1c", marginHorizontal: 14, marginBottom: 8 },
  kpiGrid: { flexDirection: "row", flexWrap: "wrap", paddingHorizontal: 10, gap: 8 },
  kpi: {
    width: "31%",
    backgroundColor: "#fff",
    borderRadius: 10,
    paddingVertical: 12,
    paddingHorizontal: 8,
    alignItems: "center",
  },
  kpiDark: { backgroundColor: "#12355a" },
  kpiVal: { fontSize: 20, fontWeight: "800", color: "#12355a" },
  kpiLab: { fontSize: 11, color: "#556", textAlign: "center", marginTop: 4 },
  section: { marginTop: 18, marginHorizontal: 16, fontWeight: "800", fontSize: 16, color: "#12355a" },
  links: { flexDirection: "row", flexWrap: "wrap", padding: 10 },
  linkItem: { width: "25%", alignItems: "center", marginBottom: 16 },
  circle: {
    width: 62,
    height: 62,
    borderRadius: 31,
    backgroundColor: "#f5c518",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 6,
  },
  circleIcon: { fontSize: 22 },
  linkLabel: { fontSize: 11, fontWeight: "700", color: "#1a2a3a", textAlign: "center" },
  tabs: {
    flexDirection: "row",
    justifyContent: "space-around",
    backgroundColor: "#fff",
    paddingVertical: 14,
    marginTop: 8,
    borderTopWidth: 1,
    borderColor: "#dde3ea",
  },
  tabOn: { color: "#1a4b8c", fontWeight: "800" },
  tab: { color: "#667", fontWeight: "600" },
});

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: "#0a0c10", padding: 16 },
  header: { flexDirection: "row", justifyContent: "space-between", marginBottom: 12 },
  name: { fontWeight: "700", fontSize: 18, color: "#e8eef6" },
  role: { color: "#8b9bb0" },
  link: { color: "#3b9eff", fontWeight: "600" },
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
  cardTitle: { fontWeight: "700", marginBottom: 4, color: "#e8eef6" },
  meta: { color: "#8b9bb0", marginBottom: 4 },
  error: { color: "#fb7185", marginBottom: 8 },
  offline: { color: "#fbbf24", marginBottom: 8 },
  hint: { color: "#8b9bb0", marginBottom: 10, fontSize: 13, lineHeight: 18 },
  actions: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 10 },
  miniBtn: {
    backgroundColor: "#3b9eff",
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 10,
  },
  miniText: { color: "#041018", fontWeight: "700", fontSize: 13 },
  ghostBtn: { backgroundColor: "transparent", borderWidth: 1, borderColor: "#243041" },
  ghostText: { color: "#e8eef6", fontWeight: "600", fontSize: 13 },
});
