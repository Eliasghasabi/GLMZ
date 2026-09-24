// ─────────────────────────────────────────────────────────────
//  ENEMY ARCHETYPES
//
//  Three genuinely different characters, not recolours. Each one
//  declares its own skeleton proportions, gear loadout, posture and
//  gait personality, so the silhouettes read differently at a
//  glance even in motion:
//
//    SCOUT    tall, narrow, hunched forward. Light vest, hood,
//             bare forearms, knee wraps. Charcoal urban camo.
//    SOLDIER  the baseline. Square shoulders, plate carrier,
//             full helmet, upright disciplined carriage.
//    HEAVY    squat and enormously wide. Exo-frame, riot chest
//             plate, hydraulic legs. Gunmetal with amber hazard
//             striping.
//
//  Silhouette contrast is deliberate: shoulderW/hipW/height differ
//  by >30% between types, which is what makes them identifiable
//  from distance and in peripheral vision.
// ─────────────────────────────────────────────────────────────

export type EnemyKind = "soldier" | "runner" | "heavy";

export interface Proportions {
  /** overall rig scale multiplier */
  scale: number;
  /** hip pivot height, in local rig units (feet at 0) */
  hipY: number;
  /** distance hips → chest pivot */
  spineLen: number;
  /** distance chest → neck */
  chestLen: number;
  /** shoulder half-span */
  shoulderW: number;
  /** hip half-span */
  hipW: number;
  /** torso depth front-to-back */
  torsoD: number;
  /** torso width at the ribs */
  torsoW: number;
  /** upper arm length */
  upperArm: number;
  /** forearm length */
  foreArm: number;
  /** limb thickness multiplier */
  limbR: number;
  /** thigh length */
  thigh: number;
  /** shin length */
  shin: number;
  /** head size */
  headR: number;
  /** neck length */
  neckLen: number;
}

export interface Posture {
  /** resting forward lean of the spine (radians) */
  spineLean: number;
  /** resting chest counter-rotation */
  chestLean: number;
  /** head pitch at rest — scouts crane forward, heavies sit back */
  headPitch: number;
  /** how far the feet sit apart, as a multiple of hipW */
  stanceWidth: number;
  /** shoulder roll: negative = hunched forward */
  shoulderRoll: number;
  /** resting elbow bend */
  elbowBend: number;
}

export interface Gait {
  /** strides per second at full speed */
  cadence: number;
  /** stride length multiplier */
  stride: number;
  /** vertical bob amplitude */
  bob: number;
  /** lateral hip sway */
  sway: number;
  /** forward lean added while running */
  runLean: number;
  /** how much the torso counter-rotates against the legs */
  counterRot: number;
  /** ground-impact reaction on foot plant (heavies dip visibly) */
  impact: number;
  /** arm swing amplitude */
  armSwing: number;
  /** 0 = floaty, 1 = every step lands hard */
  weight: number;
}

export interface Palette {
  /** fatigues / cloth */
  cloth: number;
  /** secondary cloth (sleeves, wraps) */
  cloth2: number;
  /** webbing, pouches, straps */
  gear: number;
  /** hard armour plating */
  plate: number;
  /** exposed metal, buckles, weapon */
  metal: number;
  /** skin tone */
  skin: number;
  /** emissive accent (visor, optics, hazard lights) */
  glow: number;
  /** warning stripe colour (heavy only) */
  hazard?: number;
}

export type ClothWeave = "fatigue" | "ripstop" | "canvas";
export type PlateFinish = "matte" | "semigloss" | "battered";

export interface MaterialSpec {
  weave: ClothWeave;
  plateFinish: PlateFinish;
  /** 0..1 dirt accumulation */
  grime: number;
  /** 0..1 scratches and impact damage on plating */
  damage: number;
  /** 0..1 frayed / worn fabric edges */
  fray: number;
  /** camo pattern applied to cloth */
  camo: "none" | "urban" | "woodland" | "solid";
}

export interface GearSpec {
  helmet: "hood" | "full" | "exo";
  /** armoured shoulder pads */
  pauldrons: boolean;
  /** riot-style chest slab */
  chestSlab: boolean;
  /** powered backpack */
  backpack: boolean;
  /** exposed forearms (scout) vs armoured vambraces */
  bareArms: boolean;
  /** knee protection style */
  knees: "wrap" | "pad" | "exo";
  /** hazard striping on the armour */
  hazardStripes: boolean;
  /** hip pouches count */
  pouches: number;
  /** leg holster / drop bag */
  dropLeg: boolean;
}

export interface Archetype {
  kind: EnemyKind;
  name: string;
  proportions: Proportions;
  posture: Posture;
  gait: Gait;
  palette: Palette;
  material: MaterialSpec;
  gear: GearSpec;
  /** weapon silhouette carried by this type */
  weapon: "smg" | "rifle" | "lmg" | "blade";
}

// ═════════════════════════════════════════════════════════════

