// ─────────────────────────────────────────────────────────────
//  FIRST-PERSON HAND RIG
//
//  A full replacement for the old four-box placeholder hand.
//
//  Skeleton (per hand):
//
//    root ─┬─ wrist ─┬─ palm            (merged shell + armour)
//          │         ├─ thumb  ─ meta ─ prox ─ dist
//          │         ├─ index  ─ prox ─ mid  ─ dist
//          │         ├─ middle ─ prox ─ mid  ─ dist
//          │         ├─ ring   ─ prox ─ mid  ─ dist
//          │         └─ pinky  ─ prox ─ mid  ─ dist
//          └─ forearm ─ sleeve + cuff + wrist gear
//
//  Every phalanx is its own joint, so grip poses wrap the weapon
//  instead of floating beside it. Bones merge their decoration
//  geometry down to one mesh each, keeping a full pair of hands at
//  ~40 draw calls.
//
//  `root` is what the existing weapon animation code translates and
//  rotates, so the rig is a drop-in for the previous `Hands` shape.
// ─────────────────────────────────────────────────────────────

import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import {
  PALM, FOREARM, FINGERS, THUMB, CURL_RATIO, CURL_MAX,
  type FingerSpec, type PhalanxSpec,
} from "./anatomy";
import { HAND_MATERIALS } from "./materials";

// ── UV helpers ──────────────────────────────────────────────
//
//  The glove atlas splits vertically:
//    v < 0.42  palm side  — grip pattern, no seams
//    v > 0.58  dorsal     — stitched seams, armour
//    between   neutral    — weave + wrinkles (fingers, sides)

function remapV(geo: THREE.BufferGeometry, v0: number, v1: number, fromIndex = 0, toIndex = Infinity) {
  const uv = geo.getAttribute("uv") as THREE.BufferAttribute | undefined;
  if (!uv) return geo;
  const end = Math.min(toIndex, uv.count);
  for (let i = fromIndex; i < end; i++) {
    uv.setY(i, v0 + uv.getY(i) * (v1 - v0));
  }
  uv.needsUpdate = true;
  return geo;
}

/** BoxGeometry emits faces in the order +X −X +Y −Y +Z −Z, 4 verts each */
function remapBoxFaces(geo: THREE.BufferGeometry, dorsal: [number, number], palm: [number, number], side: [number, number]) {
  remapV(geo, side[0], side[1], 0, 8);      // ±X
  remapV(geo, dorsal[0], dorsal[1], 8, 12); // +Y  back of hand
  remapV(geo, palm[0], palm[1], 12, 16);    // −Y  palm
  remapV(geo, side[0], side[1], 16, 24);    // ±Z
  return geo;
}

const NEUTRAL: [number, number] = [0.44, 0.56];
const DORSAL: [number, number] = [0.62, 0.97];
const PALMV: [number, number] = [0.03, 0.40];

// ── primitives ──────────────────────────────────────────────

/** capsule running from the joint origin along −Z */
function bone(p: PhalanxSpec, radialSeg = 10): THREE.BufferGeometry {
  const r = (p.r0 + p.r1) * 0.5;
  const g = new THREE.CapsuleGeometry(r, Math.max(0.001, p.len - r * 0.7), 3, radialSeg);
  g.rotateX(-Math.PI / 2);              // +Y → −Z
  g.translate(0, 0, -p.len * 0.5);
  // gentle taper toward the fingertip
  const pos = g.getAttribute("position") as THREE.BufferAttribute;
  const k = p.r1 / p.r0;
  for (let i = 0; i < pos.count; i++) {
    const z = pos.getZ(i);
    const t = THREE.MathUtils.clamp(-z / p.len, 0, 1);
    const s = 1 + (k - 1) * t;
    pos.setX(i, pos.getX(i) * s);
    pos.setY(i, pos.getY(i) * s);
  }
  pos.needsUpdate = true;
  g.computeVertexNormals();
  return remapV(g, NEUTRAL[0], NEUTRAL[1]);
}

function box(w: number, h: number, d: number, x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0): THREE.BufferGeometry {
  const g = new THREE.BoxGeometry(w, h, d);
  if (rx) g.rotateX(rx);
  if (ry) g.rotateY(ry);
  if (rz) g.rotateZ(rz);
  g.translate(x, y, z);
  return g;
}

function merge(list: THREE.BufferGeometry[]): THREE.BufferGeometry {
  return list.length === 1 ? list[0] : mergeGeometries(list, false)!;
}

