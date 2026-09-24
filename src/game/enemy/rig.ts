// ─────────────────────────────────────────────────────────────
//  ENEMY CHARACTER RIG
//
//  Builds a full humanoid from an Archetype spec. Because every
//  bone length, width and gear piece comes from that spec, the
//  three enemy types are genuinely different meshes — not one
//  model with a palette swap.
//
//  Skeleton:
//    root ─ hips ─ spine ─ chest ─┬─ neck ─ head
//                                 ├─ shoulderL ─ upperL ─ foreL ─ handL
//                                 ├─ shoulderR ─ upperR ─ foreR ─ handR
//                                 └─ weapon anchor
//           hips ─┬─ thighL ─ shinL ─ footL
//                 └─ thighR ─ shinR ─ footR
//
//  Each bone merges its gear decoration into one multi-material
//  mesh, keeping a full character at ~14 draw calls.
// ─────────────────────────────────────────────────────────────

import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { type Archetype, type EnemyKind, ARCHETYPES } from "./archetypes";
import { enemyTextures } from "./textures";

// ── material slots ──────────────────────────────────────────
const CLOTH = 0, PLATE = 1, GEAR = 2, METAL = 3, SKIN = 4, GLOW = 5;

export interface EnemyMaterials {
  list: THREE.MeshStandardMaterial[];
  glow: THREE.MeshStandardMaterial;
  /** every material that should flash when the enemy is hit */
  flashable: THREE.MeshStandardMaterial[];
}

/**
 * Build a fresh material set for one enemy instance. Textures are
 * shared per archetype (generated once), but the materials are
 * per-instance so hit-flash on one enemy never affects another.
 */
export function makeMaterials(a: Archetype): EnemyMaterials {
  const t = enemyTextures(a);
  const pbr = (set: typeof t.cloth, rep: number, extra: Partial<THREE.MeshStandardMaterialParameters> = {}) => {
    const clone = (tex: THREE.Texture) => {
      const c = tex.clone();
      c.needsUpdate = true;
      c.repeat.set(rep, rep);
      c.wrapS = c.wrapT = THREE.RepeatWrapping;
      return c;
    };
    return new THREE.MeshStandardMaterial({
      map: clone(set.map),
      normalMap: clone(set.normalMap),
      roughnessMap: clone(set.roughnessMap),
      metalnessMap: clone(set.metalnessMap),
      roughness: 1, metalness: 1,
      ...extra,
    });
  };

  const cloth = pbr(t.cloth, 1.6);
  const plate = pbr(t.plate, 1.2);
  const gear = pbr(t.gear, 2.2);
  const metal = new THREE.MeshStandardMaterial({
    color: a.palette.metal, metalness: 0.94, roughness: 0.28,
  });
  const skin = new THREE.MeshStandardMaterial({
    color: a.palette.skin, roughness: 0.74, metalness: 0.0,
  });
  const glow = new THREE.MeshStandardMaterial({
    color: 0x0a0c10, emissive: a.palette.glow, emissiveIntensity: 2.6, roughness: 0.35,
  });

  const list = [cloth, plate, gear, metal, skin, glow];
  return { list, glow, flashable: [cloth, plate, gear, skin] };
}

// ── geometry helpers ────────────────────────────────────────

interface Piece { g: THREE.BufferGeometry; m: number }

class Part {
  private pieces: Piece[] = [];

  box(m: number, w: number, h: number, d: number, x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0) {
    const g = new THREE.BoxGeometry(w, h, d);
    if (rx) g.rotateX(rx);
    if (ry) g.rotateY(ry);
    if (rz) g.rotateZ(rz);
    g.translate(x, y, z);
    this.pieces.push({ g, m });
    return this;
  }

  /** tapered limb segment hanging down from the joint origin */
  limb(m: number, r0: number, r1: number, len: number, x = 0, z = 0, seg = 8) {
    const g = new THREE.CylinderGeometry(r0, r1, len, seg);
    g.translate(x, -len / 2, z);
    this.pieces.push({ g, m });
    return this;
  }

