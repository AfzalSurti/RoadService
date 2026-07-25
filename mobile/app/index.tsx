import { Redirect } from "expo-router";
import React from "react";
import { ActivityIndicator, View } from "react-native";
import { useAuth } from "../lib/auth";

export default function Index() {
  const { token, loading, role } = useAuth();
  if (loading) {
    return (
      <View style={{ flex: 1, justifyContent: "center" }}>
        <ActivityIndicator />
      </View>
    );
  }
  if (!token) return <Redirect href="/login" />;
  if (role === "surveyor" || role === "contractor") return <Redirect href="/home" />;
  return <Redirect href="/login" />;
}