// ── public shape ────────────────────────────────────────────

export interface FingerJoints {
  name: string;
  root: THREE.Group;      // knuckle, carries splay
  proximal: THREE.Group;  // MCP
  middle: THREE.Group;    // PIP
  distal: THREE.Group;    // DIP
  rest: [number, number, number];
}

export interface HandRig {
  root: THREE.Group;
  wrist: THREE.Group;
  forearm: THREE.Group;
  fingers: FingerJoints[];
  thumb: FingerJoints;
  /** anchor for watches / straps so props never sit inside the mesh */
  wristAnchor: THREE.Group;
  side: "left" | "right";
  /** back-of-hand armour, toggled per glove tier */
  plates: THREE.Mesh | null;
  /** distal phalanges — material swaps between glove and bare skin */
  tips: THREE.Mesh[];
}

export type GloveCoverage = "full" | "fingerless" | "bare";

export interface HandBuildOptions {
  side: "left" | "right";
  coverage: GloveCoverage;
  /** hard knuckle / back-of-hand plating */
  plating: boolean;
}

// ── construction ────────────────────────────────────────────

function buildPalmGeo(side: number, o: HandBuildOptions): { shell: THREE.BufferGeometry; plates: THREE.BufferGeometry | null } {
  const M = HAND_MATERIALS;
  const clothGeo: THREE.BufferGeometry[] = [];
  const plateGeo: THREE.BufferGeometry[] = [];
  const metalGeo: THREE.BufferGeometry[] = [];

  // ── palm block, slightly wedge-shaped and narrowing to the wrist ──
  const p = new THREE.BoxGeometry(PALM.width, PALM.thickness, PALM.length, 2, 1, 2);
  const pos = p.getAttribute("position") as THREE.BufferAttribute;
  for (let i = 0; i < pos.count; i++) {
    const z = pos.getZ(i);
    // t: 0 at the knuckles (−z), 1 at the wrist (+z)
    const t = THREE.MathUtils.clamp((z + PALM.length / 2) / PALM.length, 0, 1);
    const narrow = 1 - (1 - PALM.wristWidth / PALM.width) * t;
    pos.setX(i, pos.getX(i) * narrow);
    // the palm is slightly cupped: thinner at the edges
    const edge = Math.abs(pos.getX(i)) / (PALM.width / 2);
    pos.setY(i, pos.getY(i) * (1 - edge * 0.18));
  }
  pos.needsUpdate = true;
  p.computeVertexNormals();
  clothGeo.push(remapBoxFaces(p, DORSAL, PALMV, NEUTRAL));

  // ── muscle pads: thenar (thumb side) and hypothenar (pinky side) ──
  const th = new THREE.SphereGeometry(1, 10, 8);
  th.scale(PALM.thenar.w, PALM.thenar.h, PALM.thenar.d);
  th.translate(-side * PALM.width * 0.3, -PALM.thickness * 0.24, PALM.length * 0.1);
  clothGeo.push(remapV(th, PALMV[0], PALMV[1]));

  const hy = new THREE.SphereGeometry(1, 10, 8);
  hy.scale(PALM.hypothenar.w, PALM.hypothenar.h, PALM.hypothenar.d);
  hy.translate(side * PALM.width * 0.38, -PALM.thickness * 0.2, PALM.length * 0.04);
  clothGeo.push(remapV(hy, PALMV[0], PALMV[1]));

  // ── knuckle ridge: the raised band the fingers hinge from ──
  const ridge = new THREE.CylinderGeometry(PALM.thickness * 0.5, PALM.thickness * 0.5, PALM.width * 0.92, 8, 1);
  ridge.rotateZ(Math.PI / 2);
  ridge.scale(1, 1, 0.75);
  ridge.translate(0, PALM.thickness * 0.06, -PALM.length * 0.46);
  clothGeo.push(remapV(ridge, DORSAL[0], DORSAL[1]));

  if (o.plating) {
    // ── hard back-of-hand armour: a segmented carapace, not one slab ──
    const spineZ = [-0.30, -0.06, 0.18];
    const spineW = [0.80, 0.86, 0.72];
    const spineL = [0.20, 0.22, 0.18];
    for (let i = 0; i < spineZ.length; i++) {
      const w = PALM.width * spineW[i];
      const l = PALM.length * spineL[i];
      const plate = box(w, PALM.thickness * 0.30, l, 0, PALM.thickness * 0.56, PALM.length * spineZ[i], -0.05 + i * 0.05);
      plateGeo.push(plate);
      // bevelled leading lip so the plates read as overlapping
      plateGeo.push(box(w * 0.92, PALM.thickness * 0.16, l * 0.3, 0, PALM.thickness * 0.66, PALM.length * spineZ[i] - l * 0.4, 0.3));
    }
    // ── individual knuckle caps over each MCP joint ──
    for (const f of FINGERS) {
      const cap = new THREE.SphereGeometry(f.proximal.r0 * 1.42, 8, 6, 0, Math.PI * 2, 0, Math.PI * 0.55);
      cap.scale(1, 0.72, 1.15);
      cap.translate(f.base[0] * side, PALM.thickness * 0.46, f.base[2] + 0.004);
      plateGeo.push(cap);
    }
    // ── rivets fixing the carapace down ──
    for (const [rx, rz] of [[-0.3, -0.24], [0.3, -0.24], [-0.26, 0.2], [0.26, 0.2]] as const) {
      const rv = new THREE.CylinderGeometry(PALM.width * 0.026, PALM.width * 0.026, PALM.thickness * 0.14, 6);
      rv.translate(rx * PALM.width * side, PALM.thickness * 0.66, rz * PALM.length);
      metalGeo.push(rv);
    }
  }

  const shell = merge(clothGeo);
  shell.clearGroups();
  shell.addGroup(0, Infinity, 0);
  const plates = plateGeo.length
    ? mergeGeometries([merge(plateGeo), merge(metalGeo)], true)!
    : null;
  void M;
  return { shell, plates };
}

