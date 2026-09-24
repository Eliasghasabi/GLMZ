// ─────────────────────────────────────────────────────────────
//  CHARACTER CUSTOMIZATION
//
//  Drives the player's visible first-person gear.
//
//  Each glove is a genuine material — its own weave, its own PBR
//  atlas (base colour / normal / roughness / metallic / AO), its own
//  coverage and its own hard-surface accents. Two gloves never share
//  a normal map, which is what stops the set feeling like recolours.
//
//  Options are organised into tiers so the list reads as a wardrobe
//  rather than a swatch book.
// ─────────────────────────────────────────────────────────────

import * as THREE from "three";
import {
  HAND_MATERIALS, applyGloveSurface, applySleeveSurface,
  applyAccents, setSkinTone,
} from "../hands/materials";
import type { GloveWeave, GloveSurface } from "../hands/gloveTextures";

export type GearTier = "standard" | "field" | "specialist" | "elite";

export interface GloveOption {
  id: string;
  name: string;
  desc: string;
  tier: GearTier;
  /** swatch pair for the UI grid */
  swatch: [string, string];

  // ── material identity ──
  weave: GloveWeave;
  color: number;
  /** contrast thread colour — drives the visible stitching */
  stitch: number;
  roughness: number;
  metalness: number;
  /** 0..1 abrasion baked into every map */
  wear: number;

  // ── design details ──
  coverage: "full" | "fingerless" | "bare";
  /** hard knuckle / back-of-hand armour */
  plating: boolean;
  plateColor: number;
  plateRough: number;
  /** buckles, rivets, clasps */
  metalColor: number;
  strapColor: number;

  unlock?: { kind: "kills" | "score" | "wave" | "headshots"; value: number };
}

export interface SleeveOption {
  id: string;
  name: string;
  desc: string;
  tier: GearTier;
  swatch: [string, string];
  weave: GloveWeave;
  color: number;
  stitch: number;
  roughness: number;
  wear: number;
  unlock?: { kind: "kills" | "score" | "wave" | "headshots"; value: number };
}

export interface WristMats {
  strap: THREE.MeshStandardMaterial;
  metal: THREE.MeshStandardMaterial;
  glow: THREE.MeshStandardMaterial;
}

export interface WristOption {
  id: string;
  name: string;
  desc: string;
  tier: GearTier;
  build?: (mats: WristMats) => THREE.Object3D;
  unlock?: { kind: "kills" | "score" | "wave" | "headshots"; value: number };
}

// ═════════════════════════════════════════════════════════════
//  GLOVES — 12 genuinely different materials
// ═════════════════════════════════════════════════════════════

