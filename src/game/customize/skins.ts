// ─────────────────────────────────────────────────────────────
//  WEAPON SKINS
//
//  A skin retextures a weapon's *structural* materials at runtime
//  without the weapon's builder knowing anything about it.
//
//  How it works:
//    1. `captureSkinTargets()` walks a built WeaponModel once and
//       snapshots every unique material, classifying each as
//         · STRUCTURAL — body panels, receivers, stocks   (retextured)
//         · ACCENT     — glowing/emissive detail parts    (recoloured)
//         · LOCKED     — lenses, ELIAS plate, reticles    (untouched)
//    2. `applySkin()` writes the skin over the structural set and
//       optionally re-tints the accent set.
//    3. Restoring is always possible because the original state of
//       every material is kept in the snapshot.
//
//  Adding a skin = append one entry to SKINS. Nothing else changes.
// ─────────────────────────────────────────────────────────────

import * as THREE from "three";
import { rng, heightToNormalPublic } from "../textures";

// ── seeded value noise (self-contained so skins stay decoupled) ──

function noise2D(seed: number, period: number) {
  const g = new Float32Array(period * period);
  const r = rng(seed);
  for (let i = 0; i < g.length; i++) g[i] = r();
  return (x: number, y: number) => {
    const xi = Math.floor(x), yi = Math.floor(y);
    const tx = x - xi, ty = y - yi;
    const x0 = ((xi % period) + period) % period;
    const y0 = ((yi % period) + period) % period;
    const x1 = (x0 + 1) % period, y1 = (y0 + 1) % period;
    const sx = tx * tx * (3 - 2 * tx), sy = ty * ty * (3 - 2 * ty);
    const a = g[y0 * period + x0], b = g[y0 * period + x1];
    const c = g[y1 * period + x0], d = g[y1 * period + x1];
    return (a + (b - a) * sx) + ((c + (d - c) * sx) - (a + (b - a) * sx)) * sy;
  };
}

function fbm2(seed: number, base: number, oct: number) {
  const layers: { f: (x: number, y: number) => number; p: number; a: number }[] = [];
  let p = base, a = 1, norm = 0;
  for (let i = 0; i < oct; i++) {
    layers.push({ f: noise2D(seed + i * 5387, p), p, a });
    norm += a; p *= 2; a *= 0.5;
  }
  return (u: number, v: number) => {
    let s = 0;
    for (const l of layers) s += l.f(u * l.p, v * l.p) * l.a;
    return s / norm;
  };
}

const hex2rgb = (h: number): [number, number, number] => [
  (h >> 16) & 255, (h >> 8) & 255, h & 255,
];

// ── pattern generators ──────────────────────────────────────

export type PatternKind =
  | "solid" | "camo" | "digital" | "tiger" | "hex"
  | "splinter" | "circuit" | "wornPaint" | "marble" | "hazard"
  | "brushed" | "twill" | "polish";

/** Build the albedo texture for a pattern from a palette. */
/**
 * Per-pattern surface behaviour. This is what stops skins being
 * recolours: each pattern drives its own HEIGHT field (hence its own
 * normal map), its own gloss response and its own metal response.
 */
interface PatternPhysics {
  /** relief written into the height field, 0 = printed flat */
  relief: number;
  /** roughness offset applied where the pattern is "raised" */
  glossHigh: number;
  /** metalness offset for the raised areas */
  metalHigh: number;
}

const PHYSICS: Record<PatternKind, PatternPhysics> = {
  solid:     { relief: 0.10, glossHigh: -0.04, metalHigh: 0.0 },
  camo:      { relief: 0.14, glossHigh: 0.05, metalHigh: -0.05 },
  digital:   { relief: 0.10, glossHigh: 0.04, metalHigh: -0.04 },
  tiger:     { relief: 0.12, glossHigh: 0.05, metalHigh: -0.05 },
  hex:       { relief: 0.70, glossHigh: -0.16, metalHigh: 0.10 },
  splinter:  { relief: 0.16, glossHigh: 0.03, metalHigh: -0.02 },
  circuit:   { relief: 0.55, glossHigh: -0.22, metalHigh: 0.18 },
  wornPaint: { relief: 0.48, glossHigh: -0.26, metalHigh: 0.42 },
  marble:    { relief: 0.22, glossHigh: -0.14, metalHigh: 0.08 },
  hazard:    { relief: 0.18, glossHigh: -0.06, metalHigh: 0.0 },
  // directional machine grain — catches light in one axis only
  brushed:   { relief: 0.26, glossHigh: -0.20, metalHigh: 0.12 },
  // carbon 2x2 twill: rounded tows under a gloss clear-coat
  twill:     { relief: 0.62, glossHigh: -0.30, metalHigh: -0.02 },
  // mirror polish: almost no relief, extreme gloss
  polish:    { relief: 0.06, glossHigh: -0.34, metalHigh: 0.18 },
};