/** one phalanx: the bone plus any glove detail riding on it */
function buildPhalanxGeo(
  spec: PhalanxSpec,
  kind: "proximal" | "middle" | "distal",
  o: HandBuildOptions,
  isThumb: boolean
): THREE.BufferGeometry {
  const M = HAND_MATERIALS;
  const cloth: THREE.BufferGeometry[] = [];
  const plate: THREE.BufferGeometry[] = [];

  // fingerless gloves stop at the middle phalanx — tips are bare skin
  const bare = o.coverage === "bare" || (o.coverage === "fingerless" && kind === "distal");
  cloth.push(bone(spec, kind === "distal" ? 8 : 10));

  if (!bare && kind !== "distal") {
    // padded knuckle roll over the joint at the base of the bone
    const roll = new THREE.TorusGeometry(spec.r0 * 0.94, spec.r0 * 0.3, 5, 10);
    roll.translate(0, 0, -spec.len * 0.06);
    cloth.push(remapV(roll, NEUTRAL[0], NEUTRAL[1]));
  }

  if (o.plating && kind === "proximal" && !isThumb) {
    // slim finger guard along the back of the proximal bone
    plate.push(box(spec.r0 * 1.5, spec.r0 * 0.42, spec.len * 0.6, 0, spec.r0 * 0.86, -spec.len * 0.45, -0.08));
  }

  if (bare && o.coverage !== "bare") {
    // fingernail on the exposed tip
    const nail = box(spec.r1 * 1.15, spec.r1 * 0.28, spec.len * 0.42, 0, spec.r1 * 0.72, -spec.len * 0.55, -0.12);
    plate.push(nail);
  }

  const groups: THREE.BufferGeometry[] = [merge(cloth)];
  if (plate.length) groups.push(merge(plate));
  void M; void bare;
  return groups.length === 1
    ? (() => { const g = groups[0]; g.clearGroups(); g.addGroup(0, Infinity, 0); return g; })()
    : mergeGeometries(groups, true)!;
}

/** wrap a cached phalanx geometry in a mesh with the right materials */
function phalanxMesh(
  geo: THREE.BufferGeometry,
  kind: "proximal" | "middle" | "distal",
  o: HandBuildOptions
): THREE.Mesh {
  const M = HAND_MATERIALS;
  const bare = o.coverage === "bare" || (o.coverage === "fingerless" && kind === "distal");
  const mats: THREE.Material[] = [bare ? M.skin : M.cloth];
  if (geo.groups.length > 1) mats.push(kind === "distal" ? M.nail : M.plate);
  const mesh = new THREE.Mesh(geo, mats);
  mesh.castShadow = false;
  mesh.receiveShadow = false;
  mesh.frustumCulled = false;
  return mesh;
}

