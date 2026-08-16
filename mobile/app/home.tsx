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

type QuickLink = { label: string; href: string; icon: string };

const GMC_LINKS: QuickLink[] = [
  { label: "Road\nMaintenance", href: "/create-issue", icon: "🛣" },
  { label: "RFI", href: "/rfi", icon: "📄" },
  { label: "Attendance", href: "/attendance", icon: "👤" },
  { label: "Road\nWarnings", href: "/warnings", icon: "⚠" },
  { label: "NCR", href: "/ncr", icon: "📋" },
  { label: "PMM", href: "/pmm", icon: "📊" },
  { label: "Critical\nIssues", href: "/critical", icon: "🚨" },
  { label: "Query\nRaise", href: "/query", icon: "🎫" },
];

/** Same layout as GMC — no Attendance; no raise-defect; RFI + Query raise; rest view/action. */
const CONTRACTOR_LINKS: QuickLink[] = [
  { label: "Site\nWork", href: "/site-work", icon: "🛣" },
  { label: "RFI", href: "/rfi", icon: "📄" },
  { label: "Road\nWarnings", href: "/warnings", icon: "⚠" },
  { label: "NCR", href: "/ncr", icon: "📋" },
  { label: "PMM", href: "/pmm", icon: "📊" },
  { label: "Critical\nIssues", href: "/critical", icon: "🚨" },
  { label: "Query\nRaise", href: "/query", icon: "🎫" },
];

function firstName(full?: string | null) {
  if (!full) return "there";
  return full.split(" ")[0];
}

function FieldHome({ role }: { role: "surveyor" | "contractor" }) {
  const { token, fullName, logout } = useAuth();
  const { mode, toggle, colors } = useTheme();
  const [issues, setIssues] = useState<Issue[]>([]);
  const [rfis, setRfis] = useState<SiteRfi[]>([]);
  const [unread, setUnread] = useState(0);
  const [pendingOffline, setPendingOffline] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const links = role === "contractor" ? CONTRACTOR_LINKS : GMC_LINKS;
  const subtitle = role === "contractor" ? "Contractor representative" : "GMC representative";

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
    <View style={[dash.page, { backgroundColor: colors.bg }]}>
      <Stack.Screen options={{ title: "Home", headerStyle: { backgroundColor: colors.header } }} />
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
        <View style={[dash.top, { backgroundColor: colors.header }]}>
          <View>
            <Text style={dash.hi}>Hi, {firstName(fullName)}</Text>
            <Text style={dash.sub}>{subtitle}</Text>
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

        <Pressable
          style={[dash.noteBanner, { backgroundColor: colors.card, borderColor: colors.border }]}
          onPress={() => router.push("/notifications")}
        >
          <Text style={[dash.noteText, { color: colors.text }]}>
            You have {unread} new notification{unread === 1 ? "" : "s"}
          </Text>
          <Text style={[dash.noteLink, { color: colors.primary }]}>View all</Text>
        </Pressable>

        {role === "contractor" ? (
          <Text style={[dash.hintBanner, { color: colors.muted }]}>
            Raise RFI and Query only. GMC activities: view and set In progress / Completed.
          </Text>
        ) : null}

        {pendingOffline ? (
          <Text style={dash.warn}>{pendingOffline} offline capture(s) saved — will sync when online</Text>
        ) : null}
        {error ? <Text style={[dash.err, { color: colors.danger }]}>{error}</Text> : null}

        <View style={dash.kpiGrid}>
          {kpis.map((k) => (
            <View
              key={k.label}
              style={[dash.kpi, { backgroundColor: colors.card }, k.dark && dash.kpiDark]}
            >
              <Text style={[dash.kpiVal, { color: colors.primary }, k.dark && { color: "#fff" }]}>
                {k.value}
              </Text>
              <Text style={[dash.kpiLab, { color: colors.muted }, k.dark && { color: "#cfe0f5" }]}>
                {k.label}
              </Text>
            </View>
          ))}
        </View>

        <Text style={[dash.section, { color: colors.text }]}>QuickLinks</Text>
        <View style={dash.links}>
          {links.map((item) => (
            <Pressable key={item.href} style={dash.linkItem} onPress={() => router.push(item.href as any)}>
              <View style={dash.circle}>
                <Text style={dash.circleIcon}>{item.icon}</Text>
              </View>
              <Text style={[dash.linkLabel, { color: colors.text }]}>{item.label}</Text>
            </Pressable>
          ))}
        </View>

        <View
          style={[
            dash.tabs,
            { backgroundColor: colors.card, borderColor: colors.border },
          ]}
        >
          <Text style={[dash.tabOn, { color: colors.primary }]}>Home</Text>
          <Pressable onPress={() => router.push("/notifications")}>
            <Text style={[dash.tab, { color: colors.muted }]}>Alerts</Text>
          </Pressable>
        </View>
      </ScrollView>
    </View>
  );
}

