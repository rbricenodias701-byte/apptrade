import { MaterialCommunityIcons } from "@expo/vector-icons";
import { Tabs } from "expo-router";
import { NativeTabs } from "expo-router/unstable-native-tabs";
import { Platform } from "react-native";

import { usesNativeTabs } from "@/src/navigation";
import { useTheme } from "@/src/theme";

export default function TabsLayout() {
  const { colors } = useTheme();
  if (usesNativeTabs) return <NativeTabs><NativeTabs.Trigger name="index"><NativeTabs.Trigger.Icon sf="house.fill" /><NativeTabs.Trigger.Label>Inicio</NativeTabs.Trigger.Label></NativeTabs.Trigger><NativeTabs.Trigger name="journal"><NativeTabs.Trigger.Icon sf="list.bullet.rectangle.fill" /><NativeTabs.Trigger.Label>Diario</NativeTabs.Trigger.Label></NativeTabs.Trigger><NativeTabs.Trigger name="assistant"><NativeTabs.Trigger.Icon sf="sparkles" /><NativeTabs.Trigger.Label>Coach</NativeTabs.Trigger.Label></NativeTabs.Trigger><NativeTabs.Trigger name="discipline"><NativeTabs.Trigger.Icon sf="shield.fill" /><NativeTabs.Trigger.Label>Reglas</NativeTabs.Trigger.Label></NativeTabs.Trigger></NativeTabs>;
  return <Tabs screenOptions={{ headerShown: false, tabBarActiveTintColor: colors.brandPrimary, tabBarInactiveTintColor: colors.muted, tabBarStyle: { backgroundColor: colors.surfaceSecondary, borderTopColor: colors.border, ...(Platform.OS === "web" ? { height: 64 } : {}) }, tabBarItemStyle: { alignSelf: "center" } }}><Tabs.Screen name="index" options={{ title: "Inicio", tabBarIcon: ({ color, size }) => <MaterialCommunityIcons name="view-dashboard-outline" color={color} size={size} /> }} /><Tabs.Screen name="journal" options={{ title: "Diario", tabBarIcon: ({ color, size }) => <MaterialCommunityIcons name="notebook-edit-outline" color={color} size={size} /> }} /><Tabs.Screen name="assistant" options={{ title: "Coach", tabBarIcon: ({ color, size }) => <MaterialCommunityIcons name="robot-outline" color={color} size={size} /> }} /><Tabs.Screen name="discipline" options={{ title: "Reglas", tabBarIcon: ({ color, size }) => <MaterialCommunityIcons name="shield-check-outline" color={color} size={size} /> }} /></Tabs>;
}