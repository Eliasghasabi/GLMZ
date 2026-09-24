// ─────────────────────────────────────────────────────────────
//  ENEMY PBR TEXTURE SETS
//
//  Generates base colour / normal / roughness / metallic per
//  archetype, per material slot. Every slot computes its own
//  height field, so cloth, plating and metal have genuinely
//  different surface relief rather than one map tinted three ways.
//
//  Battle wear is authored per role:
//    Scout   frayed fabric edges, road dust, light scuffing
//    Soldier field grime, webbing wear, moderate plate scratching
//    Heavy   deep gouges, paint chipped to bare steel, oil staining
//
//  Performance: fields are baked at low resolution and sampled
//  through precomputed index tables (output res is an exact
//  multiple), which keeps generation off the frame budget.
// ─────────────────────────────────────────────────────────────

import * as THREE from "three";
import { rng } from "../textures";
import type { Archetype, MaterialSpec, Palette } from "./archetypes";

const CLOTH_RES = 1024;
const PLATE_RES = 1024;
const DATA_DIV = 2;        // scalar maps at half the colour resolution
const FIELD = 128;         // baked noise grid

// ── noise ───────────────────────────────────────────────────

function lattice(seed: number, period: number) {
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
    const top = a + (b - a) * sx;
    return top + ((c + (d - c) * sx) - top) * sy;
  };
}

function fbm(seed: number, base: number, oct: number) {
  const layers: { f: (x: number, y: number) => number; p: number; a: number }[] = [];
  let p = base, a = 1, norm = 0;
  for (let i = 0; i < oct; i++) {
    layers.push({ f: lattice(seed + i * 4211, p), p, a });
    norm += a; p *= 2; a *= 0.5;
  }
  return (u: number, v: number) => {
    let s = 0;
    for (const l of layers) s += l.f(u * l.p, v * l.p) * l.a;
    return s / norm;
  };
}

/** bake an fBm field into a grid with its frequency folded in */
function bake(seed: number, base: number, oct: number, scale = 1): Float32Array {
  const f = fbm(seed, base, oct);
  const g = new Float32Array(FIELD * FIELD);
  for (let y = 0; y < FIELD; y++) {
    for (let x = 0; x < FIELD; x++) {
      g[y * FIELD + x] = f((x / FIELD) * scale, (y / FIELD) * scale);
    }
  }
  return g;
}

interface Table { i0: Int32Array; i1: Int32Array; w: Float32Array }
const tables = new Map<number, Table>();

function tableFor(res: number): Table {
  let t = tables.get(res);
  if (t) return t;
  const i0 = new Int32Array(res), i1 = new Int32Array(res), w = new Float32Array(res);
  for (let i = 0; i < res; i++) {
    const f = (i / res) * FIELD;
    const a = Math.floor(f);
    i0[i] = a % FIELD;
    i1[i] = (a + 1) % FIELD;
    w[i] = f - a;
  }
  t = { i0, i1, w };
  tables.set(res, t);
  return t;
}

function makeSampler(res: number) {
  const T = tableFor(res);
  return (g: Float32Array, x: number, y: number) => {
    const x0 = T.i0[x], x1 = T.i1[x], tx = T.w[x];
    const r0 = T.i0[y] * FIELD, r1 = T.i1[y] * FIELD, ty = T.w[y];
    const a = g[r0 + x0], b = g[r0 + x1], c = g[r1 + x0], d = g[r1 + x1];
    const top = a + (b - a) * tx;
    return top + ((c + (d - c) * tx) - top) * ty;
  };
}

function toTex(size: number, data: Uint8ClampedArray, srgb: boolean): THREE.CanvasTexture {
  const cv = document.createElement("canvas");
  cv.width = cv.height = size;
  const c = cv.getContext("2d")!;
  const img = c.createImageData(size, size);
  img.data.set(data);
  c.putImageData(img, 0, 0);
  const t = new THREE.CanvasTexture(cv);
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = 4;
  return t;
}