  cyl(m: number, r0: number, r1: number, h: number, x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0, seg = 8) {
    const g = new THREE.CylinderGeometry(r0, r1, h, seg);
    if (rx) g.rotateX(rx);
    if (ry) g.rotateY(ry);
    if (rz) g.rotateZ(rz);
    g.translate(x, y, z);
    this.pieces.push({ g, m });
    return this;
  }

  sphere(m: number, r: number, x = 0, y = 0, z = 0, sx = 1, sy = 1, sz = 1) {
    const g = new THREE.SphereGeometry(r, 10, 8);
    g.scale(sx, sy, sz);
    g.translate(x, y, z);
    this.pieces.push({ g, m });
    return this;
  }

  /** bevelled armour plate — a box with a chamfered leading lip */
  plate(m: number, w: number, h: number, d: number, x: number, y: number, z: number, tilt = 0) {
    this.box(m, w, h, d, x, y, z, tilt);
    this.box(m, w * 0.9, h * 0.5, d * 0.35, x, y + h * 0.45, z - d * 0.3, tilt + 0.32);
    return this;
  }

  build(mats: THREE.Material[]): THREE.Mesh | null {
    if (!this.pieces.length) return null;
    const buckets = new Map<number, THREE.BufferGeometry[]>();
    for (const p of this.pieces) {
      if (!buckets.has(p.m)) buckets.set(p.m, []);
      buckets.get(p.m)!.push(p.g);
    }
    const slots = [...buckets.keys()].sort((a, b) => a - b);
    const merged = slots.map((s) => {
      const l = buckets.get(s)!;
      return l.length === 1 ? l[0] : mergeGeometries(l, false)!;
    });
    const geo = merged.length === 1
      ? (() => {
          const g = merged[0];
          g.clearGroups();
          g.addGroup(0, g.index ? g.index.count : g.attributes.position.count, 0);
          return g;
        })()
      : mergeGeometries(merged, true)!;
    const mesh = new THREE.Mesh(geo, slots.map((i) => mats[i]));
    mesh.castShadow = true;
    mesh.receiveShadow = false;
    return mesh;
  }
}

// ── rig ─────────────────────────────────────────────────────

export interface EnemyRig {
  root: THREE.Group;
  hips: THREE.Group;
  spine: THREE.Group;
  chest: THREE.Group;
  neck: THREE.Group;
  head: THREE.Group;
  shoulderL: THREE.Group; upperL: THREE.Group; foreL: THREE.Group;
  shoulderR: THREE.Group; upperR: THREE.Group; foreR: THREE.Group;
  thighL: THREE.Group; shinL: THREE.Group; footL: THREE.Group;
  thighR: THREE.Group; shinR: THREE.Group; footR: THREE.Group;
  weapon: THREE.Group;
  muzzle: THREE.Object3D;
  bar: THREE.Group;
  barFg: THREE.Mesh;
  mats: EnemyMaterials;
  archetype: Archetype;
  /** emissive parts that pulse (visor, hazard lamps) */
  lamps: THREE.MeshStandardMaterial[];
}