export const GLOVES: GloveOption[] = [
  {
    id: "nomex_black", name: "Nomex Standard", tier: "standard",
    desc: "Issue flame-resistant ripstop. Tight weave, reinforced grid.",
    swatch: ["#2a2f33", "#14181b"],
    weave: "nomex", color: 0x262b2f, stitch: 0x4a5257, roughness: 0.9, metalness: 0.02, wear: 0.2,
    coverage: "full", plating: false, plateColor: 0x1e2126, plateRough: 0.4,
    metalColor: 0x9099a1, strapColor: 0x1d2125,
  },
  {
    id: "nomex_coyote", name: "Coyote Ripstop", tier: "standard",
    desc: "Desert-issue ripstop with contrast tan stitching.",
    swatch: ["#8a6b45", "#5a4429"],
    weave: "nomex", color: 0x8a6b45, stitch: 0xc9a878, roughness: 0.88, metalness: 0.02, wear: 0.3,
    coverage: "full", plating: false, plateColor: 0x4a3a26, plateRough: 0.45,
    metalColor: 0xa08a68, strapColor: 0x5e4a30,
  },
  {
    id: "leather_brown", name: "Shooter's Leather", tier: "standard",
    desc: "Pebbled hide with a soft sheen. Polishes where it rubs.",
    swatch: ["#6b4a2f", "#3a2718"],
    weave: "leather", color: 0x6b4a2f, stitch: 0xd8c09a, roughness: 0.62, metalness: 0.04, wear: 0.34,
    coverage: "full", plating: false, plateColor: 0x3a2718, plateRough: 0.35,
    metalColor: 0xb8a070, strapColor: 0x4a3220,
  },
  {
    id: "bare", name: "Bare Hands", tier: "standard",
    desc: "No gloves. Skin pores, knuckle creases and all.",
    swatch: ["#c08d64", "#8a6244"],
    weave: "skin", color: 0xbb8a62, stitch: 0xbb8a62, roughness: 0.6, metalness: 0.0, wear: 0.1,
    coverage: "bare", plating: false, plateColor: 0x000000, plateRough: 0.5,
    metalColor: 0x9099a1, strapColor: 0x1d2125,
  },

  {
    id: "suede_olive", name: "Ranger Suede", tier: "field",
    desc: "Napped suede palms. Dead matte, zero glare.",
    swatch: ["#4a5236", "#2b311f"],
    weave: "suede", color: 0x46503a, stitch: 0x6e7a52, roughness: 0.96, metalness: 0.0, wear: 0.38,
    coverage: "full", plating: false, plateColor: 0x2b311f, plateRough: 0.5,
    metalColor: 0x8a9080, strapColor: 0x323824,
    unlock: { kind: "kills", value: 30 },
  },
  {
    id: "mesh_summer", name: "Vented Mesh", tier: "field",
    desc: "Perforated back panel — the holes are real geometry in the normal map.",
    swatch: ["#3d4348", "#20252a"],
    weave: "mesh", color: 0x3a4045, stitch: 0x707880, roughness: 0.82, metalness: 0.05, wear: 0.25,
    coverage: "fingerless", plating: false, plateColor: 0x20252a, plateRough: 0.4,
    metalColor: 0x98a2aa, strapColor: 0x252a30,
    unlock: { kind: "wave", value: 3 },
  },
  {
    id: "tape_wrapped", name: "Wrapped Tape", tier: "field",
    desc: "Hand-wrapped cloth tape in overlapping diagonal bands.",
    swatch: ["#b8ae9a", "#6e6858"],
    weave: "tape", color: 0xb0a690, stitch: 0x7a7060, roughness: 0.93, metalness: 0.0, wear: 0.46,
    coverage: "fingerless", plating: false, plateColor: 0x5a5448, plateRough: 0.6,
    metalColor: 0x8a8578, strapColor: 0x6e6858,
    unlock: { kind: "kills", value: 70 },
  },

  {
    id: "kevlar_grey", name: "Aramid Breacher", tier: "specialist",
    desc: "Coarse basket-weave aramid with articulated knuckle armour.",
    swatch: ["#6a6a5c", "#34342c"],
    weave: "kevlar", color: 0x6a6a5c, stitch: 0x9a9880, roughness: 0.74, metalness: 0.1, wear: 0.3,
    coverage: "full", plating: true, plateColor: 0x24272b, plateRough: 0.3,
    metalColor: 0xa8b0b8, strapColor: 0x2c2f33,
    unlock: { kind: "kills", value: 140 },
  },
  {
    id: "assault_black", name: "Assault Hardshell", tier: "specialist",
    desc: "Full-coverage nomex under a segmented polymer carapace.",
    swatch: ["#1c2024", "#0a0c0e"],
    weave: "nomex", color: 0x1a1e22, stitch: 0x3a4248, roughness: 0.88, metalness: 0.03, wear: 0.22,
    coverage: "full", plating: true, plateColor: 0x121519, plateRough: 0.24,
    metalColor: 0x8e969e, strapColor: 0x15181b,
    unlock: { kind: "score", value: 14000 },
  },
  {
    id: "arctic_shell", name: "Arctic Shell", tier: "specialist",
    desc: "Insulated winter glove, frost-white with steel hardware.",
    swatch: ["#d7dce2", "#9aa4ae"],
    weave: "leather", color: 0xd2d8de, stitch: 0x8e98a2, roughness: 0.68, metalness: 0.06, wear: 0.24,
    coverage: "full", plating: true, plateColor: 0xb4bcc4, plateRough: 0.28,
    metalColor: 0xc8d0d8, strapColor: 0x9aa4ae,
    unlock: { kind: "wave", value: 7 },
  },

  {
    id: "crimson_ops", name: "Crimson Operator", tier: "elite",
    desc: "Blood-red leather, blackened plating, polished buckles.",
    swatch: ["#8f1f1c", "#3a0d0c"],
    weave: "leather", color: 0x8a201d, stitch: 0x2a0c0b, roughness: 0.48, metalness: 0.12, wear: 0.26,
    coverage: "full", plating: true, plateColor: 0x1a0a09, plateRough: 0.18,
    metalColor: 0xd8d0c0, strapColor: 0x2a0c0b,
    unlock: { kind: "score", value: 26000 },
  },
  {
    id: "gilded", name: "Gilded Gauntlet", tier: "elite",
    desc: "Black aramid beneath solid gold-plated knuckle armour.",
    swatch: ["#f5cd5c", "#6a4e12"],
    weave: "kevlar", color: 0x1a1a18, stitch: 0xc8a13a, roughness: 0.52, metalness: 0.18, wear: 0.12,
    coverage: "full", plating: true, plateColor: 0xc8a13a, plateRough: 0.14,
    metalColor: 0xf0d89a, strapColor: 0x2a2418,
    unlock: { kind: "score", value: 48000 },
  },
];

