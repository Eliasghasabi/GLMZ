// ─────────────────────────────────────────────────────────────
//  HAND MATERIALS
//
//  Six distinct material slots with genuinely different shader
//  responses, so the hand does not read as one uniform blob:
//
//    cloth  matte fabric, full PBR set from the glove atlas
//    skin   soft, slightly oily, no metal
//    plate  semi-gloss reinforced polymer
//    metal  buckles and rivets, true metallic response
//    strap  webbing, matte and fibrous
//    sleeve forearm fabric with its own weave
//    nail   keratin — smooth, translucent-looking, dielectric
//
//  These are module-level singletons shared by every weapon's
//  hands, so restyling the player's gear is a single re-tint that
//  propagates armoury-wide.
// ─────────────────────────────────────────────────────────────

import * as THREE from "three";
import { gloveTextures, type GloveSurface } from "./gloveTextures";

function mat(p: THREE.MeshStandardMaterialParameters): THREE.MeshStandardMaterial {
  const m = new THREE.MeshStandardMaterial(p);
  // hands are owned by character customization — weapon skins must
  // never repaint them
  m.userData.skinRole = "locked";
  return m;
}

export const HAND_MATERIALS = {
  /**
   * Glove fabric — receives the full 2K PBR atlas via
   * applyGloveSurface(). The initial colour is a neutral glove tone
   * rather than white so an un-configured hand still reads as a
   * glove instead of a blank surface.
   */
  cloth: mat({ color: 0x262b2f, roughness: 0.88, metalness: 0.0 }),
  /** exposed skin (bare hands / fingerless tips) */
  skin: mat({ color: 0xb98a63, roughness: 0.62, metalness: 0.0 }),
  /** hard knuckle and back-of-hand armour */
  plate: mat({ color: 0x1e2126, roughness: 0.34, metalness: 0.12 }),
  /** buckles, rivets, clasps */
  metal: mat({ color: 0xa8b0b8, roughness: 0.22, metalness: 0.96 }),
  /** wrist webbing */
  strap: mat({ color: 0x24282c, roughness: 0.94, metalness: 0.02 }),
  /** forearm sleeve fabric */
  sleeve: mat({ color: 0x2e332c, roughness: 0.95, metalness: 0.0 }),
  /** fingernails */
  nail: mat({ color: 0xd8bfae, roughness: 0.28, metalness: 0.0 }),
};

/** legacy alias — older call sites referenced these three by name */
export const LEGACY_ALIASES = {
  get skin() { return HAND_MATERIALS.skin; },
  get glove() { return HAND_MATERIALS.cloth; },
  get sleeve() { return HAND_MATERIALS.sleeve; },
};

let appliedGloveKey = "";
let appliedSleeveKey = "";

/**
 * Bind a generated PBR atlas to the glove material. Textures are
 * cached per style, so switching back to a previously used glove is
 * effectively free.
 */
export function applyGloveSurface(surface: GloveSurface, key: string) {
  if (appliedGloveKey === key) return;
  appliedGloveKey = key;
  const t = gloveTextures(surface, key);
  const m = HAND_MATERIALS.cloth;
  m.map = t.map;
  m.normalMap = t.normalMap;
  m.roughnessMap = t.roughnessMap;
  m.metalnessMap = t.metalnessMap;
  m.aoMap = t.aoMap;
  m.normalScale.set(1.15, 1.15);
  m.aoMapIntensity = 0.9;
  // the atlas already carries the colour; tint stays neutral
  m.color.setHex(0xffffff);
  m.roughness = 1;
  m.metalness = 1;
  m.needsUpdate = true;
}

/** the forearm sleeve gets its own atlas so it never matches the glove exactly */
export function applySleeveSurface(surface: GloveSurface, key: string) {
  if (appliedSleeveKey === key) return;
  appliedSleeveKey = key;
  const t = gloveTextures(surface, key, "mid");
  const m = HAND_MATERIALS.sleeve;
  m.map = t.map;
  m.normalMap = t.normalMap;
  m.roughnessMap = t.roughnessMap;
  m.metalnessMap = t.metalnessMap;
  m.aoMap = t.aoMap;
  m.normalScale.set(0.9, 0.9);
  m.color.setHex(0xffffff);
  m.roughness = 1;
  m.metalness = 1;
  m.needsUpdate = true;
}

/** hard-surface accents (plating / buckles) restyled per glove tier */
export function applyAccents(plate: number, metal: number, plateRough: number, strap: number) {
  HAND_MATERIALS.plate.color.setHex(plate);
  HAND_MATERIALS.plate.roughness = plateRough;
  HAND_MATERIALS.plate.needsUpdate = true;
  HAND_MATERIALS.metal.color.setHex(metal);
  HAND_MATERIALS.metal.needsUpdate = true;
  HAND_MATERIALS.strap.color.setHex(strap);
  HAND_MATERIALS.strap.needsUpdate = true;
}

export function setSkinTone(hex: number) {
  HAND_MATERIALS.skin.color.setHex(hex);
  HAND_MATERIALS.skin.needsUpdate = true;
}

/** force the next surface bind to rebuild (used when previewing) */
export function invalidateSurfaceCache() {
  appliedGloveKey = "";
  appliedSleeveKey = "";
}