function buildHead(a: Archetype, mats: THREE.Material[]): THREE.Mesh {
  const p = new Part();
  const { headR } = a.proportions;
  const g = a.gear;

  // skull
  p.sphere(SKIN, headR, 0, headR * 0.9, 0, 1, 1.12, 1.05);

  if (g.helmet === "hood") {
    // ── SCOUT: soft hood + half-mask + single optic ──
    p.sphere(CLOTH, headR * 1.16, 0, headR * 1.0, -headR * 0.06, 1.05, 1.0, 1.1);
    // hood drape down the back of the neck
    p.box(CLOTH, headR * 1.7, headR * 1.1, headR * 0.5, 0, headR * 0.5, -headR * 0.9, 0.3);
    // respirator over the lower face
    p.box(GEAR, headR * 1.05, headR * 0.72, headR * 0.5, 0, headR * 0.5, headR * 0.72);
    p.cyl(METAL, headR * 0.22, headR * 0.22, headR * 0.3, -headR * 0.42, headR * 0.45, headR * 0.72, 0, 0, Math.PI / 2, 6);
    p.cyl(METAL, headR * 0.22, headR * 0.22, headR * 0.3, headR * 0.42, headR * 0.45, headR * 0.72, 0, 0, Math.PI / 2, 6);
    // single monocular optic on one eye — asymmetric, reads instantly
    p.box(METAL, headR * 0.44, headR * 0.36, headR * 0.34, headR * 0.36, headR * 1.12, headR * 0.6);
    p.box(GLOW, headR * 0.26, headR * 0.2, headR * 0.04, headR * 0.36, headR * 1.12, headR * 0.79);
  } else if (g.helmet === "full") {
    // ── SOLDIER: classic combat helmet, NVG mount, full visor band ──
    p.box(PLATE, headR * 2.1, headR * 1.05, headR * 2.15, 0, headR * 1.62, -headR * 0.04);
    p.plate(PLATE, headR * 1.95, headR * 0.5, headR * 2.0, 0, headR * 2.18, -headR * 0.04, 0.08);
    // brow
    p.box(PLATE, headR * 1.9, headR * 0.42, headR * 0.4, 0, headR * 1.24, headR * 0.92, -0.3);
    // rear skirt
    p.box(PLATE, headR * 2.0, headR * 0.6, headR * 0.42, 0, headR * 1.2, -headR * 1.02, 0.38);
    // NVG mount + flipped-up tubes
    p.box(METAL, headR * 0.5, headR * 0.38, headR * 0.36, 0, headR * 1.7, headR * 0.98);
    p.cyl(METAL, headR * 0.17, headR * 0.17, headR * 0.66, -headR * 0.24, headR * 2.3, headR * 1.2, 1.1, 0, 0, 8);
    p.cyl(METAL, headR * 0.17, headR * 0.17, headR * 0.66, headR * 0.24, headR * 2.3, headR * 1.2, 1.1, 0, 0, 8);
    // visor band across the eyes
    p.box(METAL, headR * 1.55, headR * 0.5, headR * 0.3, 0, headR * 1.02, headR * 0.88);
    p.box(GLOW, headR * 1.3, headR * 0.28, headR * 0.06, 0, headR * 1.02, headR * 1.04);
    // ear cups
    p.box(GEAR, headR * 0.32, headR * 0.76, headR * 0.86, -headR * 1.02, headR * 1.05, 0);
    p.box(GEAR, headR * 0.32, headR * 0.76, headR * 0.86, headR * 1.02, headR * 1.05, 0);
  } else {
    // ── HEAVY: sealed exo helm, no visible face, hazard lamp ──
    p.box(PLATE, headR * 2.35, headR * 2.0, headR * 2.3, 0, headR * 1.35, 0);
    // heavy angled faceplate
    p.box(PLATE, headR * 2.0, headR * 1.1, headR * 0.55, 0, headR * 1.1, headR * 1.02, -0.22);
    // narrow vision slit — the only opening
    p.box(METAL, headR * 1.5, headR * 0.26, headR * 0.2, 0, headR * 1.44, headR * 1.2);
    p.box(GLOW, headR * 1.3, headR * 0.15, headR * 0.06, 0, headR * 1.44, headR * 1.32);
    // armoured collar fused to the helm
    p.box(PLATE, headR * 2.5, headR * 0.5, headR * 2.3, 0, headR * 0.28, 0, 0.1);
    // shoulder-mounted hazard lamp
    p.cyl(METAL, headR * 0.28, headR * 0.3, headR * 0.5, headR * 1.05, headR * 2.2, 0, 0.4, 0, 0, 8);
    p.sphere(GLOW, headR * 0.2, headR * 1.05, headR * 2.42, headR * 0.1);
    // exhaust stacks
    p.cyl(METAL, headR * 0.16, headR * 0.2, headR * 0.7, -headR * 0.85, headR * 2.1, -headR * 0.8, 0.2, 0, 0, 6);
  }
  return p.build(mats)!;
}