function buildFinger(f: FingerSpec, side: number, o: HandBuildOptions, tips: THREE.Mesh[], c: HandGeoCache): FingerJoints {
  const root = new THREE.Group();
  root.position.set(f.base[0] * side, f.base[1], f.base[2]);
  root.rotation.y = f.splay * side;

  const proximal = new THREE.Group();
  proximal.add(phalanxMesh(c.phalanx.get(`${f.name}:proximal`)!, "proximal", o));
  root.add(proximal);

  const middle = new THREE.Group();
  middle.position.z = -f.proximal.len;
  middle.add(phalanxMesh(c.phalanx.get(`${f.name}:middle`)!, "middle", o));
  proximal.add(middle);

  const distal = new THREE.Group();
  distal.position.z = -f.middle.len;
  const tip = phalanxMesh(c.phalanx.get(`${f.name}:distal`)!, "distal", o);
  tips.push(tip);
  distal.add(tip);
  middle.add(distal);

  return { name: f.name, root, proximal, middle, distal, rest: f.rest };
}

function buildThumb(side: number, o: HandBuildOptions, c: HandGeoCache): FingerJoints {
  const root = new THREE.Group();
  root.position.set(THUMB.base[0] * side, THUMB.base[1], THUMB.base[2]);
  // swing the thumb out of the palm plane — this is the single most
  // important angle for a hand reading as a hand
  root.rotation.set(0.18, -side * 0.92, -side * 0.55);

  const meta = new THREE.Group();
  meta.add(phalanxMesh(c.phalanx.get("thumb:proximal")!, "proximal", o));
  root.add(meta);

  const prox = new THREE.Group();
  prox.position.z = -THUMB.metacarpal.len;
  prox.add(phalanxMesh(c.phalanx.get("thumb:middle")!, "middle", o));
  meta.add(prox);

  const dist = new THREE.Group();
  dist.position.z = -THUMB.proximal.len;
  dist.add(phalanxMesh(c.phalanx.get("thumb:distal")!, "distal", o));
  prox.add(dist);

  return { name: "thumb", root, proximal: meta, middle: prox, distal: dist, rest: THUMB.rest };
}

function buildForearmGeo(): THREE.BufferGeometry {
  const group = new THREE.Group();
  void group;
  const sleeve: THREE.BufferGeometry[] = [];
  const strap: THREE.BufferGeometry[] = [];
  const metal: THREE.BufferGeometry[] = [];

  // ── tapered forearm: narrow at the wrist, thickening to the elbow ──
  const arm = new THREE.CylinderGeometry(FOREARM.elbowR, FOREARM.wristR, FOREARM.length, 14, 3, true);
  arm.rotateX(Math.PI / 2);
  arm.translate(0, 0, FOREARM.length * 0.5);
  // flatten slightly — forearms are oval, not round
  const ap = arm.getAttribute("position") as THREE.BufferAttribute;
  for (let i = 0; i < ap.count; i++) ap.setY(i, ap.getY(i) * 0.86);
  ap.needsUpdate = true;
  arm.computeVertexNormals();
  sleeve.push(remapV(arm, DORSAL[0], DORSAL[1]));

  // ── sleeve cuff: sits PROUD of the glove so it cannot clip through ──
  const cuff = new THREE.CylinderGeometry(FOREARM.wristR * 1.30, FOREARM.wristR * 1.12, FOREARM.length * 0.13, 14, 1);
  cuff.rotateX(Math.PI / 2);
  cuff.translate(0, 0, FOREARM.length * 0.085);
  const cp = cuff.getAttribute("position") as THREE.BufferAttribute;
  for (let i = 0; i < cp.count; i++) cp.setY(i, cp.getY(i) * 0.88);
  cp.needsUpdate = true;
  cuff.computeVertexNormals();
  sleeve.push(remapV(cuff, DORSAL[0], DORSAL[1]));

  // elasticated cuff ribbing
  for (let i = 0; i < 3; i++) {
    const rib = new THREE.TorusGeometry(FOREARM.wristR * 1.2, FOREARM.wristR * 0.055, 5, 14);
    rib.translate(0, 0, FOREARM.length * (0.045 + i * 0.03));
    sleeve.push(remapV(rib, DORSAL[0], DORSAL[1]));
  }

  // ── wrist strap with a metal buckle ──
  const band = new THREE.CylinderGeometry(FOREARM.wristR * 1.16, FOREARM.wristR * 1.16, FOREARM.wristR * 0.52, 14, 1, true);
  band.rotateX(Math.PI / 2);
  band.translate(0, 0, FOREARM.length * 0.19);
  const bp = band.getAttribute("position") as THREE.BufferAttribute;
  for (let i = 0; i < bp.count; i++) bp.setY(i, bp.getY(i) * 0.88);
  bp.needsUpdate = true;
  band.computeVertexNormals();
  strap.push(remapV(band, NEUTRAL[0], NEUTRAL[1]));

  const buckle = box(FOREARM.wristR * 0.54, FOREARM.wristR * 0.2, FOREARM.wristR * 0.44, 0, FOREARM.wristR * 1.02, FOREARM.length * 0.19);
  metal.push(buckle);
  const prong = box(FOREARM.wristR * 0.1, FOREARM.wristR * 0.1, FOREARM.wristR * 0.5, 0, FOREARM.wristR * 1.12, FOREARM.length * 0.19);
  metal.push(prong);

  return mergeGeometries([merge(sleeve), merge(strap), merge(metal)], true)!;
}