interface SkinMaps {
  albedo: Uint8ClampedArray;
  height: Float32Array;
  rough: Uint8ClampedArray;
  metal: Uint8ClampedArray;
}

/**
 * Rasterise one pattern into a complete set of PBR channels.
 * The pattern index `p` (which palette slot a pixel landed on) and a
 * 0..1 `raise` value drive relief, gloss and metalness independently,
 * so a camo print stays flat and matte while a hex lattice stands
 * proud and catches light along its ridges.
 */
function buildSkinMaps(
  kind: PatternKind, palette: number[], surface: SkinSurface, seed: number, size: number
): SkinMaps {
  const cols = palette.map(hex2rgb);
  const pick = (i: number) => cols[Math.min(i, cols.length - 1)];
  const phys = PHYSICS[kind];

  const n = size * size;
  const albedo = new Uint8ClampedArray(n * 4);
  const height = new Float32Array(n);
  const rough = new Uint8ClampedArray(n * 4);
  const metal = new Uint8ClampedArray(n * 4);

  const r = rng(seed);
  const blob = fbm2(seed, 5, 4);
  const fine = fbm2(seed + 71, 18, 3);
  const grain = fbm2(seed + 133, 64, 2);
  const wearN = fbm2(seed + 311, 9, 4);

  const shards: [number, number, number][] = [];
  if (kind === "splinter") for (let i = 0; i < 14; i++) shards.push([r(), r(), r() * Math.PI]);

  const baseRough = surface.roughness ?? 0.6;
  const baseMetal = surface.metalness ?? 0.5;

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const idx = y * size + x;
      const u = x / size, v = y / size;
      let c: [number, number, number];
      let raise = 0;   // 0..1, how proud this pixel sits
      let slot = 0;

      switch (kind) {
        case "camo": {
          const a = blob(u, v), b = fine(u * 0.6, v * 0.6);
          const t = a * 0.7 + b * 0.3;
          slot = t < 0.4 ? 0 : t < 0.52 ? 1 : t < 0.66 ? 2 : 3;
          c = pick(slot);
          // printed fabric: relief comes from the weave, not the print
          raise = (Math.sin(x * 1.7) * 0.5 + 0.5) * 0.5 + (Math.sin(y * 1.7) * 0.5 + 0.5) * 0.5;
          break;
        }
        case "digital": {
          const cell = size / 24;
          const bx = Math.floor(x / cell), by = Math.floor(y / cell);
          const t = blob((bx * cell) / size, (by * cell) / size);
          const j = (Math.sin(bx * 12.9898 + by * 78.233) * 43758.5453) % 1;
          const k = t + Math.abs(j) * 0.16;
          slot = k < 0.42 ? 0 : k < 0.56 ? 1 : k < 0.72 ? 2 : 3;
          c = pick(slot);
          raise = (Math.sin(x * 2.1) * 0.5 + 0.5) * 0.6;
          break;
        }
        case "tiger": {
          const warp = blob(u * 1.4, v * 1.4) * 0.55;
          const sN = Math.sin((u * 3.2 + v * 1.1 + warp) * Math.PI * 3.4);
          const edge = fine(u * 2, v * 2) * 0.4;
          slot = sN + edge > 0.75 ? 2 : sN + edge > 0.1 ? 1 : 0;
          c = pick(slot);
          raise = grain(u, v);
          break;
        }
        case "hex": {
          // a real raised lattice: cell interiors sit proud, seams sink
          const hs = size / 11;
          const q = Math.floor(y / (hs * 0.75));
          const ox = q % 2 === 0 ? 0 : hs * 0.5;
          const hx = ((x + ox) % hs) / hs - 0.5;
          const hy = ((y % (hs * 0.75)) / (hs * 0.75)) - 0.5;
          const dist = Math.max(Math.abs(hx) * 1.16 + Math.abs(hy) * 0.67, Math.abs(hy) * 1.34);
          slot = dist > 0.44 ? 1 : dist > 0.36 ? 2 : 0;
          c = pick(slot);
          raise = dist > 0.44 ? 0 : dist > 0.36 ? 0.45 : 1 - dist * 0.6;
          break;
        }
        case "splinter": {
          let acc = 0;
          for (const [sx, sy, sa] of shards) {
            acc += Math.cos(sa) * (u - sx) + Math.sin(sa) * (v - sy) > 0 ? 1 : 0;
          }
          const t = (acc % 4) / 4;
          slot = t < 0.26 ? 0 : t < 0.5 ? 1 : t < 0.76 ? 2 : 3;
          c = pick(slot);
          raise = grain(u, v) * 0.8;
          break;
        }
        case "circuit": {
          // traces are ETCHED: channels sink, pads stand proud
          const g = size / 18;
          const onH = Math.abs(((y % g) / g) - 0.5) < 0.06;
          const onV = Math.abs(((x % g) / g) - 0.5) < 0.06;
          const live = blob(Math.floor(x / g) / 18, Math.floor(y / g) / 18) > 0.48;
          const node = Math.hypot((x % g) - g * 0.5, (y % g) - g * 0.5) < g * 0.14 && live;
          slot = node ? 2 : (onH || onV) && live ? 1 : 0;
          c = pick(slot);
          raise = node ? 1 : (onH || onV) && live ? 0.15 : 0.62;
          break;
        }
        case "wornPaint": {
          // coating flakes away: paint edges lift, bare metal sits lower
          const wear = blob(u * 1.2, v * 1.2) * 0.65 + fine(u * 2.4, v * 2.4) * 0.35;
          slot = wear > 0.66 ? 1 : wear > 0.58 ? 2 : 0;
          c = pick(slot);
          raise = wear > 0.66 ? 0.0 : wear > 0.58 ? 0.35 : 1.0;
          break;
        }
        case "marble": {
          const vein = Math.sin((u * 6 + blob(u, v) * 7) * Math.PI);
          const k = Math.abs(vein);
          slot = k > 0.86 ? 2 : k > 0.5 ? 1 : 0;
          c = pick(slot);
          raise = k;
          break;
        }
        case "hazard": {
          const sN = ((u + v) * 7) % 1;
          slot = sN < 0.5 ? 0 : 1;
          c = pick(slot);
          raise = sN < 0.5 ? 1 : 0.2;
          break;
        }
        case "brushed": {
          // fine unidirectional striations, the signature of brushed steel
          const line =
            Math.sin(v * size * 2.3 + Math.sin(u * 17) * 1.6) * 0.5 +
            Math.sin(v * size * 0.7 + Math.cos(u * 9) * 2.4) * 0.5;
          const k = line * 0.5 + 0.5;
          slot = k > 0.62 ? 1 : k > 0.3 ? 0 : 2;
          c = pick(slot);
          raise = k;
          break;
        }
        case "twill": {
          // carbon fibre: 2x2 twill, alternating over/under tow blocks
          const cell = size / 16;
          const bx = Math.floor(x / cell), by = Math.floor(y / cell);
          const over = (bx + by) % 2 === 0;
          const inX = (x % cell) / cell, inY = (y % cell) / cell;
          const along = over ? inY : inX;
          const tow = Math.sin(along * Math.PI);
          // individual filaments running along each tow
          const fil = Math.sin((over ? inX : inY) * Math.PI * 9) * 0.5 + 0.5;
          slot = tow > 0.62 ? 0 : tow > 0.25 ? 1 : 2;
          c = pick(slot);
          raise = tow * 0.85 + fil * 0.15;
          break;
        }
        case "polish": {
          // mirror finish: broad soft swirl, almost perfectly flat
          const swirl = Math.sin((u * 2.2 + blob(u, v) * 3.1) * Math.PI);
          const k = Math.abs(swirl);
          slot = k > 0.9 ? 1 : k > 0.45 ? 0 : 2;
          c = pick(slot);
          raise = k * 0.4 + 0.3;
          break;
        }
        default:
          c = pick(0);
          raise = grain(u, v);
      }

      // ── height ──
      const micro = grain(u, v) * 0.16;
      height[idx] = raise * phys.relief + micro * 0.3;

      // ── albedo with shared micro-grain ──
      const gn = (grain(u, v) - 0.5) * 16;
      const i4 = idx * 4;
      albedo[i4] = c[0] + gn;
      albedo[i4 + 1] = c[1] + gn;
      albedo[i4 + 2] = c[2] + gn;
      albedo[i4 + 3] = 255;

      // ── roughness / metalness driven by the same relief ──
      let ro = baseRough + phys.glossHigh * raise + (grain(u, v) - 0.5) * 0.1;
      let me = baseMetal + phys.metalHigh * raise;

      // abrasion polishes high points and exposes bare metal
      const wr = wearN(u, v);
      if (wr > 0.72) {
        const t = (wr - 0.72) / 0.28;
        ro -= t * 0.22;
        me += t * 0.25;
      }

      ro = Math.max(0.04, Math.min(1, ro));
      me = Math.max(0, Math.min(1, me));
      const rv = ro * 255, mv = me * 255;
      rough[i4] = rv; rough[i4 + 1] = rv; rough[i4 + 2] = rv; rough[i4 + 3] = 255;
      metal[i4] = mv; metal[i4 + 1] = mv; metal[i4 + 2] = mv; metal[i4 + 3] = 255;
    }
  }

  return { albedo, height, rough, metal };
}

