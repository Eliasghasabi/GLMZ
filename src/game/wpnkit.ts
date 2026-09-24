// ─────────────────────────────────────────────────────────────
//  Weapon construction kit — shared types, animation maths,
//  geometry primitives, articulated hands, the ELIAS signature
//  plate, and a procedural PBR material factory for weapons.
//
//  Lives in its own module so both weapons.ts and the individual
//  weapon-family modules (snipers.ts, …) can import it without a
//  circular dependency. Adding a new weapon family means adding
//  one module that imports this kit — nothing else changes.
// ─────────────────────────────────────────────────────────────

import * as THREE from "three";
import { rng, heightToNormalPublic } from "./textures";

// ── weapon identity + stats ─────────────────────────────────

export type WeaponId =
  | "assault" | "shotgun" | "sniper" | "smg" | "revolver"
  // sniper variants
  | "longbow" | "vector" | "obsidian";

/** camera shake profile: amplitude (rad), frequency (Hz), duration (s) */
export interface ShakeProfile { amp: number; freq: number; dur: number }

export interface WeaponDef {
  id: WeaponId;
  slot: number;
  name: string;
  short: string;
  damage: number;
  headMult: number;
  rpm: number;
  magSize: number;
  reserveStart: number;
  reloadTime: number;
  spreadHip: number;
  spreadAds: number;
  pellets: number;
  auto: boolean;
  recoilPitch: number;
  recoilYaw: number;
  kickZ: number;
  zoom: number;
  falloffStart: number;
  falloffEnd: number;
  falloffMin: number;
  tracerColor: number;
  flashScale: number;
  scoped: boolean;

  // ── optional, data-driven presentation & feel ──
  /** muzzle effect style; defaults to a standard flash + smoke */
  muzzleFx?: "standard" | "dragon" | "heavyBrake" | "compensator" | "suppressed";
  /** delay before the bolt/charging sound plays (s); 0/undefined = none */
  boltDelay?: number;
  /** mechanical cycle time — the beat before the weapon is ready again (s) */
  boltCycle?: number;
  /** muzzle velocity (m/s), shown in the arsenal readout */
  velocity?: number;
  /** camera shake kicked on every shot */
  shake?: ShakeProfile;
  /** camera shake kicked by the kill-confirm flourish */
  killShake?: ShakeProfile;
  /** one-line tactical identity for the UI */
  blurb?: string;
}

// ── animation maths ─────────────────────────────────────────

export interface Pose {
  px: number; py: number; pz: number;
  rx: number; ry: number; rz: number;
}

export function zeroPose(p: Pose) {
  p.px = p.py = p.pz = p.rx = p.ry = p.rz = 0;
}

/** normalised progress inside [a,b], clamped 0..1 */
export function seg(t: number, a: number, b: number): number {
  if (t <= a) return 0;
  if (t >= b) return 1;
  return (t - a) / (b - a);
}
/** smoothstep 0→1 */
export const ease = (t: number) => t * t * (3 - 2 * t);
/** heavy ease-out — fast start, long settle (weighty machinery) */
export const easeOutHeavy = (t: number) => 1 - Math.pow(1 - Math.min(1, Math.max(0, t)), 4);
/** sharp ease-in — slow build then snap (spring release) */
export const easeInSharp = (t: number) => Math.pow(Math.min(1, Math.max(0, t)), 3);
/** 0→1→0 half-sine inside [a,b] */
export function pulse(t: number, a: number, b: number): number {
  return Math.sin(seg(t, a, b) * Math.PI);
}
/** snappy overshoot 0→1 */
export function overshoot(t: number, amount = 1.7): number {
  const k = Math.min(1, Math.max(0, t));
  return 1 + (amount + 1) * Math.pow(k - 1, 3) + amount * Math.pow(k - 1, 2);
}
/** damped oscillation, 1 → 0 (recoil settle, mechanical ring-out) */
export function damped(t: number, freq: number, decay: number): number {
  return Math.cos(t * freq * Math.PI * 2) * Math.exp(-t * decay);
}
/** elastic snap: overshoots then rings down (bolt slamming home) */
export function elastic(t: number, freq = 3, decay = 6): number {
  const k = Math.min(1, Math.max(0, t));
  if (k <= 0) return 0;
  if (k >= 1) return 1;
  return 1 - Math.exp(-k * decay) * Math.cos(k * freq * Math.PI * 2);
}

