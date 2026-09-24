// ─────────────────────────────────────────────────────────────
//  Procedural PBR texture factory.
//
//  Everything here is generated at runtime and is SEAMLESSLY
//  TILEABLE (periodic value-noise lattices), which is required
//  for an infinitely streaming street — an AI photo would show a
//  hard seam every chunk boundary.
//
//  Each surface produces a full material set:
//     albedo  · normal (Sobel-derived from a real height field)
//     roughness (wet/dry + material variation)
//  giving proper relief and specular break-up under the moon and
//  the sodium streetlights.
// ─────────────────────────────────────────────────────────────

import * as THREE from "three";

// ── seeded RNG ──────────────────────────────────────────────

export function rng(seed: number) {
  let s = (seed >>> 0) || 1;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

// ── periodic value noise (tiles exactly over `period`) ──────

function noiseLayer(seed: number, period: number) {
  const g = new Float32Array(period * period);
  const r = rng(seed);
  for (let i = 0; i < g.length; i++) g[i] = r();
  return (x: number, y: number) => {
    const xi = Math.floor(x), yi = Math.floor(y);
    const tx = x - xi, ty = y - yi;
    const x0 = ((xi % period) + period) % period;
    const y0 = ((yi % period) + period) % period;
    const x1 = (x0 + 1) % period;
    const y1 = (y0 + 1) % period;
    const sx = tx * tx * (3 - 2 * tx);
    const sy = ty * ty * (3 - 2 * ty);
    const a = g[y0 * period + x0], b = g[y0 * period + x1];
    const c = g[y1 * period + x0], d = g[y1 * period + x1];
    const top = a + (b - a) * sx;
    const bot = c + (d - c) * sx;
    return top + (bot - top) * sy;
  };
}

/** seamless fBm sampler over the unit square */
function fbm(seed: number, basePeriod: number, octaves: number) {
  const layers: { f: (x: number, y: number) => number; p: number; a: number }[] = [];
  let p = basePeriod;
  let a = 1;
  let norm = 0;
  for (let i = 0; i < octaves; i++) {
    layers.push({ f: noiseLayer(seed + i * 7919, p), p, a });
    norm += a;
    p *= 2;
    a *= 0.5;
  }
  return (u: number, v: number) => {
    let sum = 0;
    for (const l of layers) sum += l.f(u * l.p, v * l.p) * l.a;
    return sum / norm;
  };
}

// ── canvas helpers ──────────────────────────────────────────

function newCanvas(size: number) {
  const cv = document.createElement("canvas");
  cv.width = cv.height = size;
  return cv;
}

function toTexture(cv: HTMLCanvasElement, srgb: boolean): THREE.CanvasTexture {
  const t = new THREE.CanvasTexture(cv);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = 8;
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/** Sobel a height field into a tangent-space normal map (wraps at edges) */
function heightToNormal(height: Float32Array, size: number, strength: number): THREE.CanvasTexture {
  const cv = newCanvas(size);
  const ctx = cv.getContext("2d")!;
  const img = ctx.createImageData(size, size);
  const d = img.data;
  const at = (x: number, y: number) =>
    height[(((y % size) + size) % size) * size + (((x % size) + size) % size)];
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const tl = at(x - 1, y - 1), t = at(x, y - 1), tr = at(x + 1, y - 1);
      const l = at(x - 1, y), r = at(x + 1, y);
      const bl = at(x - 1, y + 1), b = at(x, y + 1), br = at(x + 1, y + 1);
      const dx = tl + 2 * l + bl - (tr + 2 * r + br);
      const dy = tl + 2 * t + tr - (bl + 2 * b + br);
      let nx = dx * strength;
      let ny = dy * strength;
      const nz = 1;
      const inv = 1 / Math.hypot(nx, ny, nz);
      nx *= inv; ny *= inv;
      const nzn = nz * inv;
      const i = (y * size + x) * 4;
      d[i] = (nx * 0.5 + 0.5) * 255;
      d[i + 1] = (ny * 0.5 + 0.5) * 255;
      d[i + 2] = (nzn * 0.5 + 0.5) * 255;
      d[i + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  return toTexture(cv, false);
}

export interface PBRSet {
  map: THREE.CanvasTexture;
  normalMap: THREE.CanvasTexture;
  roughnessMap: THREE.CanvasTexture;
}

function pack(
  size: number,
  albedo: Uint8ClampedArray,
  rough: Uint8ClampedArray,
  height: Float32Array,
  normalStrength: number
): PBRSet {
  const acv = newCanvas(size);
  const actx = acv.getContext("2d")!;
  const aimg = actx.createImageData(size, size);
  aimg.data.set(albedo);
  actx.putImageData(aimg, 0, 0);

  const rcv = newCanvas(size);
  const rctx = rcv.getContext("2d")!;
  const rimg = rctx.createImageData(size, size);
  rimg.data.set(rough);
  rctx.putImageData(rimg, 0, 0);

  return {
    map: toTexture(acv, true),
    roughnessMap: toTexture(rcv, false),
    normalMap: heightToNormal(height, size, normalStrength),
  };
}

/** scratch line rasteriser used for cracks (wraps around edges) */
function drawCrack(
  size: number,
  height: Float32Array,
  dark: Float32Array,
  x0: number,
  y0: number,
  angle: number,
  len: number,
  depth: number,
  width: number,
  r: () => number,
  branch: number
) {
  let x = x0, y = y0, a = angle;
  const steps = Math.max(2, Math.floor(len));
  for (let i = 0; i < steps; i++) {
    a += (r() - 0.5) * 0.35;
    x += Math.cos(a);
    y += Math.sin(a);
    const taper = 1 - i / steps;
    const w = Math.max(0.6, width * taper);
    const wi = Math.ceil(w);
    for (let oy = -wi; oy <= wi; oy++) {
      for (let ox = -wi; ox <= wi; ox++) {
        const dd = Math.hypot(ox, oy);
        if (dd > w) continue;
        const fall = 1 - dd / w;
        const px = (((Math.round(x) + ox) % size) + size) % size;
        const py = (((Math.round(y) + oy) % size) + size) % size;
        const idx = py * size + px;
        height[idx] -= depth * fall * taper;
        dark[idx] = Math.max(dark[idx], fall * taper);
      }
    }
    if (branch > 0 && r() < 0.02) {
      drawCrack(size, height, dark, x, y, a + (r() < 0.5 ? 1 : -1) * (0.5 + r()), len * 0.4, depth * 0.7, width * 0.6, r, branch - 1);
    }
  }
}

// ─────────────────────────────────────────────────────────────
//  ASPHALT — damaged road surface
//  aggregate stones · potholes · patches · cracks · oil · grime
// ─────────────────────────────────────────────────────────────

export function asphaltPBR(size = 1024, seed = 1337): PBRSet {
  const r = rng(seed);
  const grain = fbm(seed, 64, 4);       // fine aggregate
  const meso = fbm(seed + 31, 8, 4);    // patchy wear
  const macro = fbm(seed + 97, 3, 3);   // large tone drift
  const aggregate = fbm(seed + 501, 128, 2);

  const n = size * size;
  const albedo = new Uint8ClampedArray(n * 4);
  const rough = new Uint8ClampedArray(n * 4);
  const height = new Float32Array(n);
  const dark = new Float32Array(n);
  const wet = new Float32Array(n);

  // ── base height from aggregate ──
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const u = x / size, v = y / size;
      const g = grain(u, v);
      const ag = aggregate(u, v);
      // isolate stones: only the top of the aggregate noise pokes out
      const stone = Math.max(0, ag - 0.58) * 2.4;
      height[y * size + x] = g * 0.35 + stone;
    }
  }

  // ── repair patches: slightly raised, smoother rectangles ──
  const patches = 3 + Math.floor(r() * 3);
  const patchMask = new Float32Array(n);
  for (let p = 0; p < patches; p++) {
    const pw = size * (0.12 + r() * 0.22);
    const ph = size * (0.1 + r() * 0.2);
    const px = r() * size, py = r() * size;
    const rot = r() * 0.4 - 0.2;
    for (let y = -ph; y < ph; y++) {
      for (let x = -pw; x < pw; x++) {
        const rx = x * Math.cos(rot) - y * Math.sin(rot);
        const ry = x * Math.sin(rot) + y * Math.cos(rot);
        if (Math.abs(rx) > pw * 0.5 || Math.abs(ry) > ph * 0.5) continue;
        const ex = 1 - Math.max(Math.abs(rx) / (pw * 0.5), Math.abs(ry) / (ph * 0.5));
        const gx = (((Math.round(px + x) % size) + size) % size);
        const gy = (((Math.round(py + y) % size) + size) % size);
        const idx = gy * size + gx;
        const k = Math.min(1, ex * 6);
        patchMask[idx] = Math.max(patchMask[idx], k);
        height[idx] += k * 0.16;
      }
    }
  }

  // ── potholes / spalling ──
  const holes = 5 + Math.floor(r() * 5);
  for (let p = 0; p < holes; p++) {
    const hr = size * (0.012 + r() * 0.035);
    const hx = r() * size, hy = r() * size;
    for (let y = -hr * 1.6; y < hr * 1.6; y++) {
      for (let x = -hr * 1.6; x < hr * 1.6; x++) {
        const d = Math.hypot(x, y) / hr;
        if (d > 1.5) continue;
        const gx = (((Math.round(hx + x) % size) + size) % size);
        const gy = (((Math.round(hy + y) % size) + size) % size);
        const idx = gy * size + gx;
        const k = Math.max(0, 1 - d);
        height[idx] -= k * 0.9;
        dark[idx] = Math.max(dark[idx], k * 0.85);
      }
    }
  }

  // ── crack network ──
  const cracks = 16 + Math.floor(r() * 12);
  for (let c = 0; c < cracks; c++) {
    drawCrack(size, height, dark, r() * size, r() * size, r() * Math.PI * 2,
      size * (0.08 + r() * 0.3), 0.55, 1.1 + r() * 1.4, r, 2);
  }

  // ── oil / fluid stains (wet, glossy) ──
  const stains = 4 + Math.floor(r() * 4);
  for (let s = 0; s < stains; s++) {
    const sr = size * (0.03 + r() * 0.08);
    const sx = r() * size, sy = r() * size;
    for (let y = -sr * 2; y < sr * 2; y++) {
      for (let x = -sr * 2; x < sr * 2; x++) {
        const d = Math.hypot(x, y) / sr;
        if (d > 2) continue;
        const gx = (((Math.round(sx + x) % size) + size) % size);
        const gy = (((Math.round(sy + y) % size) + size) % size);
        const idx = gy * size + gx;
        const u = gx / size, v = gy / size;
        const edge = grain(u * 2, v * 2) * 0.55;
        const k = Math.max(0, 1 - d + edge - 0.3);
        if (k <= 0) continue;
        dark[idx] = Math.max(dark[idx], k * 0.8);
        wet[idx] = Math.max(wet[idx], Math.min(1, k * 1.4));
      }
    }
  }

  // ── composite ──
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const idx = y * size + x;
      const u = x / size, v = y / size;
      const g = grain(u, v);
      const m = meso(u, v);
      const M = macro(u, v);

      // base asphalt tone: cool dark grey with tonal drift
      let base = 40 + M * 26 + m * 16 + g * 26;
      // aggregate stones read lighter
      const ag = Math.max(0, aggregate(u, v) - 0.58) * 2.4;
      base += ag * 70;
      // repaired patches are darker/fresher
      base -= patchMask[idx] * 14;
      // cracks and holes go black
      base *= 1 - dark[idx] * 0.82;
      // oil darkens further
      base *= 1 - wet[idx] * 0.25;

      const rr = base * 1.0;
      const gg = base * 1.01;
      const bb = base * 1.07; // slight cool cast
      const i4 = idx * 4;
      albedo[i4] = rr; albedo[i4 + 1] = gg; albedo[i4 + 2] = bb; albedo[i4 + 3] = 255;

      // roughness: coarse asphalt is very rough; oil/polish is smooth
      let ro = 0.93 - ag * 0.22 + (g - 0.5) * 0.12;
      ro -= wet[idx] * 0.72;              // wet slick
      ro -= patchMask[idx] * 0.1;
      ro = Math.max(0.06, Math.min(1, ro));
      const rv = ro * 255;
      rough[i4] = rv; rough[i4 + 1] = rv; rough[i4 + 2] = rv; rough[i4 + 3] = 255;
    }
  }

  return pack(size, albedo, rough, height, 2.6);
}

