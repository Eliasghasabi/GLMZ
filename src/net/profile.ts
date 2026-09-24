// ─────────────────────────────────────────────────────────────
//  PLAYER PROFILE
//
//  Username + an opaque device id, persisted locally so the player
//  is remembered between sessions on this device.
//
//  Deliberately independent of gameplay code — the game never
//  imports this directly, only the score service and the UI do.
// ─────────────────────────────────────────────────────────────

import { validateUsername, usernameKey, type ValidationResult } from "./scoreRules";

const RAW_URL = (import.meta.env?.VITE_LEADERBOARD_URL ?? "").toString().trim();
const API_BASE = RAW_URL.replace(/\/+$/, "");
const HAS_BACKEND = API_BASE.length > 0;

const PROFILE_KEY = "shadowstrike.profile.v1";

export interface Profile {
  username: string;
  /** opaque per-device id used for rate limiting; not personal data */
  deviceId: string;
  /** set once the player has explicitly confirmed a name */
  confirmed: boolean;
  createdAt: number;
}

function randomId(): string {
  try {
    const a = new Uint8Array(16);
    crypto.getRandomValues(a);
    return [...a].map((b) => b.toString(16).padStart(2, "0")).join("");
  } catch {
    return Math.random().toString(36).slice(2) + Date.now().toString(36);
  }
}

function read(): Profile | null {
  try {
    const raw = localStorage.getItem(PROFILE_KEY);
    if (!raw) return null;
    const p = JSON.parse(raw) as Profile;
    if (typeof p?.username !== "string") return null;
    return {
      username: p.username,
      deviceId: typeof p.deviceId === "string" && p.deviceId ? p.deviceId : randomId(),
      confirmed: !!p.confirmed,
      createdAt: typeof p.createdAt === "number" ? p.createdAt : Date.now(),
    };
  } catch {
    return null;
  }
}

let cached: Profile = read() ?? {
  username: "",
  deviceId: randomId(),
  confirmed: false,
  createdAt: Date.now(),
};

const listeners = new Set<(p: Profile) => void>();

function persist() {
  try {
    localStorage.setItem(PROFILE_KEY, JSON.stringify(cached));
  } catch {
    /* storage unavailable — keep working in memory */
  }
  for (const fn of listeners) fn(cached);
}

export function getProfile(): Profile {
  return cached;
}

export function onProfileChange(fn: (p: Profile) => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

/** true until the player has picked a name (drives the first-run prompt) */
export function needsUsername(): boolean {
  return !cached.confirmed || !cached.username;
}

export function checkUsername(name: string): ValidationResult {
  return validateUsername(name);
}

/**
 * Ask the server whether this name is free. Telegram-style: a name
 * belongs to whoever claims it first, across every device. With no
 * backend configured (offline/demo mode) this always says "available"
 * — there's no shared registry to check against.
 */
export async function checkUsernameAvailable(name: string): Promise<ValidationResult> {
  const local = validateUsername(name);
  if (!local.ok) return local;
  if (!HAS_BACKEND) return { ok: true };

  // the player's own current name is always "available" to them
  if (usernameKey(name) === usernameKey(cached.username) && cached.confirmed) {
    return { ok: true };
  }

  try {
    const qs = new URLSearchParams({ name, device: cached.deviceId });
    const res = await fetch(`${API_BASE}/api/validate-name?${qs}`, {
      signal: AbortSignal.timeout(6000),
    });
    const data = await res.json();
    return data?.ok ? { ok: true } : { ok: false, reason: data?.error || "That name is taken" };
  } catch {
    // network hiccup — don't block the player on a connectivity issue;
    // the claim on confirm still enforces uniqueness server-side
    return { ok: true };
  }
}

/**
 * Save a username. Claims it on the server first (Telegram-style: first
 * device to claim a name owns it) before persisting locally, so two
 * players can never end up sharing one name. Only saves when valid
 * and, if a backend is configured, successfully claimed.
 */
export async function setUsername(name: string): Promise<ValidationResult> {
  const res = validateUsername(name);
  if (!res.ok) return res;

  if (HAS_BACKEND) {
    try {
      const r = await fetch(`${API_BASE}/api/username/claim`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        signal: AbortSignal.timeout(8000),
        body: JSON.stringify({ username: name.trim(), device: cached.deviceId }),
      });
      const data = await r.json();
      if (!data?.ok) return { ok: false, reason: data?.error || "That name is taken" };
    } catch {
      return { ok: false, reason: "Couldn't reach the server — try again" };
    }
  }

  cached = { ...cached, username: name.trim(), confirmed: true };
  persist();
  return res;
}

export function getDeviceId(): string {
  return cached.deviceId;
}

/** Suggest a name for the first-run prompt so the field is never empty. */
export function suggestUsername(): string {
  const a = ["Ghost", "Viper", "Reaper", "Nomad", "Echo", "Raven", "Wolf", "Cipher", "Havoc", "Onyx", "Talon", "Frost"];
  const b = ["Six", "Actual", "Zero", "Prime", "Nine", "Ace", "Delta", "Sierra", "Vector", "Kilo"];
  const pick = <T,>(arr: T[]) => arr[Math.floor(Math.random() * arr.length)];
  return `${pick(a)}${pick(b)}${Math.floor(Math.random() * 90 + 10)}`.slice(0, 16);
}
