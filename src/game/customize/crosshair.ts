// ─────────────────────────────────────────────────────────────
//  CROSSHAIR CUSTOMIZATION
//
//  8 distinct reticle styles × 8 colours × adjustable gap and thickness.
//  Persisted to localStorage so the player's choice survives sessions.
//  Rendered purely in CSS / DOM by the HUD — no canvas, no shaders.
// ─────────────────────────────────────────────────────────────

export type CrosshairStyle =
  | "default"   // four ticks + dot (the original)
  | "dot"       // single pixel-perfect dot
  | "cross"     // long thin cross with no dot
  | "t-cross"   // three ticks (top, bottom, left) — open right side
  | "circle"    // ring only
  | "triangle"  // three chevrons pointing inward
  | "chevron"   // single upward chevron
  | "dynamic";  // four ticks that close in as accuracy tightens

export type CrosshairColor =
  | "white" | "red" | "green" | "cyan" | "yellow" | "magenta" | "lime" | "orange";

export interface CrosshairConfig {
  style: CrosshairStyle;
  color: CrosshairColor;
  /** gap between centre and ticks, 4..28 px */
  gap: number;
  /** tick thickness, 1..4 px */
  thickness: number;
  /** tick length, 4..18 px */
  length: number;
  /** show the centre dot */
  dot: boolean;
  /** 0..1 — outline strength behind the crosshair for legibility on bright surfaces */
  outline: number;
}

const CROSSHAIR_KEY = "shadowstrike.crosshair.v1";

export const DEFAULT_CROSSHAIR: CrosshairConfig = {
  style: "default",
  color: "white",
  gap: 8,
  thickness: 2,
  length: 9,
  dot: true,
  outline: 0.9,
};

export const CROSSHAIR_STYLES: { id: CrosshairStyle; name: string; desc: string }[] = [
  { id: "default",  name: "Classic",   desc: "Four ticks + centre dot. The original." },
  { id: "dot",      name: "Dot",       desc: "Single pixel. Maximum precision, minimal obstruction." },
  { id: "cross",    name: "Cross",     desc: "Long thin crosshair lines, no dot." },
  { id: "t-cross",  name: "T-Cross",   desc: "Three ticks — open right side for unobstructed sight picture." },
  { id: "circle",   name: "Ring",      desc: "Hollow reticle ring. Wide field of view." },
  { id: "triangle", name: "Triangle", desc: "Three chevrons pointing inward. Aggressive look." },
  { id: "chevron",  name: "Chevron",   desc: "Single upward chevron. Minimalist." },
  { id: "dynamic",  name: "Dynamic",  desc: "Ticks expand with movement, contract when still." },
];

export const CROSSHAIR_COLORS: { id: CrosshairColor; hex: string; name: string }[] = [
  { id: "white",   hex: "#ffffff", name: "White" },
  { id: "red",     hex: "#ff4d4d", name: "Red" },
  { id: "green",   hex: "#7dd87d", name: "Green" },
  { id: "cyan",    hex: "#4dffff", name: "Cyan" },
  { id: "yellow",  hex: "#ffd76a", name: "Yellow" },
  { id: "magenta", hex: "#ff4dff", name: "Magenta" },
  { id: "lime",    hex: "#9eff3a", name: "Lime" },
  { id: "orange",  hex: "#ffae00", name: "Orange" },
];

export const CROSSHAIR_COLOR_HEX: Record<CrosshairColor, string> = {
  white: "#ffffff",
  red: "#ff4d4d",
  green: "#7dd87d",
  cyan: "#4dffff",
  yellow: "#ffd76a",
  magenta: "#ff4dff",
  lime: "#9eff3a",
  orange: "#ffae00",
};

let config: CrosshairConfig = loadCrosshair();
const listeners = new Set<(c: CrosshairConfig) => void>();

function loadCrosshair(): CrosshairConfig {
  try {
    const raw = localStorage.getItem(CROSSHAIR_KEY);
    if (raw) return { ...DEFAULT_CROSSHAIR, ...JSON.parse(raw) };
  } catch {
    /* corrupted storage */
  }
  return { ...DEFAULT_CROSSHAIR };
}

function persist() {
  try {
    localStorage.setItem(CROSSHAIR_KEY, JSON.stringify(config));
  } catch {
    /* storage unavailable */
  }
  for (const fn of listeners) fn(config);
}

export function getCrosshair(): CrosshairConfig {
  return config;
}

export function setCrosshair(patch: Partial<CrosshairConfig>) {
  config = { ...config, ...patch };
  persist();
}

export function resetCrosshair() {
  config = { ...DEFAULT_CROSSHAIR };
  persist();
}

export function onCrosshairChange(fn: (c: CrosshairConfig) => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}