// ─────────────────────────────────────────────────────────────
//  CONCRETE / BRICK WALL — damaged urban facade
//  panel seams · brick courses exposed through broken render ·
//  cracks · rebar pocks · water staining · dirt gradient
// ─────────────────────────────────────────────────────────────

export interface WallOpts {
  /** 0..1 — how much of the render has spalled off, exposing brick */
  brickExposure?: number;
  /** 0..1 — water streaking / grime */
  stain?: number;
  /** 0..1 — cracks, pocks and impact damage */
  damage?: number;
  /** number of cast-concrete panel seams (0 = smooth render) */
  seams?: number;
  /** albedo tint multiplier */
  tint?: [number, number, number];
}

export function wallPBR(size = 768, seed = 4242, opts: WallOpts = {}): PBRSet {
  const {
    brickExposure = 0.5,
    stain = 0.5,
    damage = 0.5,
    seams = 4,
    tint = [1, 1, 1],
  } = opts;
  const r = rng(seed);
  const grain = fbm(seed, 96, 4);
  const meso = fbm(seed + 17, 10, 4);
  const macro = fbm(seed + 53, 4, 3);
  const spall = fbm(seed + 211, 6, 4); // where render has fallen off

  const n = size * size;
  const albedo = new Uint8ClampedArray(n * 4);
  const rough = new Uint8ClampedArray(n * 4);
  const height = new Float32Array(n);
  const dark = new Float32Array(n);
  const brickMask = new Float32Array(n);

  const brickH = size / 16;      // 16 courses
  const brickW = size / 8;       // 8 bricks per course
  const mortar = size / 190;

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const idx = y * size + x;
      const u = x / size, v = y / size;
      height[idx] = grain(u, v) * 0.3 + meso(u, v) * 0.22;

      // brick lattice (revealed where the render has spalled away)
      const row = Math.floor(y / brickH);
      const offset = (row % 2) * brickW * 0.5;
      const bx = ((x + offset) % brickW);
      const by = y % brickH;
      const isMortar = bx < mortar || by < mortar;
      const exposure = Math.max(0, spall(u, v) - (0.78 - brickExposure * 0.42)) * 3.2;
      if (exposure > 0.05) {
        brickMask[idx] = Math.min(1, exposure);
        height[idx] += isMortar ? -0.35 * brickMask[idx] : 0.2 * brickMask[idx];
      } else {
        // intact render: subtle float marks
        height[idx] += Math.sin(v * 40 + macro(u, v) * 6) * 0.02;
      }
    }
  }

  // ── horizontal panel seams (cast concrete form lines) ──
  for (let s = 1; s < seams; s++) {
    const sy = Math.floor((s / seams) * size);
    for (let x = 0; x < size; x++) {
      for (let o = -2; o <= 2; o++) {
        const idx = ((((sy + o) % size) + size) % size) * size + x;
        const k = 1 - Math.abs(o) / 3;
        height[idx] -= 0.5 * k;
        dark[idx] = Math.max(dark[idx], k * 0.55);
      }
    }
  }
  // vertical seam
  if (seams > 0) {
    const sx = Math.floor(size * 0.5);
    for (let y = 0; y < size; y++) {
      for (let o = -2; o <= 2; o++) {
        const idx = y * size + ((((sx + o) % size) + size) % size);
        const k = 1 - Math.abs(o) / 3;
        height[idx] -= 0.4 * k;
        dark[idx] = Math.max(dark[idx], k * 0.4);
      }
    }
  }

  // ── structural cracks ──
  const crackCount = Math.round(4 + damage * 20);
  for (let c = 0; c < crackCount; c++) {
    drawCrack(size, height, dark, r() * size, r() * size,
      Math.PI * 0.5 + (r() - 0.5) * 1.4, size * (0.1 + r() * 0.4), 0.7, 1 + r() * 1.6, r, 2);
  }

  // ── impact pocks / bullet scars, some exposing rebar ──
  const rebar: { x: number; y: number }[] = [];
  const pockCount = Math.round(6 + damage * 42);
  for (let p = 0; p < pockCount; p++) {
    const pr = size * (0.004 + r() * 0.016);
    const px = r() * size, py = r() * size;
    for (let y = -pr * 2; y < pr * 2; y++) {
      for (let x = -pr * 2; x < pr * 2; x++) {
        const d = Math.hypot(x, y) / pr;
        if (d > 1.8) continue;
        const gx = (((Math.round(px + x) % size) + size) % size);
        const gy = (((Math.round(py + y) % size) + size) % size);
        const idx = gy * size + gx;
        const k = Math.max(0, 1 - d);
        height[idx] -= k * 0.8;
        dark[idx] = Math.max(dark[idx], k * 0.7);
      }
    }
    if (r() < 0.25) rebar.push({ x: px, y: py });
  }

  // ── water staining running down from seams/holes ──
  const streaks = Math.round(4 + stain * 34);
  const stainMap = new Float32Array(n);
  for (let s = 0; s < streaks; s++) {
    const sx = r() * size;
    const sy = r() * size * 0.7;
    const len = size * (0.08 + r() * 0.35);
    const w = 2 + r() * 9;
    for (let i = 0; i < len; i++) {
      const t = i / len;
      const wob = Math.sin(i * 0.06 + sx) * 2;
      for (let o = -w; o <= w; o++) {
        const gx = (((Math.round(sx + o + wob) % size) + size) % size);
        const gy = (((Math.round(sy + i) % size) + size) % size);
        const idx = gy * size + gx;
        const k = (1 - Math.abs(o) / w) * (1 - t) * 0.75;
        stainMap[idx] = Math.max(stainMap[idx], k);
      }
    }
  }

  // ── composite ──
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const idx = y * size + x;
      const u = x / size, v = y / size;
      const g = grain(u, v);
      const m = meso(u, v);
      const M = macro(u, v);

      // pale weathered concrete
      let rr = 138 + M * 44 + m * 26 + g * 30;
      let gg = 134 + M * 42 + m * 25 + g * 30;
      let bb = 126 + M * 38 + m * 22 + g * 30;

      // exposed brick beneath
      const bm = brickMask[idx];
      if (bm > 0) {
        const row = Math.floor(y / brickH);
        const offset = (row % 2) * brickW * 0.5;
        const bxr = ((x + offset) % brickW);
        const byr = y % brickH;
        const isMortar = bxr < mortar || byr < mortar;
        const brickTone = 0.75 + ((row * 31 + Math.floor((x + offset) / brickW) * 17) % 10) / 30;
        const br = isMortar ? 128 : 122 * brickTone + 26;
        const bg = isMortar ? 122 : 62 * brickTone + 12;
        const bb2 = isMortar ? 112 : 48 * brickTone + 10;
        rr = rr * (1 - bm) + br * bm;
        gg = gg * (1 - bm) + bg * bm;
        bb = bb * (1 - bm) + bb2 * bm;
      }

      // grime gradient: dirtier toward the bottom of the tile
      const grime = (Math.pow(v, 1.6) * 0.4 + stainMap[idx] * 0.5) * (0.45 + stain * 1.1);
      rr *= 1 - grime * 0.62;
      gg *= 1 - grime * 0.6;
      bb *= 1 - grime * 0.55;

      // cracks / seams / pocks
      const dk = dark[idx];
      rr *= 1 - dk * 0.72; gg *= 1 - dk * 0.72; bb *= 1 - dk * 0.72;

      const i4 = idx * 4;
      albedo[i4] = rr * tint[0];
      albedo[i4 + 1] = gg * tint[1];
      albedo[i4 + 2] = bb * tint[2];
      albedo[i4 + 3] = 255;

      // concrete is uniformly rough; wet stains are glossier
      let ro = 0.95 - (g - 0.5) * 0.16 - stainMap[idx] * 0.45 - bm * 0.05;
      ro = Math.max(0.18, Math.min(1, ro));
      const rv = ro * 255;
      rough[i4] = rv; rough[i4 + 1] = rv; rough[i4 + 2] = rv; rough[i4 + 3] = 255;
    }
  }

  // rust bleed around exposed rebar
  for (const p of rebar) {
    const pr = size * 0.03;
    for (let y = -pr; y < pr * 2.2; y++) {
      for (let x = -pr; x < pr; x++) {
        const d = Math.hypot(x, Math.max(0, y)) / pr;
        if (d > 1) continue;
        const gx = (((Math.round(p.x + x) % size) + size) % size);
        const gy = (((Math.round(p.y + y) % size) + size) % size);
        const i4 = (gy * size + gx) * 4;
        const k = (1 - d) * 0.6;
        albedo[i4] = albedo[i4] * (1 - k) + 122 * k;
        albedo[i4 + 1] = albedo[i4 + 1] * (1 - k) + 58 * k;
        albedo[i4 + 2] = albedo[i4 + 2] * (1 - k) + 26 * k;
      }
    }
  }

  return pack(size, albedo, rough, height, 2.2);
}