function buildTorso(a: Archetype, mats: THREE.Material[]): THREE.Mesh {
  const p = new Part();
  const pr = a.proportions;
  const g = a.gear;
  const w = pr.torsoW * 0.5, d = pr.torsoD * 0.5, h = pr.chestLen;

  // ── ribcage: tapers from shoulders to waist ──
  p.box(CLOTH, w * 2, h, d * 2, 0, h * 0.42, 0);
  p.box(CLOTH, w * 1.72, h * 0.4, d * 1.82, 0, -h * 0.06, 0);

  if (g.chestSlab) {
    // ── HEAVY: riot slab, three overlapping layers ──
    p.plate(PLATE, w * 2.15, h * 0.42, d * 2.3, 0, h * 0.72, d * 0.12, -0.16);
    p.plate(PLATE, w * 2.2, h * 0.4, d * 2.35, 0, h * 0.34, d * 0.16, -0.04);
    p.plate(PLATE, w * 2.05, h * 0.36, d * 2.25, 0, -h * 0.02, d * 0.12, 0.12);
    // central sternum rib
    p.box(METAL, w * 0.3, h * 1.0, d * 0.45, 0, h * 0.4, d * 1.05);
    // hazard chevrons across the chest
    if (g.hazardStripes) {
      for (let i = 0; i < 3; i++) {
        p.box(GLOW, w * 1.3, h * 0.07, d * 0.1, 0, h * (0.2 + i * 0.22), d * 1.12);
      }
    }
    // exo-frame spars running up the flanks
    for (const sx of [-1, 1]) {
      p.box(METAL, w * 0.18, h * 1.2, d * 0.3, sx * w * 1.05, h * 0.4, -d * 0.3);
      p.cyl(METAL, w * 0.13, w * 0.13, h * 0.5, sx * w * 1.05, h * 0.9, -d * 0.3, 0, 0, 0, 6);
    }
  } else if (g.pauldrons) {
    // ── SOLDIER: plate carrier with mag pouches ──
    p.plate(PLATE, w * 2.05, h * 0.44, d * 2.2, 0, h * 0.64, d * 0.08, -0.1);
    p.plate(PLATE, w * 2.0, h * 0.4, d * 2.15, 0, h * 0.26, d * 0.1, 0.04);
    for (let i = 0; i < 3; i++) {
      p.box(GEAR, w * 0.42, h * 0.3, d * 0.42, (i - 1) * w * 0.52, h * 0.18, d * 1.02);
    }
    p.box(GEAR, w * 0.55, h * 0.2, d * 0.35, -w * 0.2, h * 0.62, d * 1.0);
    p.box(GLOW, w * 0.16, h * 0.1, d * 0.1, w * 0.62, h * 0.66, d * 1.05);
  } else {
    // ── SCOUT: minimal chest rig, no hard plate at all ──
    p.box(GEAR, w * 1.4, h * 0.5, d * 1.9, 0, h * 0.38, d * 0.5);
    for (let i = 0; i < 2; i++) {
      p.box(GEAR, w * 0.4, h * 0.34, d * 0.4, (i - 0.5) * w * 0.7, h * 0.3, d * 1.0);
    }
    // cross-draw strap over one shoulder — asymmetric silhouette
    p.box(GEAR, w * 0.3, h * 1.15, d * 0.26, -w * 0.5, h * 0.4, d * 0.86, 0, 0, -0.34);
  }

  // shoulder straps
  for (const sx of [-1, 1]) {
    p.box(GEAR, w * 0.34, h * 0.58, d * 0.34, sx * w * 0.62, h * 0.82, d * 0.5, 0.2);
  }

  if (g.backpack) {
    const bw = g.helmet === "exo" ? 1.5 : 1.15;
    p.box(GEAR, w * bw, h * 0.86, d * 0.75, 0, h * 0.45, -d * 1.32);
    p.plate(PLATE, w * bw * 0.85, h * 0.32, d * 0.3, 0, h * 0.78, -d * 1.5, 0.2);
    if (g.helmet === "exo") {
      for (const sx of [-1, 1]) {
        p.cyl(METAL, w * 0.16, w * 0.19, h * 0.9, sx * w * 0.55, h * 1.0, -d * 1.45, 0, 0, 0, 8);
        p.sphere(GLOW, w * 0.11, sx * w * 0.55, h * 1.48, -d * 1.45);
      }
    }
  }
  return p.build(mats)!;
}

