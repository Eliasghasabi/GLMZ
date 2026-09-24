// ─────────────────────────────────────────────────────────────
//  WEAPON ATTACHMENTS
//
//  Five slots per weapon. Every attachment changes BOTH the model
//  and the stats, so each choice is a real trade-off rather than a
//  cosmetic pick.
//
//  Geometry is mounted on anchors derived from the weapon's own
//  bounding box, so attachments fit any weapon — including ones
//  added later — without per-weapon authoring.
//
//  Adding an attachment = append one entry to ATTACHMENTS.
// ─────────────────────────────────────────────────────────────

import * as THREE from "three";
import type { WeaponDef } from "../wpnkit";

export type SlotId = "sight" | "barrel" | "magazine" | "grip" | "stock";

export const SLOTS: { id: SlotId; label: string; hint: string }[] = [
  { id: "sight", label: "OPTIC", hint: "Zoom level and aim-down-sights feel" },
  { id: "barrel", label: "BARREL", hint: "Range, accuracy and handling" },
  { id: "magazine", label: "MAGAZINE", hint: "Capacity versus reload speed" },
  { id: "grip", label: "GRIP", hint: "Recoil control and hip accuracy" },
  { id: "stock", label: "STOCK", hint: "Stability versus mobility" },
];

/**
 * Stat deltas. Multipliers default to 1, additives to 0, so an
 * attachment only declares what it actually changes.
 */
export interface StatMods {
  zoomMul?: number;
  adsSpeedMul?: number;     // >1 = faster sight transition
  spreadHipMul?: number;
  spreadAdsMul?: number;
  damageMul?: number;
  falloffStartMul?: number;
  falloffEndMul?: number;
  magAdd?: number;
  magMul?: number;
  reloadMul?: number;       // >1 = slower reload
  recoilMul?: number;
  rpmMul?: number;
  moveSpeedMul?: number;    // player movement while equipped
  velocityMul?: number;
}

export interface AttachmentDef {
  id: string;
  slot: SlotId;
  name: string;
  desc: string;
  mods: StatMods;
  /** builds the visual part; receives the mount anchor to size against */
  build?: (mat: AttachMats, scale: number) => THREE.Object3D;
  unlock?: { kind: "kills" | "score" | "wave" | "headshots"; value: number };
}

/** shared materials so attachments inherit a consistent look */
export interface AttachMats {
  body: THREE.MeshStandardMaterial;
  dark: THREE.MeshStandardMaterial;
  accent: THREE.MeshStandardMaterial;
  glass: THREE.MeshStandardMaterial;
}

export function makeAttachMats(): AttachMats {
  return {
    body: new THREE.MeshStandardMaterial({ color: 0x2a2e34, metalness: 0.8, roughness: 0.38 }),
    dark: new THREE.MeshStandardMaterial({ color: 0x111316, metalness: 0.45, roughness: 0.78 }),
    accent: new THREE.MeshStandardMaterial({ color: 0x6d7681, metalness: 0.94, roughness: 0.24 }),
    glass: new THREE.MeshStandardMaterial({
      color: 0x0a1620, emissive: 0x3fa8ff, emissiveIntensity: 1.4,
      metalness: 0.9, roughness: 0.08, transparent: true, opacity: 0.85,
    }),
  };
}

const bx = (m: THREE.Material, w: number, h: number, d: number, x = 0, y = 0, z = 0) => {
  const o = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m);
  o.position.set(x, y, z);
  return o;
};
const cy = (
  m: THREE.Material, r0: number, r1: number, h: number,
  x = 0, y = 0, z = 0, seg = 12, rotX = 0
) => {
  const o = new THREE.Mesh(new THREE.CylinderGeometry(r0, r1, h, seg), m);
  o.position.set(x, y, z);
  o.rotation.x = rotX;
  return o;
};

// ═════════════════════════════════════════════════════════════
//  CATALOGUE
// ═════════════════════════════════════════════════════════════