export interface ReloadMark { t: number; s: 0 | 1 | 2 }

/**
 * A weapon's complete motion set. Only idle/fire/reload are
 * required; the rest let a weapon opt into richer choreography.
 * Every callback writes an ADDITIVE offset into `p`.
 */
export interface WeaponAnim {
  /** audio cue points through the reload */
  marks: ReloadMark[];
  /** how fast the fire action decays (bolt/pump cycle speed) */
  actionRate: number;

  /** resting motion — unique rhythm per weapon */
  idle(p: Pose, t: number, speedN: number, ads: number): void;
  /** k: 1 → 0 immediately after each shot */
  fire(p: Pose, k: number): void;
  /** t: 0 → 1 across the whole reload / bolt cycle */
  reload(p: Pose, t: number): void;

  /** raise / ready as the weapon is brought up (t: 0 → 1) */
  equip?(p: Pose, t: number): void;
  /** lower / holster as the weapon is put away (t: 0 → 1) */
  holster?(p: Pose, t: number): void;
  /** extra motion during the sight transition; vel is d(blend)/dt */
  adsTransition?(p: Pose, blend: number, vel: number): void;
  /** kill-confirm flourish (t: 0 → 1) */
  killConfirm?(p: Pose, t: number): void;

  /** seconds the kill flourish runs for (default 0.7) */
  killDur?: number;
  /** seconds the raise takes (default 0.42) */
  equipDur?: number;
  /** seconds the lower takes (default 0.24) */
  holsterDur?: number;
}

export interface WeaponModel {
  group: THREE.Group;
  muzzle: THREE.Object3D;
  /**
   * Optical axis of the sight, in model space. When present the ADS
   * offset is derived from it automatically, so the reticle always
   * lands on the crosshair even if the model is re-proportioned.
   */
  sight?: THREE.Object3D;
  hands: Hands;
  anim: WeaponAnim;
  /** cosmetic skin animation (glow, spin, counters) */
  animate?: (t: number, dt: number, ammo: number, heat: number) => void;
  /** moving-part + material animation for the kill flourish (t: 0 → 1) */
  killFx?: (t: number, dt: number) => void;
  /** release any generated textures / materials */
  dispose?: () => void;
}

// ── engraved "ELIAS" signature plate ────────────────────────

function eliasTexture(ink: string, bevel: string): THREE.CanvasTexture {
  const W = 320, H = 96;
  const cv = document.createElement("canvas");
  cv.width = W; cv.height = H;
  const c = cv.getContext("2d")!;
  c.clearRect(0, 0, W, H);

  const fs = 44;
  c.font = `900 ${fs}px "Arial Narrow", "Haettenschweiler", Impact, sans-serif`;
  c.textAlign = "center";
  c.textBaseline = "alphabetic";

  const chars = "ELIAS".split("");
  const tracking = fs * 0.2;
  const widths = chars.map((ch) => c.measureText(ch).width);
  const total = widths.reduce((a, b) => a + b, 0) + tracking * (chars.length - 1);
  const baseY = H * 0.6;
  let pen = (W - total) / 2;
  const glyphs = chars.map((ch, i) => {
    const g = { ch, x: pen + widths[i] / 2, w: widths[i] };
    pen += widths[i] + tracking;
    return g;
  });
  const draw = (dx: number, dy: number) => {
    for (const g of glyphs) c.fillText(g.ch, g.x + dx, baseY + dy);
  };

  c.fillStyle = "rgba(0,0,0,0.92)";
  draw(0, 2.2);
  draw(1.1, 1.4);
  c.fillStyle = bevel;
  draw(-1.1, -1.2);
  c.fillStyle = ink;
  draw(0, 0);

  c.globalCompositeOperation = "destination-out";
  c.fillStyle = "#000";
  for (const by of [baseY - fs * 0.6, baseY - fs * 0.24]) {
    for (const g of glyphs) {
      c.fillRect(g.x - g.w * 0.62, by - fs * 0.028, g.w * 1.24, fs * 0.055);
    }
  }
  c.globalCompositeOperation = "source-over";

  c.strokeStyle = ink;
  c.globalAlpha = 0.8;
  c.lineWidth = 2;
  c.beginPath();
  c.moveTo(14, baseY - fs * 0.3); c.lineTo(44, baseY - fs * 0.3);
  c.moveTo(W - 44, baseY - fs * 0.3); c.lineTo(W - 14, baseY - fs * 0.3);
  c.stroke();
  c.globalAlpha = 0.5;
  c.font = `bold 12px "Courier New", monospace`;
  c.fillStyle = ink;
  c.fillText("SIGNATURE SERIES", W / 2, H - 12);
  c.globalAlpha = 1;

  const t = new THREE.CanvasTexture(cv);
  t.anisotropy = 8;
  return t;
}