// ═════════════════════════════════════════════════════════════
//  SLEEVES
// ═════════════════════════════════════════════════════════════

export const SLEEVES: SleeveOption[] = [
  {
    id: "olive", name: "Olive Fatigues", tier: "standard", swatch: ["#2e332c", "#1a1e19"],
    desc: "Standard combat uniform, ripstop weave.",
    weave: "nomex", color: 0x2e332c, stitch: 0x4a5246, roughness: 0.95, wear: 0.22,
  },
  {
    id: "black", name: "Blackout", tier: "standard", swatch: ["#15171a", "#08090b"],
    desc: "Night-operations sleeve. Absorbs light completely.",
    weave: "nomex", color: 0x14161a, stitch: 0x2c3036, roughness: 0.94, wear: 0.16,
  },
  {
    id: "desert", name: "Desert Tan", tier: "standard", swatch: ["#9a8560", "#655840"],
    desc: "Arid-region uniform, sun-bleached.",
    weave: "nomex", color: 0x9a8560, stitch: 0xc4b48e, roughness: 0.94, wear: 0.4,
  },
  {
    id: "canvas", name: "Waxed Canvas", tier: "field", swatch: ["#5a4f3a", "#302a1e"],
    desc: "Heavy waxed canvas with a faint sheen.",
    weave: "tape", color: 0x584d38, stitch: 0x8a7a58, roughness: 0.72, wear: 0.42,
    unlock: { kind: "kills", value: 40 },
  },
  {
    id: "urban", name: "Urban Grey", tier: "field", swatch: ["#4a4f56", "#272b30"],
    desc: "City-fight grey with reinforced elbow panel.",
    weave: "kevlar", color: 0x474c53, stitch: 0x737b84, roughness: 0.86, wear: 0.3,
    unlock: { kind: "wave", value: 4 },
  },
  {
    id: "arcticsleeve", name: "Snow Overwhite", tier: "specialist", swatch: ["#c9d2da", "#8e99a4"],
    desc: "Winter overwhites layered on the base uniform.",
    weave: "suede", color: 0xc4cdd6, stitch: 0x8e99a4, roughness: 0.92, wear: 0.28,
    unlock: { kind: "kills", value: 110 },
  },
  {
    id: "techweave", name: "Tech Underlayer", tier: "elite", swatch: ["#1c2330", "#2ad39a"],
    desc: "Powered compression weave with conductive threading.",
    weave: "mesh", color: 0x1b2230, stitch: 0x2ad39a, roughness: 0.6, wear: 0.1,
    unlock: { kind: "score", value: 30000 },
  },
];

