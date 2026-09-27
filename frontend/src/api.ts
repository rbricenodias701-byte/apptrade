import Constants from "expo-constants";

import { storage } from "@/src/utils/storage";

const configuredUrl = Constants.expoConfig?.extra?.backendUrl ?? process.env.EXPO_PUBLIC_BACKEND_URL;
if (!configuredUrl) throw new Error("EXPO_PUBLIC_BACKEND_URL is required");
const API_URL = `${String(configuredUrl).replace(/\/$/, "")}/api`;
export const TOKEN_KEY = "apextrade_token";
export const ACCOUNT_KEY = "apextrade_account";

export type User = { id: string; name: string; email: string };
export type Account = { id: string; name: string; initial_capital: number; currency: string; target_mode: "amount" | "percentage"; daily_target: number; monthly_target: number; stop_after_losses: number };
export type Trade = { id: string; account_id: string; symbol: string; side: string; result: "win" | "loss" | "breakeven"; pnl: number; entry_date: string; review: string; created_at: string };
export type Dashboard = { account: Account; capital: number; total_pnl: number; daily_pnl: number; monthly_pnl: number; daily_target: number; monthly_target: number; daily_progress: number; monthly_progress: number; trades_count: number; today_trades: number; consecutive_losses: number; should_stop: boolean; recent_trades: Trade[] };

async function token() {
  return storage.secureGet(TOKEN_KEY, null);
}

export async function getSelectedAccount(accounts: Account[]) {
  const saved = await storage.getItem(ACCOUNT_KEY, null);
  return accounts.find((item) => item.id === saved) || accounts[0] || null;
}

export async function apiFetch<T>(path: string, init: RequestInit = {}): Promise<T> {
  const auth = await token();
  const response = await fetch(`${API_URL}${path}`, {
    ...init,
    headers: { "Content-Type": "application/json", ...(auth ? { Authorization: `Bearer ${auth}` } : {}), ...(init.headers || {}) },
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(body.detail || "No se pudo completar la solicitud");
  return body as T;
}

export async function login(email: string, password: string) { return apiFetch<{ token: string; user: User; account: Account }>("/auth/login", { method: "POST", body: JSON.stringify({ email, password }) }); }
export async function register(name: string, email: string, password: string) { return apiFetch<{ token: string; user: User; account: Account }>("/auth/register", { method: "POST", body: JSON.stringify({ name, email, password }) }); }
export async function getAccounts() { return apiFetch<Account[]>("/accounts"); }
export async function createAccount(payload: Omit<Account, "id">) { return apiFetch<Account>("/accounts", { method: "POST", body: JSON.stringify(payload) }); }
export async function updateAccount(id: string, payload: Partial<Account>) { return apiFetch<Account>(`/accounts/${id}`, { method: "PATCH", body: JSON.stringify(payload) }); }
export async function deleteAccount(id: string) { return apiFetch<{ ok: boolean }>(`/accounts/${id}`, { method: "DELETE" }); }
export async function getDashboard(accountId: string) { return apiFetch<Dashboard>(`/dashboard?account_id=${encodeURIComponent(accountId)}`); }
export async function getTrades(accountId: string) { return apiFetch<Trade[]>(`/trades?account_id=${encodeURIComponent(accountId)}`); }
export async function createTrade(payload: Omit<Trade, "id" | "created_at">) { return apiFetch<Trade>("/trades", { method: "POST", body: JSON.stringify(payload) }); }
export async function updateTrade(id: string, payload: Omit<Trade, "id" | "created_at">) { return apiFetch<Trade>(`/trades/${id}`, { method: "PATCH", body: JSON.stringify(payload) }); }
export async function deleteTrade(id: string, accountId: string) { return apiFetch<{ ok: boolean }>(`/trades/${id}?account_id=${accountId}`, { method: "DELETE" }); }
export async function getNotes(accountId: string) { return apiFetch<{ id: string; text: string; mood: string; created_at: string }[]>(`/notes?account_id=${accountId}`); }
export async function createNote(payload: { account_id: string; text: string; mood: string }) { return apiFetch<{ id: string; text: string; mood: string; created_at: string }>("/notes", { method: "POST", body: JSON.stringify(payload) }); }
export async function deleteNote(id: string, accountId: string) { return apiFetch<{ ok: boolean }>(`/notes/${id}?account_id=${accountId}`, { method: "DELETE" }); }
export async function getBriefing(accountId: string, question: string) { return apiFetch<{ text: string; market: { available: boolean; price?: number; change?: number; change_pct?: number; message?: string }; generated_at: string }>("/ai/briefing", { method: "POST", body: JSON.stringify({ account_id: accountId, question }) }); }
export function reportUrl(accountId: string, period: string) { return `${API_URL}/reports/pdf?account_id=${encodeURIComponent(accountId)}&period=${period}`; }

export type MarketQuote = { available: boolean; price?: number; change?: number; change_pct?: number; previous_close?: number };
export type MarketAccumulation = { present: boolean; window?: number; range_high?: number; range_low?: number; body_high?: number; body_low?: number; equal_highs?: number; equal_lows?: number; atr?: number; height?: number };
export type MarketManipulation = { present: boolean; direction?: "long" | "short"; level?: number; target_entry?: number | null; stage?: "listo_para_retest" | "sweep_hecho_esperando_choch" };
export type MarketTimeframe = { trend: "alcista" | "bajista" | "neutral"; accumulation: MarketAccumulation; manipulation: MarketManipulation; last_price: number; last_time: string };
export type MarketAlignment = { aligned: boolean; strong: boolean; direction: "long" | "short" | null; message: string };
export type MarketAnalysis = { quote: MarketQuote; five_min: MarketTimeframe; one_hour: MarketTimeframe; alignment: MarketAlignment; generated_at: string; new_signal: boolean };
export type MarketSignal = { id: string; direction: "long" | "short"; strong: boolean; price: number; message: string; created_at: string };
export type LotResult = { lots: number; micro_lots: number; risk_amount: number; stop_distance: number; dollar_per_lot: number; reward_1r: number; reward_2r: number; reward_3r: number };

export async function getMarketAnalysis() { return apiFetch<MarketAnalysis>("/market/xauusd"); }
export async function getMarketSignals() { return apiFetch<MarketSignal[]>("/market/signals"); }
export async function calcLot(payload: { capital: number; risk_mode: "percentage" | "amount"; risk_value: number; entry_price: number; stop_loss: number; contract_size?: number }) { return apiFetch<LotResult>("/tools/lot-size", { method: "POST", body: JSON.stringify({ contract_size: 100, ...payload }) }); }