export const ATTACHMENTS: AttachmentDef[] = [
  // ── SIGHTS ────────────────────────────────────────────────
  {
    id: "sight_iron", slot: "sight", name: "Iron Sights",
    desc: "No optic. Fastest handling, widest field of view.",
    mods: { adsSpeedMul: 1.25, zoomMul: 0.85 },
  },
  {
    id: "sight_reddot", slot: "sight", name: "Red Dot",
    desc: "Compact 1.5× dot. Quick target acquisition.",
    mods: { zoomMul: 1.15, adsSpeedMul: 1.1, spreadAdsMul: 0.9 },
    // OPEN-FRAME REFLEX: two thin posts holding a single canted lens,
    // no tube at all — the most compact silhouette in the optic set
    build: (m, s) => {
      const g = new THREE.Group();
      g.add(bx(m.dark, 0.048 * s, 0.010 * s, 0.062 * s, 0, 0.004 * s, 0));       // footprint
      for (const sx of [-1, 1]) {                                                  // side posts
        g.add(bx(m.body, 0.007 * s, 0.040 * s, 0.010 * s, sx * 0.019 * s, 0.026 * s, -0.020 * s));
      }
      g.add(bx(m.body, 0.045 * s, 0.009 * s, 0.014 * s, 0, 0.046 * s, -0.020 * s)); // hood
      const lens = new THREE.Mesh(new THREE.BoxGeometry(0.032 * s, 0.034 * s, 0.003 * s), m.glass);
      lens.position.set(0, 0.026 * s, -0.020 * s);
      lens.rotation.x = 0.22;   // reflex lenses are canted toward the eye
      g.add(lens);
      g.add(bx(m.body, 0.014 * s, 0.016 * s, 0.022 * s, 0, 0.014 * s, 0.020 * s));  // emitter housing
      const dot = new THREE.Mesh(
        new THREE.SphereGeometry(0.0035 * s, 8, 6),
        new THREE.MeshStandardMaterial({ color: 0xff2a1a, emissive: 0xff2a1a, emissiveIntensity: 4.5 })
      );
      dot.position.set(0, 0.026 * s, -0.022 * s);
      g.add(dot);
      return g;
    },
  },
  {
    id: "sight_holo", slot: "sight", name: "Holographic",
    desc: "Projected reticle. Balanced zoom with a clear sight picture.",
    mods: { zoomMul: 1.45, adsSpeedMul: 0.98, spreadAdsMul: 0.82 },
    // HOLOGRAPHIC: long boxy housing, large SQUARE viewing window and
    // a laser module at the rear — bulkier and taller than the reflex
    build: (m, s) => {
      const g = new THREE.Group();
      g.add(bx(m.dark, 0.058 * s, 0.014 * s, 0.128 * s, 0, 0.002 * s, 0.01 * s));   // long base
      // hollow housing built as four walls so the window really is open
      g.add(bx(m.body, 0.058 * s, 0.056 * s, 0.020 * s, 0, 0.034 * s, 0.048 * s));  // rear block
      for (const sx of [-1, 1]) {
        g.add(bx(m.body, 0.008 * s, 0.056 * s, 0.070 * s, sx * 0.025 * s, 0.034 * s, -0.010 * s));
      }
      g.add(bx(m.body, 0.058 * s, 0.010 * s, 0.070 * s, 0, 0.058 * s, -0.010 * s));  // roof
      const win = bx(m.glass, 0.042 * s, 0.044 * s, 0.003 * s, 0, 0.032 * s, -0.042 * s);
      g.add(win);
      const ret = new THREE.MeshStandardMaterial({ color: 0x0a2016, emissive: 0x35ff9e, emissiveIntensity: 3.8 });
      // circle-dot holographic reticle, not a plain cross
      for (let i = 0; i < 12; i++) {
        const a = (i / 12) * Math.PI * 2;
        g.add(bx(ret, 0.0028 * s, 0.0028 * s, 0.002 * s,
          Math.cos(a) * 0.016 * s, 0.032 * s + Math.sin(a) * 0.016 * s, -0.044 * s));
      }
      g.add(bx(ret, 0.004 * s, 0.004 * s, 0.002 * s, 0, 0.032 * s, -0.044 * s));
      g.add(bx(m.accent, 0.020 * s, 0.014 * s, 0.016 * s, 0.030 * s, 0.020 * s, 0.040 * s)); // battery cap
      return g;
    },
    unlock: { kind: "kills", value: 40 },
  },
  {
    id: "sight_acog", slot: "sight", name: "ACOG 4×",
    desc: "Prismatic 4× optic. Reaches out, slower to bring up.",
    mods: { zoomMul: 2.3, adsSpeedMul: 0.78, spreadAdsMul: 0.65, falloffStartMul: 1.2 },
    // PRISMATIC 4x: a genuine telescope — tapered tube, flared
    // objective bell, rubber eyecup, elevation turret and a carry
    // handle. Structurally nothing like either reflex sight.
    build: (m, s) => {
      const g = new THREE.Group();
      g.add(bx(m.dark, 0.050 * s, 0.018 * s, 0.150 * s, 0, 0.004 * s, 0));          // mount rail
      for (const z of [-0.048, 0.044]) {                                            // ring clamps
        g.add(cy(m.accent, 0.032 * s, 0.032 * s, 0.014 * s, 0, 0.034 * s, z * s, 12, Math.PI / 2));
      }
      g.add(cy(m.body, 0.024 * s, 0.028 * s, 0.150 * s, 0, 0.034 * s, -0.005 * s, 14, Math.PI / 2)); // tapered body
      g.add(cy(m.accent, 0.036 * s, 0.030 * s, 0.028 * s, 0, 0.034 * s, -0.090 * s, 14, Math.PI / 2)); // objective bell
      g.add(cy(m.dark, 0.030 * s, 0.034 * s, 0.024 * s, 0, 0.034 * s, 0.080 * s, 14, Math.PI / 2));    // rubber eyecup
      const lens = cy(m.glass, 0.030 * s, 0.030 * s, 0.003 * s, 0, 0.034 * s, -0.104 * s, 16, Math.PI / 2);
      g.add(lens);
      g.add(cy(m.accent, 0.013 * s, 0.013 * s, 0.022 * s, 0, 0.060 * s, -0.005 * s, 10));   // elevation turret
      const windage = cy(m.accent, 0.011 * s, 0.011 * s, 0.018 * s, 0.032 * s, 0.034 * s, -0.005 * s, 10);
      windage.rotation.z = Math.PI / 2;
      g.add(windage);
      g.add(bx(m.body, 0.010 * s, 0.022 * s, 0.048 * s, 0, 0.070 * s, 0.010 * s));  // carry handle
      return g;
    },
    unlock: { kind: "score", value: 6000 },
  },
  {
    id: "sight_thermal", slot: "sight", name: "Thermal 6×",
    desc: "Long-range thermal. Maximum zoom, heavy and slow.",
    mods: { zoomMul: 3.4, adsSpeedMul: 0.6, spreadAdsMul: 0.45, falloffStartMul: 1.4, moveSpeedMul: 0.96 },
    build: (m, s) => {
      const g = new THREE.Group();
      g.add(cy(m.dark, 0.03 * s, 0.032 * s, 0.24 * s, 0, 0.034 * s, 0.01 * s, 12, Math.PI / 2));
      g.add(cy(m.body, 0.04 * s, 0.04 * s, 0.05 * s, 0, 0.034 * s, -0.11 * s, 12, Math.PI / 2));
      g.add(bx(m.dark, 0.054 * s, 0.018 * s, 0.17 * s, 0, 0.006 * s, 0.01 * s));
      const lens = cy(
        new THREE.MeshStandardMaterial({
          color: 0x1a0a14, emissive: 0xc23af0, emissiveIntensity: 1.8, metalness: 0.9, roughness: 0.06,
        }),
        0.032 * s, 0.032 * s, 0.004 * s, 0, 0.034 * s, -0.136 * s, 14, Math.PI / 2
      );
      g.add(lens);
      g.add(cy(m.accent, 0.014 * s, 0.014 * s, 0.022 * s, 0, 0.064 * s, 0.01 * s, 8));
      g.add(cy(m.accent, 0.012 * s, 0.012 * s, 0.02 * s, 0.036 * s, 0.034 * s, 0.01 * s, 8, 0));
      return g;
    },
    unlock: { kind: "wave", value: 8 },
  },

  // ── BARRELS ───────────────────────────────────────────────
  {
    id: "barrel_std", slot: "barrel", name: "Standard Barrel",
    desc: "Factory length. No modification.",
    mods: {},
  },
  {
    id: "barrel_long", slot: "barrel", name: "Extended Barrel",
    desc: "Longer bore: more range and velocity, slower to swing on target.",
    mods: {
      falloffStartMul: 1.35, falloffEndMul: 1.3, velocityMul: 1.18,
      spreadHipMul: 0.88, spreadAdsMul: 0.8, adsSpeedMul: 0.82, moveSpeedMul: 0.97,
    },
    build: (m, s) => {
      const g = new THREE.Group();
      g.add(cy(m.accent, 0.018 * s, 0.018 * s, 0.22 * s, 0, 0, -0.1 * s, 12, Math.PI / 2));
      g.add(cy(m.body, 0.024 * s, 0.024 * s, 0.03 * s, 0, 0, -0.2 * s, 12, Math.PI / 2));
      return g;
    },
  },
  {
    id: "barrel_suppressor", slot: "barrel", name: "Suppressor",
    desc: "Muted report and reduced flash. Costs a little muzzle velocity.",
    mods: {
      spreadHipMul: 0.85, recoilMul: 0.82, velocityMul: 0.92,
      falloffEndMul: 0.92, adsSpeedMul: 0.94,
    },
    build: (m, s) => {
      const g = new THREE.Group();
      g.add(cy(m.dark, 0.032 * s, 0.034 * s, 0.26 * s, 0, 0, -0.12 * s, 14, Math.PI / 2));
      for (let i = 0; i < 4; i++) {
        g.add(cy(m.accent, 0.035 * s, 0.035 * s, 0.006 * s, 0, 0, -0.03 * s - i * 0.06 * s, 14, Math.PI / 2));
      }
      return g;
    },
    unlock: { kind: "kills", value: 80 },
  },
  {
    id: "barrel_brake", slot: "barrel", name: "Muzzle Brake",
    desc: "Vents gas sideways. Tames recoil at the cost of a louder signature.",
    mods: { recoilMul: 0.62, spreadHipMul: 1.12, rpmMul: 1.04 },
    build: (m, s) => {
      const g = new THREE.Group();
      g.add(cy(m.accent, 0.03 * s, 0.03 * s, 0.1 * s, 0, 0, -0.05 * s, 12, Math.PI / 2));
      for (let i = 0; i < 3; i++) {
        g.add(bx(m.dark, 0.07 * s, 0.008 * s, 0.014 * s, 0, 0.008 * s, -0.02 * s - i * 0.03 * s));
        g.add(bx(m.dark, 0.07 * s, 0.008 * s, 0.014 * s, 0, -0.008 * s, -0.02 * s - i * 0.03 * s));
      }
      return g;
    },
    unlock: { kind: "score", value: 12000 },
  },

  // ── MAGAZINES ─────────────────────────────────────────────
  {
    id: "mag_std", slot: "magazine", name: "Standard Mag",
    desc: "Issue capacity and reload speed.",
    mods: {},
  },
  {
    id: "mag_extended", slot: "magazine", name: "Extended Mag",
    desc: "Half again the rounds. Heavier, noticeably slower to swap.",
    mods: { magMul: 1.5, reloadMul: 1.28, moveSpeedMul: 0.99 },
    build: (m, s) => {
      const g = new THREE.Group();
      g.add(bx(m.dark, 0.05 * s, 0.09 * s, 0.08 * s, 0, -0.045 * s, 0));
      g.add(bx(m.accent, 0.054 * s, 0.014 * s, 0.084 * s, 0, -0.092 * s, 0));
      return g;
    },
  },
  {
    id: "mag_drum", slot: "magazine", name: "Drum Magazine",
    desc: "Double capacity. Very slow reload and it unbalances the weapon.",
    mods: { magMul: 2.0, reloadMul: 1.62, adsSpeedMul: 0.88, moveSpeedMul: 0.96 },
    build: (m, s) => {
      const g = new THREE.Group();
      const drum = cy(m.dark, 0.075 * s, 0.075 * s, 0.056 * s, 0, -0.07 * s, 0, 16, 0);
      drum.rotation.z = Math.PI / 2;
      drum.rotation.y = Math.PI / 2;
      g.add(drum);
      const hub = cy(m.accent, 0.03 * s, 0.03 * s, 0.062 * s, 0, -0.07 * s, 0, 12, 0);
      hub.rotation.set(0, Math.PI / 2, Math.PI / 2);
      g.add(hub);
      return g;
    },
    unlock: { kind: "kills", value: 160 },
  },
  {
    id: "mag_fast", slot: "magazine", name: "Fast Mag",
    desc: "Tapered well and pull tabs. Rapid swaps, fewer rounds.",
    mods: { magMul: 0.8, reloadMul: 0.64 },
    build: (m, s) => {
      const g = new THREE.Group();
      g.add(bx(m.accent, 0.056 * s, 0.03 * s, 0.086 * s, 0, -0.012 * s, 0));
      g.add(bx(m.dark, 0.016 * s, 0.05 * s, 0.02 * s, 0.032 * s, -0.03 * s, 0));
      return g;
    },
    unlock: { kind: "wave", value: 5 },
  },

  // ── GRIPS ─────────────────────────────────────────────────
  {
    id: "grip_std", slot: "grip", name: "Standard Grip",
    desc: "Issue pistol grip.",
    mods: {},
  },
  {
    id: "grip_vertical", slot: "grip", name: "Vertical Grip",
    desc: "Front vertical grip. Strong recoil control, slightly slower ADS.",
    mods: { recoilMul: 0.74, spreadHipMul: 0.9, adsSpeedMul: 0.93 },
    build: (m, s) => {
      const g = new THREE.Group();
      g.add(bx(m.dark, 0.03 * s, 0.09 * s, 0.032 * s, 0, -0.05 * s, 0));
      g.add(bx(m.accent, 0.034 * s, 0.012 * s, 0.036 * s, 0, -0.098 * s, 0));
      return g;
    },
  },
  {
    id: "grip_angled", slot: "grip", name: "Angled Grip",
    desc: "Raked forward. Faster into the shoulder, less vertical control.",
    mods: { adsSpeedMul: 1.18, recoilMul: 0.92, spreadHipMul: 0.96 },
    build: (m, s) => {
      const g = new THREE.Group();
      const grip = bx(m.dark, 0.028 * s, 0.078 * s, 0.03 * s, 0, -0.044 * s, -0.01 * s);
      grip.rotation.x = -0.38;
      g.add(grip);
      return g;
    },
    unlock: { kind: "kills", value: 30 },
  },
  {
    id: "grip_bipod", slot: "grip", name: "Bipod",
    desc: "Deployable legs. Excellent stability, poor mobility.",
    mods: { recoilMul: 0.52, spreadAdsMul: 0.7, adsSpeedMul: 0.84, moveSpeedMul: 0.94 },
    build: (m, s) => {
      const g = new THREE.Group();
      for (const sx of [-1, 1]) {
        const leg = cy(m.accent, 0.006 * s, 0.005 * s, 0.11 * s, sx * 0.022 * s, -0.055 * s, 0, 6);
        leg.rotation.z = sx * 0.34;
        g.add(leg);
      }
      g.add(bx(m.dark, 0.05 * s, 0.02 * s, 0.03 * s, 0, -0.012 * s, 0));
      return g;
    },
    unlock: { kind: "score", value: 15000 },
  },

  // ── STOCKS ────────────────────────────────────────────────
  {
    id: "stock_std", slot: "stock", name: "Standard Stock",
    desc: "Issue fixed stock.",
    mods: {},
  },
  {
    id: "stock_heavy", slot: "stock", name: "Heavy Stock",
    desc: "Weighted cheek assembly. Rock steady, slows you down.",
    mods: { recoilMul: 0.7, spreadAdsMul: 0.78, moveSpeedMul: 0.93, adsSpeedMul: 0.9 },
    build: (m, s) => {
      const g = new THREE.Group();
      g.add(bx(m.dark, 0.062 * s, 0.07 * s, 0.1 * s, 0, 0.01 * s, 0.05 * s));
      g.add(bx(m.accent, 0.066 * s, 0.026 * s, 0.03 * s, 0, -0.03 * s, 0.09 * s));
      return g;
    },
  },
  {
    id: "stock_light", slot: "stock", name: "Skeleton Stock",
    desc: "Stripped to the frame. Fast and mobile, harder to hold steady.",
    mods: { moveSpeedMul: 1.06, adsSpeedMul: 1.2, recoilMul: 1.18 },
    build: (m, s) => {
      const g = new THREE.Group();
      g.add(bx(m.accent, 0.012 * s, 0.05 * s, 0.11 * s, 0, 0.012 * s, 0.05 * s));
      g.add(bx(m.accent, 0.05 * s, 0.01 * s, 0.03 * s, 0, -0.014 * s, 0.096 * s));
      return g;
    },
    unlock: { kind: "kills", value: 60 },
  },
  {
    id: "stock_none", slot: "stock", name: "No Stock",
    desc: "Removed entirely. Maximum speed, brutal recoil.",
    mods: { moveSpeedMul: 1.1, adsSpeedMul: 1.32, recoilMul: 1.45, spreadHipMul: 1.2 },
    unlock: { kind: "headshots", value: 40 },
  },

  // ═════════════════════════════════════════════════════════════
  //  EXPANDED ATTACHMENT CATALOG — Studio Edition
  //  Each new entry below offers a fresh trade-off so the loadout
  //  screen has more genuine *choices* per slot, not just sidegrades.
  // ═════════════════════════════════════════════════════════════

  // ── SIGHTS (expanded) ─────────────────────────────────────
  {
    id: "sight_prism", slot: "sight", name: "Prism 2×",
    desc: "Compact prismatic 2× with a wide eye-box. Best all-rounder optic.",
    mods: { zoomMul: 1.7, adsSpeedMul: 0.92, spreadAdsMul: 0.78 },
    build: (m, s) => {
      const g = new THREE.Group();
      g.add(bx(m.dark, 0.052 * s, 0.012 * s, 0.110 * s, 0, 0.004 * s, 0));
      g.add(cy(m.accent, 0.030 * s, 0.030 * s, 0.014 * s, 0, 0.034 * s, -0.028 * s, 12, Math.PI / 2));
      g.add(cy(m.accent, 0.030 * s, 0.030 * s, 0.014 * s, 0, 0.034 * s, 0.040 * s, 12, Math.PI / 2));
      g.add(cy(m.body, 0.022 * s, 0.026 * s, 0.090 * s, 0, 0.034 * s, 0.006 * s, 12, Math.PI / 2));
      const lens = cy(m.glass, 0.024 * s, 0.024 * s, 0.004 * s, 0, 0.034 * s, -0.040 * s, 14, Math.PI / 2);
      g.add(lens);
      // amber-tinted backup fibre
      const fibre = new THREE.Mesh(
        new THREE.BoxGeometry(0.004 * s, 0.004 * s, 0.075 * s),
        new THREE.MeshStandardMaterial({ color: 0xff8a1a, emissive: 0xff8a1a, emissiveIntensity: 2.4 })
      );
      fibre.position.set(0.026 * s, 0.034 * s, 0.006 * s);
      g.add(fibre);
      return g;
    },
    unlock: { kind: "kills", value: 90 },
  },
  {
    id: "sight_reflex_dual", slot: "sight", name: "Twin Reflex",
    desc: "Side-by-side reflex lenses for split-second transition between eyes.",
    mods: { zoomMul: 1.3, adsSpeedMul: 1.18, spreadAdsMul: 0.88, spreadHipMul: 0.95 },
    build: (m, s) => {
      const g = new THREE.Group();
      g.add(bx(m.dark, 0.068 * s, 0.010 * s, 0.062 * s, 0, 0.004 * s, 0));
      for (const sx of [-1, 1]) {
        const lens = new THREE.Mesh(new THREE.BoxGeometry(0.026 * s, 0.030 * s, 0.003 * s), m.glass);
        lens.position.set(sx * 0.018 * s, 0.026 * s, -0.014 * s);
        lens.rotation.x = 0.18;
        g.add(lens);
        g.add(bx(m.body, 0.007 * s, 0.038 * s, 0.010 * s, sx * 0.018 * s, 0.026 * s, 0.020 * s));
      }
      // two-tone reticle: red and green
      const dotColors = [0xff2a1a, 0x35ff9e];
      for (let i = 0; i < 2; i++) {
        const dot = new THREE.Mesh(
          new THREE.SphereGeometry(0.0035 * s, 8, 6),
          new THREE.MeshStandardMaterial({ color: dotColors[i], emissive: dotColors[i], emissiveIntensity: 4.5 })
        );
        dot.position.set((i === 0 ? -1 : 1) * 0.018 * s, 0.026 * s, -0.016 * s);
        g.add(dot);
      }
      return g;
    },
    unlock: { kind: "wave", value: 6 },
  },

  // ── BARRELS (expanded) ────────────────────────────────────
  {
    id: "barrel_compensator", slot: "barrel", name: "Compensator",
    desc: "Vents gas upward. Tames vertical recoil only, no spread penalty.",
    mods: { recoilMul: 0.78, spreadHipMul: 0.96 },
    build: (m, s) => {
      const g = new THREE.Group();
      g.add(cy(m.accent, 0.026 * s, 0.030 * s, 0.06 * s, 0, 0, -0.025 * s, 12, Math.PI / 2));
      // top vents
      for (let i = 0; i < 3; i++) {
        const vent = bx(m.dark, 0.014 * s, 0.004 * s, 0.006 * s, 0, 0.020 * s, -0.014 * s - i * 0.014 * s);
        g.add(vent);
      }
      return g;
    },
    unlock: { kind: "kills", value: 50 },
  },
  {
    id: "barrel_carbine", slot: "barrel", name: "Carbine Barrel",
    desc: "Shortened barrel. Snappy handling, sacrifices range.",
    mods: { adsSpeedMul: 1.16, moveSpeedMul: 1.03, falloffStartMul: 0.82, falloffEndMul: 0.85, spreadAdsMul: 1.06 },
    build: (m, s) => {
      const g = new THREE.Group();
      g.add(cy(m.accent, 0.020 * s, 0.022 * s, 0.110 * s, 0, 0, -0.05 * s, 12, Math.PI / 2));
      g.add(cy(m.dark, 0.030 * s, 0.028 * s, 0.018 * s, 0, 0, -0.105 * s, 12, Math.PI / 2));
      return g;
    },
  },
  {
    id: "barrel_flashhider", slot: "barrel", name: "Flash Hider",
    desc: "Pronged flash hider. Kills muzzle flash signature, no other effect.",
    mods: { velocityMul: 1.0 },
    build: (m, s) => {
      const g = new THREE.Group();
      g.add(cy(m.dark, 0.028 * s, 0.032 * s, 0.07 * s, 0, 0, -0.04 * s, 12, Math.PI / 2));
      // three prongs
      for (let i = 0; i < 3; i++) {
        const a = (i / 3) * Math.PI * 2;
        const prong = bx(m.accent, 0.005 * s, 0.020 * s, 0.006 * s,
          Math.cos(a) * 0.012 * s, Math.sin(a) * 0.012 * s, -0.075 * s);
        prong.rotation.z = a;
        g.add(prong);
      }
      return g;
    },
    unlock: { kind: "wave", value: 2 },
  },

  // ── MAGAZINES (expanded) ─────────────────────────────────
  {
    id: "mag_speedload", slot: "magazine", name: "Speed Loader",
    desc: "Tuned spring and follower. Magazine dumps in one motion.",
    mods: { magMul: 0.92, reloadMul: 0.50 },
    build: (m, s) => {
      const g = new THREE.Group();
      g.add(bx(m.accent, 0.048 * s, 0.07 * s, 0.078 * s, 0, -0.035 * s, 0));
      // pull tab
      g.add(bx(m.dark, 0.030 * s, 0.014 * s, 0.020 * s, 0, -0.076 * s, 0));
      // high-vis stripe
      g.add(bx(new THREE.MeshStandardMaterial({ color: 0xffae00, emissive: 0xffae00, emissiveIntensity: 0.6 }),
        0.050 * s, 0.006 * s, 0.080 * s, 0, -0.012 * s, 0));
      return g;
    },
    unlock: { kind: "score", value: 4000 },
  },
  {
    id: "mag_armor_piercing", slot: "magazine", name: "AP Magazine",
    desc: "Loaded with armour-piercing rounds. +15% damage, slower velocity.",
    mods: { damageMul: 1.15, velocityMul: 0.92, magMul: 0.95 },
    build: (m, s) => {
      const g = new THREE.Group();
      g.add(bx(m.dark, 0.052 * s, 0.082 * s, 0.082 * s, 0, -0.042 * s, 0));
      // black-tipped AP rounds visible at the top
      g.add(bx(new THREE.MeshStandardMaterial({ color: 0x0a0a0a, metalness: 0.6, roughness: 0.4 }),
        0.044 * s, 0.012 * s, 0.074 * s, 0, -0.004 * s, 0));
      // red warning stripe
      g.add(bx(new THREE.MeshStandardMaterial({ color: 0xc41818, emissive: 0xc41818, emissiveIntensity: 0.5 }),
        0.054 * s, 0.004 * s, 0.080 * s, 0, -0.070 * s, 0));
      return g;
    },
    unlock: { kind: "kills", value: 200 },
  },

  // ── GRIPS (expanded) ─────────────────────────────────────
  {
    id: "grip_laser", slot: "grip", name: "Laser Grip",
    desc: "Integrated visible laser. Improves hip-fire accuracy dramatically.",
    mods: { spreadHipMul: 0.72, recoilMul: 0.94 },
    build: (m, s) => {
      const g = new THREE.Group();
      g.add(bx(m.dark, 0.028 * s, 0.078 * s, 0.030 * s, 0, -0.044 * s, 0));
      g.add(bx(m.accent, 0.034 * s, 0.012 * s, 0.034 * s, 0, -0.088 * s, 0));
      // laser emitter
      const laser = new THREE.Mesh(
        new THREE.CylinderGeometry(0.003 * s, 0.003 * s, 0.012 * s, 8),
        new THREE.MeshStandardMaterial({ color: 0xff2a1a, emissive: 0xff2a1a, emissiveIntensity: 3.5 })
      );
      laser.position.set(0, -0.092 * s, 0);
      g.add(laser);
      return g;
    },
    unlock: { kind: "wave", value: 4 },
  },
  {
    id: "grip_handstop", slot: "grip", name: "Hand Stop",
    desc: "Minimal hand-stop. Lightest possible front grip, no recoil penalty.",
    mods: { adsSpeedMul: 1.10, spreadHipMul: 0.94, moveSpeedMul: 1.02 },
    build: (m, s) => {
      const g = new THREE.Group();
      g.add(bx(m.accent, 0.024 * s, 0.030 * s, 0.030 * s, 0, -0.018 * s, 0));
      g.add(bx(m.dark, 0.030 * s, 0.010 * s, 0.036 * s, 0, -0.036 * s, 0));
      return g;
    },
    unlock: { kind: "kills", value: 25 },
  },

  // ── STOCKS (expanded) ────────────────────────────────────
  {
    id: "stock_collapsible", slot: "stock", name: "Collapsible Stock",
    desc: "Six-position sliding stock. Tune stability vs mobility on the fly.",
    mods: { recoilMul: 0.92, adsSpeedMul: 1.08, moveSpeedMul: 1.02 },
    build: (m, s) => {
      const g = new THREE.Group();
      // two sliding rails
      for (const sx of [-1, 1]) {
        g.add(bx(m.accent, 0.008 * s, 0.014 * s, 0.13 * s, sx * 0.018 * s, 0.018 * s, 0.055 * s));
      }
      // sliding stock body
      g.add(bx(m.dark, 0.044 * s, 0.058 * s, 0.040 * s, 0, 0.014 * s, 0.090 * s));
      // buttpad
      g.add(bx(m.accent, 0.050 * s, 0.026 * s, 0.014 * s, 0, -0.012 * s, 0.110 * s));
      return g;
    },
    unlock: { kind: "kills", value: 35 },
  },
  {
    id: "stock_cheekrest", slot: "stock", name: "Cheek Riser",
    desc: "Raised cheek weld. Maximum stability, heavier handling.",
    mods: { recoilMul: 0.78, spreadAdsMul: 0.74, adsSpeedMul: 0.94, moveSpeedMul: 0.97 },
    build: (m, s) => {
      const g = new THREE.Group();
      g.add(bx(m.dark, 0.052 * s, 0.080 * s, 0.094 * s, 0, 0.020 * s, 0.058 * s));
      // raised cheek pad
      g.add(bx(m.accent, 0.060 * s, 0.030 * s, 0.062 * s, 0, 0.052 * s, 0.058 * s));
      // buttpad
      g.add(bx(m.dark, 0.060 * s, 0.030 * s, 0.016 * s, 0, -0.020 * s, 0.100 * s));
      return g;
    },
    unlock: { kind: "score", value: 9000 },
  },
];