export interface EliasPlate { mesh: THREE.Group; mat: THREE.MeshStandardMaterial }

export function eliasPlate(
  w: number, h: number, ink: string, bevel: string, glow: number
): EliasPlate {
  const tex = eliasTexture(ink, bevel);
  const mat = new THREE.MeshStandardMaterial({
    map: tex, emissiveMap: tex, emissive: glow, emissiveIntensity: 0.55,
    transparent: true, metalness: 0.7, roughness: 0.35,
    depthWrite: false, polygonOffset: true, polygonOffsetFactor: -3,
  });
  mat.userData.skinRole = "locked";   // signature branding survives every skin
  const g = new THREE.Group();
  const geo = new THREE.PlaneGeometry(w, h);
  const left = new THREE.Mesh(geo, mat);
  left.rotation.y = -Math.PI / 2;
  const right = new THREE.Mesh(geo, mat);
  right.rotation.y = Math.PI / 2;
  g.add(left, right);
  return { mesh: g, mat };
}

// ── geometry primitives ─────────────────────────────────────

export function B(w: number, h: number, d: number, m: THREE.Material, x = 0, y = 0, z = 0) {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m);
  mesh.position.set(x, y, z);
  return mesh;
}

export function C(
  r0: number, r1: number, h: number, m: THREE.Material,
  x = 0, y = 0, z = 0, seg2 = 12
) {
  const mesh = new THREE.Mesh(new THREE.CylinderGeometry(r0, r1, h, seg2), m);
  mesh.position.set(x, y, z);
  return mesh;
}

/** cylinder aligned down the barrel axis (-Z) */
export function tubeZ(
  r0: number, r1: number, len: number, m: THREE.Material,
  x = 0, y = 0, z = 0, seg2 = 12
) {
  const mesh = C(r0, r1, len, m, x, y, z, seg2);
  mesh.rotation.x = Math.PI / 2;
  return mesh;
}

/** hexagonal prism down the barrel axis — reads as a machined flute */
export function hexZ(r: number, len: number, m: THREE.Material, x = 0, y = 0, z = 0) {
  const mesh = C(r, r, len, m, x, y, z, 6);
  mesh.rotation.x = Math.PI / 2;
  return mesh;
}

/** thin ring / collar around the barrel */
export function ringZ(
  r: number, thick: number, m: THREE.Material,
  x = 0, y = 0, z = 0, radSeg = 5, tubSeg = 12
) {
  const mesh = new THREE.Mesh(new THREE.TorusGeometry(r, thick, radSeg, tubSeg), m);
  mesh.position.set(x, y, z);
  return mesh;
}

// ── articulated hands ───────────────────────────────────────
//
//  Fully re-modelled anatomical rig lives in ./hands. This section
//  is the adapter that keeps the historic `Hands` shape intact, so
//  every existing weapon animation keeps working unchanged.

export { HAND_MATERIALS } from "./hands/materials";
import { HAND_MATERIALS as HM } from "./hands/materials";
import { buildHand, type HandRig } from "./hands/rig";
import {
  applyGrip, HandAnimator, DEFAULT_LEFT, DEFAULT_RIGHT,
  type GripProfile, type GripKind,
} from "./hands/poses";

export type { GripProfile, GripKind, HandRig };
export { HandAnimator };

