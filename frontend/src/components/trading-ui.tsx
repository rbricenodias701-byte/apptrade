import { MaterialCommunityIcons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Pressable, ScrollView, Text, View, type ScrollViewProps } from "react-native";

import { makeStyles, useTheme } from "@/src/theme";
import { usesNativeTabs } from "@/src/navigation";

export const formatMoney = (value: number, currency = "USD") => `${value >= 0 ? "+" : "−"}${Math.abs(value).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${currency}`;

export function AppScroll({ children, ...props }: ScrollViewProps) {
  const insets = useSafeAreaInsets();
  const bottomChrome = usesNativeTabs ? insets.bottom : 0;
  const styles = useStyles();
  return <ScrollView {...props} style={styles.scroll} contentContainerStyle={[styles.content, { paddingTop: insets.top + 18, paddingBottom: bottomChrome + 28 }]} keyboardShouldPersistTaps="handled">{children}</ScrollView>;
}

export function Card({ children, accent = false, testID }: { children: React.ReactNode; accent?: boolean; testID?: string }) {
  const styles = useStyles();
  return <View testID={testID} style={[styles.card, accent && styles.accentCard]}>{children}</View>;
}

export function Heading({ eyebrow, title, subtitle }: { eyebrow?: string; title: string; subtitle?: string }) {
  const styles = useStyles();
  return <View style={styles.heading}><View>{eyebrow ? <Text style={styles.eyebrow}>{eyebrow.toUpperCase()}</Text> : null}<Text style={styles.title}>{title}</Text>{subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}</View></View>;
}

export function Metric({ label, value, tone = "normal", icon }: { label: string; value: string; tone?: "normal" | "positive" | "negative" | "warning"; icon?: keyof typeof MaterialCommunityIcons.glyphMap }) {
  const styles = useStyles();
  return <View style={styles.metric}>{icon ? <MaterialCommunityIcons name={icon} size={20} color={styles[`tone_${tone}`].color} /> : null}<Text style={styles.metricLabel}>{label}</Text><Text style={[styles.metricValue, styles[`tone_${tone}`]]}>{value}</Text></View>;
}

export function Progress({ value, tone = "brand" }: { value: number; tone?: "brand" | "success" }) {
  const { colors } = useTheme();
  return <View style={{ height: 10, borderRadius: 999, backgroundColor: colors.surfaceTertiary, overflow: "hidden" }}><View style={{ height: "100%", width: `${Math.min(Math.max(value, 0), 100)}%`, borderRadius: 999, backgroundColor: tone === "success" ? colors.success : colors.brandPrimary }} /></View>;
}

export function PrimaryButton({ title, onPress, icon, secondary = false, disabled = false, testID }: { title: string; onPress: () => void; icon?: keyof typeof MaterialCommunityIcons.glyphMap; secondary?: boolean; disabled?: boolean; testID?: string }) {
  const styles = useStyles();
  return <Pressable testID={testID} accessibilityRole="button" disabled={disabled} onPress={onPress} style={({ pressed }) => [styles.button, secondary && styles.secondaryButton, disabled && styles.disabled, pressed && styles.pressed]}>{icon ? <MaterialCommunityIcons name={icon} size={20} color={secondary ? styles.secondaryButtonText.color : styles.buttonText.color} /> : null}<Text style={secondary ? styles.secondaryButtonText : styles.buttonText}>{title}</Text></Pressable>;
}

export function SmallIconButton({ icon, onPress, label, testID }: { icon: keyof typeof MaterialCommunityIcons.glyphMap; onPress: () => void; label: string; testID?: string }) {
  const { colors } = useTheme();
  return <Pressable testID={testID} accessibilityLabel={label} accessibilityRole="button" onPress={onPress} hitSlop={8} style={({ pressed }) => ({ width: 44, height: 44, borderRadius: 22, alignItems: "center", justifyContent: "center", backgroundColor: colors.surfaceTertiary, opacity: pressed ? 0.7 : 1 })}><MaterialCommunityIcons name={icon} size={21} color={colors.onSurface} /></Pressable>;
}

const useStyles = makeStyles((colors) => ({
  scroll: { flex: 1, backgroundColor: colors.surface },
  content: { paddingHorizontal: 18, gap: 16 },
  heading: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start", gap: 12 },
  eyebrow: { color: colors.brandPrimary, fontSize: 12, fontWeight: "800", letterSpacing: 1.2 },
  title: { color: colors.onSurface, fontSize: 30, fontWeight: "900", letterSpacing: -0.5 },
  subtitle: { color: colors.muted, fontSize: 15, marginTop: 4, lineHeight: 21 },
  card: { backgroundColor: colors.surfaceSecondary, borderColor: colors.border, borderWidth: 1, borderRadius: 16, padding: 16, gap: 12 },
  accentCard: { borderColor: colors.brandSecondary },
  metric: { flex: 1, gap: 5 },
  metricLabel: { color: colors.muted, fontSize: 12, fontWeight: "700", textTransform: "uppercase", letterSpacing: 0.4 },
  metricValue: { color: colors.onSurface, fontSize: 19, fontWeight: "900" },
  tone_normal: { color: colors.onSurface },
  tone_positive: { color: colors.success },
  tone_negative: { color: colors.error },
  tone_warning: { color: colors.warning },
  button: { minHeight: 52, borderRadius: 14, backgroundColor: colors.brandPrimary, paddingHorizontal: 18, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8 },
  buttonText: { color: colors.onBrandPrimary, fontSize: 16, fontWeight: "900" },
  secondaryButton: { backgroundColor: colors.surfaceTertiary, borderWidth: 1, borderColor: colors.borderStrong },
  secondaryButtonText: { color: colors.onSurface, fontSize: 16, fontWeight: "800" },
  pressed: { opacity: 0.76, transform: [{ scale: 0.985 }] },
  disabled: { opacity: 0.45 },
}));