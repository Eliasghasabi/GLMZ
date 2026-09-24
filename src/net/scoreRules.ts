// ─────────────────────────────────────────────────────────────
//  SHARED SCORE RULES
//
//  Single source of truth imported by BOTH the game client and the
//  Cloudflare Worker, so the plausibility checks can never drift
//  apart between the two.
//
//  Keep this file dependency-free (no DOM, no Node, no Three.js)
//  so it bundles cleanly into a Worker.
// ─────────────────────────────────────────────────────────────

export const USERNAME_MIN = 3;
export const USERNAME_MAX = 16;

/** mirrors ENEMY_CONFIG score values in enemies.ts */
const ENEMY_SCORE = { soldier: 100, runner: 120, heavy: 250 } as const;
const MIN_KILL_SCORE = Math.min(...Object.values(ENEMY_SCORE)); // 100
const MAX_KILL_SCORE = Math.max(...Object.values(ENEMY_SCORE)); // 250

/** wave-clear bonus is 250 * wave (game.ts waveCleared) */
const WAVE_BONUS = 250;

/** largest difficulty count multiplier (VETERAN) */
const MAX_COUNT_MUL = 1.3;

export const MAX_WAVE = 200;
export const MAX_SCORE = 50_000_000;

/** upper bound on enemies spawned in a single wave, any difficulty */
export function maxEnemiesInWave(wave: number): number {
  return Math.ceil(Math.min(5 + (wave - 1) * 3, 30) * MAX_COUNT_MUL);
}

/** upper bound on total enemies that can have spawned by `wave` */
export function maxCumulativeEnemies(wave: number): number {
  let total = 0;
  for (let w = 1; w <= wave; w++) total += maxEnemiesInWave(w);
  return total;
}

/** upper bound on score achievable having reached `wave` with `kills` */
export function maxPlausibleScore(wave: number, kills: number): number {
  // every kill valued as the richest enemy, plus every wave bonus
  const killCap = kills * MAX_KILL_SCORE;
  const bonusCap = (WAVE_BONUS * wave * (wave + 1)) / 2;
  // 15% headroom so future scoring tweaks don't cause false rejects
  return Math.ceil((killCap + bonusCap) * 1.15);
}

/** every kill awards at least 100, so score can never fall far below this */
export function minPlausibleScore(kills: number): number {
  return Math.floor(kills * MIN_KILL_SCORE * 0.9);
}

export interface ScorePayload {
  username: string;
  score: number;
  kills: number;
  wave: number;
  accuracy: number;
  difficulty: string;
  /** run length in seconds */
  duration: number;
}

export interface ValidationResult {
  ok: boolean;
  reason?: string;
}

const isInt = (n: unknown): n is number =>
  typeof n === "number" && Number.isFinite(n) && Math.floor(n) === n;

/**
 * Plausibility check for a submitted run. Deliberately generous —
 * the goal is to reject obviously fabricated numbers, not to
 * perfectly police skilled play.
 */
export function validateScorePayload(p: Partial<ScorePayload>): ValidationResult {
  const nameCheck = validateUsername(String(p.username ?? ""));
  if (!nameCheck.ok) return { ok: false, reason: nameCheck.reason };

  if (!isInt(p.score) || p.score < 0) return { ok: false, reason: "score must be a non-negative integer" };
  if (!isInt(p.kills) || p.kills < 0) return { ok: false, reason: "kills must be a non-negative integer" };
  if (!isInt(p.wave) || p.wave < 1) return { ok: false, reason: "wave must be at least 1" };

  if (p.score > MAX_SCORE) return { ok: false, reason: "score exceeds the maximum possible" };
  if (p.wave > MAX_WAVE) return { ok: false, reason: "wave exceeds the maximum possible" };

  if (typeof p.accuracy !== "number" || p.accuracy < 0 || p.accuracy > 100) {
    return { ok: false, reason: "accuracy must be between 0 and 100" };
  }

  // ── internal consistency ──
  const killCap = maxCumulativeEnemies(p.wave);
  if (p.kills > killCap) {
    return { ok: false, reason: `kills (${p.kills}) exceed the enemies available by wave ${p.wave}` };
  }

  const scoreCap = maxPlausibleScore(p.wave, p.kills);
  if (p.score > scoreCap) {
    return { ok: false, reason: `score (${p.score}) is too high for ${p.kills} kills on wave ${p.wave}` };
  }

  const scoreFloor = minPlausibleScore(p.kills);
  if (p.score < scoreFloor) {
    return { ok: false, reason: `score (${p.score}) is too low for ${p.kills} kills` };
  }

  // ── pacing: waves physically take time to spawn and clear ──
  if (typeof p.duration === "number" && p.duration > 0) {
    const minDuration = p.wave * 3; // very loose lower bound
    if (p.duration < minDuration) {
      return { ok: false, reason: `run too short (${Math.round(p.duration)}s) to reach wave ${p.wave}` };
    }
    if (p.duration > 24 * 3600) return { ok: false, reason: "run duration is implausible" };
  }

  return { ok: true };
}

// ── username validation ─────────────────────────────────────

const ALLOWED = /^[A-Za-z0-9 _\-.]+$/;

/**
 * Small blocklist, matched after leetspeak normalisation.
 *
 *  · BLOCKED_SUBSTRING — caught anywhere in the name.
 *  · BLOCKED_WHOLE     — only as a standalone token, because these
 *                        appear inside innocent words (ass/assassin).
 *  · INNOCENT          — known-good words containing a blocked
 *                        substring. Stripped before the substring
 *                        pass, so "Scunthorpe" and "Grape" survive
 *                        while "cuntface" and "rapebot" do not.
 */