export default function HomeScreen() {
  const { token, role, fullName, logout } = useAuth();
  const { mode, toggle, colors } = useTheme();
  const [issues, setIssues] = useState<Issue[]>([]);
  const [unread, setUnread] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    if (!token) return;
    try {
      const [issueList, notes] = await Promise.all([api.issues(token), api.notifications(token)]);
      setIssues(issueList);
      setUnread(notes.filter((n) => !n.is_read).length);
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

  if (role === "surveyor") return <FieldHome role="surveyor" />;
  if (role === "contractor") return <FieldHome role="contractor" />;

  return (
    <View style={[styles.page, { backgroundColor: colors.bg }]}>
      <Stack.Screen options={{ title: "Issues" }} />
      <View style={styles.header}>
        <View>
          <Text style={[styles.name, { color: colors.text }]}>{fullName}</Text>
          <Text style={[styles.role, { color: colors.muted }]}>
            {roleLabel(role)}
            {unread ? ` · ${unread} alerts` : ""}
          </Text>
        </View>
        <View style={{ flexDirection: "row", gap: 12, alignItems: "center" }}>
          <Pressable onPress={toggle}>
            <Text style={[styles.link, { color: colors.primary }]}>
              {mode === "dark" ? "Light" : "Dark"}
            </Text>
          </Pressable>
          <Pressable
            onPress={async () => {
              await logout();
              router.replace("/login");
            }}
          >
            <Text style={[styles.link, { color: colors.primary }]}>Sign out</Text>
          </Pressable>
        </View>
      </View>
      {error ? <Text style={[styles.error, { color: colors.danger }]}>{error}</Text> : null}
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
          <Link href={`/issue/${item.id}`} asChild>
            <Pressable
              style={[
                styles.card,
                { backgroundColor: colors.card, borderColor: colors.border },
              ]}
            >
              <Text style={[styles.cardTitle, { color: colors.text }]}>
                #{item.id} · {item.issue_type}
              </Text>
              <Text style={[styles.meta, { color: colors.muted }]}>
                {item.status} · {item.remaining_days ?? "?"} days left
              </Text>
              <Text style={{ color: colors.text }} numberOfLines={2}>
                {item.description}
              </Text>
            </Pressable>
          </Link>
        )}
        ListEmptyComponent={<Text style={[styles.meta, { color: colors.muted }]}>No issues yet.</Text>}
      />
    </View>
  );
}

const dash = StyleSheet.create({
  page: { flex: 1 },
  top: {
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
    borderRadius: 12,
    padding: 14,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    borderWidth: 1,
  },
  hintBanner: {
    marginHorizontal: 14,
    marginBottom: 8,
    fontSize: 13,
    lineHeight: 18,
  },
  noteText: { fontWeight: "600", flex: 1 },
  noteLink: { fontWeight: "700" },
  warn: { color: "#b45309", marginHorizontal: 14, marginBottom: 8 },
  err: { marginHorizontal: 14, marginBottom: 8 },
  kpiGrid: { flexDirection: "row", flexWrap: "wrap", paddingHorizontal: 10, gap: 8 },
  kpi: {
    width: "31%",
    borderRadius: 10,
    paddingVertical: 12,
    paddingHorizontal: 8,
    alignItems: "center",
  },
  kpiDark: { backgroundColor: "#12355a" },
  kpiVal: { fontSize: 20, fontWeight: "800" },
  kpiLab: { fontSize: 11, textAlign: "center", marginTop: 4 },
  section: { marginTop: 18, marginHorizontal: 16, fontWeight: "800", fontSize: 16 },
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
  linkLabel: { fontSize: 11, fontWeight: "700", textAlign: "center" },
  tabs: {
    flexDirection: "row",
    justifyContent: "space-around",
    paddingVertical: 14,
    marginTop: 8,
    borderTopWidth: 1,
  },
  tabOn: { fontWeight: "800" },
  tab: { fontWeight: "600" },
});

const styles = StyleSheet.create({
  page: { flex: 1, padding: 16 },
  header: { flexDirection: "row", justifyContent: "space-between", marginBottom: 12 },
  name: { fontWeight: "700", fontSize: 18 },
  role: {},
  link: { fontWeight: "600" },
  card: {
    borderRadius: 12,
    padding: 14,
    marginBottom: 10,
    borderWidth: 1,
  },
  cardTitle: { fontWeight: "700", marginBottom: 4 },
  meta: { marginBottom: 4 },
  error: { marginBottom: 8 },
});