function buildPelvis(a: Archetype, mats: THREE.Material[]): THREE.Mesh {
  const p = new Part();
  const pr = a.proportions;
  const g = a.gear;
  const w = pr.hipW;

  p.box(CLOTH, w * 2.1, pr.spineLen * 1.15, pr.torsoD * 0.8, 0, -pr.spineLen * 0.1, 0);
  // duty belt
  p.box(GEAR, w * 2.25, pr.spineLen * 0.35, pr.torsoD * 0.86, 0, -pr.spineLen * 0.4, 0);
  p.box(METAL, w * 0.42, pr.spineLen * 0.26, pr.torsoD * 0.2, 0, -pr.spineLen * 0.4, pr.torsoD * 0.44);

  for (let i = 0; i < g.pouches; i++) {
    const sx = i === 0 ? -1 : i === 1 ? 1 : 0;
    const zz = i === 2 ? -pr.torsoD * 0.45 : pr.torsoD * 0.2;
    p.box(GEAR, w * 0.5, pr.spineLen * 0.62, pr.torsoD * 0.34, sx * w * 1.15, -pr.spineLen * 0.55, zz);
  }

  if (g.helmet === "exo") {
    // heavy: armoured tassets hanging off the belt
    for (const sx of [-1, 0, 1]) {
      p.plate(PLATE, w * 0.95, pr.spineLen * 1.0, pr.torsoD * 0.28,
        sx * w * 1.0, -pr.spineLen * 1.0, pr.torsoD * 0.34, 0.16);
    }
  }
  if (g.dropLeg) {
    // scout: drop-leg holster, clearly visible on one thigh
    p.box(GEAR, w * 0.6, pr.spineLen * 0.9, pr.torsoD * 0.4, w * 1.2, -pr.spineLen * 1.3, pr.torsoD * 0.1);
    p.box(METAL, w * 0.3, pr.spineLen * 0.5, pr.torsoD * 0.22, w * 1.2, -pr.spineLen * 1.2, pr.torsoD * 0.28);
  }
  return p.build(mats)!;
}

function buildArm(a: Archetype, mats: THREE.Material[], which: "upper" | "fore"): THREE.Mesh {
  const p = new Part();
  const pr = a.proportions;
  const g = a.gear;
  const r = 0.055 * pr.limbR;

  if (which === "upper") {
    p.limb(CLOTH, r, r * 0.9, pr.upperArm);
    if (g.helmet === "exo") {
      // heavy: exo actuator running down the outside of the arm
      p.box(METAL, r * 0.6, pr.upperArm * 0.8, r * 0.7, r * 1.05, -pr.upperArm * 0.45, 0);
    }
    // elbow cap
    p.sphere(g.bareArms ? SKIN : GEAR, r * 0.92, 0, -pr.upperArm, 0, 1, 0.8, 1);
  } else {
    // scouts have bare forearms — instantly readable as "light"
    p.limb(g.bareArms ? SKIN : CLOTH, r * 0.88, r * 0.7, pr.foreArm);
    if (!g.bareArms) {
      p.plate(PLATE, r * 1.7, pr.foreArm * 0.62, r * 0.55, 0, -pr.foreArm * 0.45, r * 0.85, 0);
    } else {
      // taped wrist wrap
      p.cyl(GEAR, r * 0.82, r * 0.82, pr.foreArm * 0.2, 0, -pr.foreArm * 0.82, 0, 0, 0, 0, 8);
    }
    // glove
    p.box(GEAR, r * 1.5, r * 1.9, r * 1.6, 0, -pr.foreArm - r * 0.7, r * 0.1);
  }
  return p.build(mats)!;
}