export interface Hands {
  /** outer transform — weapon animations translate/rotate these */
  left: THREE.Group;
  right: THREE.Group;
  leftHome: THREE.Vector3;
  rightHome: THREE.Vector3;
  /** small prop held by the left hand (magazine / shell / speedloader) */
  carried: THREE.Group;
  // ── new rig surface ──
  leftRig: HandRig;
  rightRig: HandRig;
  leftGrip: GripProfile;
  rightGrip: GripProfile;
  animator: HandAnimator;
  /** re-pose both hands for the current frame */
  pose(): void;
}

export interface HandsOptions {
  leftGrip?: Partial<GripProfile>;
  rightGrip?: Partial<GripProfile>;
  coverage?: "full" | "fingerless" | "bare";
  plating?: boolean;
}

/**
 * A hand wraps a cylinder lying along its own local X axis, so each
 * grip style needs the rig rolled into the right plane before the
 * fingers will close around the weapon instead of through it.
 */
function baseOrientation(kind: GripKind, side: 1 | -1): THREE.Euler {
  switch (kind) {
    // vertical grip: local X points down the backstrap
    case "pistol":
      return new THREE.Euler(0.20, -0.16 * side, -Math.PI / 2 * side);
    case "cup":
      return new THREE.Euler(0.26, -0.30 * side, -Math.PI / 2 * side + 0.34 * side);
    case "bolt":
      return new THREE.Euler(0.10, -0.40 * side, -Math.PI / 2 * side);
    // horizontal handguard: local X runs down the barrel axis
    case "foregrip":
      return new THREE.Euler(0.12, Math.PI / 2 * side, -0.22 * side);
    case "pump":
      return new THREE.Euler(0.06, Math.PI / 2 * side, -0.12 * side);
    case "vertical":
      return new THREE.Euler(0.22, -0.10 * side, -Math.PI / 2 * side);
    default:
      return new THREE.Euler(0.15, 0, 0);
  }
}

export function addHands(
  group: THREE.Group,
  gripPos: THREE.Vector3,
  forePos: THREE.Vector3,
  opts: HandsOptions = {}
): Hands {
  const coverage = opts.coverage ?? "full";
  const plating = opts.plating ?? true;

  const rightGrip: GripProfile = { ...DEFAULT_RIGHT, ...opts.rightGrip };
  const leftGrip: GripProfile = { ...DEFAULT_LEFT, ...opts.leftGrip };

  const mount = (rig: HandRig, pos: THREE.Vector3, grip: GripProfile, side: 1 | -1) => {
    // outer group is what the weapon animations drive; the inner
    // group holds the grip orientation so those writes never clash
    const outer = new THREE.Group();
    outer.position.copy(pos);
    const oriented = new THREE.Group();
    oriented.rotation.copy(baseOrientation(grip.kind, side));
    oriented.add(rig.root);
    outer.add(oriented);
    group.add(outer);
    return outer;
  };

  const rightRig = buildHand({ side: "right", coverage, plating });
  const leftRig = buildHand({ side: "left", coverage, plating });

  const right = mount(rightRig, gripPos, rightGrip, 1);
  const left = mount(leftRig, forePos, leftGrip, -1);

  const carried = new THREE.Group();
  carried.visible = false;
  leftRig.wrist.add(carried);

  const animator = new HandAnimator();

  const hands: Hands = {
    left, right,
    leftHome: forePos.clone(),
    rightHome: gripPos.clone(),
    carried,
    leftRig, rightRig, leftGrip, rightGrip, animator,
    pose() {
      applyGrip(rightRig, rightGrip, animator.params("right"), true);
      applyGrip(leftRig, leftGrip, animator.params("left"), false);
    },
  };
  hands.pose();
  void HM;
  return hands;
}

// ── procedural PBR weapon materials ─────────────────────────

export type WeaponFinish =
  | "brushedGunmetal"
  | "carbonFiber"
  | "matteTactical";

export interface WeaponPBR {
  map: THREE.CanvasTexture;
  normalMap: THREE.CanvasTexture;
  roughnessMap: THREE.CanvasTexture;
  metalnessMap: THREE.CanvasTexture;
}

