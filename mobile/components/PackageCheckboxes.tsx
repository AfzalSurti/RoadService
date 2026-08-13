import React from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { PACKAGE_NAMES } from "../lib/packages";

type Props = {
  selected: string[];
  onChange: (next: string[]) => void;
  label?: string;
};

export function PackageCheckboxes({ selected, onChange, label = "Select package(s)" }: Props) {
  const toggle = (name: string) => {
    if (selected.includes(name)) onChange(selected.filter((s) => s !== name));
    else onChange([...selected, name]);
  };

  return (
    <View style={styles.wrap}>
      <Text style={styles.label}>{label}</Text>
      {PACKAGE_NAMES.map((name) => {
        const on = selected.includes(name);
        return (
          <Pressable key={name} style={[styles.row, on && styles.rowOn]} onPress={() => toggle(name)}>
            <View style={[styles.box, on && styles.boxOn]}>{on ? <Text style={styles.tick}>✓</Text> : null}</View>
            <Text style={styles.name}>{name}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { marginBottom: 10 },
  label: { fontWeight: "700", color: "#334", marginBottom: 8 },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    padding: 12,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#d5dbe3",
    backgroundColor: "#fff",
    marginBottom: 8,
  },
  rowOn: { borderColor: "#1a4b8c", backgroundColor: "#eef4fb" },
  box: {
    width: 22,
    height: 22,
    borderRadius: 4,
    borderWidth: 2,
    borderColor: "#1a4b8c",
    alignItems: "center",
    justifyContent: "center",
  },
  boxOn: { backgroundColor: "#1a4b8c" },
  tick: { color: "#fff", fontWeight: "800", fontSize: 12 },
  name: { color: "#111", flex: 1, fontWeight: "600" },
});
