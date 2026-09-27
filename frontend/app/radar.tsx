import { MaterialCommunityIcons } from "@expo/vector-icons";
import { router, useFocusEffect } from "expo-router";
import { useCallback, useEffect, useRef, useState } from "react";
import { ActivityIndicator, Text, View } from "react-native";

import { getMarketAnalysis, getMarketSignals, MarketAnalysis, MarketSignal, MarketTimeframe } from "@/src/api";
import { AppScroll, Card, Heading, PrimaryButton, SmallIconButton } from "@/src/components/trading-ui";
import { makeStyles, useTheme } from "@/src/theme";

const trendLabel: Record<string, string> = { alcista: "ALCISTA", bajista: "BAJISTA", neutral: "NEUTRA" };
const stageLabel: Record<string, string> = { listo_para_retest: "MANIPULACIÓN COMPLETA · ESPERÁ RETESTEO", sweep_hecho_esperando_choch: "SWEEP HECHO · ESPERANDO CHOCH" };

export default function RadarScreen() {
  const { colors } = useTheme();
  const styles = useStyles();
  const [data, setData] = useState<MarketAnalysis | null>(null);
  const [signals, setSignals] = useState<MarketSignal[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [countdown, setCountdown] = useState(60);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const load = useCallback(async () => {
    try {
      setError(null);
      const [analysis, history] = await Promise.all([getMarketAnalysis(), getMarketSignals()]);
      setData(analysis);
      setSignals(history);
      setCountdown(60);
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo consultar el mercado");
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  useEffect(() => {
    if (timerRef.current) clearInterval(timerRef.current);
    timerRef.current = setInterval(() => {
      setCountdown((prev) => {
        if (prev <= 1) { load(); return 60; }
        return prev - 1;
      });
    }, 1000);
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [load]);

  const renderTimeframe = (label: string, tf: MarketTimeframe | undefined) => {
    if (!tf) return null;
    const acc = tf.accumulation;
    const man = tf.manipulation;
    return (
      <Card testID={`radar-tf-${tf.last_time || label}`.replace(/\s+/g, "-")}>
        <View style={styles.tfHeader}>
          <View>
            <Text style={styles.eyebrow}>TEMPORALIDAD</Text>
            <Text style={styles.tfTitle}>{label}</Text>
          </View>
          <View style={[styles.trendPill, tf.trend === "alcista" ? styles.trendUp : tf.trend === "bajista" ? styles.trendDown : styles.trendNeutral]}>
            <MaterialCommunityIcons name={tf.trend === "alcista" ? "trending-up" : tf.trend === "bajista" ? "trending-down" : "swap-horizontal"} size={16} color={colors.onBrandPrimary} />
            <Text style={styles.trendText}>{trendLabel[tf.trend]}</Text>
          </View>
        </View>
        <View style={styles.stageRow}>
          <View style={[styles.dot, { backgroundColor: acc.present ? colors.success : colors.muted }]} />
          <Text style={styles.stageLabel}>Acumulación</Text>
          <Text style={styles.stageValue}>{acc.present ? `Rango ${acc.range_low}–${acc.range_high} · ${acc.window} velas` : "No detectada"}</Text>
        </View>
        <View style={styles.stageRow}>
          <View style={[styles.dot, { backgroundColor: man.present ? (man.stage === "listo_para_retest" ? colors.brandPrimary : colors.warning) : colors.muted }]} />
          <Text style={styles.stageLabel}>Manipulación</Text>
          <Text style={styles.stageValue}>{man.present ? `${man.direction === "long" ? "COMPRA" : "VENTA"} · ${stageLabel[man.stage || "sweep_hecho_esperando_choch"]}` : "Sin señal"}</Text>
        </View>
        {man.present && man.target_entry ? (
          <View style={styles.entryBox}>
            <Text style={styles.entryLabel}>ZONA DE RETESTEO SUGERIDA</Text>
            <Text style={styles.entryPrice}>{man.target_entry}</Text>
          </View>
        ) : null}
      </Card>
    );
  };

  return (
    <AppScroll testID="radar-screen">
      <View style={styles.topRow}>
        <SmallIconButton icon="arrow-left" label="Volver" onPress={() => router.back()} testID="radar-back" />
        <Heading eyebrow="RADAR ORO" title="XAU/USD" subtitle="Acumulación → Manipulación → Distribución" />
      </View>

      <Card accent={data?.alignment?.aligned} testID="radar-quote-card">
        <View style={styles.quoteRow}>
          <View style={{ flex: 1 }}>
            <Text style={styles.eyebrow}>PRECIO ACTUAL</Text>
            {data?.quote?.available ? (
              <>
                <Text style={styles.price}>{data.quote.price?.toFixed(2)}</Text>
                <Text style={[styles.change, { color: (data.quote.change || 0) >= 0 ? colors.success : colors.error }]}>
                  {(data.quote.change || 0) >= 0 ? "+" : ""}{data.quote.change?.toFixed(2)} ({data.quote.change_pct?.toFixed(2)}%)
                </Text>
              </>
            ) : (
              <Text style={styles.muted}>Precio no disponible</Text>
            )}
          </View>
          <View style={styles.countdown}>
            <MaterialCommunityIcons name="refresh" size={16} color={colors.brandPrimary} />
            <Text style={styles.countdownText}>{countdown}s</Text>
          </View>
        </View>
        {data?.alignment ? (
          <View style={[styles.alignBanner, data.alignment.aligned ? (data.alignment.strong ? styles.alignStrong : styles.alignSoft) : styles.alignNone]}>
            <MaterialCommunityIcons
              name={data.alignment.aligned ? (data.alignment.direction === "long" ? "arrow-up-bold-circle" : "arrow-down-bold-circle") : "eye-outline"}
              size={22}
              color={data.alignment.aligned ? colors.onBrandPrimary : colors.onSurface}
            />
            <Text style={[styles.alignText, { color: data.alignment.aligned ? colors.onBrandPrimary : colors.onSurface }]}>{data.alignment.message}</Text>
          </View>
        ) : null}
      </Card>

      {loading && !data ? <ActivityIndicator color={colors.brandPrimary} /> : null}
      {error ? <Card><Text style={styles.error}>{error}</Text><PrimaryButton title="Reintentar" onPress={load} icon="refresh" /></Card> : null}

      {renderTimeframe("5 MINUTOS", data?.five_min)}
      {renderTimeframe("1 HORA", data?.one_hour)}

      <Card>
        <Text style={styles.cardTitle}>Historial de señales</Text>
        {signals.length === 0 ? <Text style={styles.muted}>Aún no hay señales detectadas. La app está vigilando el mercado por ti.</Text> : signals.slice(0, 10).map((s) => (
          <View key={s.id} style={styles.signalRow} testID={`signal-${s.id}`}>
            <View style={[styles.signalDir, { backgroundColor: s.direction === "long" ? colors.success : colors.error }]}>
              <MaterialCommunityIcons name={s.direction === "long" ? "trending-up" : "trending-down"} size={14} color={colors.onBrandPrimary} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.signalTitle}>{s.direction === "long" ? "COMPRA" : "VENTA"} @ {s.price.toFixed(2)}{s.strong ? " · FUERTE" : ""}</Text>
              <Text style={styles.muted} numberOfLines={2}>{s.message}</Text>
              <Text style={styles.mutedSmall}>{new Date(s.created_at).toLocaleString("es-ES")}</Text>
            </View>
          </View>
        ))}
      </Card>

      <PrimaryButton title="Abrir calculadora de lotaje" icon="calculator-variant" secondary onPress={() => router.push("/calculator")} testID="open-calculator" />

      <Card>
        <Text style={styles.disclaimer}>Esta detección es una guía educativa basada en compresión de rango, sweep y CHoCH. No es asesoría financiera. Confirmá con tu criterio antes de operar.</Text>
      </Card>
    </AppScroll>
  );
}

const useStyles = makeStyles((colors) => ({
  topRow: { flexDirection: "row", alignItems: "flex-start", gap: 12 },
  eyebrow: { color: colors.brandPrimary, fontSize: 11, fontWeight: "900", letterSpacing: 1.2 },
  quoteRow: { flexDirection: "row", alignItems: "flex-start" },
  price: { color: colors.onSurface, fontSize: 34, fontWeight: "900", marginTop: 4 },
  change: { fontSize: 15, fontWeight: "800", marginTop: 2 },
  muted: { color: colors.muted, fontSize: 13, lineHeight: 19 },
  mutedSmall: { color: colors.muted, fontSize: 11, marginTop: 4 },
  countdown: { flexDirection: "row", alignItems: "center", gap: 4, backgroundColor: colors.surfaceTertiary, paddingHorizontal: 10, paddingVertical: 6, borderRadius: 12 },
  countdownText: { color: colors.brandPrimary, fontWeight: "900", fontSize: 12 },
  alignBanner: { flexDirection: "row", alignItems: "center", gap: 10, padding: 12, borderRadius: 12 },
  alignStrong: { backgroundColor: colors.brandPrimary },
  alignSoft: { backgroundColor: colors.brandSecondary },
  alignNone: { backgroundColor: colors.surfaceTertiary },
  alignText: { flex: 1, fontSize: 13, fontWeight: "700", lineHeight: 18 },
  tfHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  tfTitle: { color: colors.onSurface, fontSize: 20, fontWeight: "900", marginTop: 2 },
  trendPill: { flexDirection: "row", alignItems: "center", gap: 4, paddingHorizontal: 10, paddingVertical: 6, borderRadius: 12 },
  trendUp: { backgroundColor: colors.success },
  trendDown: { backgroundColor: colors.error },
  trendNeutral: { backgroundColor: colors.muted },
  trendText: { color: colors.onBrandPrimary, fontWeight: "900", fontSize: 11, letterSpacing: 0.8 },
  stageRow: { flexDirection: "row", alignItems: "center", gap: 8, paddingVertical: 4 },
  dot: { width: 10, height: 10, borderRadius: 5 },
  stageLabel: { color: colors.onSurfaceSecondary, fontSize: 13, fontWeight: "800", width: 110 },
  stageValue: { flex: 1, color: colors.onSurface, fontSize: 13, fontWeight: "700" },
  entryBox: { padding: 12, borderRadius: 12, backgroundColor: colors.brandTertiary, borderWidth: 1, borderColor: colors.brandPrimary, gap: 4 },
  entryLabel: { color: colors.brandPrimary, fontSize: 11, fontWeight: "900", letterSpacing: 0.8 },
  entryPrice: { color: colors.onSurface, fontSize: 24, fontWeight: "900" },
  cardTitle: { color: colors.onSurface, fontSize: 17, fontWeight: "900" },
  signalRow: { flexDirection: "row", gap: 10, paddingVertical: 10, borderTopWidth: 1, borderTopColor: colors.divider, alignItems: "flex-start" },
  signalDir: { width: 26, height: 26, borderRadius: 13, alignItems: "center", justifyContent: "center", marginTop: 2 },
  signalTitle: { color: colors.onSurface, fontWeight: "900", fontSize: 14 },
  error: { color: colors.error, fontWeight: "800" },
  disclaimer: { color: colors.muted, fontSize: 12, lineHeight: 17, fontStyle: "italic" },
}));
