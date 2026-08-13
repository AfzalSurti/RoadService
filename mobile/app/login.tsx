import { router } from "expo-router";
import React, { useState } from "react";
import { Image, Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { useAuth } from "../lib/auth";
import { useTheme } from "../lib/theme";

export default function LoginScreen() {
  const { login } = useAuth();
  const { colors, mode, toggle } = useTheme();
  const [email, setEmail] = useState("surveyor@roadservice.app");
  const [password, setPassword] = useState("Surveyor123!");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const onSubmit = async () => {
    setBusy(true);
    setError(null);
    try {
      await login(email.trim(), password);
      router.replace("/home");
    } catch (e: any) {
      setError(e.message || "Login failed");
    } finally {
      setBusy(false);
    }
  };

  return (
    <View style={[styles.page, { backgroundColor: colors.bg }]}>
      <Pressable style={styles.themeBtn} onPress={toggle}>
        <Text style={{ color: colors.primary, fontWeight: "700" }}>
          {mode === "dark" ? "Light mode" : "Dark mode"}
        </Text>
      </Pressable>
      <Image source={require("../assets/gdr-logo.png")} style={styles.logo} resizeMode="contain" />
      <Text style={[styles.brand, { color: colors.text }]}>RoadService</Text>
      <Text style={[styles.sub, { color: colors.muted }]}>
        Geo Designs & Research · Contractor & GMC representative
      </Text>
      {error ? <Text style={[styles.error, { color: colors.danger }]}>{error}</Text> : null}
      <TextInput
        style={[styles.input, { backgroundColor: colors.inputBg, borderColor: colors.border, color: colors.text }]}
        autoCapitalize="none"
        keyboardType="email-address"
        value={email}
        onChangeText={setEmail}
        placeholder="Email"
        placeholderTextColor={colors.muted}
      />
      <TextInput
        style={[styles.input, { backgroundColor: colors.inputBg, borderColor: colors.border, color: colors.text }]}
        secureTextEntry
        value={password}
        onChangeText={setPassword}
        placeholder="Password"
        placeholderTextColor={colors.muted}
      />
      <Pressable style={[styles.btn, { backgroundColor: colors.primary }]} onPress={onSubmit} disabled={busy}>
        <Text style={[styles.btnText, { color: colors.primaryText }]}>
          {busy ? "Signing in…" : "Sign in"}
        </Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, justifyContent: "center", padding: 24 },
  themeBtn: { position: "absolute", top: 48, right: 20, padding: 8 },
  logo: { width: 160, height: 72, alignSelf: "center", marginBottom: 12 },
  brand: { fontSize: 32, fontWeight: "800", textAlign: "center" },
  sub: { marginBottom: 24, textAlign: "center" },
  input: {
    borderWidth: 1,
    borderRadius: 10,
    padding: 14,
    marginBottom: 12,
  },
  btn: { padding: 16, borderRadius: 12, alignItems: "center" },
  btnText: { fontWeight: "700" },
  error: { marginBottom: 12 },
});