// ── skin definitions ────────────────────────────────────────

export type SkinRarity = "standard" | "rare" | "epic" | "legendary";

/** how a skin paints the weapon's structural materials */
export interface SkinSurface {
  pattern: PatternKind;
  palette: number[];
  /** texture tiling across the part */
  repeat?: number;
  metalness?: number;
  roughness?: number;
  /** multiplied over the pattern (or used alone for solid skins) */
  tint?: number;
}

export type SkinFx = "none" | "pulse" | "scroll" | "shimmer" | "flicker";

export interface SkinDef {
  id: string;
  name: string;
  rarity: SkinRarity;
  desc: string;
  /** two colours the UI uses to draw the swatch */
  swatch: [string, string];
  surface: SkinSurface;
  /** re-tint of the weapon's emissive accent parts */
  accent?: number;
  /** overrides the muzzle-flash colour while equipped */
  muzzleColor?: number;
  /** overrides the tracer colour while equipped */
  tracerColor?: number;
  /** animated flair driven every frame */
  fx?: SkinFx;
  /** emits a coloured particle trail from the muzzle on fire */
  trail?: number;
  /** unlock requirement; absent = available from the start */
  unlock?: { kind: "kills" | "score" | "wave" | "headshots"; value: number };
}

/**
 * Global catalogue. `weapons` restricts a skin to certain weapons;
 * omit it and the skin is offered for every weapon in the game.
 */
