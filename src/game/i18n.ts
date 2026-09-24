// ─────────────────────────────────────────────────────────────
//  INTERNATIONALISATION
//
//  Two languages: English (default) and Persian/Farsi (fa).
//  Persian switches the entire UI font to Vazirmatn + sets RTL.
//
//  Persisted to localStorage so the player's choice survives
//  sessions. The Android APK defaults to Persian; the website
//  defaults to English.
//
//  Adding a string = add it to STRINGS and to both LANGS.
//  Adding a language = add an entry to LANGS and to LangId.
// ─────────────────────────────────────────────────────────────

import { Capacitor } from "@capacitor/core";

export type LangId = "en" | "fa";

export interface LangInfo {
  id: LangId;
  /** native name shown in the picker */
  label: string;
  /** short tag for the html lang attribute */
  htmlLang: string;
  /** "ltr" or "rtl" — controls writing direction */
  dir: "ltr" | "rtl";
  /** CSS font-family applied to the body when this language is active */
  fontFamily: string;
}

export const LANGS: Record<LangId, LangInfo> = {
  en: {
    id: "en",
    label: "English",
    htmlLang: "en",
    dir: "ltr",
    fontFamily: '"Chakra Petch", system-ui, sans-serif',
  },
  fa: {
    id: "fa",
    label: "فارسی",
    htmlLang: "fa",
    dir: "rtl",
    // Vazirmatn is a beautiful Persian-Latin hybrid font designed
    // specifically for modern UI work. Latin glyphs fall back to
    // Chakra Petch for the tactical aesthetic.
    fontFamily: '"Vazirmatn", "Chakra Petch", system-ui, sans-serif',
  },
};

/**
 * Default language per platform. The APK ships Persian-first
 * (player requested it); the website stays English so the global
 * leaderboard isn't suddenly in a different script.
 */
function defaultLang(): LangId {
  try {
    const native = Capacitor.isNativePlatform?.() ?? false;
    if (native) return "fa";
  } catch { /* not loaded yet */ }
  // sniff browser language as a hint for the web build
  try {
    const nav = (navigator.language || "en").toLowerCase();
    if (nav.startsWith("fa") || nav.startsWith("persian") || nav.includes("fa-") || nav.includes("fa_")) {
      return "fa";
    }
  } catch { /* no navigator */ }
  return "en";
}

const LANG_KEY = "shadowstrike.lang.v1";

let current: LangId = loadLang();
const listeners = new Set<(l: LangId) => void>();

function loadLang(): LangId {
  try {
    const raw = localStorage.getItem(LANG_KEY);
    if (raw === "en" || raw === "fa") return raw;
  } catch { /* storage blocked */ }
  return defaultLang();
}

function persist() {
  try { localStorage.setItem(LANG_KEY, current); } catch { /* ignore */ }
  for (const fn of listeners) fn(current);
}

export function getLang(): LangId { return current; }

export function setLang(l: LangId) {
  if (l === current) return;
  current = l;
  persist();
}