// ─────────────────────────────────────────────────────────────
//  CONCRETE SIDEWALK / KERB
// ─────────────────────────────────────────────────────────────

export function sidewalkPBR(size = 512, seed = 909): PBRSet {
  const r = rng(seed);
  const grain = fbm(seed, 80, 4);
  const meso = fbm(seed + 13, 8, 3);
  const n = size * size;
  const albedo = new Uint8ClampedArray(n * 4);
  const rough = new Uint8ClampedArray(n * 4);
  const height = new Float32Array(n);
  const dark = new Float32Array(n);

  const slab = size / 4;
  const joint = size / 150;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const idx = y * size + x;
      height[idx] = grain(x / size, y / size) * 0.34 + meso(x / size, y / size) * 0.2;
      const jx = x % slab, jy = y % slab;
      if (jx < joint || jy < joint) {
        height[idx] -= 0.75;
        dark[idx] = 0.7;
      }
    }
  }
  for (let c = 0; c < 12; c++) {
    drawCrack(size, height, dark, r() * size, r() * size, r() * Math.PI * 2, size * (0.06 + r() * 0.22), 0.5, 0.9 + r(), r, 1);
  }

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const idx = y * size + x;
      const g = grain(x / size, y / size);
      const m = meso(x / size, y / size);
      let base = 118 + m * 40 + g * 34;
      base *= 1 - dark[idx] * 0.65;
      const i4 = idx * 4;
      albedo[i4] = base * 1.0;
      albedo[i4 + 1] = base * 0.99;
      albedo[i4 + 2] = base * 0.94;
      albedo[i4 + 3] = 255;
      const ro = Math.max(0.3, Math.min(1, 0.95 - (g - 0.5) * 0.2));
      const rv = ro * 255;
      rough[i4] = rv; rough[i4 + 1] = rv; rough[i4 + 2] = rv; rough[i4 + 3] = 255;
    }
  }
  return pack(size, albedo, rough, height, 2.0);
}

