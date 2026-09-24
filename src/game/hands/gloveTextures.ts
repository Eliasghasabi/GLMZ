// ─────────────────────────────────────────────────────────────
//  GLOVE PBR TEXTURE SET
//
//  Generates a FULL material set per glove style — base colour,
//  normal, roughness, metallic and ambient occlusion — at a
//  resolution high enough for first-person close-ups.
//
//  Every style computes its own height field, so the normal maps
//  genuinely differ (leather grain vs. ripstop weave vs. knuckle
//  armour vs. wrapped tape). That is the difference between a real
//  material library and a pile of recolours.
//
//  Cost is paid once: the maps are cached per style and the hand
//  materials are shared across every weapon in the game.
// ─────────────────────────────────────────────────────────────

import * as THREE from "three";
import { rng } from "../textures";

/**
 * Sobel a height field into a tangent-space normal map.
 *
 * The shared helper wraps edges with `((v % n) + n) % n` on every tap,
 * which costs ~150M modulo operations at 2K. Precomputing the
 * neighbour indices once per axis removes them entirely and turns a
 * multi-second pass into a few hundred milliseconds.
 */
function fastNormalMap(height: Float32Array, size: number, strength: number): THREE.CanvasTexture {
  const xm = new Int32Array(size);
  const xp = new Int32Array(size);
  const ym = new Int32Array(size);
  const yp = new Int32Array(size);
  for (let i = 0; i < size; i++) {
    xm[i] = i === 0 ? size - 1 : i - 1;
    xp[i] = i === size - 1 ? 0 : i + 1;
    ym[i] = (i === 0 ? size - 1 : i - 1) * size;
    yp[i] = (i === size - 1 ? 0 : i + 1) * size;
  }
  const out = new Uint8ClampedArray(size * size * 4);
  for (let y = 0; y < size; y++) {
    const rowC = y * size, rowU = ym[y], rowD = yp[y];
    for (let x = 0; x < size; x++) {
      const xl = xm[x], xr = xp[x];
      const tl = height[rowU + xl], tc = height[rowU + x], tr = height[rowU + xr];
      const ml = height[rowC + xl], mr = height[rowC + xr];
      const bl = height[rowD + xl], bc = height[rowD + x], br = height[rowD + xr];
      const dx = (tl + 2 * ml + bl) - (tr + 2 * mr + br);
      const dy = (tl + 2 * tc + tr) - (bl + 2 * bc + br);
      let nx = dx * strength, ny = dy * strength;
      const inv = 1 / Math.sqrt(nx * nx + ny * ny + 1);
      nx *= inv; ny *= inv;
      const o = (rowC + x) * 4;
      out[o] = (nx * 0.5 + 0.5) * 255;
      out[o + 1] = (ny * 0.5 + 0.5) * 255;
      out[o + 2] = (inv * 0.5 + 0.5) * 255;
      out[o + 3] = 255;
    }
  }
  return toTexture(size, out, false);
}

/**
 * The glove sits centimetres from the camera, so its albedo and
 * normal are generated at 2K. Scalar maps are lower frequency and
 * run at half that. The forearm sleeve is never that close, so it
 * opts down a tier — see `gloveTextures(..., tier)`.
 */
const RES = {
  closeup: { color: 2048, data: 1024 },
  mid: { color: 1024, data: 512 },
} as const;

export type DetailTier = keyof typeof RES;

export type GloveWeave =
  | "nomex"      // fine ripstop technical fabric
  | "leather"    // pebbled hide, soft sheen
  | "suede"      // napped, very matte
  | "mesh"       // perforated summer glove
  | "kevlar"     // coarse aramid twill
  | "tape"       // wrapped cloth tape
  | "skin";      // bare hand

export interface GloveSurface {
  weave: GloveWeave;
  /** primary fabric colour */
  color: number;
  /** contrast colour used by stitching */
  stitch: number;
  /** 0..1 how beaten-up the glove is */
  wear: number;
  /** base roughness before per-pixel variation */
  roughness: number;
  /** base metalness (fabrics ~0, armoured weaves lift slightly) */
  metalness: number;
}