export const ATTACH_BY_ID = new Map(ATTACHMENTS.map((a) => [a.id, a]));

export function attachmentsForSlot(slot: SlotId): AttachmentDef[] {
  return ATTACHMENTS.filter((a) => a.slot === slot);
}

/** the no-op default for each slot */
export const DEFAULT_ATTACHMENTS: Record<SlotId, string> = {
  sight: "sight_iron",
  barrel: "barrel_std",
  magazine: "mag_std",
  grip: "grip_std",
  stock: "stock_std",
};

// ── stat resolution ─────────────────────────────────────────

/** Extra fields the loadout layer adds on top of a WeaponDef. */
export interface DerivedStats {
  adsSpeedMul: number;
  moveSpeedMul: number;
}

/**
 * Fold a set of attachments into a weapon's base stats.
 * Pure — never mutates the source definition.
 */
export function applyAttachmentMods(
  base: WeaponDef,
  ids: string[]
): WeaponDef & DerivedStats {
  const out: WeaponDef & DerivedStats = { ...base, adsSpeedMul: 1, moveSpeedMul: 1 };
  for (const id of ids) {
    const a = ATTACH_BY_ID.get(id);
    if (!a) continue;
    const m = a.mods;
    if (m.zoomMul) out.zoom = Math.max(1.05, out.zoom * m.zoomMul);
    if (m.spreadHipMul) out.spreadHip *= m.spreadHipMul;
    if (m.spreadAdsMul) out.spreadAds *= m.spreadAdsMul;
    if (m.damageMul) out.damage *= m.damageMul;
    if (m.falloffStartMul) out.falloffStart *= m.falloffStartMul;
    if (m.falloffEndMul) out.falloffEnd *= m.falloffEndMul;
    if (m.magMul) out.magSize = Math.max(1, Math.round(out.magSize * m.magMul));
    if (m.magAdd) out.magSize = Math.max(1, out.magSize + m.magAdd);
    if (m.reloadMul) out.reloadTime *= m.reloadMul;
    if (m.rpmMul) out.rpm = Math.round(out.rpm * m.rpmMul);
    if (m.recoilMul) {
      out.recoilPitch *= m.recoilMul;
      out.recoilYaw *= m.recoilMul;
      out.kickZ *= m.recoilMul;
    }
    if (m.velocityMul && out.velocity) out.velocity = Math.round(out.velocity * m.velocityMul);
    if (m.adsSpeedMul) out.adsSpeedMul *= m.adsSpeedMul;
    if (m.moveSpeedMul) out.moveSpeedMul *= m.moveSpeedMul;
  }
  // keep reserve ammo proportional so extended mags stay sane
  out.reserveStart = Math.round(base.reserveStart * (out.magSize / base.magSize));
  return out;
}

