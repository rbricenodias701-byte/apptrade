import { MaterialCommunityIcons } from "@expo/vector-icons";
import { router } from "expo-router";
import { useEffect, useState } from "react";
import { KeyboardAvoidingView, Platform, Pressable, StyleSheet, Text, TextInput, View } from "react-native";

import { login, register, TOKEN_KEY } from "@/src/api";
import { storage } from "@/src/utils/storage";
import { useTheme } from "@/src/theme";

export default function AuthScreen() {
  const { colors } = useTheme();
  const [isRegister, setIsRegister] = useState(false);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState("");
  useEffect(() => { storage.secureGet(TOKEN_KEY, null).then((token) => { if (token) router.replace("/(tabs)"); else setBusy(false); }); }, []);
  const submit = async () => {
    setError("");
    if (!email || password.length < 6 || (isRegister && !name)) { setError("Completa los campos. La contraseña debe tener 6 caracteres."); return; }
    setBusy(true);
    try { const response = isRegister ? await register(name, email, password) : await login(email, password); await storage.secureSet(TOKEN_KEY, response.token); router.replace("/(tabs)"); } catch (err) { setError(err instanceof Error ? err.message : "No se pudo iniciar sesión"); setBusy(false); }
  };
  if (busy && !error) return <View style={[styles.loading, { backgroundColor: colors.surface }]}><MaterialCommunityIcons name="chart-line" size={48} color={colors.brandPrimary} /></View>;
  return <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : "height"} style={[styles.root, { backgroundColor: colors.surface }]}><View style={styles.hero}><View style={[styles.logo, { backgroundColor: colors.brandPrimary }]}><MaterialCommunityIcons name="finance" size={30} color={colors.onBrandPrimary} /></View><Text style={[styles.brand, { color: colors.onSurface }]}>Apex<Text style={{ color: colors.brandPrimary }}>Trade</Text></Text><Text style={[styles.tagline, { color: colors.muted }]}>Tu capital. Tus reglas. Tu progreso.</Text></View><View style={[styles.form, { backgroundColor: colors.surfaceSecondary, borderColor: colors.border }]}><Text style={[styles.formTitle, { color: colors.onSurface }]}>{isRegister ? "Crea tu espacio de trading" : "Vuelve a tu control"}</Text>{isRegister ? <TextInput placeholder="Tu nombre" placeholderTextColor={colors.muted} value={name} onChangeText={setName} style={[styles.input, { color: colors.onSurface, borderColor: colors.border }]} /> : null}<TextInput autoCapitalize="none" keyboardType="email-address" placeholder="Correo electrónico" placeholderTextColor={colors.muted} value={email} onChangeText={setEmail} style={[styles.input, { color: colors.onSurface, borderColor: colors.border }]} /><TextInput secureTextEntry placeholder="Contraseña" placeholderTextColor={colors.muted} value={password} onChangeText={setPassword} style={[styles.input, { color: colors.onSurface, borderColor: colors.border }]} />{error ? <Text style={[styles.error, { color: colors.error }]}>{error}</Text> : null}<Pressable disabled={busy} onPress={submit} style={({ pressed }) => [styles.submit, { backgroundColor: colors.brandPrimary, opacity: pressed || busy ? 0.7 : 1 }]}><Text style={[styles.submitText, { color: colors.onBrandPrimary }]}>{busy ? "Cargando…" : isRegister ? "Crear cuenta" : "Entrar"}</Text></Pressable><Pressable onPress={() => { setIsRegister((value) => !value); setError(""); }} style={styles.switch}><Text style={[styles.switchText, { color: colors.onSurfaceSecondary }]}>{isRegister ? "Ya tengo una cuenta" : "Crear una cuenta nueva"}</Text></Pressable></View><Text style={[styles.disclaimer, { color: colors.muted }]}>Gestión personal · Disciplina primero · Información educativa</Text></KeyboardAvoidingView>;
}

const styles = StyleSheet.create({ root: { flex: 1, justifyContent: "center", padding: 24, gap: 26 }, loading: { flex: 1, alignItems: "center", justifyContent: "center" }, hero: { alignItems: "center", gap: 8 }, logo: { width: 66, height: 66, borderRadius: 20, alignItems: "center", justifyContent: "center" }, brand: { fontSize: 34, fontWeight: "900", letterSpacing: -1 }, tagline: { fontSize: 15 }, form: { borderWidth: 1, borderRadius: 20, padding: 20, gap: 13 }, formTitle: { fontSize: 21, fontWeight: "900", marginBottom: 4 }, input: { minHeight: 52, borderWidth: 1, borderRadius: 12, paddingHorizontal: 15, fontSize: 16 }, error: { fontSize: 14, fontWeight: "700" }, submit: { minHeight: 54, borderRadius: 13, alignItems: "center", justifyContent: "center", marginTop: 4 }, submitText: { fontSize: 17, fontWeight: "900" }, switch: { minHeight: 44, alignItems: "center", justifyContent: "center" }, switchText: { fontSize: 15, fontWeight: "800" }, disclaimer: { textAlign: "center", fontSize: 12 } });