// ── decal textures (transparent) ────────────────────────────

/** long directional tyre smear, tiles along V */
export function tyreTexture(seed = 7): THREE.CanvasTexture {
  const size = 256;
  const cv = newCanvas(size);
  const c = cv.getContext("2d")!;
  c.clearRect(0, 0, size, size);
  const r = rng(seed);
  const streak = fbm(seed, 16, 4);
  const img = c.createImageData(size, size);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const u = x / size, v = y / size;
      // dark band with soft edges across U
      const edge = Math.pow(Math.sin(Math.PI * u), 0.55);
      const n = streak(u * 0.6, v) * 0.75 + streak(u * 3, v * 3) * 0.25;
      let a = edge * (0.35 + n * 0.65) - 0.18;
      a = Math.max(0, Math.min(1, a)) * 0.72;
      const i = (y * size + x) * 4;
      img.data[i] = 14; img.data[i + 1] = 13; img.data[i + 2] = 13;
      img.data[i + 3] = a * 255;
    }
  }
  c.putImageData(img, 0, 0);
  // occasional tread chevrons
  c.globalAlpha = 0.14;
  c.strokeStyle = "#000";
  c.lineWidth = 2;
  for (let i = 0; i < 40; i++) {
    const y = r() * size;
    c.beginPath();
    c.moveTo(size * 0.2, y);
    c.lineTo(size * 0.8, y + 3);
    c.stroke();
  }
  c.globalAlpha = 1;
  return toTexture(cv, true);
}