function buildLeg(a: Archetype, mats: THREE.Material[], which: "thigh" | "shin" | "foot"): THREE.Mesh {
  const p = new Part();
  const pr = a.proportions;
  const g = a.gear;
  const r = 0.072 * pr.limbR;

  if (which === "thigh") {
    p.limb(CLOTH, r, r * 0.88, pr.thigh);
    if (g.helmet === "exo") {
      p.box(METAL, r * 0.55, pr.thigh * 0.85, r * 0.65, r * 1.0, -pr.thigh * 0.45, 0);
      p.plate(PLATE, r * 1.7, pr.thigh * 0.5, r * 0.5, 0, -pr.thigh * 0.35, r * 0.95, 0.05);
    }
  } else if (which === "shin") {
    // knee protection differs per type — a clear silhouette cue
    if (g.knees === "wrap") {
      p.cyl(GEAR, r * 0.95, r * 0.95, pr.shin * 0.16, 0, -pr.shin * 0.06, 0, 0, 0, 0, 8);
    } else if (g.knees === "pad") {
      p.plate(PLATE, r * 1.7, pr.shin * 0.22, r * 0.62, 0, -pr.shin * 0.06, r * 0.72, 0);
    } else {
      p.sphere(METAL, r * 1.05, 0, -pr.shin * 0.04, r * 0.3, 1, 0.9, 1);
      p.cyl(METAL, r * 0.42, r * 0.42, pr.shin * 0.7, r * 0.95, -pr.shin * 0.45, 0, 0, 0, 0, 6);
    }
    p.limb(CLOTH, r * 0.9, r * 0.66, pr.shin);
    if (g.knees === "exo") {
      p.plate(PLATE, r * 1.6, pr.shin * 0.5, r * 0.5, 0, -pr.shin * 0.5, r * 0.8, 0);
    }
  } else {
    // boot: sole + upper + toe cap
    const bw = r * 1.5, bl = r * 2.6;
    p.box(g.helmet === "exo" ? METAL : GEAR, bw, r * 0.7, bl, 0, -r * 0.3, bl * 0.18);
    p.box(METAL, bw * 1.04, r * 0.3, bl * 1.02, 0, -r * 0.68, bl * 0.18);
    p.box(PLATE, bw * 0.96, r * 0.4, bl * 0.34, 0, -r * 0.34, bl * 0.62, 0.25);
  }
  return p.build(mats)!;
}