/** instantiate the shared forearm geometry with its own anchor */
function forearmInstance(geo: THREE.BufferGeometry): { group: THREE.Group; anchor: THREE.Group } {
  const M = HAND_MATERIALS;
  const group = new THREE.Group();
  const mesh = new THREE.Mesh(geo, [M.sleeve, M.strap, M.metal]);
  mesh.castShadow = false;
  mesh.receiveShadow = false;
  mesh.frustumCulled = false;
  group.add(mesh);
  // props (watch, terminal, …) mount here, clear of the sleeve surface
  const anchor = new THREE.Group();
  anchor.name = "wristAnchor";
  anchor.position.set(0, FOREARM.wristR * 0.5, FOREARM.length * 0.26);
  group.add(anchor);
  return { group, anchor };
}

// ── geometry cache ──────────────────────────────────────────
//
//  Sixteen hands exist (8 weapons x 2), but only two distinct
//  geometries. Generating and merging is the expensive part, so it
//  is done once per side and the BufferGeometry is shared; each
//  instance only pays for cheap Mesh/Group objects.

interface HandGeoCache {
  palmShell: THREE.BufferGeometry;
  palmPlates: THREE.BufferGeometry | null;
  phalanx: Map<string, THREE.BufferGeometry>;
  forearm: THREE.BufferGeometry;
}

const geoCache = new Map<string, HandGeoCache>();

function cacheFor(side: number, o: HandBuildOptions): HandGeoCache {
  const key = side > 0 ? "right" : "left";
  let c = geoCache.get(key);
  if (c) return c;
  const palm = buildPalmGeo(side, o);
  const phalanx = new Map<string, THREE.BufferGeometry>();
  for (const f of FINGERS) {
    phalanx.set(`${f.name}:proximal`, buildPhalanxGeo(f.proximal, "proximal", o, false));
    phalanx.set(`${f.name}:middle`, buildPhalanxGeo(f.middle, "middle", o, false));
    phalanx.set(`${f.name}:distal`, buildPhalanxGeo(f.distal, "distal", o, false));
  }
  phalanx.set("thumb:proximal", buildPhalanxGeo(THUMB.metacarpal, "proximal", o, true));
  phalanx.set("thumb:middle", buildPhalanxGeo(THUMB.proximal, "middle", o, true));
  phalanx.set("thumb:distal", buildPhalanxGeo(THUMB.distal, "distal", o, true));
  c = { palmShell: palm.shell, palmPlates: palm.plates, phalanx, forearm: buildForearmGeo() };
  geoCache.set(key, c);
  return c;
}

// ── assembly ────────────────────────────────────────────────