/** worn road paint stripe */
export function paintTexture(seed = 11): THREE.CanvasTexture {
  const size = 128;
  const cv = newCanvas(size);
  const c = cv.getContext("2d")!;
  const wear = fbm(seed, 12, 4);
  const img = c.createImageData(size, size);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const u = x / size, v = y / size;
      const w = wear(u * 2, v * 2);
      const edge = Math.min(1, Math.min(u, 1 - u) * 9);
      let a = edge * (w * 1.5 - 0.28);
      a = Math.max(0, Math.min(1, a));
      const i = (y * size + x) * 4;
      const tone = 196 + w * 50;
      img.data[i] = tone; img.data[i + 1] = tone * 0.95; img.data[i + 2] = tone * 0.78;
      img.data[i + 3] = a * 235;
    }
  }
  c.putImageData(img, 0, 0);
  return toTexture(cv, true);
}

/** grime / dirt accumulation blob used along kerbs and wall bases */
export function grimeTexture(seed = 23): THREE.CanvasTexture {
  const size = 256;
  const cv = newCanvas(size);
  const c = cv.getContext("2d")!;
  const f = fbm(seed, 8, 4);
  const img = c.createImageData(size, size);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const u = x / size, v = y / size;
      const n = f(u * 2, v * 2);
      const fade = Math.pow(1 - v, 1.5);
      let a = (n * 1.3 - 0.35) * fade;
      a = Math.max(0, Math.min(1, a));
      const i = (y * size + x) * 4;
      img.data[i] = 26; img.data[i + 1] = 24; img.data[i + 2] = 20;
      img.data[i + 3] = a * 200;
    }
  }
  c.putImageData(img, 0, 0);
  return toTexture(cv, true);
}