function buildWeapon(a: Archetype, mats: THREE.Material[]): { mesh: THREE.Mesh; muzzleZ: number } {
  const p = new Part();
  const s = a.proportions.limbR;

  switch (a.weapon) {
    case "smg": {
      // compact, stubby — matches the scout's fast identity
      p.box(METAL, 0.06 * s, 0.09 * s, 0.30 * s, 0, 0, 0.04);
      p.cyl(METAL, 0.016 * s, 0.016 * s, 0.22 * s, 0, 0.008 * s, 0.26 * s, Math.PI / 2, 0, 0, 8);
      p.box(GEAR, 0.04 * s, 0.14 * s, 0.07 * s, 0, -0.10 * s, 0.02, 0.18);
      p.box(GEAR, 0.05 * s, 0.09 * s, 0.05 * s, 0, -0.08 * s, -0.08 * s);
      p.box(METAL, 0.03 * s, 0.03 * s, 0.14 * s, 0, 0.01 * s, -0.17 * s);
      p.box(GLOW, 0.014 * s, 0.014 * s, 0.012 * s, 0, 0.062 * s, 0.0);
      return { mesh: p.build(mats)!, muzzleZ: 0.40 * s };
    }
    case "lmg": {
      // belt-fed, huge — sells the heavy's threat level
      p.box(METAL, 0.10 * s, 0.14 * s, 0.52 * s, 0, 0, 0.06);
      p.cyl(METAL, 0.026 * s, 0.026 * s, 0.44 * s, 0, 0.012 * s, 0.42 * s, Math.PI / 2, 0, 0, 10);
      p.cyl(METAL, 0.05 * s, 0.05 * s, 0.1 * s, 0, 0.012 * s, 0.66 * s, Math.PI / 2, 0, 0, 10);
      // ammo drum
      p.cyl(GEAR, 0.11 * s, 0.11 * s, 0.11 * s, 0, -0.11 * s, 0.0, 0, 0, Math.PI / 2, 12);
      p.box(GEAR, 0.06 * s, 0.11 * s, 0.06 * s, 0, -0.09 * s, -0.12 * s);
      p.box(METAL, 0.05 * s, 0.05 * s, 0.2 * s, 0, 0.0, -0.26 * s);
      p.box(GLOW, 0.02 * s, 0.02 * s, 0.014 * s, 0, 0.09 * s, 0.02);
      // bipod folded under the barrel
      for (const sx of [-1, 1]) {
        p.cyl(METAL, 0.01 * s, 0.008 * s, 0.18 * s, sx * 0.02 * s, -0.06 * s, 0.4 * s, 1.2, 0, sx * 0.2, 6);
      }
      return { mesh: p.build(mats)!, muzzleZ: 0.74 * s };
    }
    default: {
      // standard rifle
      p.box(METAL, 0.075 * s, 0.11 * s, 0.42 * s, 0, 0, 0.05);
      p.cyl(METAL, 0.018 * s, 0.018 * s, 0.34 * s, 0, 0.01 * s, 0.36 * s, Math.PI / 2, 0, 0, 8);
      p.box(GEAR, 0.06 * s, 0.07 * s, 0.2 * s, 0, -0.015 * s, 0.24 * s);
      p.box(GEAR, 0.045 * s, 0.16 * s, 0.08 * s, 0, -0.11 * s, 0.0, 0.2);
      p.box(GEAR, 0.05 * s, 0.1 * s, 0.05 * s, 0, -0.085 * s, -0.09 * s);
      p.box(GEAR, 0.055 * s, 0.09 * s, 0.22 * s, 0, 0.0, -0.24 * s);
      p.box(METAL, 0.03 * s, 0.045 * s, 0.06 * s, 0, 0.08 * s, 0.0);
      p.box(GLOW, 0.016 * s, 0.016 * s, 0.012 * s, 0, 0.09 * s, -0.028 * s);
      return { mesh: p.build(mats)!, muzzleZ: 0.56 * s };
    }
  }
}

// ── assembly ────────────────────────────────────────────────