// ═════════════════════════════════════════════════════════════
//  WRIST GEAR
// ═════════════════════════════════════════════════════════════

const S = 0.66; // matches HAND_SCALE so props sit correctly on the arm

export const WRISTS: WristOption[] = [
  { id: "none", name: "None", tier: "standard", desc: "No wrist gear." },
  {
    id: "watch", name: "Field Watch", tier: "standard",
    desc: "Rugged analogue chronograph on a leather strap.",
    build: (m) => {
      const g = new THREE.Group();
      const band = new THREE.Mesh(new THREE.TorusGeometry(0.030 * S, 0.008 * S, 6, 16), m.strap);
      band.rotation.y = Math.PI / 2;
      g.add(band);
      const case_ = new THREE.Mesh(new THREE.CylinderGeometry(0.019 * S, 0.020 * S, 0.009 * S, 14), m.metal);
      case_.rotation.z = Math.PI / 2;
      case_.position.set(0.028 * S, 0, 0);
      g.add(case_);
      const face = new THREE.Mesh(new THREE.CylinderGeometry(0.015 * S, 0.015 * S, 0.010 * S, 14), m.glow);
      face.rotation.z = Math.PI / 2;
      face.position.set(0.031 * S, 0, 0);
      g.add(face);
      return g;
    },
  },
  {
    id: "gps", name: "Wrist Terminal", tier: "field",
    desc: "Backlit navigation and comms unit.",
    build: (m) => {
      const g = new THREE.Group();
      const band = new THREE.Mesh(new THREE.TorusGeometry(0.031 * S, 0.007 * S, 6, 16), m.strap);
      band.rotation.y = Math.PI / 2;
      g.add(band);
      const body = new THREE.Mesh(new THREE.BoxGeometry(0.012 * S, 0.042 * S, 0.034 * S), m.metal);
      body.position.set(0.030 * S, 0, 0);
      g.add(body);
      const screen = new THREE.Mesh(new THREE.BoxGeometry(0.004 * S, 0.032 * S, 0.026 * S), m.glow);
      screen.position.set(0.038 * S, 0, 0);
      g.add(screen);
      return g;
    },
    unlock: { kind: "kills", value: 45 },
  },
  {
    id: "paracord", name: "Paracord Band", tier: "field",
    desc: "Woven survival cord, three tight turns.",
    build: (m) => {
      const g = new THREE.Group();
      for (let i = 0; i < 3; i++) {
        const band = new THREE.Mesh(new THREE.TorusGeometry((0.030 + i * 0.0015) * S, 0.005 * S, 5, 14), m.strap);
        band.rotation.y = Math.PI / 2;
        band.position.x = (-0.008 + i * 0.008) * S;
        g.add(band);
      }
      return g;
    },
    unlock: { kind: "wave", value: 3 },
  },
  {
    id: "plates", name: "Armoured Cuff", tier: "specialist",
    desc: "Segmented forearm plating on a webbing base.",
    build: (m) => {
      const g = new THREE.Group();
      for (let i = 0; i < 4; i++) {
        const plate = new THREE.Mesh(
          new THREE.BoxGeometry(0.030 * S, (0.050 - i * 0.004) * S, 0.013 * S), m.metal
        );
        plate.position.set((-0.004 - i * 0.026) * S, 0.006 * S, 0);
        plate.rotation.z = 0.08;
        g.add(plate);
      }
      const strap = new THREE.Mesh(new THREE.TorusGeometry(0.031 * S, 0.006 * S, 5, 14), m.strap);
      strap.rotation.y = Math.PI / 2;
      g.add(strap);
      return g;
    },
    unlock: { kind: "kills", value: 200 },
  },
  {
    id: "beacon", name: "IFF Beacon", tier: "elite",
    desc: "Pulsing identification strobe.",
    build: (m) => {
      const g = new THREE.Group();
      const band = new THREE.Mesh(new THREE.TorusGeometry(0.030 * S, 0.006 * S, 6, 14), m.strap);
      band.rotation.y = Math.PI / 2;
      g.add(band);
      const pod = new THREE.Mesh(new THREE.SphereGeometry(0.011 * S, 10, 8), m.glow);
      pod.position.set(0.028 * S, 0.012 * S, 0);
      g.add(pod);
      return g;
    },
    unlock: { kind: "score", value: 34000 },
  },
];