export const ARCHETYPES: Record<EnemyKind, Archetype> = {
  // ── SCOUT: tall, narrow, predatory forward hunch ──
  runner: {
    kind: "runner",
    name: "Scout",
    proportions: {
      scale: 0.90,
      hipY: 1.06, spineLen: 0.17, chestLen: 0.30,
      shoulderW: 0.20, hipW: 0.115, torsoD: 0.22, torsoW: 0.34,
      upperArm: 0.30, foreArm: 0.27, limbR: 0.82,
      thigh: 0.47, shin: 0.45,
      headR: 0.115, neckLen: 0.09,
    },
    posture: {
      // pitched forward at the waist like a sprinter waiting to go
      spineLean: 0.26, chestLean: -0.10, headPitch: -0.16,
      stanceWidth: 0.85, shoulderRoll: -0.16, elbowBend: -1.35,
    },
    gait: {
      cadence: 1.32, stride: 1.22, bob: 0.052, sway: 0.13,
      runLean: 0.34, counterRot: 0.30, impact: 0.25,
      armSwing: 1.25, weight: 0.35,
    },
    palette: {
      cloth: 0x2b2f33, cloth2: 0x21252a, gear: 0x191c20,
      plate: 0x33383e, metal: 0x6a7179, skin: 0xc0906c, glow: 0xffb022,
    },
    material: {
      weave: "ripstop", plateFinish: "matte",
      grime: 0.45, damage: 0.3, fray: 0.6, camo: "urban",
    },
    gear: {
      helmet: "hood", pauldrons: false, chestSlab: false, backpack: false,
      bareArms: true, knees: "wrap", hazardStripes: false,
      pouches: 2, dropLeg: true,
    },
    weapon: "smg",
  },

  // ── SOLDIER: the baseline silhouette ──
  soldier: {
    kind: "soldier",
    name: "Soldier",
    proportions: {
      scale: 0.94,
      hipY: 1.02, spineLen: 0.18, chestLen: 0.30,
      shoulderW: 0.255, hipW: 0.135, torsoD: 0.29, torsoW: 0.42,
      upperArm: 0.29, foreArm: 0.26, limbR: 1.0,
      thigh: 0.45, shin: 0.43,
      headR: 0.125, neckLen: 0.075,
    },
    posture: {
      spineLean: 0.07, chestLean: 0.0, headPitch: 0.0,
      stanceWidth: 1.0, shoulderRoll: 0.0, elbowBend: -1.2,
    },
    gait: {
      cadence: 1.0, stride: 1.0, bob: 0.055, sway: 0.11,
      runLean: 0.24, counterRot: 0.22, impact: 0.45,
      armSwing: 1.0, weight: 0.6,
    },
    palette: {
      cloth: 0x6e6a4e, cloth2: 0x585437, gear: 0x43443f,
      plate: 0x6d7168, metal: 0x8a9199, skin: 0xb98b68, glow: 0xff3822,
    },
    material: {
      weave: "fatigue", plateFinish: "semigloss",
      grime: 0.38, damage: 0.35, fray: 0.3, camo: "woodland",
    },
    gear: {
      helmet: "full", pauldrons: true, chestSlab: false, backpack: true,
      bareArms: false, knees: "pad", hazardStripes: false,
      pouches: 3, dropLeg: false,
    },
    weapon: "rifle",
  },

  // ── HEAVY: squat, enormously wide, exo-framed ──
  heavy: {
    kind: "heavy",
    name: "Heavy",
    proportions: {
      scale: 1.14,
      // short legs, long torso — reads as a walking bunker
      hipY: 0.92, spineLen: 0.20, chestLen: 0.34,
      shoulderW: 0.375, hipW: 0.175, torsoD: 0.40, torsoW: 0.58,
      upperArm: 0.28, foreArm: 0.26, limbR: 1.42,
      thigh: 0.40, shin: 0.38,
      headR: 0.125, neckLen: 0.045,
    },
    posture: {
      // sits back on its heels, chest thrown out, head low in the shoulders
      spineLean: -0.05, chestLean: 0.08, headPitch: 0.06,
      stanceWidth: 1.45, shoulderRoll: 0.10, elbowBend: -1.05,
    },
    gait: {
      cadence: 0.66, stride: 0.86, bob: 0.075, sway: 0.075,
      runLean: 0.14, counterRot: 0.12, impact: 1.0,
      armSwing: 0.62, weight: 1.0,
    },
    palette: {
      cloth: 0x2e3136, cloth2: 0x24272b, gear: 0x1e2125,
      plate: 0x4a5058, metal: 0x9aa2ab, skin: 0xac8060, glow: 0xff5a12,
      hazard: 0xe8a22a,
    },
    material: {
      weave: "canvas", plateFinish: "battered",
      grime: 0.55, damage: 0.75, fray: 0.2, camo: "solid",
    },
    gear: {
      helmet: "exo", pauldrons: true, chestSlab: true, backpack: true,
      bareArms: false, knees: "exo", hazardStripes: true,
      pouches: 2, dropLeg: false,
    },
    weapon: "lmg",
  },
};

/** total rig height in local units, used to derive hitboxes */
export function rigHeight(a: Archetype): number {
  const p = a.proportions;
  return p.hipY + p.spineLen + p.chestLen + p.neckLen + p.headR * 2.4;
}

/** shoulder span in world units — the widest part of the silhouette */
export function rigWidth(a: Archetype): number {
  return (a.proportions.shoulderW + a.proportions.limbR * 0.09) * 2 * a.proportions.scale;
}
