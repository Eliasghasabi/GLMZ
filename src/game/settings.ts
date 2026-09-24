// ─────────────────────────────────────────────────────────────
//  Settings — persisted to LocalStorage
//
//  Quality tiers:
//    • "low"     — web fallback, no shadows, no post-processing
//    • "medium"  — basic shadows + bloom
//    • "high"    — soft PCF shadows + bloom + AO + filmic tone-map
//    • "studio"  — APK-only: max shadow res, full post-processing,
//                  subtle chromatic aberration & film grain, higher DPR
//
//  On first launch, the runtime GPU tier detection in gpuTier.ts
//  picks a sensible default per device.
// ─────────────────────────────────────────────────────────────

export type Quality = "low" | "medium" | "high" | "studio";
export type Difficulty = "easy" | "normal" | "hard";

/** enemy tuning per difficulty tier */
export interface DifficultyProfile {
  label: string;
  blurb: string;
  hp: number;        // enemy health multiplier
  damage: number;    // enemy damage multiplier
  speed: number;     // enemy move speed multiplier
  spawnRate: number; // spawn interval multiplier (lower = faster waves)
  count: number;     // enemies per wave multiplier
  aggression: number;// fire-rate / accuracy multiplier
}

export const DIFFICULTIES: Record<Difficulty, DifficultyProfile> = {
  easy: {
    label: "RECRUIT",
    blurb: "Fewer, weaker hostiles. Forgiving accuracy.",
    hp: 0.7, damage: 0.6, speed: 0.9, spawnRate: 1.35, count: 0.75, aggression: 0.65,
  },
  normal: {
    label: "OPERATOR",
    blurb: "Balanced engagement. The intended experience.",
    hp: 1, damage: 1, speed: 1, spawnRate: 1, count: 1, aggression: 1,
  },
  hard: {
    label: "VETERAN",
    blurb: "Tougher squads, relentless pressure, deadly aim.",
    hp: 1.45, damage: 1.5, speed: 1.12, spawnRate: 0.68, count: 1.3, aggression: 1.4,
  },
};

export interface Settings {
  sensitivity: number; // 0.2 – 3.0 multiplier
  fov: number; // 60 – 110
  masterVolume: number; // 0 – 1
  sfxVolume: number; // 0 – 1
  quality: Quality;
  difficulty: Difficulty;
  /** cinematic post-processing: bloom + AO + filmic — auto on high/studio, off on low */
  postProcessing: boolean;
  /** subtle chromatic aberration + film grain — opt-in, default off */
  cinematicGrain: boolean;
}

const DEFAULTS: Settings = {
  sensitivity: 1,
  fov: 75,
  masterVolume: 0.8,
  sfxVolume: 0.9,
  quality: "high",
  difficulty: "normal",
  postProcessing: true,
  cinematicGrain: false,
};

const SETTINGS_KEY = "shadowstrike.settings.v2";
const BEST_KEY = "shadowstrike.best.v1";

/** touch devices default to lower graphics + slightly higher look sensitivity.
 *  Inside the native Android APK we pick the quality tier at runtime
 *  using GPU tier detection (see gpuTier.ts) — but never above 'studio'
 *  because that's the APK-only max. The web build caps at 'high'.
 *  For first-time fallback before benchmarking, native defaults to
 *  'high' (Studio only kicks in once we've confirmed the GPU is fast). */
function deviceDefaults(): Settings {
  const d = { ...DEFAULTS };
  try {
    const coarse = window.matchMedia?.("(pointer: coarse)").matches;
    const touch = "ontouchstart" in window || navigator.maxTouchPoints > 0;
    if (coarse && touch) {
      d.quality = "low";
      d.sensitivity = 1.35;
      d.fov = 80;
    }
    const native = typeof window !== "undefined" &&
      (window as any).Capacitor?.isNativePlatform?.();
    if (native) {
      // Studio is too expensive to assume by default — start at high
      // and let the runtime benchmark promote or demote on first launch.
      // The benchmark runs in gpuTier.ts and may overwrite this once.
      d.quality = "high";
      d.postProcessing = true;
      if (!coarse) d.sensitivity = 1.4;
      d.fov = 80;
    }
  } catch {
    /* non-browser environment */
  }
  return d;
}

export function loadSettings(): Settings {
  const base = deviceDefaults();
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      // Migrate v1 settings if the user has them — drop the old "low"
      // cap on native so the new studio tier can take effect after the
      // first benchmark.
      const v1Key = "shadowstrike.settings.v1";
      if (!localStorage.getItem(SETTINGS_KEY) && localStorage.getItem(v1Key)) {
        const v1 = JSON.parse(localStorage.getItem(v1Key) || "{}");
        return { ...base, ...v1, postProcessing: true, cinematicGrain: false };
      }
      return { ...base, ...parsed };
    }
  } catch {
    /* corrupted storage — fall through to defaults */
  }
  return base;
}

export function saveSettings(s: Settings) {
  try {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(s));
  } catch {
    /* storage unavailable */
  }
}

export interface Best {
  score: number;
  wave: number;
  kills: number;
}

export function loadBest(): Best {
  try {
    const raw = localStorage.getItem(BEST_KEY);
    if (raw) return { score: 0, wave: 0, kills: 0, ...JSON.parse(raw) };
  } catch {
    /* ignore */
  }
  return { score: 0, wave: 0, kills: 0 };
}

export function saveBest(b: Best) {
  try {
    const prev = loadBest();
    const next: Best = {
      score: Math.max(prev.score, b.score),
      wave: Math.max(prev.wave, b.wave),
      kills: Math.max(prev.kills, b.kills),
    };
    localStorage.setItem(BEST_KEY, JSON.stringify(next));
    return b.score > prev.score;
  } catch {
    return false;
  }
}