function canvasFrom(size: number, data: Uint8ClampedArray, srgb: boolean): THREE.CanvasTexture {
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

/**
 * Generate a full PBR set for a weapon finish. Every finish shares
 * the same battle-wear pass (edge scuffs, scratches, grime, chips)
 * so damage reads consistently, but the base surface, normal relief,
 * gloss response and metal response are each finish-specific.
 */
export function weaponPBR(finish: WeaponFinish, size = 256, seed = 1): WeaponPBR {
  const r = rng(seed);
  const n = size * size;
  const albedo = new Uint8ClampedArray(n * 4);
  const rough = new Uint8ClampedArray(n * 4);
  const metal = new Uint8ClampedArray(n * 4);
  const height = new Float32Array(n);

  // ── battle wear masks (shared across finishes) ──
  const scratch = new Float32Array(n);   // bright bare-metal scratches
  const grime = new Float32Array(n);     // dark accumulated dirt
  const chip = new Float32Array(n);      // deep paint chips to substrate

  // fine scratches, mostly axis-aligned from handling
  const scratches = 90 + Math.floor(r() * 60);
  for (let i = 0; i < scratches; i++) {
    let x = r() * size, y = r() * size;
    const along = r() < 0.7;
    const ang = along ? (r() - 0.5) * 0.35 : Math.PI / 2 + (r() - 0.5) * 0.5;
    const len = size * (0.04 + r() * 0.4);
    const deep = r() * r();
    const dx = Math.cos(ang), dy = Math.sin(ang);
    for (let s = 0; s < len; s++) {
      x += dx; y += dy;
      const px = ((Math.round(x) % size) + size) % size;
      const py = ((Math.round(y) % size) + size) % size;
      const idx = py * size + px;
      const k = (1 - s / len) * (0.35 + deep * 0.65);
      scratch[idx] = Math.max(scratch[idx], k);
      height[idx] -= k * 0.1;
    }
  }

  // grime pooling in low areas / around fasteners
  for (let i = 0; i < 26; i++) {
    const gx = r() * size, gy = r() * size;
    const gr = size * (0.04 + r() * 0.13);
    for (let y = -gr; y < gr; y++) {
      for (let x = -gr; x < gr; x++) {
        const d = Math.hypot(x, y) / gr;
        if (d > 1) continue;
        const px = ((Math.round(gx + x) % size) + size) % size;
        const py = ((Math.round(gy + y) % size) + size) % size;
        grime[py * size + px] = Math.max(grime[py * size + px], (1 - d) * (0.4 + r() * 0.6));
      }
    }
  }

  // chips: impacts that punch through the coating
  for (let i = 0; i < 34; i++) {
    const cx = r() * size, cy = r() * size;
    const cr = size * (0.006 + r() * 0.022);
    for (let y = -cr * 2; y < cr * 2; y++) {
      for (let x = -cr * 2; x < cr * 2; x++) {
        const d = Math.hypot(x, y) / cr;
        if (d > 1.1) continue;
        const px = ((Math.round(cx + x) % size) + size) % size;
        const py = ((Math.round(cy + y) % size) + size) % size;
        const idx = py * size + px;
        const k = Math.max(0, 1 - d);
        chip[idx] = Math.max(chip[idx], k);
        height[idx] -= k * 0.55;
      }
    }
  }

  // ── finish-specific base surface ──
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const idx = y * size + x;
      const u = x / size, v = y / size;
      let rr: number, gg: number, bb: number;
      let ro: number, me: number;

      if (finish === "brushedGunmetal") {
        // fine horizontal brush striations catching the light
        const brush =
          Math.sin(v * size * 2.1 + Math.sin(u * 26) * 1.4) * 0.5 +
          Math.sin(v * size * 0.7 + Math.cos(u * 11) * 2.2) * 0.5;
        const streak = brush * 0.5 + 0.5;
        height[idx] += streak * 0.13;
        const base = 96 + streak * 44;
        rr = base * 1.0; gg = base * 1.02; bb = base * 1.1;
        ro = 0.3 + streak * 0.16;
        me = 0.94;
      } else if (finish === "carbonFiber") {
        // 2×2 twill weave: alternating over/under tow blocks
        const cell = size / 16;
        const bx = Math.floor(x / cell), by = Math.floor(y / cell);
        const over = (bx + by) % 2 === 0;
        const inX = (x % cell) / cell, inY = (y % cell) / cell;
        const along = over ? inY : inX;
        // rounded tow profile + fibre filaments running along the tow
        const tow = Math.sin(along * Math.PI);
        const fil = Math.sin((over ? inX : inY) * Math.PI * 9) * 0.5 + 0.5;
        height[idx] += tow * 0.34 + fil * 0.05;
        const base = 16 + tow * 30 + fil * 12;
        rr = base; gg = base * 1.03; bb = base * 1.12;
        // clear-coat: glossy, dielectric
        ro = 0.16 + (1 - tow) * 0.14;
        me = 0.12;
      } else {
        // matte tactical: fine cerakote stipple, almost no specular
        const stip =
          Math.sin(x * 3.7 + Math.sin(y * 2.3) * 3) * 0.5 +
          Math.sin(y * 4.1 + Math.cos(x * 1.9) * 2) * 0.5;
        const grit = stip * 0.5 + 0.5;
        height[idx] += grit * 0.09;
        const base = 26 + grit * 12;
        rr = base; gg = base * 1.01; bb = base * 1.04;
        ro = 0.82 + grit * 0.12;
        me = 0.22;
      }

      // ── battle wear composite ──
      const sc = scratch[idx], gm = grime[idx], ch = chip[idx];
      // scratches cut to bright bare steel: lighter, smoother, metallic
      if (sc > 0) {
        rr = rr * (1 - sc) + 172 * sc;
        gg = gg * (1 - sc) + 176 * sc;
        bb = bb * (1 - sc) + 184 * sc;
        ro = ro * (1 - sc) + 0.24 * sc;
        me = me * (1 - sc) + 0.96 * sc;
      }
      // chips expose dark substrate with a bright lip
      if (ch > 0) {
        const lip = ch > 0.7 ? 0 : ch;
        rr = rr * (1 - ch) + 44 * ch + lip * 60;
        gg = gg * (1 - ch) + 42 * ch + lip * 60;
        bb = bb * (1 - ch) + 40 * ch + lip * 62;
        ro = ro * (1 - ch) + 0.7 * ch;
        me = me * (1 - ch) + 0.7 * ch;
      }
      // grime darkens and kills gloss
      if (gm > 0) {
        const k = gm * 0.55;
        rr *= 1 - k * 0.7; gg *= 1 - k * 0.72; bb *= 1 - k * 0.76;
        ro = Math.min(1, ro + gm * 0.35);
        me *= 1 - gm * 0.4;
      }

      const i4 = idx * 4;
      albedo[i4] = rr; albedo[i4 + 1] = gg; albedo[i4 + 2] = bb; albedo[i4 + 3] = 255;
      const rv = Math.max(0, Math.min(1, ro)) * 255;
      rough[i4] = rv; rough[i4 + 1] = rv; rough[i4 + 2] = rv; rough[i4 + 3] = 255;
      const mv = Math.max(0, Math.min(1, me)) * 255;
      metal[i4] = mv; metal[i4 + 1] = mv; metal[i4 + 2] = mv; metal[i4 + 3] = 255;
    }
  }

  return {
    map: canvasFrom(size, albedo, true),
    roughnessMap: canvasFrom(size, rough, false),
    metalnessMap: canvasFrom(size, metal, false),
    normalMap: heightToNormalPublic(height, size, finish === "carbonFiber" ? 2.6 : 1.9),
  };
}

/** build a MeshStandardMaterial from a PBR set with per-part UV tiling */
export function pbrMaterial(
  pbr: WeaponPBR,
  repeat: number,
  opts: Partial<THREE.MeshStandardMaterialParameters> = {}
): THREE.MeshStandardMaterial {
  const clone = (t: THREE.Texture) => {
    const c = t.clone();
    c.needsUpdate = true;
    c.repeat.set(repeat, repeat);
    return c;
  };
  return new THREE.MeshStandardMaterial({
    map: clone(pbr.map),
    normalMap: clone(pbr.normalMap),
    roughnessMap: clone(pbr.roughnessMap),
    metalnessMap: clone(pbr.metalnessMap),
    normalScale: new THREE.Vector2(1, 1),
    metalness: 1,
    roughness: 1,
    ...opts,
  });
}