// ─────────────────────────────────────────────────────────────
//  ELIAS — professional spray-stencil graffiti
//
//  Built the way a real stencil tag is made:
//    1. soft overspray halo bleeding past the stencil edge
//    2. crisp, hard-edged paint fill (the stencil mask)
//    3. cut "bridges" knocked through the letters — the single
//       most recognisable feature of a military stencil
//    4. gravity drips with bulbous heads running from letter feet
//    5. fine aerosol speckle, densest near the edges
//    6. flaking / wear where the paint sits on rough concrete
// ─────────────────────────────────────────────────────────────

export interface StencilOpts {
  text?: string;
  color?: string;        // core paint colour
  seed?: number;
  width?: number;
  height?: number;
  drips?: number;
  wear?: number;         // 0..1 how flaked the paint is
  bridges?: boolean;
}

export function eliasStencil(opts: StencilOpts = {}): THREE.CanvasTexture {
  const {
    text = "ELIAS",
    color = "#e7e3d8",
    seed = 5,
    width = 512,
    height = 256,
    drips = 7,
    wear = 0.5,
    bridges = true,
  } = opts;

  const r = rng(seed);
  const cv = newCanvas(1);
  cv.width = width;
  cv.height = height;
  const c = cv.getContext("2d")!;
  c.clearRect(0, 0, width, height);

  // condensed, heavy face reads as a cut stencil
  const fs = Math.floor(height * 0.46);
  const font = `900 ${fs}px "Arial Narrow", "Haettenschweiler", Impact, sans-serif`;
  c.font = font;
  c.textAlign = "center";
  c.textBaseline = "alphabetic";

  const chars = text.split("");
  const tracking = fs * 0.1;
  const widths = chars.map((ch) => c.measureText(ch).width);
  const total = widths.reduce((a, b) => a + b, 0) + tracking * (chars.length - 1);
  const baseY = height * 0.62;
  let penX = (width - total) / 2;

  // per-glyph placement with a touch of hand-held stencil misalignment
  const glyphs = chars.map((ch, i) => {
    const w = widths[i];
    const g = {
      ch,
      x: penX + w / 2 + (r() - 0.5) * fs * 0.03,
      y: baseY + (r() - 0.5) * fs * 0.035,
      rot: (r() - 0.5) * 0.028,
      w,
    };
    penX += w + tracking;
    return g;
  });

  const drawGlyphs = (dx: number, dy: number) => {
    for (const g of glyphs) {
      c.save();
      c.translate(g.x + dx, g.y + dy);
      c.rotate(g.rot);
      c.fillText(g.ch, 0, 0);
      c.restore();
    }
  };

  // ── 1. overspray halo — many faint offset passes = soft aerosol edge ──
  c.fillStyle = color;
  const halo = 9;
  for (let i = 0; i < halo; i++) {
    const a = (i / halo) * Math.PI * 2;
    const rad = 2 + i * 0.55;
    c.globalAlpha = 0.05;
    drawGlyphs(Math.cos(a) * rad, Math.sin(a) * rad);
  }
  c.globalAlpha = 1;

  // ── 2. crisp paint fill ──
  c.fillStyle = color;
  drawGlyphs(0, 0);

  // subtle internal tonal variation so the paint isn't dead flat
  const tone = fbm(seed + 91, 8, 3);
  const img = c.getImageData(0, 0, width, height);
  const d = img.data;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4;
      if (d[i + 3] < 8) continue;
      const k = 0.86 + tone(x / width, y / height) * 0.26;
      d[i] = Math.min(255, d[i] * k);
      d[i + 1] = Math.min(255, d[i + 1] * k);
      d[i + 2] = Math.min(255, d[i + 2] * k);
    }
  }
  c.putImageData(img, 0, 0);

  // ── 3. stencil bridges (cut ties) ──
  if (bridges) {
    c.globalCompositeOperation = "destination-out";
    c.fillStyle = "#000";
    const bandYs = [baseY - fs * 0.62, baseY - fs * 0.26];
    for (const by of bandYs) {
      const th = fs * (0.055 + r() * 0.02);
      // ties are cut per-glyph so they land on the letterforms
      for (const g of glyphs) {
        c.save();
        c.translate(g.x, g.y);
        c.rotate(g.rot);
        c.fillRect(-g.w * 0.62, by - g.y - th / 2, g.w * 1.24, th);
        c.restore();
      }
    }
    // one vertical tie through the middle glyph
    const mid = glyphs[Math.floor(glyphs.length / 2)];
    c.fillRect(mid.x - fs * 0.02, baseY - fs * 0.95, fs * 0.04, fs * 0.3);
    c.globalCompositeOperation = "source-over";
  }

  // ── 4. drips ──
  c.fillStyle = color;
  for (let i = 0; i < drips; i++) {
    const g = glyphs[Math.floor(r() * glyphs.length)];
    const x = g.x + (r() - 0.5) * g.w * 0.75;
    const y0 = g.y + fs * 0.02;
    const len = fs * (0.2 + r() * 0.95);
    const w0 = fs * (0.022 + r() * 0.026);
    // tapered run
    c.globalAlpha = 0.92;
    c.beginPath();
    c.moveTo(x - w0, y0);
    c.lineTo(x + w0, y0);
    c.lineTo(x + w0 * 0.45, y0 + len);
    c.lineTo(x - w0 * 0.45, y0 + len);
    c.closePath();
    c.fill();
    // bulbous head where the paint pooled
    c.beginPath();
    c.arc(x, y0 + len, w0 * 0.72, 0, Math.PI * 2);
    c.fill();
    // faint trailing wash below the head
    c.globalAlpha = 0.22;
    c.beginPath();
    c.arc(x, y0 + len + w0 * 0.8, w0 * 0.5, 0, Math.PI * 2);
    c.fill();
    c.globalAlpha = 1;
  }

  // ── 5. aerosol speckle around the tag ──
  for (let i = 0; i < 520; i++) {
    const g = glyphs[Math.floor(r() * glyphs.length)];
    const ang = r() * Math.PI * 2;
    const dist = Math.pow(r(), 1.8) * fs * 0.85;
    const x = g.x + Math.cos(ang) * dist;
    const y = g.y - fs * 0.3 + Math.sin(ang) * dist;
    const rad = 0.4 + r() * 1.5;
    c.globalAlpha = 0.05 + r() * 0.3;
    c.fillStyle = color;
    c.beginPath();
    c.arc(x, y, rad, 0, Math.PI * 2);
    c.fill();
  }
  c.globalAlpha = 1;

  // ── 6. wear — knock holes in the paint where the wall is rough ──
  if (wear > 0) {
    c.globalCompositeOperation = "destination-out";
    const flake = fbm(seed + 401, 24, 4);
    const wimg = c.getImageData(0, 0, width, height);
    const wd = wimg.data;
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const i = (y * width + x) * 4;
        if (wd[i + 3] === 0) continue;
        const n = flake(x / width, y / height);
        if (n > 1 - wear * 0.42) wd[i + 3] *= 0.12;
        else if (n > 1 - wear * 0.62) wd[i + 3] *= 0.6;
      }
    }
    c.globalCompositeOperation = "source-over";
    c.putImageData(wimg, 0, 0);
  }

  const t = new THREE.CanvasTexture(cv);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  return t;
}