export interface PBRSet {
  map: THREE.CanvasTexture;
  normalMap: THREE.CanvasTexture;
  roughnessMap: THREE.CanvasTexture;
  metalnessMap: THREE.CanvasTexture;
  aoMap: THREE.CanvasTexture;
}

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
    const bot = c + (d - c) * sx;
    return top + (bot - top) * sy;
  };
}

function fbm(seed: number, base: number, oct: number) {
  const layers: { f: (x: number, y: number) => number; p: number; a: number }[] = [];
  let p = base, a = 1, norm = 0;
  for (let i = 0; i < oct; i++) {
    layers.push({ f: lattice(seed + i * 3121, p), p, a });
    norm += a; p *= 2; a *= 0.5;
  }
  return (u: number, v: number) => {
    let s = 0;
    for (const l of layers) s += l.f(u * l.p, v * l.p) * l.a;
    return s / norm;
  };
}

/**
 * Bake an fBm field into a grid once, then read it back with bilinear
 * filtering.
 *
 * These fields are low-frequency by nature, so evaluating them per
 * pixel at 2K means ~40 lattice lookups for every one of 4.2M pixels.
 * Baking at 256x256 and interpolating gives a visually identical
 * result for a fraction of the cost — the difference between a 2.6s
 * stall per glove and a barely perceptible one.
 */
const FIELD = 256;

function bakeGrid(seed: number, base: number, oct: number, scale = 1): Float32Array {
  const f = fbm(seed, base, oct);
  const g = new Float32Array(FIELD * FIELD);
  for (let y = 0; y < FIELD; y++) {
    for (let x = 0; x < FIELD; x++) {
      g[y * FIELD + x] = f((x / FIELD) * scale, (y / FIELD) * scale);
    }
  }
  return g;
}

/**
 * Bilinear sample tables.
 *
 * Output resolutions are exact multiples of FIELD, so the grid index
 * and blend weight for a given pixel are fixed per axis. Precomputing
 * them removes every modulo, floor and divide from the inner loop —
 * each field read becomes four array lookups and three lerps.
 */
interface SampleTable { i0: Int32Array; i1: Int32Array; w: Float32Array }

const tableCache = new Map<number, SampleTable>();

function sampleTable(outRes: number): SampleTable {
  let t = tableCache.get(outRes);
  if (t) return t;
  const i0 = new Int32Array(outRes);
  const i1 = new Int32Array(outRes);
  const w = new Float32Array(outRes);
  for (let i = 0; i < outRes; i++) {
    const f = (i / outRes) * FIELD;
    const a = Math.floor(f);
    i0[i] = a % FIELD;
    i1[i] = (a + 1) % FIELD;
    w[i] = f - a;
  }
  t = { i0, i1, w };
  tableCache.set(outRes, t);
  return t;
}

