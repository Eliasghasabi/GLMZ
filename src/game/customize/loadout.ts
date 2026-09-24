// ─────────────────────────────────────────────────────────────
//  LOADOUT STATE · PERSISTENCE · PROGRESSION
//
//  Single source of truth for what the player has equipped and
//  what they have unlocked. Everything is persisted to
//  localStorage and re-applied automatically on the next session.
//
//  Career stats accumulate across every run and drive unlocks, so
//  customization doubles as a progression track.
// ─────────────────────────────────────────────────────────────

import { WEAPONS, WEAPON_ORDER } from "../weapons";
import type { WeaponDef, WeaponId } from "../wpnkit";
import { SKINS, SKIN_BY_ID, DEFAULT_SKIN, type SkinDef } from "./skins";
import {
  ATTACHMENTS, ATTACH_BY_ID, DEFAULT_ATTACHMENTS, SLOTS,
  applyAttachmentMods, type SlotId, type DerivedStats,
} from "./attachments";
import {
  GLOVES, SLEEVES, WRISTS, DEFAULT_CHARACTER, type CharacterLoadout,
} from "./character";

const LOADOUT_KEY = "shadowstrike.loadout.v1";
const CAREER_KEY = "shadowstrike.career.v1";

// ── career progression ──────────────────────────────────────

export interface Career {
  kills: number;
  headshots: number;
  bestScore: number;
  bestWave: number;
  totalScore: number;
  runs: number;
}

const EMPTY_CAREER: Career = {
  kills: 0, headshots: 0, bestScore: 0, bestWave: 0, totalScore: 0, runs: 0,
};

export function loadCareer(): Career {
  try {
    const raw = localStorage.getItem(CAREER_KEY);
    if (raw) return { ...EMPTY_CAREER, ...JSON.parse(raw) };
  } catch {
    /* corrupted storage */
  }
  return { ...EMPTY_CAREER };
}

function saveCareer(c: Career) {
  try {
    localStorage.setItem(CAREER_KEY, JSON.stringify(c));
  } catch {
    /* storage unavailable */
  }
}

let career: Career = loadCareer();

export function getCareer(): Career {
  return career;
}

/**
 * Close out a run. Kills and headshots are already accumulated live
 * by `bumpCareerLive`, so this only folds in the run-level records —
 * counting them here too would double-count every elimination.
 */
export function recordRun(stats: { score: number; wave: number }): UnlockableRef[] {
  const before = listUnlocked();
  career = {
    ...career,
    bestScore: Math.max(career.bestScore, stats.score),
    bestWave: Math.max(career.bestWave, stats.wave),
    totalScore: career.totalScore + stats.score,
    runs: career.runs + 1,
  };
  saveCareer(career);
  const after = listUnlocked();
  return after.filter((a) => !before.some((b) => b.id === a.id && b.kind === a.kind));
}

/**
 * Accumulate progress during a run so unlocks can pop mid-game.
 * Returns anything that just became available.
 */
export function bumpCareerLive(
  kills: number, headshots: number, score: number, wave: number
): UnlockableRef[] {
  const before = listUnlocked();
  career = {
    ...career,
    kills: career.kills + kills,
    headshots: career.headshots + headshots,
    bestScore: Math.max(career.bestScore, score),
    bestWave: Math.max(career.bestWave, wave),
  };
  saveCareer(career);
  const after = listUnlocked();
  return after.filter((a) => !before.some((b) => b.id === a.id && b.kind === a.kind));
}

export type UnlockReq = { kind: "kills" | "score" | "wave" | "headshots"; value: number };

export function unlockProgress(req: UnlockReq): { have: number; need: number } {
  const have =
    req.kind === "kills" ? career.kills
      : req.kind === "headshots" ? career.headshots
        : req.kind === "wave" ? career.bestWave
          : career.bestScore;
  return { have, need: req.value };
}

export function isUnlocked(req?: UnlockReq): boolean {
  if (!req) return true;
  const { have, need } = unlockProgress(req);
  return have >= need;
}

export function describeUnlock(req: UnlockReq): string {
  switch (req.kind) {
    case "kills": return `${req.value} career eliminations`;
    case "headshots": return `${req.value} career headshots`;
    case "wave": return `reach wave ${req.value}`;
    case "score": return `score ${req.value.toLocaleString()} in one run`;
  }
}

export interface UnlockableRef { kind: "skin" | "attachment" | "glove" | "sleeve" | "wrist"; id: string; name: string }

function listUnlocked(): UnlockableRef[] {
  const out: UnlockableRef[] = [];
  for (const s of SKINS) if (isUnlocked(s.unlock)) out.push({ kind: "skin", id: s.id, name: s.name });
  for (const a of ATTACHMENTS) if (isUnlocked(a.unlock)) out.push({ kind: "attachment", id: a.id, name: a.name });
  for (const g of GLOVES) if (isUnlocked(g.unlock)) out.push({ kind: "glove", id: g.id, name: g.name });
  for (const s of SLEEVES) if (isUnlocked(s.unlock)) out.push({ kind: "sleeve", id: s.id, name: s.name });
  for (const w of WRISTS) if (isUnlocked(w.unlock)) out.push({ kind: "wrist", id: w.id, name: w.name });
  return out;
}

/** headline numbers for the loadout screen */
export function unlockSummary(): { owned: number; total: number } {
  const total = SKINS.length + ATTACHMENTS.length + GLOVES.length + SLEEVES.length + WRISTS.length;
  return { owned: listUnlocked().length, total };
}