export const SKINS: SkinDef[] = [
  {
    id: "factory",
    name: "Factory Issue",
    rarity: "standard",
    desc: "Standard service finish. No embellishment.",
    swatch: ["#2b3038", "#14161a"],
    surface: { pattern: "solid", palette: [0x2b3038], metalness: 0.7, roughness: 0.45 },
  },
  {
    id: "matteblack",
    name: "Midnight",
    rarity: "standard",
    desc: "Matte black cerakote. Drinks light, gives nothing back.",
    swatch: ["#1a1c20", "#0a0b0d"],
    surface: { pattern: "solid", palette: [0x16181c], metalness: 0.28, roughness: 0.88 },
  },
  {
    id: "gunmetal",
    name: "Brushed Gunmetal",
    rarity: "standard",
    desc: "Bare machined steel with a fine brushed grain.",
    swatch: ["#9aa2ab", "#5d646c"],
    surface: { pattern: "brushed", palette: [0x8f97a0, 0xb4bcc5, 0x6a717a], repeat: 3, metalness: 0.95, roughness: 0.26 },
  },
  {
    id: "woodland",
    name: "Woodland",
    rarity: "standard",
    desc: "Four-tone temperate camouflage.",
    swatch: ["#4a5236", "#2a2e1e"],
    surface: { pattern: "camo", palette: [0x3c4430, 0x5a6340, 0x2b2f21, 0x6d6a4a], repeat: 2, metalness: 0.3, roughness: 0.82 },
  },
  {
    id: "arctic",
    name: "Arctic Splinter",
    rarity: "rare",
    desc: "Hard-edged winter disruption pattern.",
    swatch: ["#d8dee5", "#8a949e"],
    surface: { pattern: "splinter", palette: [0xd4dae1, 0x9aa4ae, 0x6d757e, 0xeef2f6], repeat: 2, metalness: 0.42, roughness: 0.6 },
    unlock: { kind: "kills", value: 50 },
  },
  {
    id: "digital",
    name: "Urban Digital",
    rarity: "rare",
    desc: "Pixelated grey disruption. City-fight issue.",
    swatch: ["#6b7179", "#2c3036"],
    surface: { pattern: "digital", palette: [0x40454b, 0x6b7179, 0x25282d, 0x8d949c], repeat: 2, metalness: 0.4, roughness: 0.74 },
    unlock: { kind: "wave", value: 4 },
  },
  {
    id: "tiger",
    name: "Tigerstripe",
    rarity: "rare",
    desc: "Torn diagonal stripes. Jungle heritage pattern.",
    swatch: ["#6a6a3c", "#231f16"],
    surface: { pattern: "tiger", palette: [0x5c5f36, 0x2a2a1c, 0x7d7a48], repeat: 2, metalness: 0.32, roughness: 0.8 },
    unlock: { kind: "kills", value: 120 },
  },
  {
    id: "carbon",
    name: "Carbon Weave",
    rarity: "rare",
    desc: "Aerospace composite over a gloss clear-coat.",
    swatch: ["#26292e", "#0e1013"],
    surface: { pattern: "twill", palette: [0x1a1d21, 0x2e333a, 0x0d0f12], repeat: 4, metalness: 0.35, roughness: 0.22 },
    unlock: { kind: "score", value: 8000 },
  },
  {
    id: "battleworn",
    name: "Battle-Worn",
    rarity: "epic",
    desc: "Paint chipped back to steel. Every mark earned.",
    swatch: ["#4d4a42", "#9aa0a6"],
    surface: { pattern: "wornPaint", palette: [0x3f3d37, 0x9aa1a8, 0x6a6258], repeat: 2.5, metalness: 0.72, roughness: 0.52 },
    unlock: { kind: "kills", value: 250 },
  },
  {
    id: "chrome",
    name: "Liquid Chrome",
    rarity: "epic",
    desc: "Mirror-polished. Reflects the muzzle flash back at you.",
    swatch: ["#e8eef5", "#9fb0c2"],
    surface: { pattern: "polish", palette: [0xdfe7ef, 0xffffff, 0xa8b6c4], repeat: 2, metalness: 1.0, roughness: 0.04 },
    accent: 0xbfe4ff,
    fx: "shimmer",
    unlock: { kind: "score", value: 20000 },
  },
  {
    id: "gold",
    name: "Gilded Wrath",
    rarity: "legendary",
    desc: "Solid gold plating with a deep lustre. Pure statement.",
    swatch: ["#f5cd5c", "#8a6412"],
    surface: { pattern: "polish", palette: [0xd8a52e, 0xf7db72, 0x9a6f14], repeat: 2, metalness: 1.0, roughness: 0.14 },
    accent: 0xffd76a,
    muzzleColor: 0xffd76a,
    tracerColor: 0xffd76a,
    fx: "shimmer",
    unlock: { kind: "score", value: 45000 },
  },
  {
    id: "neon",
    name: "Neon Circuit",
    rarity: "legendary",
    desc: "Live circuitry etched into the frame. Pulses as it fires.",
    swatch: ["#12f0c8", "#0a1418"],
    surface: { pattern: "circuit", palette: [0x0c1418, 0x11a58c, 0x24f7cf], repeat: 3, metalness: 0.6, roughness: 0.34 },
    accent: 0x24f7cf,
    muzzleColor: 0x4dffe0,
    tracerColor: 0x24f7cf,
    fx: "pulse",
    trail: 0x24f7cf,
    unlock: { kind: "wave", value: 10 },
  },
  {
    id: "infernal",
    name: "Infernal",
    rarity: "legendary",
    desc: "Molten veins crawl across blackened steel.",
    swatch: ["#ff5a12", "#1b0d07"],
    surface: { pattern: "marble", palette: [0x1a0e08, 0xff5410, 0x7a2408], repeat: 2.4, metalness: 0.78, roughness: 0.4 },
    accent: 0xff6a1e,
    muzzleColor: 0xff7a24,
    tracerColor: 0xff6a1e,
    fx: "scroll",
    trail: 0xff5a12,
    unlock: { kind: "headshots", value: 75 },
  },
  {
    id: "phantom",
    name: "Phantom Protocol",
    rarity: "legendary",
    desc: "Experimental cloaking lattice. Flickers between states.",
    swatch: ["#9a6cff", "#15101f"],
    surface: { pattern: "hex", palette: [0x141020, 0x5e3fb0, 0x9a6cff], repeat: 4, metalness: 0.85, roughness: 0.2 },
    accent: 0xb48cff,
    muzzleColor: 0xb48cff,
    tracerColor: 0x9a6cff,
    fx: "flicker",
    trail: 0x9a6cff,
    unlock: { kind: "kills", value: 500 },
  },
];