export function buildEnemyRig(kind: EnemyKind): EnemyRig {
  const a = ARCHETYPES[kind];
  const pr = a.proportions;
  const mats = makeMaterials(a);
  const M = mats.list;

  const root = new THREE.Group();
  const hips = new THREE.Group();
  hips.position.y = pr.hipY;
  root.add(hips);
  hips.add(buildPelvis(a, M));

  const spine = new THREE.Group();
  spine.position.y = pr.spineLen;
  hips.add(spine);

  const chest = new THREE.Group();
  chest.position.y = 0;
  spine.add(chest);
  chest.add(buildTorso(a, M));

  const neck = new THREE.Group();
  neck.position.y = pr.chestLen;
  chest.add(neck);
  const head = new THREE.Group();
  head.position.y = pr.neckLen;
  neck.add(head);
  head.add(buildHead(a, M));
  // neck column
  const neckMesh = new Part().cyl(SKIN, pr.headR * 0.44, pr.headR * 0.5, pr.neckLen * 1.5, 0, pr.neckLen * 0.4, 0).build(M)!;
  neck.add(neckMesh);

  // ── arms ──
  const upperGeo = buildArm(a, M, "upper");
  const foreGeo = buildArm(a, M, "fore");
  const mkArm = (side: 1 | -1) => {
    const shoulder = new THREE.Group();
    shoulder.position.set(side * pr.shoulderW, pr.chestLen * 0.82, 0);
    if (a.gear.pauldrons) {
      // layered pauldron lames — the soldier/heavy shoulder signature
      const pp = new Part();
      const r = 0.055 * pr.limbR;
      const lames = a.gear.helmet === "exo" ? 3 : 2;
      for (let i = 0; i < lames; i++) {
        pp.plate(PLATE, r * (3.4 - i * 0.3), r * 0.7, r * (3.0 - i * 0.25),
          side * r * 0.25, -i * r * 0.62, 0, -0.12 + i * 0.1);
      }
      shoulder.add(pp.build(M)!);
    }
    const upper = new THREE.Group();
    shoulder.add(upper);
    upper.add(upperGeo.clone());
    const fore = new THREE.Group();
    fore.position.y = -pr.upperArm;
    upper.add(fore);
    fore.add(foreGeo.clone());
    return { shoulder, upper, fore };
  };
  const L = mkArm(-1), R = mkArm(1);
  chest.add(L.shoulder, R.shoulder);

  // ── legs ──
  const thighGeo = buildLeg(a, M, "thigh");
  const shinGeo = buildLeg(a, M, "shin");
  const footGeo = buildLeg(a, M, "foot");
  const mkLeg = (side: 1 | -1) => {
    const thigh = new THREE.Group();
    thigh.position.set(side * pr.hipW, -pr.spineLen * 0.15, 0);
    thigh.add(thighGeo.clone());
    const shin = new THREE.Group();
    shin.position.y = -pr.thigh;
    thigh.add(shin);
    shin.add(shinGeo.clone());
    const foot = new THREE.Group();
    foot.position.y = -pr.shin;
    shin.add(foot);
    foot.add(footGeo.clone());
    return { thigh, shin, foot };
  };
  const LL = mkLeg(-1), RL = mkLeg(1);
  hips.add(LL.thigh, RL.thigh);

  // ── weapon, carried by the right hand ──
  const weapon = new THREE.Group();
  weapon.position.set(0, -pr.foreArm - 0.03, 0.05);
  const w = buildWeapon(a, M);
  weapon.add(w.mesh);
  const muzzle = new THREE.Object3D();
  muzzle.position.set(0, 0.01, w.muzzleZ);
  weapon.add(muzzle);
  R.fore.add(weapon);

  // ── health bar ──
  const bar = new THREE.Group();
  const totalH = pr.hipY + pr.spineLen + pr.chestLen + pr.neckLen + pr.headR * 2.6;
  bar.position.y = totalH + 0.16;
  const bg = new THREE.Mesh(
    new THREE.PlaneGeometry(0.7, 0.085),
    new THREE.MeshBasicMaterial({ color: 0x0b0e12, transparent: true, opacity: 0.8, depthWrite: false })
  );
  const barFg = new THREE.Mesh(
    new THREE.PlaneGeometry(0.64, 0.046),
    new THREE.MeshBasicMaterial({ color: 0x53d769, transparent: true, opacity: 0.95, depthWrite: false })
  );
  barFg.position.z = 0.004;
  bar.add(bg, barFg);
  bar.visible = false;
  root.add(bar);

  root.scale.setScalar(pr.scale);

  // collect emissive lamps for pulsing
  const lamps: THREE.MeshStandardMaterial[] = [mats.glow];

  return {
    root, hips, spine, chest, neck, head,
    shoulderL: L.shoulder, upperL: L.upper, foreL: L.fore,
    shoulderR: R.shoulder, upperR: R.upper, foreR: R.fore,
    thighL: LL.thigh, shinL: LL.shin, footL: LL.foot,
    thighR: RL.thigh, shinR: RL.shin, footR: RL.foot,
    weapon, muzzle, bar, barFg, mats, archetype: a, lamps,
  };
}

export function disposeRig(rig: EnemyRig) {
  rig.root.traverse((o) => {
    const m = o as THREE.Mesh;
    if (m.isMesh) m.geometry.dispose();
  });
  for (const m of rig.mats.list) m.dispose();
  rig.root.parent?.remove(rig.root);
}
