import { Stack, useFocusEffect } from "expo-router";
import React, { useCallback, useState } from "react";
import {
  FlatList,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { api, type RateItemSurveyor } from "../lib/api";
import { useAuth } from "../lib/auth";

export default function QuantityScreen() {
  const { token } = useAuth();
  const [items, setItems] = useState<RateItemSurveyor[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [selected, setSelected] = useState<RateItemSurveyor | null>(null);
  const [qty, setQty] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    if (!token) return;
    try {
      const data = await api.rateItems(token);
      setItems(data);
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

  const submit = async () => {
    if (!token || !selected) return;
    const value = Number(qty);
    if (!value || value <= 0) {
      setError("Enter quantity greater than 0");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await api.addQuantity(token, selected.id, {
        quantity: value,
        note: note.trim() || undefined,
      });
      setInfo(`Saved ${value} ${selected.unit} for item ${selected.item_no}. Value calculated on project.`);
      setSelected(null);
      setQty("");
      setNote("");
      await load();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <View style={styles.page}>
      <Stack.Screen options={{ title: "Quantity" }} />
      <Text style={styles.lead}>
        Enter executed quantity for BOQ items. Rate is applied automatically on the project (not shown
        here).
      </Text>
      {error ? <Text style={styles.error}>{error}</Text> : null}
      {info ? <Text style={styles.info}>{info}</Text> : null}

      <FlatList
        data={items}
        keyExtractor={(i) => String(i.id)}
        renderItem={({ item }) => (
          <Pressable style={styles.card} onPress={() => setSelected(item)}>
            <Text style={styles.title}>
              {item.item_no} · {item.unit}
            </Text>
            <Text style={styles.desc}>{item.description}</Text>
            <Text style={styles.meta}>Executed so far: {item.executed_quantity} {item.unit}</Text>
            <Text style={styles.link}>Enter quantity →</Text>
          </Pressable>
        )}
        ListEmptyComponent={<Text style={styles.meta}>No rate items assigned yet.</Text>}
      />

      <Modal visible={!!selected} transparent animationType="slide">
        <View style={styles.modalWrap}>
          <View style={styles.modal}>
            <Text style={styles.title}>{selected?.item_no}</Text>
            <Text style={styles.desc}>{selected?.description}</Text>
            <Text style={styles.meta}>Unit: {selected?.unit}</Text>
            <TextInput
              style={styles.input}
              keyboardType="decimal-pad"
              placeholder={`Quantity (${selected?.unit || ""})`}
              placeholderTextColor="#8b9bb0"
              value={qty}
              onChangeText={setQty}
            />
            <TextInput
              style={styles.input}
              placeholder="Note (optional)"
              placeholderTextColor="#8b9bb0"
              value={note}
              onChangeText={setNote}
            />
            <Pressable style={styles.primary} onPress={submit} disabled={busy}>
              <Text style={styles.primaryText}>{busy ? "Saving…" : "Submit quantity"}</Text>
            </Pressable>
            <Pressable style={styles.ghost} onPress={() => setSelected(null)}>
              <Text style={styles.ghostText}>Cancel</Text>
            </Pressable>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: "#0a0c10", padding: 16 },
  lead: { color: "#8b9bb0", marginBottom: 12, lineHeight: 20 },
  card: {
    backgroundColor: "#12161d",
    borderRadius: 12,
    padding: 14,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: "#243041",
  },
  title: { color: "#e8eef6", fontWeight: "700", marginBottom: 4 },
  desc: { color: "#c9d6e5", marginBottom: 6 },
  meta: { color: "#8b9bb0", marginBottom: 4 },
  link: { color: "#3b9eff", fontWeight: "600", marginTop: 4 },
  error: { color: "#fb7185", marginBottom: 8 },
  info: { color: "#4ade80", marginBottom: 8 },
  modalWrap: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.55)",
    justifyContent: "flex-end",
  },
  modal: {
    backgroundColor: "#12161d",
    borderTopLeftRadius: 18,
    borderTopRightRadius: 18,
    padding: 18,
    borderWidth: 1,
    borderColor: "#243041",
  },
  input: {
    backgroundColor: "#0a0e14",
    borderWidth: 1,
    borderColor: "#243041",
    borderRadius: 10,
    padding: 12,
    marginTop: 10,
    color: "#e8eef6",
  },
  primary: {
    backgroundColor: "#3b9eff",
    padding: 14,
    borderRadius: 12,
    alignItems: "center",
    marginTop: 12,
  },
  primaryText: { color: "#041018", fontWeight: "700" },
  ghost: { padding: 14, alignItems: "center" },
  ghostText: { color: "#8b9bb0", fontWeight: "600" },
});