// ─────────────────────────────────────────────────────────────
//  DRAGON FORGE — texture set for the mythical fire sniper
// ─────────────────────────────────────────────────────────────

/** interlocking dragon scales with a metallic sheen and worn tips */
export function dragonScaleTexture(size = 512, seed = 777): {
  map: THREE.CanvasTexture;
  normalMap: THREE.CanvasTexture;
} {
  const grain = fbm(seed, 64, 4);
  const tone = fbm(seed + 41, 6, 3);

  const n = size * size;
  const albedo = new Uint8ClampedArray(n * 4);
  const height = new Float32Array(n);

  // scale lattice: staggered rows of rounded, overlapping plates
  const cols = 18;
  const rows = 26;
  const cw = size / cols;
  const chh = size / rows;

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const idx = y * size + x;
      const row = Math.floor(y / chh);
      const offset = (row % 2) * cw * 0.5;
      const lx = ((x + offset) % cw) / cw - 0.5;   // -0.5..0.5 across a scale
      const ly = (y % chh) / chh;                  // 0..1 down a scale

      // rounded pointed-tip scale profile
      const tip = Math.pow(ly, 0.75);
      const halfW = 0.5 * (1 - tip * 0.55);
      const inside = Math.abs(lx) < halfW ? 1 : 0;
      const across = inside ? 1 - Math.pow(Math.abs(lx) / halfW, 2) : 0;
      const dome = inside ? Math.sqrt(Math.max(0, across)) * (1 - ly * 0.4) : 0;

      const g = grain(x / size, y / size);
      height[idx] = dome * 0.95 + g * 0.12 - (inside ? 0 : 0.25);

      // dark iron-red scales with a hot underglow in the seams
      const t = tone(x / size, y / size);
      const base = inside ? 0.28 + dome * 0.62 : 0.1;
      let rr = (44 + t * 40) * base + dome * 62;
      let gg = (20 + t * 18) * base + dome * 26;
      let bb = (18 + t * 14) * base + dome * 20;
      // molten glow bleeding out of the seams between scales
      if (!inside) { rr += 46; gg += 12; bb += 4; }
      // worn metallic highlight along each scale's leading edge
      const edge = inside && ly < 0.16 ? (1 - ly / 0.16) * 0.55 : 0;
      rr += edge * 95; gg += edge * 70; bb += edge * 58;

      const i4 = idx * 4;
      albedo[i4] = rr; albedo[i4 + 1] = gg; albedo[i4 + 2] = bb; albedo[i4 + 3] = 255;
    }
  }

  const acv = document.createElement("canvas");
  acv.width = acv.height = size;
  const actx = acv.getContext("2d")!;
  const aimg = actx.createImageData(size, size);
  aimg.data.set(albedo);
  actx.putImageData(aimg, 0, 0);
  const map = new THREE.CanvasTexture(acv);
  map.colorSpace = THREE.SRGBColorSpace;
  map.wrapS = map.wrapT = THREE.RepeatWrapping;
  map.anisotropy = 8;

  // reuse the shared Sobel normal generator
  const normalMap = heightToNormalPublic(height, size, 3.0);
  return { map, normalMap };
}