export function onLangChange(fn: (l: LangId) => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

// ── string catalogue ──────────────────────────────────────────

export type StrKey =
  // menu
  | "tagline" | "subtagline" | "play" | "settings" | "leaderboard"
  | "loadout" | "crosshair" | "howToPlay" | "setCallsign" | "headphonesHint"
  | "createdBy" | "rotateDevice" | "rotateHint"
  // settings
  | "settingsTitle" | "difficulty" | "mouseSensitivity" | "fieldOfView"
  | "masterVolume" | "sfxVolume" | "graphicsQuality" | "language"
  | "difficultyEasy" | "difficultyNormal" | "difficultyHard"
  | "difficultyEasyBlurb" | "difficultyNormalBlurb" | "difficultyHardBlurb"
  // crosshair
  | "crosshairTitle" | "reticleStyle" | "colour" | "gap" | "thickness"
  | "length" | "outline" | "centreDot" | "on" | "off" | "reset" | "back"
  | "livePreview"
  // loadout
  | "loadoutTitle" | "unlocked" | "operatorGear" | "gloves" | "sleeves"
  | "wristGear" | "options" | "weaponStats" | "previewing" | "resetWeapon"
  | "dragToRotate"
  // hud
  | "wave" | "hostiles" | "hostile" | "score" | "eliminations" | "reloading"
  | "killConfirmed" | "killConfirmedHeadshot"
  | "doubleKill" | "tripleKill" | "killingSpree" | "unstoppable" | "rampage"
  | "streak" | "onFire" | "unlockedToast"
  // pause / game over
  | "paused" | "operationOnHold" | "resume" | "restart" | "mainMenu"
  | "gameOver"
  ;

export const STRINGS: Record<LangId, Record<string, string>> = {
  en: {
    tagline: "TACTICAL COMBAT PROTOCOL",
    subtagline: "ELIAS STREET // WAVE SURVIVAL // NIGHT OPERATION",
    play: "PLAY",
    settings: "SETTINGS",
    leaderboard: "LEADERBOARD",
    loadout: "LOADOUT",
    crosshair: "CROSSHAIR",
    howToPlay: "HOW TO PLAY",
    setCallsign: "SET CALLSIGN",
    headphonesHint: "HEADPHONES RECOMMENDED · CLICK PLAY TO ENGAGE POINTER LOCK",
    createdBy: "CREATED BY ELIAS",
    rotateDevice: "ROTATE YOUR DEVICE",
    rotateHint: "Shadow Strike plays in landscape. Turn your phone sideways to continue.",

    settingsTitle: "SETTINGS",
    difficulty: "DIFFICULTY",
    mouseSensitivity: "MOUSE SENSITIVITY",
    fieldOfView: "FIELD OF VIEW",
    masterVolume: "MASTER VOLUME",
    sfxVolume: "SFX VOLUME",
    graphicsQuality: "GRAPHICS QUALITY",
    language: "LANGUAGE",
    difficultyEasy: "RECRUIT",
    difficultyNormal: "OPERATOR",
    difficultyHard: "VETERAN",
    difficultyEasyBlurb: "Fewer, weaker hostiles. Forgiving accuracy.",
    difficultyNormalBlurb: "Balanced engagement. The intended experience.",
    difficultyHardBlurb: "Tougher squads, relentless pressure, deadly aim.",

    postProcessing: "POST-PROCESSING",
    cinematicGrain: "CINEMATIC GRAIN",

    crosshairTitle: "CROSSHAIR",
    reticleStyle: "RETICLE STYLE",
    colour: "COLOUR",
    gap: "GAP",
    thickness: "THICKNESS",
    length: "LENGTH",
    outline: "OUTLINE",
    centreDot: "CENTRE DOT",
    on: "ON",
    off: "OFF",
    reset: "RESET",
    back: "BACK",
    livePreview: "LIVE PREVIEW",

    loadoutTitle: "LOADOUT",
    unlocked: "UNLOCKED",
    operatorGear: "OPERATOR GEAR",
    gloves: "GLOVES",
    sleeves: "SLEEVES",
    wristGear: "WRIST GEAR",
    options: "OPTIONS",
    weaponStats: "WEAPON STATS",
    previewing: "PREVIEWING",
    resetWeapon: "RESET WEAPON",
    dragToRotate: "DRAG TO ROTATE · SCROLL TO ZOOM",

    wave: "WAVE",
    hostiles: "HOSTILES",
    hostile: "HOSTILE",
    score: "SCORE",
    eliminations: "ELIMINATIONS",
    reloading: "RELOADING",
    killConfirmed: "KILL CONFIRMED",
    killConfirmedHeadshot: "CONFIRMED · HEADSHOT",
    doubleKill: "DOUBLE KILL",
    tripleKill: "TRIPLE KILL",
    killingSpree: "KILLING SPREE",
    unstoppable: "UNSTOPPABLE",
    rampage: "RAMPAGE",
    streak: "STREAK",
    onFire: "ON FIRE",
    unlockedToast: "UNLOCKED",

    paused: "PAUSED",
    operationOnHold: "OPERATION ON HOLD",
    resume: "RESUME",
    restart: "RESTART",
    mainMenu: "MAIN MENU",
    gameOver: "MISSION FAILED",
  },

  fa: {
    tagline: "پروتکل نبرد تاکتیکی",
    subtagline: "خیابان الیاس // بقا موجی // عملیات شبانه",
    play: "بازی",
    settings: "تنظیمات",
    leaderboard: "تابلوی امتیازات",
    loadout: "تجهیزات",
    crosshair: "نقطه‌نشانه",
    howToPlay: "راهنمای بازی",
    setCallsign: "تعیین نام",
    headphonesHint: "استفاده از هدفون توصیه می‌شود · برای فعال کردن ماوس روی بازی کلیک کنید",
    createdBy: "ساخته‌ی الیاس",
    rotateDevice: "گوشی را بچرخانید",
    rotateHint: "شِیدو استرایک در حالت افقی اجرا می‌شود. گوشی را بچرخانید.",

    settingsTitle: "تنظیمات",
    difficulty: "سختی",
    mouseSensitivity: "حساسیت ماوس",
    fieldOfView: "میدان دید",
    masterVolume: "صدای اصلی",
    sfxVolume: "افکت‌های صوتی",
    graphicsQuality: "کیفیت گرافیک",
    language: "زبان",
    difficultyEasy: "تازه‌کار",
    difficultyNormal: "اپراتور",
    difficultyHard: "کهنه‌سرباز",
    difficultyEasyBlurb: "دشمنان کمتر و ضعیف‌تر. دقت آمرزنده.",
    difficultyNormalBlurb: "نبرد متعادل. تجربه پیشنهادی.",
    difficultyHardBlurb: "گروه‌های سرسخت، فشار بی‌وقفه، هدف‌گیری کشنده.",

    postProcessing: "پس‌پردازش تصویر",
    cinematicGrain: "نویز سینمایی",

    crosshairTitle: "نقطه‌نشانه",
    reticleStyle: "نوع نشانه",
    colour: "رنگ",
    gap: "فاصله",
    thickness: "ضخامت",
    length: "طول",
    outline: "حاشیه",
    centreDot: "نقطه مرکزی",
    on: "روشن",
    off: "خاموش",
    reset: "بازنشانی",
    back: "بازگشت",
    livePreview: "پیش‌نمایش زنده",

    loadoutTitle: "تجهیزات",
    unlocked: "بازگشده",
    operatorGear: "تجهیزات اپراتور",
    gloves: "دستکش",
    sleeves: "آستین",
    wristGear: "مچ‌بند",
    options: "گزینه‌ها",
    weaponStats: "آمار سلاح",
    previewing: "در حال پیش‌نمایش",
    resetWeapon: "بازنشانی سلاح",
    dragToRotate: "برای چرخش بکشید · برای زوم اسکرول کنید",

    wave: "موج",
    hostiles: "دشمن",
    hostile: "دشمن",
    score: "امتیاز",
    eliminations: "حذف‌ها",
    reloading: "در حال شارژ",
    killConfirmed: "کشتن تأیید شد",
    killConfirmedHeadshot: "تأیید شد · شات سر",
    doubleKill: "کُشتن دوتایی",
    tripleKill: "کُشتن سه‌تایی",
    killingSpree: "رشته کشتن",
    unstoppable: "توقف‌ناپذیر",
    rampage: "هیاهو",
    streak: "رشته",
    onFire: "در آتش",
    unlockedToast: "بازگشده",

    paused: "مکث",
    operationOnHold: "عملیات متوقف شد",
    resume: "ادامه",
    restart: "شروع دوباره",
    mainMenu: "منوی اصلی",
    gameOver: "مأموریت شکست خورد",
  },
};

export function t(key: string): string {
  return STRINGS[current]?.[key] ?? STRINGS.en[key] ?? key;
}