// ── loadout state ───────────────────────────────────────────

export interface WeaponLoadout {
  skin: string;
  attachments: Record<SlotId, string>;
}

export interface Loadout {
  weapons: Record<string, WeaponLoadout>;
  character: CharacterLoadout;
}

function defaultWeaponLoadout(): WeaponLoadout {
  return { skin: DEFAULT_SKIN, attachments: { ...DEFAULT_ATTACHMENTS } };
}

function defaultLoadout(): Loadout {
  const weapons: Record<string, WeaponLoadout> = {};
  for (const id of WEAPON_ORDER) weapons[id] = defaultWeaponLoadout();
  return { weapons, character: { ...DEFAULT_CHARACTER } };
}

/** Repair anything missing, renamed or since-locked. */
function sanitize(l: Loadout): Loadout {
  const out = defaultLoadout();
  for (const id of WEAPON_ORDER) {
    const src = l.weapons?.[id];
    if (!src) continue;
    const w = out.weapons[id];
    const skin = SKIN_BY_ID.get(src.skin);
    if (skin && isUnlocked(skin.unlock)) w.skin = src.skin;
    for (const slot of SLOTS) {
      const aid = src.attachments?.[slot.id];
      const a = aid ? ATTACH_BY_ID.get(aid) : undefined;
      if (a && a.slot === slot.id && isUnlocked(a.unlock)) w.attachments[slot.id] = aid!;
    }
  }
  const c = l.character;
  if (c) {
    const g = GLOVES.find((x) => x.id === c.gloves);
    const s = SLEEVES.find((x) => x.id === c.sleeve);
    const wr = WRISTS.find((x) => x.id === c.wrist);
    if (g && isUnlocked(g.unlock)) out.character.gloves = c.gloves;
    if (s && isUnlocked(s.unlock)) out.character.sleeve = c.sleeve;
    if (wr && isUnlocked(wr.unlock)) out.character.wrist = c.wrist;
  }
  return out;
}

let loadout: Loadout = (() => {
  try {
    const raw = localStorage.getItem(LOADOUT_KEY);
    if (raw) return sanitize(JSON.parse(raw));
  } catch {
    /* corrupted storage */
  }
  return defaultLoadout();
})();

const listeners = new Set<(l: Loadout) => void>();

export function getLoadout(): Loadout {
  return loadout;
}

export function onLoadoutChange(fn: (l: Loadout) => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

function persist() {
  try {
    localStorage.setItem(LOADOUT_KEY, JSON.stringify(loadout));
  } catch {
    /* storage unavailable */
  }
  for (const fn of listeners) fn(loadout);
}

export function getWeaponLoadout(id: WeaponId): WeaponLoadout {
  return loadout.weapons[id] ?? defaultWeaponLoadout();
}

export function setWeaponSkin(id: WeaponId, skinId: string) {
  const skin = SKIN_BY_ID.get(skinId);
  if (!skin || !isUnlocked(skin.unlock)) return;
  loadout.weapons[id] = { ...getWeaponLoadout(id), skin: skinId };
  persist();
}

export function setWeaponAttachment(id: WeaponId, slot: SlotId, attachId: string) {
  const a = ATTACH_BY_ID.get(attachId);
  if (!a || a.slot !== slot || !isUnlocked(a.unlock)) return;
  const cur = getWeaponLoadout(id);
  loadout.weapons[id] = {
    ...cur,
    attachments: { ...cur.attachments, [slot]: attachId },
  };
  persist();
}

export function setCharacter(patch: Partial<CharacterLoadout>) {
  loadout.character = { ...loadout.character, ...patch };
  persist();
}

export function resetWeaponLoadout(id: WeaponId) {
  loadout.weapons[id] = defaultWeaponLoadout();
  persist();
}

// ── resolved stats ──────────────────────────────────────────

export type EffectiveDef = WeaponDef & DerivedStats;

const statCache = new Map<string, EffectiveDef>();

/**
 * A weapon's stats with its equipped attachments folded in, plus
 * any skin-driven colour overrides. Cached per unique combination.
 */
export function effectiveDef(id: WeaponId): EffectiveDef {
  const wl = getWeaponLoadout(id);
  const ids = SLOTS.map((s) => wl.attachments[s.id]);
  const key = `${id}|${wl.skin}|${ids.join(",")}`;
  let d = statCache.get(key);
  if (!d) {
    d = applyAttachmentMods(WEAPONS[id], ids);
    const skin = SKIN_BY_ID.get(wl.skin);
    if (skin?.tracerColor) d.tracerColor = skin.tracerColor;
    statCache.set(key, d);
  }
  return d;
}

/** the skin currently equipped on a weapon */
export function equippedSkin(id: WeaponId): SkinDef {
  return SKIN_BY_ID.get(getWeaponLoadout(id).skin) ?? SKIN_BY_ID.get(DEFAULT_SKIN)!;
}

/** attachment ids currently equipped, in slot order */
export function equippedAttachments(id: WeaponId): string[] {
  const wl = getWeaponLoadout(id);
  return SLOTS.map((s) => wl.attachments[s.id]);
}

/**
 * Preview stats for a hypothetical combination — used by the
 * loadout screen to show deltas before the player commits.
 */
export function previewDef(id: WeaponId, attachIds: string[]): EffectiveDef {
  return applyAttachmentMods(WEAPONS[id], attachIds);
}

/** player movement multiplier from the equipped weapon's attachments */
export function moveSpeedMultiplier(id: WeaponId): number {
  return effectiveDef(id).moveSpeedMul;
}