export const SKIN_BY_ID = new Map(SKINS.map((s) => [s.id, s]));
export const DEFAULT_SKIN = "factory";

// ── material capture + application ──────────────────────────

type Role = "structural" | "accent" | "locked";

interface Captured {
  mat: THREE.MeshStandardMaterial;
  role: Role;
  // original state, so any skin can be replaced or removed cleanly
  color: number;
  emissive: number;
  emissiveIntensity: number;
  metalness: number;
  roughness: number;
  map: THREE.Texture | null;
}

export interface SkinTargets {
  items: Captured[];
  /** cached generated textures, disposed when the model is torn down */
  generated: THREE.Texture[];
}

/**
 * Snapshot every unique material on a weapon and classify it.
 * Materials opt out with `userData.skinRole = "locked"` (used by the
 * ELIAS plate and optic glass so branding and reticles survive).
 */
export function captureSkinTargets(root: THREE.Object3D): SkinTargets {
  const seen = new Set<string>();
  const items: Captured[] = [];
  root.traverse((o) => {
    const mesh = o as THREE.Mesh;
    if (!mesh.isMesh) return;
    const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    for (const m of mats) {
      const sm = m as THREE.MeshStandardMaterial;
      if (!sm || !sm.isMeshStandardMaterial || seen.has(sm.uuid)) continue;
      seen.add(sm.uuid);

      let role: Role;
      const declared = sm.userData?.skinRole as Role | undefined;
      // NOTE: emissiveIntensity defaults to 1.0 on every standard
      // material, so it alone cannot identify a glowing part — the
      // emissive COLOUR must actually be non-black.
      const emits = sm.emissive.getHex() !== 0x000000 && sm.emissiveIntensity > 0.01;
      if (declared) role = declared;
      else if (sm.emissiveMap) role = "locked";          // ELIAS plate, reticle art
      else if (emits && sm.emissiveIntensity >= 0.9) role = "accent";   // glow details
      else role = "structural";

      items.push({
        mat: sm,
        role,
        color: sm.color.getHex(),
        emissive: sm.emissive.getHex(),
        emissiveIntensity: sm.emissiveIntensity,
        metalness: sm.metalness,
        roughness: sm.roughness,
        map: sm.map,
      });
    }
  });
  return { items, generated: [] };
}