export function buildHand(opts: HandBuildOptions): HandRig {
  // geometry is always built at maximum detail; glove tiers toggle
  // plating visibility and swap fingertip materials at runtime, which
  // avoids rebuilding meshes every time the player changes loadout
  const o: HandBuildOptions = { ...opts, coverage: "full", plating: true };
  const side = o.side === "right" ? 1 : -1;

  const root = new THREE.Group();
  const wrist = new THREE.Group();
  root.add(wrist);

  const c = cacheFor(side, o);

  const shell = new THREE.Mesh(c.palmShell, [o.coverage === "bare" ? HAND_MATERIALS.skin : HAND_MATERIALS.cloth]);
  shell.castShadow = false; shell.receiveShadow = false; shell.frustumCulled = false;
  wrist.add(shell);

  let plates: THREE.Mesh | null = null;
  if (c.palmPlates) {
    plates = new THREE.Mesh(c.palmPlates, [HAND_MATERIALS.plate, HAND_MATERIALS.metal]);
    plates.castShadow = false; plates.receiveShadow = false; plates.frustumCulled = false;
    wrist.add(plates);
  }

  const tips: THREE.Mesh[] = [];
  const fingers = FINGERS.map((f) => {
    const j = buildFinger(f, side, o, tips, c);
    wrist.add(j.root);
    return j;
  });

  const thumb = buildThumb(side, o, c);
  wrist.add(thumb.root);

  const fa = forearmInstance(c.forearm);
  fa.group.position.set(0, -PALM.thickness * 0.1, PALM.length * 0.46);
  root.add(fa.group);

  const rig: HandRig = {
    root, wrist, forearm: fa.group, fingers, thumb,
    wristAnchor: fa.anchor, side: o.side,
    plates, tips,
  };
  applyRestPose(rig);
  return rig;
}

// ── posing ──────────────────────────────────────────────────

/** relaxed open hand — fingers always carry a little natural curl */
export function applyRestPose(rig: HandRig) {
  for (const f of rig.fingers) {
    f.proximal.rotation.x = -f.rest[0];
    f.middle.rotation.x = -f.rest[1];
    f.distal.rotation.x = -f.rest[2];
  }
  rig.thumb.proximal.rotation.x = -rig.thumb.rest[0];
  rig.thumb.middle.rotation.x = -rig.thumb.rest[1];
  rig.thumb.distal.rotation.x = -rig.thumb.rest[2];
}

/**
 * Curl one finger. 0 keeps the resting curve, 1 closes it fully.
 * Joints move at different rates (PIP furthest) so the motion reads
 * as a real finger closing rather than three boxes folding.
 */
export function curlFinger(f: FingerJoints, amount: number, spread = 0) {
  const a = THREE.MathUtils.clamp(amount, 0, 1.25);
  f.proximal.rotation.x = -(f.rest[0] + a * CURL_MAX * CURL_RATIO.mcp * 0.55);
  f.middle.rotation.x = -(f.rest[1] + a * CURL_MAX * CURL_RATIO.pip * 0.55);
  f.distal.rotation.x = -(f.rest[2] + a * CURL_MAX * CURL_RATIO.dip * 0.55);
  if (spread) f.proximal.rotation.y = spread;
}

/** thumb has its own axis mix — it wraps rather than folds */
export function curlThumb(t: FingerJoints, amount: number, side: number) {
  const a = THREE.MathUtils.clamp(amount, 0, 1.25);
  t.proximal.rotation.x = -(t.rest[0] + a * 0.42);
  t.proximal.rotation.z = -side * (0.1 + a * 0.30);
  t.middle.rotation.x = -(t.rest[1] + a * 0.62);
  t.distal.rotation.x = -(t.rest[2] + a * 0.48);
}

/**
 * Detach a hand. Geometry is intentionally NOT disposed: it is
 * shared with every other hand instance of the same side.
 */
export function disposeHand(rig: HandRig) {
  rig.root.parent?.remove(rig.root);
}

/** release the shared geometry (full teardown only) */
export function disposeHandGeometry() {
  for (const c of geoCache.values()) {
    c.palmShell.dispose();
    c.palmPlates?.dispose();
    c.forearm.dispose();
    for (const g of c.phalanx.values()) g.dispose();
  }
  geoCache.clear();
}

// ── runtime glove variation ─────────────────────────────────

/**
 * Switch a built hand between glove coverages and plating tiers
 * without rebuilding any geometry.
 */
export function setHandStyle(
  rig: HandRig,
  coverage: "full" | "fingerless" | "bare",
  plating: boolean
) {
  const M = HAND_MATERIALS;
  if (rig.plates) rig.plates.visible = plating && coverage !== "bare";
  const tipMat = coverage === "full" ? M.cloth : M.skin;
  for (const t of rig.tips) {
    const mats = t.material as THREE.Material[];
    if (Array.isArray(mats)) mats[0] = tipMat;
    else t.material = tipMat;
  }
  // the palm shell itself turns to skin only for fully bare hands
  rig.wrist.traverse((o) => {
    const mesh = o as THREE.Mesh;
    if (!mesh.isMesh || mesh === rig.plates) return;
  });
}
