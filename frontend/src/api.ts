import Constants from "expo-constants";

import { storage } from "@/src/utils/storage";

const configuredUrl = Constants.expoConfig?.extra?.backendUrl ?? process.env.EXPO_PUBLIC_BACKEND_URL;
const API_URL = `${String(configuredUrl).replace(/\/$/, "")}/api`;
export const TOKEN_KEY = "apextrade_token";

export type User = { id: string; name: string; email: string };
export type Account = { id: string; name: string; initial_capital: number; currency: string; target_mode: "amount" | "percentage"; daily_target: number; monthly_target: number; stop_after_losses: number };
export type Trade = { id: string; account_id: string; symbol: string; side: string; result: "win" | "loss" | "breakeven"; pnl: number; entry_date: string; review: string; created_at: string };
export type Dashboard = { account: Account; capital: number; total_pnl: number; daily_pnl: number; monthly_pnl: number; daily_target: number; monthly_target: number; daily_progress: number; monthly_progress: number; trades_count: number; today_trades: number; consecutive_losses: number; should_stop: boolean; recent_trades: Trade[] };

async function token() {
  return storage.secureGet(TOKEN_KEY, null);
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