interface SkinPBR {
  map: THREE.CanvasTexture;
  normalMap: THREE.CanvasTexture;
  roughnessMap: THREE.CanvasTexture;
  metalnessMap: THREE.CanvasTexture;
}

const pbrCache = new Map<string, SkinPBR>();

const SKIN_RES = 512;

/**
 * Build (or fetch) the complete PBR set for a skin. Every skin owns
 * its own normal, roughness and metallic maps — no two skins share
 * surface relief, which is what makes them read as different
 * materials rather than different colours.
 */
function skinPBR(skin: SkinDef): SkinPBR {
  const s = skin.surface;
  const key = `${skin.id}|${s.pattern}|${s.palette.join(",")}`;
  let set = pbrCache.get(key);
  if (set) return set;

  let seed = 17;
  for (let i = 0; i < key.length; i++) seed = (seed * 31 + key.charCodeAt(i)) >>> 0;

  const maps = buildSkinMaps(s.pattern, s.palette, s, seed, SKIN_RES);
  set = {
    map: rawTexture(SKIN_RES, maps.albedo, true),
    normalMap: heightToNormalPublic(maps.height, SKIN_RES, PHYSICS[s.pattern].relief > 0.4 ? 3.0 : 1.8),
    roughnessMap: rawTexture(SKIN_RES, maps.rough, false),
    metalnessMap: rawTexture(SKIN_RES, maps.metal, false),
  };
  pbrCache.set(key, set);
  return set;
}