/** wrap-free Sobel — precomputed neighbour indices, no modulo per tap */
function normalMap(height: Float32Array, size: number, strength: number): THREE.CanvasTexture {
  const xm = new Int32Array(size), xp = new Int32Array(size);
  const ym = new Int32Array(size), yp = new Int32Array(size);
  for (let i = 0; i < size; i++) {
    xm[i] = i === 0 ? size - 1 : i - 1;
    xp[i] = i === size - 1 ? 0 : i + 1;
    ym[i] = (i === 0 ? size - 1 : i - 1) * size;
    yp[i] = (i === size - 1 ? 0 : i + 1) * size;
  }
  const out = new Uint8ClampedArray(size * size * 4);
  for (let y = 0; y < size; y++) {
    const rc = y * size, ru = ym[y], rd = yp[y];
    for (let x = 0; x < size; x++) {
      const xl = xm[x], xr = xp[x];
      const dx = (height[ru + xl] + 2 * height[rc + xl] + height[rd + xl])
               - (height[ru + xr] + 2 * height[rc + xr] + height[rd + xr]);
      const dy = (height[ru + xl] + 2 * height[ru + x] + height[ru + xr])
               - (height[rd + xl] + 2 * height[rd + x] + height[rd + xr]);
      let nx = dx * strength, ny = dy * strength;
      const inv = 1 / Math.sqrt(nx * nx + ny * ny + 1);
      nx *= inv; ny *= inv;
      const o = (rc + x) * 4;
      out[o] = (nx * 0.5 + 0.5) * 255;
      out[o + 1] = (ny * 0.5 + 0.5) * 255;
      out[o + 2] = (inv * 0.5 + 0.5) * 255;
      out[o + 3] = 255;
    }
  }
  return toTex(size, out, false);
}

export interface PBRSet {
  map: THREE.CanvasTexture;
  normalMap: THREE.CanvasTexture;
  roughnessMap: THREE.CanvasTexture;
  metalnessMap: THREE.CanvasTexture;
}

const rgb = (h: number): [number, number, number] => [(h >> 16) & 255, (h >> 8) & 255, h & 255];

// ═════════════════════════════════════════════════════════════
//  CLOTH — fatigues, with per-type weave and camo
// ═════════════════════════════════════════════════════════════

