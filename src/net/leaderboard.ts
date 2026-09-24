// ─────────────────────────────────────────────────────────────
//  LEADERBOARD CLIENT
//
//  Talks to the Cloudflare Worker, with a local-only fallback so
//  the feature still works (and is demonstrable) when no backend
//  is configured or the network is unavailable.
//
//  Configure the endpoint at build time:
//      VITE_LEADERBOARD_URL=https://your-worker.workers.dev
//
//  With no URL set the game runs in LOCAL mode: scores are kept in
//  localStorage and the board shows this device's own runs, clearly
//  labelled as offline.
// ─────────────────────────────────────────────────────────────

import {
  monthKey, signPayload, validateScorePayload, usernameKey,
  type ScorePayload,
} from "./scoreRules";
import { getDeviceId, getProfile } from "./profile";

const RAW_URL = (import.meta.env?.VITE_LEADERBOARD_URL ?? "").toString().trim();
export const API_BASE = RAW_URL.replace(/\/+$/, "");
export const HAS_BACKEND = API_BASE.length > 0;

const LOCAL_KEY = "shadowstrike.localscores.v1";
const TIMEOUT_MS = 8000;

export interface LeaderEntry {
  rank: number;
  username: string;
  score: number;
  kills: number;
  wave: number;
  accuracy: number;
  difficulty?: string;
  at?: number;
}

export interface LeaderboardData {
  month: string;
  entries: LeaderEntry[];
  you: LeaderEntry | null;
  totalPlayers: number;
  /** true when served from localStorage rather than the backend */
  local: boolean;
}

export interface SubmitResult {
  ok: boolean;
  rank?: number;
  personalBest?: number;
  isPersonalBest?: boolean;
  /** stored locally only (no backend, or the request failed) */
  local?: boolean;
  error?: string;
  /** held in the outbox for a later retry */
  queued?: boolean;
}

export interface RunPayload {
  score: number;
  kills: number;
  wave: number;
  accuracy: number;
  difficulty: string;
  duration: number;
}

// ── local store (fallback + offline outbox) ─────────────────

interface LocalRecord extends ScorePayload {
  at: number;
  month: string;
  /** still awaiting upload to the backend */
  pending?: boolean;
}

function readLocal(): LocalRecord[] {
  try {
    const raw = localStorage.getItem(LOCAL_KEY);
    const arr = raw ? JSON.parse(raw) : [];
    return Array.isArray(arr) ? arr : [];
  } catch {
    return [];
  }
}

function writeLocal(rows: LocalRecord[]) {
  try {
    // keep the store bounded
    localStorage.setItem(LOCAL_KEY, JSON.stringify(rows.slice(-300)));
  } catch {
    /* storage unavailable */
  }
}

function localBoard(month: string, username: string): LeaderboardData {
  const rows = readLocal().filter((r) => r.month === month);
  // best run per name, exactly as the server ranks it
  const best = new Map<string, LocalRecord>();
  for (const r of rows) {
    const k = usernameKey(r.username);
    const cur = best.get(k);
    if (!cur || r.score > cur.score) best.set(k, r);
  }
  const sorted = [...best.values()].sort((a, b) => b.score - a.score || a.at - b.at);
  const entries: LeaderEntry[] = sorted.map((r, i) => ({
    rank: i + 1,
    username: r.username,
    score: r.score,
    kills: r.kills,
    wave: r.wave,
    accuracy: r.accuracy,
    difficulty: r.difficulty,
    at: r.at,
  }));
  const key = usernameKey(username);
  const you = entries.find((e) => usernameKey(e.username) === key) ?? null;
  return { month, entries, you, totalPlayers: entries.length, local: true };
}

function storeLocal(p: ScorePayload, pending: boolean) {
  const rows = readLocal();
  rows.push({ ...p, at: Date.now(), month: monthKey(), pending });
  writeLocal(rows);
}

// ── fetch with timeout ──────────────────────────────────────

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

/**
 * Map transport errors onto messages a player can act on.
 * Wording differs per engine — Chrome "Failed to fetch", Firefox
 * "NetworkError...", Safari "Load failed", undici "fetch failed" —
 * so match generously and never surface a raw stack to the UI.
 */
