import { Stack, router } from "expo-router";
import React, { useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { api } from "../lib/api";
import { useAuth } from "../lib/auth";
import { useTheme } from "../lib/theme";

/** Same rule as the web portal and the server. */
function checks(pw: string) {
  return [
    { ok: pw.length >= 8, label: "At least 8 characters" },
    { ok: /[A-Za-z]/.test(pw), label: "At least one letter" },
    { ok: /\d/.test(pw), label: "At least one number" },
    { ok: pw === pw.trim(), label: "No space at the start or end" },
  ];
}

export default function ChangePasswordScreen() {
  const { token } = useAuth();
  const { colors } = useTheme();
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  const rules = checks(next);
  const same = next.length > 0 && next === current;
  const matches = confirm.length > 0 && confirm === next;
  const valid = current.length > 0 && rules.every((r) => r.ok) && !same && matches;

  const submit = async () => {
    if (!token || !valid) return;
    setBusy(true);
    setError(null);
    try {
      await api.changePassword(token, current, next);
      setDone(true);
    } catch (e: any) {
      setError(e.message || "Could not change the password");
    } finally {
      setBusy(false);
    }
  };

  const input = [styles.input, { borderColor: colors.border, color: colors.text, backgroundColor: colors.card }];

  return (
    <ScrollView style={{ flex: 1, backgroundColor: colors.bg }} contentContainerStyle={{ padding: 16, gap: 12 }}>
      <Stack.Screen options={{ title: "Change password" }} />
      {done ? (
        <>
          <Text style={[styles.ok, { color: colors.text }]}>
            Your password has been changed. Use the new password the next time you sign in.
          </Text>
          <Pressable style={[styles.btn, { backgroundColor: colors.primary }]} onPress={() => router.back()}>
            <Text style={styles.btnText}>Done</Text>
          </Pressable>
        </>
      ) : (
        <>
          {error ? <Text style={styles.error}>{error}</Text> : null}
          <Text style={[styles.label, { color: colors.text }]}>Current password</Text>
          <TextInput style={input} secureTextEntry={!show} value={current} onChangeText={setCurrent} autoCapitalize="none" />
          <Text style={[styles.label, { color: colors.text }]}>New password</Text>
          <TextInput style={input} secureTextEntry={!show} value={next} onChangeText={setNext} autoCapitalize="none" />
          <View style={{ gap: 2 }}>
            {rules.map((r) => (
              <Text key={r.label} style={{ color: r.ok ? "#1f8a4c" : colors.muted }}>
                {r.ok ? "✓" : "•"} {r.label}
              </Text>
            ))}
            <Text style={{ color: next && !same ? "#1f8a4c" : colors.muted }}>
              {next && !same ? "✓" : "•"} Different from the current password
            </Text>
          </View>
          <Text style={[styles.label, { color: colors.text }]}>Confirm new password</Text>
          <TextInput style={input} secureTextEntry={!show} value={confirm} onChangeText={setConfirm} autoCapitalize="none" />
          {confirm && !matches ? <Text style={styles.error}>The two passwords do not match</Text> : null}
          <Pressable onPress={() => setShow((v) => !v)}>
            <Text style={{ color: colors.primary }}>{show ? "Hide passwords" : "Show passwords"}</Text>
          </Pressable>
          <Pressable
            style={[styles.btn, { backgroundColor: colors.primary, opacity: valid && !busy ? 1 : 0.5 }]}
            disabled={!valid || busy}
            onPress={submit}
          >
            <Text style={styles.btnText}>{busy ? "Saving…" : "Change password"}</Text>
          </Pressable>
        </>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  label: { fontWeight: "600" },
  input: { borderWidth: 1, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10, fontSize: 16 },
  btn: { borderRadius: 10, paddingVertical: 14, alignItems: "center", marginTop: 8 },
  btnText: { color: "#fff", fontWeight: "700", fontSize: 16 },
  error: { color: "#c0392b" },
  ok: { fontSize: 16, lineHeight: 22 },
});