function buildCloth(pal: Palette, spec: MaterialSpec, seed: number): PBRSet {
  const N = CLOTH_RES, D = N / DATA_DIV;
  const base = rgb(pal.cloth);
  const alt = rgb(pal.cloth2);
  const gear = rgb(pal.gear);

  const gWeave = bake(seed, 64, 3);
  const gBlob = bake(seed + 11, 5, 4);
  const gFine = bake(seed + 23, 14, 3);
  const gDirt = bake(seed + 41, 7, 4);
  const gFray = bake(seed + 67, 30, 2);

  const albedo = new Uint8ClampedArray(N * N * 4);
  const height = new Float32Array(N * N);
  const smp = makeSampler(N);

  for (let y = 0; y < N; y++) {
    const v = y / N;
    for (let x = 0; x < N; x++) {
      const i = y * N + x;

      // ── weave relief, unique per fabric type ──
      let h: number;
      switch (spec.weave) {
        case "ripstop": {
          // tight twill with a reinforcement grid every ~40px
          const twill = Math.sin((x + y) * 0.85) * 0.5 + 0.5;
          const grid = (x % 40 < 3 || y % 40 < 3) ? 0.45 : 0;
          h = twill * 0.3 + grid;
          break;
        }
        case "canvas": {
          // coarse basket weave — visibly chunkier
          const cw = 14;
          const over = (Math.floor(x / cw) + Math.floor(y / cw)) % 2 === 0;
          const along = over ? (y % cw) / cw : (x % cw) / cw;
          h = Math.sin(along * Math.PI) * 0.62;
          break;
        }
        default: {
          // standard fatigue: soft plain weave
          h = (Math.sin(x * 1.6) * 0.5 + 0.5) * 0.22 + (Math.sin(y * 1.6) * 0.5 + 0.5) * 0.22;
        }
      }
      h += smp(gWeave, x, y) * 0.12;

      // ── camo ──
      let c: [number, number, number];
      if (spec.camo === "urban") {
        const t = smp(gBlob, x, y) * 0.7 + smp(gFine, x, y) * 0.3;
        // hard-edged blocky urban disruption
        const q = Math.round(t * 4) / 4;
        c = q < 0.3 ? alt : q < 0.55 ? base : q < 0.8 ? gear : [
          Math.min(255, base[0] * 1.35), Math.min(255, base[1] * 1.35), Math.min(255, base[2] * 1.35),
        ];
      } else if (spec.camo === "woodland") {
        const t = smp(gBlob, x, y) * 0.75 + smp(gFine, x, y) * 0.25;
        c = t < 0.38 ? [alt[0] * 0.8, alt[1] * 0.85, alt[2] * 0.7]
          : t < 0.55 ? base
            : t < 0.72 ? [base[0] * 0.66, base[1] * 0.7, base[2] * 0.5]
              : [base[0] * 1.2, base[1] * 1.15, base[2] * 0.9];
      } else {
        c = base;
      }

      // ── frayed edges: fibres pull loose where the fabric wears ──
      const fray = smp(gFray, x, y);
      if (fray > 1 - spec.fray * 0.28) {
        const t = (fray - (1 - spec.fray * 0.28)) / (spec.fray * 0.28 + 1e-6);
        h -= t * 0.5;
        c = [c[0] * (1 - t * 0.3), c[1] * (1 - t * 0.3), c[2] * (1 - t * 0.3)];
      }

      // ── ground-in dirt, heaviest low on the body ──
      const dirt = smp(gDirt, x, y) * spec.grime * (0.5 + v * 0.9);
      const dk = 1 - dirt * 0.45;
      const i4 = i * 4;
      albedo[i4] = c[0] * dk + dirt * 22;
      albedo[i4 + 1] = c[1] * dk + dirt * 19;
      albedo[i4 + 2] = c[2] * dk + dirt * 14;
      albedo[i4 + 3] = 255;
      height[i] = h;
    }
  }

  // ── scalar maps ──
  const rough = new Uint8ClampedArray(D * D * 4);
  const metal = new Uint8ClampedArray(D * D * 4);
  const smpD = makeSampler(D);
  for (let y = 0; y < D; y++) {
    for (let x = 0; x < D; x++) {
      const i4 = (y * D + x) * 4;
      // cloth is uniformly matte; dirt makes it duller still
      let ro = 0.93 - smpD(gWeave, x, y) * 0.06 + smpD(gDirt, x, y) * spec.grime * 0.05;
      ro = Math.max(0.5, Math.min(1, ro));
      const rv = ro * 255;
      rough[i4] = rv; rough[i4 + 1] = rv; rough[i4 + 2] = rv; rough[i4 + 3] = 255;
      metal[i4] = 4; metal[i4 + 1] = 4; metal[i4 + 2] = 4; metal[i4 + 3] = 255;
    }
  }

  return {
    map: toTex(N, albedo, true),
    normalMap: normalMap(height, N, spec.weave === "canvas" ? 2.6 : 1.9),
    roughnessMap: toTex(D, rough, false),
    metalnessMap: toTex(D, metal, false),
  };
}

// ═════════════════════════════════════════════════════════════
//  PLATE — hard armour, with per-type damage and finish
// ═════════════════════════════════════════════════════════════