function friendlyError(e: unknown): string {
  const msg = (e instanceof Error ? e.message : String(e)) || "";
  if (/abort|timeout|timed out/i.test(msg)) {
    return "The server took too long to respond.";
  }
  if (/fetch|network|load failed|connect|refused|dns|offline|socket/i.test(msg)) {
    return "Couldn't reach the leaderboard server.";
  }
  // server-sent messages are already player-facing; anything else is
  // an internal detail we should not show verbatim
  if (msg.length > 0 && msg.length <= 120 && !/\bat\s|\n/.test(msg)) return msg;
  return "Something went wrong. Please try again.";
}

// ── public API ──────────────────────────────────────────────

/** Fetch the current (or a given) month's ranking. Never throws. */
export async function fetchLeaderboard(
  month: string = monthKey(),
  limit = 50
): Promise<{ data: LeaderboardData | null; error: string | null }> {
  const username = getProfile().username;

  if (!HAS_BACKEND) {
    return { data: localBoard(month, username), error: null };
  }

  try {
    const qs = new URLSearchParams({ month, limit: String(limit) });
    if (username) qs.set("user", username);
    const res = await request(`/api/leaderboard?${qs}`);
    const entries: LeaderEntry[] = Array.isArray(res?.entries) ? res.entries : [];
    return {
      data: {
        month: res?.month ?? month,
        entries,
        you: res?.you ?? null,
        totalPlayers: res?.totalPlayers ?? entries.length,
        local: false,
      },
      error: null,
    };
  } catch (e) {
    // fall back to whatever this device knows, and say so
    const fallback = localBoard(month, username);
    return {
      data: fallback.entries.length ? fallback : null,
      error: friendlyError(e),
    };
  }
}

/**
 * Submit a finished run. Always records locally first so a score is
 * never lost, then tries the backend. Never throws.
 */
export async function submitScore(run: RunPayload): Promise<SubmitResult> {
  const profile = getProfile();
  if (!profile.username || !profile.confirmed) {
    return { ok: false, error: "No username set" };
  }

  const payload: ScorePayload = {
    username: profile.username,
    score: Math.round(run.score),
    kills: Math.round(run.kills),
    wave: Math.round(run.wave),
    accuracy: Math.round(run.accuracy),
    difficulty: run.difficulty,
    duration: Math.round(run.duration),
  };

  // client-side pre-check using the very same rules the server runs,
  // so a malformed run never burns a request
  const v = validateScorePayload(payload);
  if (!v.ok) return { ok: false, error: v.reason };

  if (!HAS_BACKEND) {
    storeLocal(payload, false);
    const board = localBoard(monthKey(), payload.username);
    return { ok: true, local: true, rank: board.you?.rank, personalBest: board.you?.score };
  }

  try {
    const res = await request("/api/score", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ...payload,
        device: getDeviceId(),
        sig: signPayload(payload),
      }),
    });
    storeLocal(payload, false);
    return {
      ok: true,
      rank: res?.rank,
      personalBest: res?.personalBest,
      isPersonalBest: res?.isPersonalBest,
    };
  } catch (e) {
    // keep it in the outbox; flushed on the next successful contact
    storeLocal(payload, true);
    return { ok: false, queued: true, error: friendlyError(e) };
  }
}

/**
 * Retry any submissions that failed earlier. Safe to call on
 * startup and whenever the leaderboard screen opens.
 */
export async function flushPending(): Promise<number> {
  if (!HAS_BACKEND) return 0;
  const rows = readLocal();
  const pending = rows.filter((r) => r.pending);
  if (!pending.length) return 0;

  let sent = 0;
  for (const r of pending.slice(0, 5)) {
    try {
      await request("/api/score", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          username: r.username, score: r.score, kills: r.kills, wave: r.wave,
          accuracy: r.accuracy, difficulty: r.difficulty, duration: r.duration,
          device: getDeviceId(),
          sig: signPayload(r),
        }),
      });
      r.pending = false;
      sent++;
    } catch {
      break; // still offline — stop and try again later
    }
  }
  if (sent) writeLocal(rows);
  return sent;
}

/** how many runs are waiting to upload */
export function pendingCount(): number {
  return readLocal().filter((r) => r.pending).length;
}

/** best local score for the current month, for the menu readout */
export function localBestThisMonth(): number {
  const m = monthKey();
  return readLocal()
    .filter((r) => r.month === m)
    .reduce((best, r) => Math.max(best, r.score), 0);
}