function toTexture(size: number, data: Uint8ClampedArray, srgb: boolean): THREE.CanvasTexture {
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

const hexRGB = (h: number): [number, number, number] => [(h >> 16) & 255, (h >> 8) & 255, h & 255];

// Math.pow with a constant exponent and Math.hypot are both far
// slower than the direct arithmetic (hypot carries overflow
// protection we do not need here). At 4.2M pixels the difference is
// seconds, so the hot loops use these instead.
const p2 = (x: number) => x * x;
const p3 = (x: number) => x * x * x;
const p5 = (x: number) => { const s = x * x; return s * s * x; };
const p15 = (x: number) => x * Math.sqrt(x);           // ~x^1.5
const dist2 = (a: number, b: number) => Math.sqrt(a * a + b * b);

// ── UV layout ───────────────────────────────────────────────
//
//  The hand geometry is UV-mapped so that:
//    v < 0.42  → palm side (grip texture, no stitching)
//    v > 0.58  → back of hand (stitch seams + armour)
//  This lets one texture serve both faces with genuinely different
//  detail, exactly as a real game glove atlas would.

const isPalmSide = (v: number) => v < 0.42;

/**
 * Generate a complete PBR set for one glove style.
 * Returns five maps whose relief, gloss and metal response all
 * derive from the same height field, so they stay consistent.
 */
export function buildGloveTextures(s: GloveSurface, seed: number, tier: DetailTier = "closeup"): PBRSet {
  const base = hexRGB(s.color);
  const stitchCol = hexRGB(s.stitch);

  // ── shared noise fields ──
  // Fields are baked WITH their frequency folded in, so every read is
  // at plain (u,v) and can use the shared sample tables.
  const gGrain = bakeGrid(seed, 96, 4);
  const gBlotch = bakeGrid(seed + 17, 7, 4);          // used at 1x
  const gBlotch3 = bakeGrid(seed + 17, 7, 4, 3.2);    // leather pebbles
  const gGrain16 = bakeGrid(seed, 96, 4, 1.6);
  const gGrain24 = bakeGrid(seed, 96, 4, 2.4);
  const gGrain34 = bakeGrid(seed, 96, 4, 3.4);
  const gWrink = bakeGrid(seed + 51, 11, 3, 2.1);
  const gScuff = bakeGrid(seed + 83, 22, 3);

  // ── high-res pass: albedo + height ──
  const N = RES[tier].color;
  const albedo = new Uint8ClampedArray(N * N * 4);
  const height = new Float32Array(N * N);

  const T = sampleTable(N);
  // inline bilinear read of a baked grid using the shared tables
  const smp = (g: Float32Array, x: number, y: number) => {
    const x0 = T.i0[x], x1 = T.i1[x], tx = T.w[x];
    const r0 = T.i0[y] * FIELD, r1 = T.i1[y] * FIELD, ty = T.w[y];
    const a = g[r0 + x0], b = g[r0 + x1], c = g[r1 + x0], d = g[r1 + x1];
    const top = a + (b - a) * tx;
    return top + ((c + (d - c) * tx) - top) * ty;
  };

  for (let y = 0; y < N; y++) {
    const v = y / N;
    const palm = isPalmSide(v);
    for (let x = 0; x < N; x++) {
      const i = y * N + x;
      const u = x / N;

      let r = base[0], g = base[1], b = base[2];
      let h = 0;

      // ── weave / grain, unique per style ──
      switch (s.weave) {
        case "nomex": {
          // fine ripstop: tight twill plus a coarser reinforcement grid
          const twill = Math.sin((x * 0.9 + y * 0.9) * 0.8) * 0.5 + 0.5;
          const ripX = (x % 46) < 3 ? 1 : 0;
          const ripY = (y % 46) < 3 ? 1 : 0;
          h = twill * 0.28 + (ripX || ripY ? 0.4 : 0) + smp(gGrain, x, y) * 0.16;
          const k = 0.88 + twill * 0.16 + (ripX || ripY ? 0.1 : 0);
          r *= k; g *= k; b *= k;
          break;
        }
        case "leather": {
          // pebbled hide: irregular cells with soft valleys between
          const cell = smp(gBlotch3, x, y);
          const fine = smp(gGrain16, x, y);
          const pebble = p15(cell);
          h = pebble * 0.62 + fine * 0.14;
          const k = 0.8 + pebble * 0.34 + fine * 0.08;
          r *= k; g *= k; b *= k;
          break;
        }
        case "suede": {
          // napped fibre: dense directional fuzz, almost no specular
          const nap = smp(gGrain24, x, y);
          h = nap * 0.3 + smp(gBlotch, x, y) * 0.1;
          const k = 0.84 + nap * 0.26;
          r *= k; g *= k; b *= k;
          break;
        }
        case "mesh": {
          // perforated: real holes punched through the back panel
          const p = 34;
          const cx = (x % p) - p / 2, cy = (y % p) - p / 2;
          const d = dist2(cx, cy);
          const hole = !palm && d < 8 ? 1 : 0;
          const rim = !palm && d >= 8 && d < 11 ? 1 : 0;
          h = hole ? -0.85 : rim ? 0.45 : smp(gGrain, x, y) * 0.2;
          const k = hole ? 0.32 : rim ? 1.12 : 0.9 + smp(gGrain, x, y) * 0.16;
          r *= k; g *= k; b *= k;
          break;
        }
        case "kevlar": {
          // coarse aramid basket-weave with a faint golden cast
          const cellSz = 26;
          const bx = Math.floor(x / cellSz), by = Math.floor(y / cellSz);
          const over = (bx + by) % 2 === 0;
          const inX = (x % cellSz) / cellSz, inY = (y % cellSz) / cellSz;
          const along = over ? inY : inX;
          const tow = Math.sin(along * Math.PI);
          const fil = Math.sin((over ? inX : inY) * Math.PI * 7) * 0.5 + 0.5;
          h = tow * 0.55 + fil * 0.12;
          const k = 0.74 + tow * 0.4 + fil * 0.08;
          r *= k * 1.04; g *= k * 0.99; b *= k * 0.82;
          break;
        }
        case "tape": {
          // wrapped cloth tape: overlapping diagonal bands with edges
          const band = (u * 5.5 + v * 2.2) % 1;
          const edge = band < 0.06 || band > 0.94 ? 1 : 0;
          h = (1 - Math.abs(band - 0.5) * 1.2) * 0.4 + (edge ? 0.5 : 0) + smp(gGrain, x, y) * 0.14;
          const k = 0.82 + (1 - Math.abs(band - 0.5)) * 0.28 - (edge ? 0.12 : 0);
          r *= k; g *= k; b *= k;
          break;
        }
        case "skin": {
          // bare hand: pores, fine creases, subtle blood tone variation
          const pore = smp(gGrain34, x, y);
          const crease = Math.abs(Math.sin((u * 14 + smp(gWrink, x, y) * 7) * Math.PI));
          const deep = palm ? p5(crease) * p2(crease) : 0;
          h = pore * 0.18 - deep * 0.5;
          const k = 0.92 + pore * 0.12 - deep * 0.22;
          r *= k * 1.02; g *= k * 0.95; b *= k * 0.9;
          break;
        }
      }

      // ── palm grip pattern (silicone dots / suede patch) ──
      if (palm && s.weave !== "skin") {
        const gp = 30;
        const gx = (x % gp) - gp / 2, gy = (y % gp) - gp / 2;
        const dot = dist2(gx, gy) < 9 ? 1 : 0;
        if (dot) {
          h += 0.6;
          r = r * 0.55 + 26; g = g * 0.55 + 26; b = b * 0.55 + 28;
        }
      }

      // ── stitched seams on the back of the hand ──
      if (!palm) {
        // two long seams running toward the knuckles plus a cuff seam
        const seamA = Math.abs(u - 0.3) < 0.004;
        const seamB = Math.abs(u - 0.7) < 0.004;
        const seamC = Math.abs(v - 0.88) < 0.005;
        const onSeam = seamA || seamB || seamC;
        if (onSeam) {
          // dashed thread: alternating stitch / gap along the seam
          const along = (seamC ? x : y) % 22;
          if (along < 13) {
            h += 0.75;
            r = stitchCol[0]; g = stitchCol[1]; b = stitchCol[2];
          } else {
            h -= 0.25;
          }
        }
      }

      // ── wrinkles concentrated at flex points ──
      const flex = smp(gWrink, x, y);
      const fold = p5(Math.abs(Math.sin(flex * Math.PI * 3)));
      h -= fold * 0.42;
      const fk = 1 - fold * 0.2;
      r *= fk; g *= fk; b *= fk;

      // ── wear: knuckles and fingertips rub through first ──
      const rub = smp(gScuff, x, y) * s.wear;
      if (rub > 0.52) {
        const t = (rub - 0.52) / 0.48;
        r = r * (1 - t) + 214 * t * 0.55 + r * t * 0.45;
        g = g * (1 - t) + 210 * t * 0.55 + g * t * 0.45;
        b = b * (1 - t) + 205 * t * 0.55 + b * t * 0.45;
        h -= t * 0.2;
      }

      height[i] = h;
      const o = i * 4;
      albedo[o] = r; albedo[o + 1] = g; albedo[o + 2] = b; albedo[o + 3] = 255;
    }
  }

  // ── data pass: roughness / metalness / AO at half res ──
  const D = RES[tier].data;
  const rough = new Uint8ClampedArray(D * D * 4);
  const metal = new Uint8ClampedArray(D * D * 4);
  const ao = new Uint8ClampedArray(D * D * 4);

  const TD = sampleTable(D);
  const smpD = (g: Float32Array, x: number, y: number) => {
    const x0 = TD.i0[x], x1 = TD.i1[x], tx = TD.w[x];
    const r0 = TD.i0[y] * FIELD, r1 = TD.i1[y] * FIELD, ty = TD.w[y];
    const a = g[r0 + x0], b = g[r0 + x1], c = g[r1 + x0], d = g[r1 + x1];
    const top = a + (b - a) * tx;
    return top + ((c + (d - c) * tx) - top) * ty;
  };

  for (let y = 0; y < D; y++) {
    const v = y / D;
    const palm = isPalmSide(v);
    for (let x = 0; x < D; x++) {
      const i = y * D + x;

      let ro = s.roughness;
      let me = s.metalness;

      // style-specific gloss behaviour
      switch (s.weave) {
        case "leather":
          // worn leather polishes to a sheen on the high points
          ro -= p15(smpD(gBlotch3, x, y)) * 0.26;
          break;
        case "suede":
          ro += smpD(gGrain24, x, y) * 0.08;
          break;
        case "mesh":
          ro -= (dist2((x * 2 % 34) - 17, (y * 2 % 34) - 17) < 11 ? 0.12 : 0);
          break;
        case "kevlar":
          // aramid fibre catches light along the tows
          ro -= Math.sin(((x * 2) % 26) / 26 * Math.PI) * 0.16;
          me += 0.08;
          break;
        case "nomex":
          ro -= Math.sin((x * 1.8 + y * 1.8) * 0.8) * 0.05;
          break;
        case "skin":
          // skin has oily highlights on the pads, drier on the back
          ro -= palm ? 0.14 : 0.04;
          break;
        case "tape":
          ro += 0.04;
          break;
      }

      // palm grip rubber is notably glossier than the fabric around it
      if (palm && s.weave !== "skin") {
        const gp = 15;
        const dot = dist2((x % gp) - gp / 2, (y % gp) - gp / 2) < 4.5;
        if (dot) { ro -= 0.3; me += 0.02; }
      }

      // abrasion smooths the surface
      const rub = smpD(gScuff, x, y) * s.wear;
      if (rub > 0.52) ro -= (rub - 0.52) * 0.5;

      ro = Math.max(0.05, Math.min(1, ro));
      me = Math.max(0, Math.min(1, me));

      // AO: creases and the webbing between fingers hold shadow
      const fold = p5(Math.abs(Math.sin(smpD(gWrink, x, y) * Math.PI * 3)));
      const edgeDark = p3(Math.abs(v - 0.5) * 2) * 0.35;
      const occ = Math.max(0, Math.min(1, 1 - fold * 0.5 - edgeDark));

      const o = i * 4;
      const rv = ro * 255, mv = me * 255, av = occ * 255;
      rough[o] = rv; rough[o + 1] = rv; rough[o + 2] = rv; rough[o + 3] = 255;
      metal[o] = mv; metal[o + 1] = mv; metal[o + 2] = mv; metal[o + 3] = 255;
      ao[o] = av; ao[o + 1] = av; ao[o + 2] = av; ao[o + 3] = 255;
    }
  }

  return {
    map: toTexture(N, albedo, true),
    normalMap: fastNormalMap(height, N, s.weave === "mesh" ? 3.4 : 2.4),
    roughnessMap: toTexture(D, rough, false),
    metalnessMap: toTexture(D, metal, false),
    aoMap: toTexture(D, ao, false),
  };
}

// ── cache ───────────────────────────────────────────────────

const cache = new Map<string, PBRSet>();

export function gloveTextures(s: GloveSurface, key: string, tier: DetailTier = "closeup"): PBRSet {
  const ck = `${key}@${tier}`;
  let set = cache.get(ck);
  if (!set) {
    let seed = 991;
    for (let i = 0; i < key.length; i++) seed = (seed * 31 + key.charCodeAt(i)) >>> 0;
    set = buildGloveTextures(s, seed, tier);
    cache.set(ck, set);
  }
  return set;
}

/** how many distinct texture sets have been generated (diagnostics) */
export function gloveTextureCount(): number {
  return cache.size;
}
