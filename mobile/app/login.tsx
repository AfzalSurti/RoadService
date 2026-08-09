import { router } from "expo-router";
import React, { useState } from "react";
import { Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { useAuth } from "../lib/auth";

export default function LoginScreen() {
  const { login } = useAuth();
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
    <View style={styles.page}>
      <Text style={styles.brand}>RoadService</Text>
      <Text style={styles.sub}>Contractor & GMC representative mobile</Text>
      {error ? <Text style={styles.error}>{error}</Text> : null}
      <TextInput
        style={styles.input}
        autoCapitalize="none"
        keyboardType="email-address"
        value={email}
        onChangeText={setEmail}
        placeholder="Email"
      />
      <TextInput
        style={styles.input}
        secureTextEntry
        value={password}
        onChangeText={setPassword}
        placeholder="Password"
      />
      <Pressable style={styles.btn} onPress={onSubmit} disabled={busy}>
        <Text style={styles.btnText}>{busy ? "Signing in…" : "Sign in"}</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, justifyContent: "center", padding: 24, backgroundColor: "#eef2f6" },
  brand: { fontSize: 32, fontWeight: "800", color: "#0b2a43" },
  sub: { color: "#5b6b7c", marginBottom: 24 },
  input: {
    backgroundColor: "#fff",
    borderWidth: 1,
    borderColor: "#d5dee8",
    borderRadius: 10,
    padding: 14,
    marginBottom: 12,
  },
  btn: { backgroundColor: "#0f4c81", padding: 16, borderRadius: 12, alignItems: "center" },
  btnText: { color: "#fff", fontWeight: "700" },
  error: { color: "#be123c", marginBottom: 12 },
});