/** cracked obsidian crust with glowing lava veins (emissive mask) */
export function moltenTexture(size = 512, seed = 909): {
  map: THREE.CanvasTexture;
  emissive: THREE.CanvasTexture;
} {
  const veins = fbm(seed, 7, 4);
  const detail = fbm(seed + 23, 22, 3);
  const crust = fbm(seed + 61, 40, 3);

  const n = size * size;
  const albedo = new Uint8ClampedArray(n * 4);
  const emis = new Uint8ClampedArray(n * 4);

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const idx = y * size + x;
      const u = x / size, v = y / size;
      // ridged noise -> branching crack network
      const vn = veins(u, v) * 0.72 + detail(u, v) * 0.28;
      const ridge = 1 - Math.abs(vn - 0.5) * 2;      // 1 along the crack centre
      const heat = Math.pow(Math.max(0, ridge - 0.62) / 0.38, 1.5);
      const c = crust(u, v);

      // cooled black basalt crust
      const base = 16 + c * 26;
      let rr = base, gg = base * 0.9, bb = base * 0.86;
      // lava gradient: deep red -> orange -> white hot core
      if (heat > 0) {
        rr += heat * 255;
        gg += Math.pow(heat, 1.5) * 190;
        bb += Math.pow(heat, 3.2) * 130;
      }
      const i4 = idx * 4;
      albedo[i4] = rr; albedo[i4 + 1] = gg; albedo[i4 + 2] = bb; albedo[i4 + 3] = 255;
      // emissive mask carries only the molten veins
      emis[i4] = heat * 255;
      emis[i4 + 1] = Math.pow(heat, 1.6) * 170;
      emis[i4 + 2] = Math.pow(heat, 3.4) * 90;
      emis[i4 + 3] = 255;
    }
  }

  const mk = (data: Uint8ClampedArray, srgb: boolean) => {
    const cv = document.createElement("canvas");
    cv.width = cv.height = size;
    const c = cv.getContext("2d")!;
    const img = c.createImageData(size, size);
    img.data.set(data);
    c.putImageData(img, 0, 0);
    const t = new THREE.CanvasTexture(cv);
    if (srgb) t.colorSpace = THREE.SRGBColorSpace;
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    return t;
  };
  return { map: mk(albedo, true), emissive: mk(emis, true) };
}

/** exposed so the dragon set can build normals from its own height field */
export function heightToNormalPublic(
  height: Float32Array,
  size: number,
  strength: number
): THREE.CanvasTexture {
  return heightToNormal(height, size, strength);
}
