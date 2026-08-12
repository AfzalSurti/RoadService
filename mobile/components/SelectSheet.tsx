import React, { useEffect, useMemo, useState } from "react";
import { Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";

export type SheetOption = { id: string; label: string; hint?: string };

type Props = {
  visible: boolean;
  title: string;
  searchPlaceholder?: string;
  options: SheetOption[];
  value?: string | null;
  onClose: () => void;
  onConfirm: (id: string) => void;
};

export function SelectSheet({
  visible,
  title,
  searchPlaceholder = "Search",
  options,
  value,
  onClose,
  onConfirm,
}: Props) {
  const [q, setQ] = useState("");
  const [picked, setPicked] = useState<string | null>(value ?? null);

  useEffect(() => {
    if (visible) {
      setPicked(value ?? null);
      setQ("");
    }
  }, [visible, value]);

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    if (!needle) return options;
    return options.filter(
      (o) =>
        o.label.toLowerCase().includes(needle) ||
        o.id.toLowerCase().includes(needle) ||
        (o.hint || "").toLowerCase().includes(needle)
    );
  }, [options, q]);

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View style={styles.bg}>
        <View style={styles.sheet}>
          <View style={styles.handle} />
          <View style={styles.head}>
            <Text style={styles.title}>{title}</Text>
            <Pressable onPress={onClose} hitSlop={12}>
              <Text style={styles.x}>✕</Text>
            </Pressable>
          </View>
          <View style={styles.search}>
            <Text style={styles.mag}>⌕</Text>
            <TextInput
              style={styles.searchInput}
              placeholder={searchPlaceholder}
              placeholderTextColor="#8b97a8"
              value={q}
              onChangeText={setQ}
            />
          </View>
          <ScrollView style={{ maxHeight: 360 }}>
            {filtered.map((o) => {
              const on = picked === o.id;
              return (
                <Pressable key={o.id} style={styles.row} onPress={() => setPicked(o.id)}>
                  <View style={[styles.radio, on && styles.radioOn]}>{on ? <View style={styles.dot} /> : null}</View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.label}>{o.label}</Text>
                    {o.hint ? <Text style={styles.hint}>{o.hint}</Text> : null}
                  </View>
                </Pressable>
              );
            })}
            {!filtered.length ? <Text style={styles.empty}>No matches</Text> : null}
          </ScrollView>
          <Pressable
            style={[styles.confirm, !picked && styles.confirmOff]}
            disabled={!picked}
            onPress={() => picked && onConfirm(picked)}
          >
            <Text style={styles.confirmText}>Confirm</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  bg: { flex: 1, backgroundColor: "rgba(0,0,0,0.45)", justifyContent: "flex-end" },
  sheet: {
    backgroundColor: "#fff",
    borderTopLeftRadius: 18,
    borderTopRightRadius: 18,
    padding: 16,
    paddingBottom: 24,
  },
  handle: {
    alignSelf: "center",
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: "#d5dbe3",
    marginBottom: 10,
  },
  head: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 10 },
  title: { fontSize: 22, fontWeight: "800", color: "#111" },
  x: { fontSize: 22, color: "#333", fontWeight: "600" },
  search: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#f3f5f8",
    borderRadius: 12,
    paddingHorizontal: 12,
    marginBottom: 8,
  },
  mag: { fontSize: 18, color: "#667", marginRight: 6 },
  searchInput: { flex: 1, paddingVertical: 10, color: "#111", fontSize: 15 },
  row: { flexDirection: "row", alignItems: "flex-start", gap: 12, paddingVertical: 12 },
  radio: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 2,
    borderColor: "#c5ccd6",
    marginTop: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  radioOn: { borderColor: "#1a4b8c" },
  dot: { width: 12, height: 12, borderRadius: 6, backgroundColor: "#1a4b8c" },
  label: { color: "#1a1a1a", fontSize: 15, fontWeight: "500" },
  hint: { color: "#667", fontSize: 12, marginTop: 2 },
  empty: { color: "#889", padding: 16, textAlign: "center" },
  confirm: {
    backgroundColor: "#1a4b8c",
    borderRadius: 24,
    paddingVertical: 14,
    alignItems: "center",
    marginTop: 8,
  },
  confirmOff: { backgroundColor: "#cfd6df" },
  confirmText: { color: "#fff", fontWeight: "700", fontSize: 16 },
});