function buildPlate(pal: Palette, spec: MaterialSpec, seed: number, hazard: boolean): PBRSet {
  const N = PLATE_RES, D = N / DATA_DIV;
  const base = rgb(pal.plate);
  const bare = rgb(pal.metal);
  const haz = rgb(pal.hazard ?? 0xe8a22a);

  const gGrain = bake(seed + 3, 72, 3);
  const gPanel = bake(seed + 19, 6, 3);
  const gScuff = bake(seed + 31, 18, 4);
  const gGouge = bake(seed + 53, 26, 2);
  const gOil = bake(seed + 71, 5, 4);

  const albedo = new Uint8ClampedArray(N * N * 4);
  const height = new Float32Array(N * N);
  const bareMask = new Float32Array(N * N);
  const smp = makeSampler(N);

  for (let y = 0; y < N; y++) {
    const v = y / N;
    for (let x = 0; x < N; x++) {
      const i = y * N + x;
      const u = x / N;

      // ── panel lines + bevels: armour is made of plates ──
      const panelU = Math.abs(((u * 4) % 1) - 0.5);
      const panelV = Math.abs(((v * 3) % 1) - 0.5);
      const seam = (panelU > 0.47 || panelV > 0.47) ? 1 : 0;
      let h = smp(gPanel, x, y) * 0.2 + smp(gGrain, x, y) * 0.1;
      h -= seam * 0.55;

      let c: [number, number, number] = [base[0], base[1], base[2]];

      // ── hazard striping (heavy only) ──
      if (hazard) {
        const band = ((u * 3 + v * 3) % 1);
        if (band < 0.22 && v > 0.25 && v < 0.62) {
          c = [haz[0], haz[1], haz[2]];
          h += 0.05;
        }
      }

      // ── scuffs: shallow abrasion polishing the surface ──
      const scuff = smp(gScuff, x, y);
      if (scuff > 0.62) {
        const t = (scuff - 0.62) / 0.38 * spec.damage;
        c = [c[0] + t * 34, c[1] + t * 36, c[2] + t * 38];
        h += t * 0.06;
      }

      // ── deep gouges: paint stripped to bare metal ──
      const gouge = smp(gGouge, x, y);
      const gouThresh = 1 - spec.damage * 0.3;
      if (gouge > gouThresh) {
        const t = (gouge - gouThresh) / (spec.damage * 0.3 + 1e-6);
        bareMask[i] = t;
        c = [
          c[0] * (1 - t) + bare[0] * t,
          c[1] * (1 - t) + bare[1] * t,
          c[2] * (1 - t) + bare[2] * t,
        ];
        h -= t * 0.42;
      }

      // ── oil / powder staining, pooling low and in the seams ──
      const oil = smp(gOil, x, y) * spec.grime * (0.4 + v * 0.8);
      const ok = 1 - oil * 0.42;
      const i4 = i * 4;
      albedo[i4] = c[0] * ok;
      albedo[i4 + 1] = c[1] * ok;
      albedo[i4 + 2] = c[2] * ok;
      albedo[i4 + 3] = 255;
      height[i] = h;
    }
  }

  // ── scalar maps: finish drives gloss, gouges expose metal ──
  const rough = new Uint8ClampedArray(D * D * 4);
  const metal = new Uint8ClampedArray(D * D * 4);
  const smpD = makeSampler(D);
  const baseRough =
    spec.plateFinish === "semigloss" ? 0.38 :
    spec.plateFinish === "battered" ? 0.56 : 0.72;

  for (let y = 0; y < D; y++) {
    for (let x = 0; x < D; x++) {
      const i = y * D + x;
      const i4 = i * 4;
      // sample the bare-metal mask from the full-res pass
      const bm = bareMask[(y * DATA_DIV) * N + x * DATA_DIV];
      let ro = baseRough + (smpD(gGrain, x, y) - 0.5) * 0.12;
      let me = 0.18;
      // scuffed high points polish up
      const sc = smpD(gScuff, x, y);
      if (sc > 0.62) ro -= (sc - 0.62) * spec.damage * 0.5;
      // exposed steel is smooth and fully metallic
      if (bm > 0) { ro = ro * (1 - bm) + 0.26 * bm; me = me * (1 - bm) + 0.95 * bm; }
      // oil residue kills the gloss
      ro += smpD(gOil, x, y) * spec.grime * 0.18;

      ro = Math.max(0.06, Math.min(1, ro));
      me = Math.max(0, Math.min(1, me));
      const rv = ro * 255, mv = me * 255;
      rough[i4] = rv; rough[i4 + 1] = rv; rough[i4 + 2] = rv; rough[i4 + 3] = 255;
      metal[i4] = mv; metal[i4 + 1] = mv; metal[i4 + 2] = mv; metal[i4 + 3] = 255;
    }
  }

  return {
    map: toTex(N, albedo, true),
    normalMap: normalMap(height, N, spec.plateFinish === "battered" ? 2.8 : 2.0),
    roughnessMap: toTex(D, rough, false),
    metalnessMap: toTex(D, metal, false),
  };
}

