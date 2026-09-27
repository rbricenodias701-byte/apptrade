import { router } from "expo-router";
import { useState } from "react";
import { Pressable, Text, TextInput, View } from "react-native";

import { calcLot, LotResult } from "@/src/api";
import { AppScroll, Card, Heading, PrimaryButton, SmallIconButton } from "@/src/components/trading-ui";
import { makeStyles, useTheme } from "@/src/theme";

export default function CalculatorScreen() {
  const { colors } = useTheme();
  const styles = useStyles();
  const [capital, setCapital] = useState("10000");
  const [mode, setMode] = useState<"percentage" | "amount">("percentage");
  const [risk, setRisk] = useState("1");
  const [entry, setEntry] = useState("");
  const [stop, setStop] = useState("");
  const [contract, setContract] = useState("100");
  const [result, setResult] = useState<LotResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const compute = async () => {
    try {
      setError(null);
      const payload = {
        capital: Number(capital),
        risk_mode: mode,
        risk_value: Number(risk),
        entry_price: Number(entry),
        stop_loss: Number(stop),
        contract_size: Number(contract) || 100,
      };
      const data = await calcLot(payload);
      setResult(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo calcular");
    }
  };

  return (
    <AppScroll testID="calculator-screen">
      <View style={styles.topRow}>
        <SmallIconButton icon="arrow-left" label="Volver" onPress={() => router.back()} testID="calc-back" />
        <Heading eyebrow="CALCULADORA" title="Lotaje seguro" subtitle="Definí cuánto arriesgar y la app te dice el lote exacto." />
      </View>

      <Card>
        <Text style={styles.label}>Capital disponible (USD)</Text>
        <TextInput testID="calc-capital" style={styles.input} value={capital} onChangeText={setCapital} keyboardType="decimal-pad" placeholderTextColor={colors.muted} />

        <Text style={styles.label}>Riesgo por operación</Text>
        <View style={styles.modeRow}>
          <Pressable testID="calc-mode-percentage" onPress={() => setMode("percentage")} style={[styles.mode, mode === "percentage" && styles.modeActive]}><Text style={styles.modeText}>% del capital</Text></Pressable>
          <Pressable testID="calc-mode-amount" onPress={() => setMode("amount")} style={[styles.mode, mode === "amount" && styles.modeActive]}><Text style={styles.modeText}>Monto fijo $</Text></Pressable>
        </View>
        <TextInput testID="calc-risk" style={styles.input} value={risk} onChangeText={setRisk} keyboardType="decimal-pad" placeholder={mode === "percentage" ? "Ej: 1 (=1%)" : "Ej: 50 (=$50)"} placeholderTextColor={colors.muted} />

        <Text style={styles.label}>Precio de entrada</Text>
        <TextInput testID="calc-entry" style={styles.input} value={entry} onChangeText={setEntry} keyboardType="decimal-pad" placeholder="Ej: 4286.50" placeholderTextColor={colors.muted} />

        <Text style={styles.label}>Precio del stop loss</Text>
        <TextInput testID="calc-stop" style={styles.input} value={stop} onChangeText={setStop} keyboardType="decimal-pad" placeholder="Ej: 4283.50" placeholderTextColor={colors.muted} />

        <Text style={styles.label}>Tamaño del contrato (oz por lote)</Text>
        <TextInput testID="calc-contract" style={styles.input} value={contract} onChangeText={setContract} keyboardType="decimal-pad" placeholderTextColor={colors.muted} />
        <Text style={styles.hint}>XAU/USD estándar = 100 oz por lote. Cambialo si tu broker usa contratos distintos.</Text>

        <PrimaryButton testID="calc-submit" title="Calcular lotaje" icon="calculator-variant" onPress={compute} disabled={!capital || !risk || !entry || !stop} />
        {error ? <Text style={styles.error}>{error}</Text> : null}
      </Card>

      {result ? (
        <Card accent testID="calc-result">
          <Text style={styles.eyebrow}>RESULTADO</Text>
          <Text style={styles.lots}>{result.lots} <Text style={styles.lotsUnit}>lotes</Text></Text>
          <Text style={styles.microlots}>≈ {result.micro_lots} micro lotes (0.01)</Text>
          <View style={styles.divider} />
          <Row label="Riesgo real" value={`$${result.risk_amount}`} />
          <Row label="Distancia al stop" value={`${result.stop_distance} pts`} />
          <Row label="Valor por lote (SL completo)" value={`$${result.dollar_per_lot}`} />
          <View style={styles.divider} />
          <Text style={styles.eyebrow}>METAS SEGÚN RIESGO</Text>
          <Row label="Meta 1R (recuperar riesgo)" value={`+$${result.reward_1r}`} tone="success" />
          <Row label="Meta 2R" value={`+$${result.reward_2r}`} tone="success" />
          <Row label="Meta 3R" value={`+$${result.reward_3r}`} tone="success" />
        </Card>
      ) : null}
    </AppScroll>
  );
}

function Row({ label, value, tone }: { label: string; value: string; tone?: "success" }) {
  const styles = useStyles();
  return (
    <View style={styles.row}>
      <Text style={styles.rowLabel}>{label}</Text>
      <Text style={[styles.rowValue, tone === "success" && styles.rowValueSuccess]}>{value}</Text>
    </View>
  );
}

const useStyles = makeStyles((colors) => ({
  topRow: { flexDirection: "row", alignItems: "flex-start", gap: 12 },
  label: { color: colors.onSurfaceSecondary, fontSize: 14, fontWeight: "800", marginTop: 4 },
  hint: { color: colors.muted, fontSize: 12, lineHeight: 17, marginTop: -4 },
  input: { minHeight: 52, borderRadius: 12, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surfaceTertiary, color: colors.onSurface, paddingHorizontal: 14, fontSize: 17, fontWeight: "700" },
  modeRow: { flexDirection: "row", gap: 8 },
  mode: { flex: 1, minHeight: 46, borderRadius: 12, alignItems: "center", justifyContent: "center", backgroundColor: colors.surfaceTertiary },
  modeActive: { backgroundColor: colors.brandTertiary, borderWidth: 1, borderColor: colors.brandPrimary },
  modeText: { color: colors.onSurface, fontWeight: "900" },
  error: { color: colors.error, fontWeight: "800" },
  eyebrow: { color: colors.brandPrimary, fontSize: 12, fontWeight: "900", letterSpacing: 1.2 },
  lots: { color: colors.onSurface, fontSize: 40, fontWeight: "900" },
  lotsUnit: { color: colors.brandPrimary, fontSize: 20 },
  microlots: { color: colors.muted, fontSize: 14, fontWeight: "700" },
  divider: { height: 1, backgroundColor: colors.divider, marginVertical: 4 },
  row: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingVertical: 4 },
  rowLabel: { color: colors.onSurfaceSecondary, fontSize: 14, fontWeight: "700" },
  rowValue: { color: colors.onSurface, fontSize: 16, fontWeight: "900" },
  rowValueSuccess: { color: colors.success },
}));
