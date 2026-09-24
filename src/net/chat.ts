// ─────────────────────────────────────────────────────────────
//  LEADERBOARD CHAT CLIENT
//
//  A lightweight polling chat scoped to the leaderboard screen.
//  Only a name's claimed owner (see profile.ts / worker's
//  usernames table) can speak as that name — the server enforces
//  this the same way it enforces score-submission ownership.
//
//  Requires a backend (VITE_LEADERBOARD_URL). With none configured
//  the chat simply reports itself unavailable — there's no shared
//  place for messages to live.
// ─────────────────────────────────────────────────────────────

import { getDeviceId, getProfile } from "./profile";

const RAW_URL = (import.meta.env?.VITE_LEADERBOARD_URL ?? "").toString().trim();
const API_BASE = RAW_URL.replace(/\/+$/, "");
export const CHAT_AVAILABLE = API_BASE.length > 0;

const TIMEOUT_MS = 8000;
export const CHAT_TEXT_MAX = 200;

export interface ChatMessage {
  id: number;
  username: string;
  text: string;
  created_at: number;
}

async function request(path: string, init?: RequestInit): Promise<any> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(`${API_BASE}${path}`, { ...init, signal: ctrl.signal });
    const text = await res.text();
    let data: any = null;
    try {
      data = text ? JSON.parse(text) : null;
    } catch {
      throw new Error(`Unexpected response from server (${res.status})`);
    }
    if (!res.ok) throw new Error(data?.error || `Server returned ${res.status}`);
    return data;
  } finally {
    clearTimeout(timer);
  }
}

function friendlyError(e: unknown): string {
  const msg = (e instanceof Error ? e.message : String(e)) || "";
  if (/abort|timeout|timed out/i.test(msg)) return "The server took too long to respond.";
  if (/fetch|network|load failed|connect|refused|dns|offline|socket/i.test(msg)) {
    return "Couldn't reach the chat server.";
  }
  if (msg.length > 0 && msg.length <= 120 && !/\bat\s|\n/.test(msg)) return msg;
  return "Something went wrong. Please try again.";
}

/** Fetch messages newer than `since` (a created_at timestamp), or the
 *  most recent `limit` messages when `since` is 0. Never throws. */
export async function fetchChat(
  since = 0,
  limit = 50
): Promise<{ messages: ChatMessage[]; serverTime: number | null; error: string | null }> {
  if (!CHAT_AVAILABLE) {
    return { messages: [], serverTime: null, error: "Chat needs a backend — none is configured." };
  }
  try {
    const qs = new URLSearchParams({ since: String(since), limit: String(limit) });
    const res = await request(`/api/chat?${qs}`);
    const messages: ChatMessage[] = Array.isArray(res?.messages) ? res.messages : [];
    return { messages, serverTime: res?.serverTime ?? null, error: null };
  } catch (e) {
    return { messages: [], serverTime: null, error: friendlyError(e) };
  }
}

/** Send a chat message as the player's claimed username. Never throws. */
export async function sendChat(text: string): Promise<{ ok: boolean; error?: string }> {
  const profile = getProfile();
  if (!profile.username || !profile.confirmed) {
    return { ok: false, error: "Set a callsign before chatting" };
  }
  const trimmed = text.trim();
  if (!trimmed) return { ok: false, error: "Message is empty" };
  if (trimmed.length > CHAT_TEXT_MAX) {
    return { ok: false, error: `Message exceeds ${CHAT_TEXT_MAX} characters` };
  }
  if (!CHAT_AVAILABLE) {
    return { ok: false, error: "Chat needs a backend — none is configured." };
  }

  try {
    await request("/api/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username: profile.username, device: getDeviceId(), text: trimmed }),
    });
    return { ok: true };
  } catch (e) {
    return { ok: false, error: friendlyError(e) };
  }
}