// ═════════════════════════════════════════════════════════════
//  GEAR — webbing, pouches, straps (matte nylon)
// ═════════════════════════════════════════════════════════════

function buildGear(pal: Palette, spec: MaterialSpec, seed: number): PBRSet {
  const N = CLOTH_RES / 2, D = N / DATA_DIV;
  const base = rgb(pal.gear);
  const gWeb = bake(seed + 7, 48, 3);
  const gWear = bake(seed + 29, 12, 3);

  const albedo = new Uint8ClampedArray(N * N * 4);
  const height = new Float32Array(N * N);
  const smp = makeSampler(N);

  for (let y = 0; y < N; y++) {
    for (let x = 0; x < N; x++) {
      const i = y * N + x;
      // MOLLE webbing: horizontal rows of stitched nylon tape
      const row = (y % 26) < 4 ? 1 : 0;
      const stitch = row && (x % 9 < 2) ? 1 : 0;
      let h = row * 0.4 + stitch * 0.3 + smp(gWeb, x, y) * 0.16;
      const w = smp(gWear, x, y) * spec.grime;
      const k = 0.88 + row * 0.18 - w * 0.34;
      const i4 = i * 4;
      albedo[i4] = base[0] * k + w * 16;
      albedo[i4 + 1] = base[1] * k + w * 14;
      albedo[i4 + 2] = base[2] * k + w * 11;
      albedo[i4 + 3] = 255;
      height[i] = h;
    }
  }

  const rough = new Uint8ClampedArray(D * D * 4);
  const metal = new Uint8ClampedArray(D * D * 4);
  for (let i = 0; i < D * D; i++) {
    const i4 = i * 4;
    rough[i4] = rough[i4 + 1] = rough[i4 + 2] = 240; rough[i4 + 3] = 255;
    metal[i4] = metal[i4 + 1] = metal[i4 + 2] = 8; metal[i4 + 3] = 255;
  }

  return {
    map: toTex(N, albedo, true),
    normalMap: normalMap(height, N, 2.2),
    roughnessMap: toTex(D, rough, false),
    metalnessMap: toTex(D, metal, false),
  };
}

// ── cache ───────────────────────────────────────────────────

export interface EnemyTextures {
  cloth: PBRSet;
  plate: PBRSet;
  gear: PBRSet;
}

const cache = new Map<string, EnemyTextures>();

export function enemyTextures(a: Archetype): EnemyTextures {
  let set = cache.get(a.kind);
  if (set) return set;
  let seed = 1013;
  for (let i = 0; i < a.kind.length; i++) seed = (seed * 31 + a.kind.charCodeAt(i)) >>> 0;
  set = {
    cloth: buildCloth(a.palette, a.material, seed),
    plate: buildPlate(a.palette, a.material, seed + 500, !!a.gear.hazardStripes),
    gear: buildGear(a.palette, a.material, seed + 900),
  };
  cache.set(a.kind, set);
  return set;
}

export function enemyTextureCount(): number {
  return cache.size;
}