const BLOCKED_SUBSTRING = [
  "fuck", "shit", "cunt", "bitch", "asshole", "bastard",
  "nigger", "nigga", "faggot", "retard", "rape", "nazi", "hitler",
  "whore", "slut", "dickhead", "motherfuck", "wanker", "pedophile",
];
const BLOCKED_WHOLE = [
  "ass", "cum", "fag", "tit", "tits", "sex", "anal",
  "damn", "hell", "piss", "dick", "cock", "pedo",
];
const INNOCENT = [
  "scunthorpe", "penistone", "lightwater", "clitheroe",
  "grape", "grapes", "grapeshot", "therapist", "therapy", "therapeutic",
  "pedometer", "pedestal", "pedigree",
  "cumberland", "cucumber", "document", "circumstance", "accumulate",
  "assassin", "assault", "assembly", "assist", "asset", "class", "grass",
  "brass", "compass", "glass", "bass", "pass", "mass", "massive",
  "cockpit", "peacock", "shuttlecock", "cocktail",
  "dickens", "dickinson", "title", "constitution", "competition",
  "essex", "sussex", "middlesex", "analysis", "analog", "analyst", "analyse",
  "hello", "shell", "shelley", "michelle", "hellenic",
  "bitchute", "shiitake",
];

/** fold leetspeak and separators so "f_u_c_k" and "sh1t" are caught */
function normalizeForFilter(s: string): string {
  return s
    .toLowerCase()
    .replace(/[0]/g, "o")
    .replace(/[1!|]/g, "i")
    .replace(/[3]/g, "e")
    .replace(/[4@]/g, "a")
    .replace(/[5$]/g, "s")
    .replace(/[7]/g, "t")
    .replace(/[8]/g, "b")
    .replace(/[^a-z]/g, "");
}

export function isCleanUsername(name: string): boolean {
  const n = normalizeForFilter(name);
  if (!n) return true;

  // remove known-innocent words so they can't trip the substring pass
  let scrubbed = n;
  for (const w of INNOCENT) scrubbed = scrubbed.split(w).join("");

  for (const w of BLOCKED_SUBSTRING) if (scrubbed.includes(w)) return false;

  // whole-word terms: the entire name, or one of its tokens
  const tokens = name.toLowerCase().split(/[^a-z0-9]+/).map(normalizeForFilter);
  for (const w of BLOCKED_WHOLE) {
    if (n === w) return false;
    if (tokens.includes(w)) return false;
  }
  return true;
}

export function validateUsername(raw: string): ValidationResult {
  const name = String(raw ?? "").trim();
  if (!name) return { ok: false, reason: "Username cannot be empty" };
  if (name.length < USERNAME_MIN) {
    return { ok: false, reason: `At least ${USERNAME_MIN} characters` };
  }
  if (name.length > USERNAME_MAX) {
    return { ok: false, reason: `At most ${USERNAME_MAX} characters` };
  }
  if (!ALLOWED.test(name)) {
    return { ok: false, reason: "Letters, numbers, spaces, _ - . only" };
  }
  if (/^[._\-\s]+$/.test(name)) {
    return { ok: false, reason: "Username needs at least one letter or number" };
  }
  if (/\s{2,}/.test(name)) return { ok: false, reason: "No double spaces" };
  if (!isCleanUsername(name)) return { ok: false, reason: "That name isn't allowed" };
  return { ok: true };
}

/** canonical form used for grouping a player's runs together */
export function usernameKey(name: string): string {
  return name.trim().toLowerCase().replace(/\s+/g, " ");
}

// ── month helpers (UTC, so every player shares one boundary) ──

/** 'YYYY-MM' for a timestamp, UTC */
export function monthKey(ts: number = Date.now()): string {
  const d = new Date(ts);
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

/** e.g. "March 2026" */
export function monthLabel(key: string): string {
  const [y, m] = key.split("-").map(Number);
  if (!y || !m) return key;
  const names = [
    "January", "February", "March", "April", "May", "June",
    "July", "August", "September", "October", "November", "December",
  ];
  return `${names[m - 1]} ${y}`;
}

/** ms remaining until the current UTC month rolls over */
export function msUntilMonthEnd(now: number = Date.now()): number {
  const d = new Date(now);
  const next = Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 1, 0, 0, 0, 0);
  return next - now;
}

// ── lightweight submission signature ────────────────────────
//
//  A JS client can never hold a real secret, so this is not
//  cryptographic security — it simply means a would-be cheater has
//  to read the bundle rather than curl the endpoint blind. The
//  server's plausibility checks and rate limits do the real work.

export const SIGNING_SALT = "shadowstrike-v1";

export function signPayload(p: ScorePayload, salt: string = SIGNING_SALT): string {
  const base = [
    usernameKey(p.username), p.score, p.kills, p.wave,
    Math.round(p.accuracy), p.difficulty, Math.round(p.duration), salt,
  ].join("|");
  // FNV-1a 32-bit, doubled with a different offset for a wider tag
  let h1 = 0x811c9dc5;
  let h2 = 0x01000193;
  for (let i = 0; i < base.length; i++) {
    const c = base.charCodeAt(i);
    h1 = ((h1 ^ c) >>> 0) * 0x01000193 >>> 0;
    h2 = ((h2 ^ c) >>> 0) * 0x85ebca6b >>> 0;
  }
  return (h1 >>> 0).toString(36) + "-" + (h2 >>> 0).toString(36);
}

export function verifySignature(p: ScorePayload, sig: string, salt: string = SIGNING_SALT): boolean {
  return signPayload(p, salt) === sig;
}