function rawTexture(size: number, data: Uint8ClampedArray, srgb: boolean): THREE.CanvasTexture {
  const cv = document.createElement("canvas");
  cv.width = cv.height = size;
  const c = cv.getContext("2d")!;
  const img = c.createImageData(size, size);
  img.data.set(data);
  c.putImageData(img, 0, 0);
  const t = new THREE.CanvasTexture(cv);
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = 8;
  return t;
}

/** number of distinct PBR sets generated (diagnostics) */
export function skinTextureCount(): number {
  return pbrCache.size;
}

/**
 * Paint a skin onto a captured material set. Safe to call every time
 * the player changes selection — it always writes from the captured
 * originals rather than stacking on the previous skin.
 */
export function applySkin(targets: SkinTargets, skin: SkinDef) {
  const s = skin.surface;
  const pbr = skinPBR(skin);

  for (const it of targets.items) {
    const m = it.mat;
    if (it.role === "locked") continue;

    if (it.role === "accent") {
      // accents keep their glow but adopt the skin's signature colour
      m.emissive.setHex(skin.accent ?? it.emissive);
      m.emissiveIntensity = it.emissiveIntensity;
      continue;
    }

    // ── structural: full PBR repaint ──
    const rep = s.repeat ?? 2;
    const bind = (src: THREE.Texture) => {
      const t = src.clone();
      t.needsUpdate = true;
      t.repeat.set(rep, rep);
      t.wrapS = t.wrapT = THREE.RepeatWrapping;
      targets.generated.push(t);
      return t;
    };
    m.map = bind(pbr.map);
    m.normalMap = bind(pbr.normalMap);
    m.roughnessMap = bind(pbr.roughnessMap);
    m.metalnessMap = bind(pbr.metalnessMap);
    m.normalScale.set(1, 1);
    m.color.setHex(s.tint ?? 0xffffff);
    // the maps carry the values; scalars act as multipliers
    m.roughness = 1;
    m.metalness = 1;
    // structural parts pick up a faint sympathetic glow on fx skins
    if (skin.accent && skin.fx && skin.fx !== "none") {
      m.emissive.setHex(skin.accent);
      m.emissiveIntensity = 0.06;
    } else {
      m.emissive.setHex(it.emissive);
      m.emissiveIntensity = it.emissiveIntensity;
    }
    m.needsUpdate = true;
  }
}

/** Free textures a previous skin generated for this model. */
export function clearGenerated(targets: SkinTargets) {
  for (const t of targets.generated) t.dispose();
  targets.generated.length = 0;
}

/**
 * Per-frame flair. `heat` is the weapon's action energy (1 right
 * after a shot), letting skins react to firing.
 */
export function animateSkin(targets: SkinTargets, skin: SkinDef, t: number, heat: number) {
  if (!skin.fx || skin.fx === "none") return;
  let k = 1;
  switch (skin.fx) {
    case "pulse":   k = 0.55 + Math.sin(t * 2.6) * 0.45; break;
    case "shimmer": k = 0.7 + Math.sin(t * 1.4) * 0.3; break;
    case "flicker": k = Math.sin(t * 17) > 0.5 ? 1 : 0.25 + Math.sin(t * 3) * 0.2; break;
    case "scroll":  k = 0.5 + Math.sin(t * 1.1) * 0.5; break;
  }
  const boost = 1 + heat * 4;

  for (const it of targets.items) {
    if (it.role === "locked") continue;
    const m = it.mat;
    if (it.role === "accent") {
      m.emissiveIntensity = it.emissiveIntensity * (0.5 + k) * boost;
    } else {
      m.emissiveIntensity = 0.04 + k * 0.1 + heat * 0.5;
      if (skin.fx === "scroll" && m.map) {
        // molten veins crawl across the surface
        m.map.offset.y = (t * 0.045) % 1;
      }
    }
  }
}