// ── mounting ────────────────────────────────────────────────

export interface Anchors {
  sight: THREE.Vector3;
  barrel: THREE.Vector3;
  magazine: THREE.Vector3;
  grip: THREE.Vector3;
  stock: THREE.Vector3;
  /** reference size used to scale attachment geometry to the weapon */
  scale: number;
}

/**
 * Derive mount points from the weapon's own bounds so any weapon —
 * including future ones — receives correctly placed attachments.
 * `sight` and `muzzle` anchors from the model are preferred when present.
 */
export function deriveAnchors(
  group: THREE.Object3D,
  muzzle?: THREE.Object3D,
  sight?: THREE.Object3D
): Anchors {
  const box = new THREE.Box3().setFromObject(group);
  const size = new THREE.Vector3();
  const centre = new THREE.Vector3();
  box.getSize(size);
  box.getCenter(centre);
  const scale = THREE.MathUtils.clamp(size.z / 1.0, 0.65, 1.5);

  const sightPos = sight
    ? sight.position.clone().add(new THREE.Vector3(0, 0.03, 0))
    : new THREE.Vector3(0, box.max.y + 0.01, centre.z - size.z * 0.08);

  const barrelPos = muzzle
    ? muzzle.position.clone()
    : new THREE.Vector3(0, centre.y, box.min.z);

  return {
    sight: sightPos,
    barrel: barrelPos,
    magazine: new THREE.Vector3(0, box.min.y + size.y * 0.16, centre.z - size.z * 0.04),
    grip: new THREE.Vector3(0, box.min.y + size.y * 0.2, centre.z - size.z * 0.28),
    stock: new THREE.Vector3(0, centre.y, box.max.z - size.z * 0.02),
    scale,
  };
}

/**
 * Rebuild the attachment geometry hanging off a weapon.
 * Everything lives under one container so swapping is a single
 * clear-and-rebuild with no leaks.
 */
export function mountAttachments(
  container: THREE.Group,
  anchors: Anchors,
  ids: string[],
  mats: AttachMats
) {
  // tear down the previous set
  for (let i = container.children.length - 1; i >= 0; i--) {
    const c = container.children[i];
    c.traverse((o) => {
      const mesh = o as THREE.Mesh;
      if (mesh.isMesh) mesh.geometry.dispose();
    });
    container.remove(c);
  }

  for (const id of ids) {
    const a = ATTACH_BY_ID.get(id);
    if (!a || !a.build) continue;
    const part = a.build(mats, anchors.scale);
    part.position.copy(anchors[a.slot]);
    part.traverse((o) => {
      const mesh = o as THREE.Mesh;
      if (mesh.isMesh) {
        mesh.castShadow = false;
        mesh.receiveShadow = false;
        mesh.frustumCulled = false;
      }
    });
    container.add(part);
  }
}