export const GLOVE_BY_ID = new Map(GLOVES.map((g) => [g.id, g]));
export const SLEEVE_BY_ID = new Map(SLEEVES.map((s) => [s.id, s]));
export const WRIST_BY_ID = new Map(WRISTS.map((w) => [w.id, w]));

export interface CharacterLoadout {
  gloves: string;
  sleeve: string;
  wrist: string;
}

export const DEFAULT_CHARACTER: CharacterLoadout = {
  gloves: "nomex_black",
  sleeve: "olive",
  wrist: "none",
};

// ── application ─────────────────────────────────────────────

const toSurface = (g: GloveOption): GloveSurface => ({
  weave: g.weave, color: g.color, stitch: g.stitch,
  wear: g.wear, roughness: g.roughness, metalness: g.metalness,
});

const sleeveSurface = (s: SleeveOption): GloveSurface => ({
  weave: s.weave, color: s.color, stitch: s.stitch,
  wear: s.wear, roughness: s.roughness, metalness: 0.02,
});

/** the coverage/plating the current gloves ask for */
export function currentHandStyle(c: CharacterLoadout): {
  coverage: "full" | "fingerless" | "bare"; plating: boolean;
} {
  const g = GLOVE_BY_ID.get(c.gloves) ?? GLOVES[0];
  return { coverage: g.coverage, plating: g.plating };
}

/**
 * Push a character loadout onto the shared hand materials. Because
 * every weapon's hands reference those same materials, one call
 * restyles the player's gear across the entire armoury.
 */
export function applyCharacter(c: CharacterLoadout) {
  const glove = GLOVE_BY_ID.get(c.gloves) ?? GLOVES[0];
  const sleeve = SLEEVE_BY_ID.get(c.sleeve) ?? SLEEVES[0];

  applyGloveSurface(toSurface(glove), `glove:${glove.id}`);
  applySleeveSurface(sleeveSurface(sleeve), `sleeve:${sleeve.id}`);
  applyAccents(glove.plateColor, glove.metalColor, glove.plateRough, glove.strapColor);
  setSkinTone(glove.weave === "skin" ? glove.color : 0xb98a63);
}

/**
 * Attach the wrist prop. Mounts to the rig's dedicated forearm
 * anchor when present so props never intersect the sleeve.
 */
export function applyWrist(handRoot: THREE.Object3D, wristId: string) {
  const host = handRoot.getObjectByName("wristAnchor") ?? handRoot;
  const prev = host.getObjectByName("wristProp");
  if (prev) {
    prev.traverse((o) => {
      const m = o as THREE.Mesh;
      if (m.isMesh) m.geometry.dispose();
    });
    host.remove(prev);
  }
  const opt = WRIST_BY_ID.get(wristId);
  if (!opt || !opt.build) return;

  const mats: WristMats = {
    strap: HAND_MATERIALS.strap,
    metal: HAND_MATERIALS.metal,
    glow: new THREE.MeshStandardMaterial({
      color: 0x0a1a14, emissive: 0x35ffbe, emissiveIntensity: 2.0, roughness: 0.3,
    }),
  };
  const prop = opt.build(mats);
  prop.name = "wristProp";
  prop.traverse((o) => {
    const m = o as THREE.Mesh;
    if (m.isMesh) {
      m.castShadow = false;
      m.receiveShadow = false;
      m.frustumCulled = false;
    }
  });
  host.add(prop);
}
