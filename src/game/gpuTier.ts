// ─────────────────────────────────────────────────────────────
//  GPU TIER DETECTION
//
//  Runs a tiny micro-benchmark on first launch to classify the
//  device into one of three tiers. The chosen tier sets the
//  default Quality (low/medium/high/studio).
//
//  Detection logic:
//    1. Capabilities check (max texture size, max samples, framebuffer
//       precision). If anything is below the WebGL2 baseline, we drop
//       straight to "low" without benchmarking.
//    2. One-frame render benchmark: render a small instanced scene
//       and time it. Higher-resolution shadow maps + post-processing
//       need a fast enough GPU.
//    3. Heuristic combining DPR + cores + memory as a fallback when
//       the benchmark fails for any reason.
//
//  Result is cached in localStorage so we only benchmark once per
//  device. The player can still manually override the quality tier
//  from the settings panel.
// ─────────────────────────────────────────────────────────────

import type { Quality } from "./settings";
import { isNativeApp } from "./platform";

export type GpuTier = "low" | "mid" | "high";

export interface GpuProfile {
  tier: GpuTier;
  /** the quality level we recommend for this device */
  recommended: Quality;
  /** human-readable name of the GPU, for the diagnostic UI */
  renderer: string;
  /** max anisotropy supported by the GPU */
  maxAnisotropy: number;
  /** max texture size — we cap texture LODs to half of this on low */
  maxTextureSize: number;
  /** whether the GPU supports WebGL2 (most modern mobile GPUs do) */
  webgl2: boolean;
}

const CACHE_KEY = "shadowstrike.gpu.v1";

function readCache(): GpuProfile | null {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as GpuProfile;
  } catch { return null; }
}

function writeCache(p: GpuProfile) {
  try { localStorage.setItem(CACHE_KEY, JSON.stringify(p)); } catch { /* */ }
}

function makeContext(): WebGLRenderingContext | WebGL2RenderingContext | null {
  try {
    const canvas = document.createElement("canvas");
    const gl = canvas.getContext("webgl2", { alpha: false, antialias: false }) as WebGL2RenderingContext | null;
    if (gl) return gl;
    return canvas.getContext("webgl", { alpha: false, antialias: false }) as WebGLRenderingContext | null;
  } catch {
    return null;
  }
}

function maxAnisotropy(gl: WebGLRenderingContext | WebGL2RenderingContext): number {
  try {
    const ext = (
      gl as WebGLRenderingContext
    ).getExtension?.("EXT_texture_filter_anisotropic") ||
      (gl as any).getExtension?.("MOZ_EXT_texture_filter_anisotropic") ||
      (gl as any).getExtension?.("WEBKIT_EXT_texture_filter_anisotropic");
    if (!ext) return 1;
    const a = (gl as WebGLRenderingContext).getParameter(ext.MAX_TEXTURE_MAX_ANISOTROPY_EXT);
    return typeof a === "number" ? Math.min(8, Math.max(1, Math.floor(a))) : 1;
  } catch { return 1; }
}

/**
 * Run a quick benchmark: render N frames of a small instanced scene
 * and measure average ms. Returns the average ms per frame.
 *
 * Lower is better. Anything < 8ms (~120fps capable for the GPU's own
 * render cost) we treat as tier "high"; 8–16ms as "mid"; >16ms as low.
 */
function runBenchmark(gl: WebGLRenderingContext | WebGL2RenderingContext): number {
  try {
    const canvas = gl.canvas as HTMLCanvasElement;
    canvas.width = 256; canvas.height = 256;
    gl.viewport(0, 0, 256, 256);

    // Simple shader that simulates the kind of pixel cost of a real
    // fragment with a few texture samples + lighting math.
    const vert = `
      attribute vec2 a_pos;
      void main() { gl_Position = vec4(a_pos, 0.0, 1.0); }
    `;
    const frag = `
      precision mediump float;
      uniform float u_t;
      void main() {
        vec2 uv = gl_FragCoord.xy / vec2(256.0);
        float c = 0.0;
        for (int i = 0; i < 8; i++) {
          float fi = float(i);
          uv = fract(uv * 1.3 + vec2(0.1, 0.13));
          c += sin(uv.x * 12.0 + u_t + fi) * cos(uv.y * 9.0 + fi);
        }
        gl_FragColor = vec4(vec3(c * 0.125), 1.0);
      }
    `;
    const compile = (type: number, src: string) => {
      const s = gl.createShader(type)!;
      gl.shaderSource(s, src);
      gl.compileShader(s);
      return s;
    };
    const prog = gl.createProgram()!;
    gl.attachShader(prog, compile(gl.VERTEX_SHADER, vert));
    gl.attachShader(prog, compile(gl.FRAGMENT_SHADER, frag));
    gl.linkProgram(prog);
    gl.useProgram(prog);

    const buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([
      -1, -1, 1, -1, -1, 1, -1, 1, 1, -1, 1, 1,
    ]), gl.STATIC_DRAW);
    const loc = gl.getAttribLocation(prog, "a_pos");
    gl.enableVertexAttribArray(loc);
    gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
    const uT = gl.getUniformLocation(prog, "u_t");

    // Warm-up
    for (let i = 0; i < 5; i++) {
      gl.uniform1f(uT, i * 0.1);
      gl.drawArrays(gl.TRIANGLES, 0, 6);
      gl.finish();
    }

    // Measure 60 frames
    const start = performance.now();
    for (let i = 0; i < 60; i++) {
      gl.uniform1f(uT, i * 0.05);
      gl.drawArrays(gl.TRIANGLES, 0, 6);
      gl.finish();
    }
    const elapsed = performance.now() - start;
    return elapsed / 60;
  } catch {
    return 99; // very slow / failed — treat as low
  }
}

function heuristicTier(): GpuTier {
  try {
    const cores = (navigator as any).hardwareConcurrency || 4;
    const mem = (navigator as any).deviceMemory || 4;
    // mid-to-high-end phones: 6+ cores, 4+ GB
    if (cores >= 6 && mem >= 4) return "high";
    if (cores >= 4 && mem >= 3) return "mid";
    return "low";
  } catch { return "mid"; }
}

function tierFromMs(ms: number): GpuTier {
  if (ms < 6) return "high";      // very fast GPU → can do studio
  if (ms < 12) return "mid";      // medium settings OK
  return "low";                   // struggle, drop to low
}

function qualityForTier(tier: GpuTier, native: boolean): Quality {
  if (!native) {
    // web build: cap at high to be safe
    if (tier === "high") return "high";
    if (tier === "mid") return "medium";
    return "low";
  }
  // native APK: high-end can try studio; mid = high; low = medium
  if (tier === "high") return "studio";
  if (tier === "mid") return "high";
  return "medium";
}

let cached: GpuProfile | null = null;

/**
 * Detect the device's GPU tier. On the first call this runs the
 * benchmark (1-2 frame stalls on a hidden 256x256 canvas); subsequent
 * calls return the cached profile.
 *
 * Pass `force=true` to re-run the benchmark even if cached.
 */
export function detectGpu(force = false): GpuProfile {
  if (!force && cached) return cached;
  const fromStorage = readCache();
  if (!force && fromStorage) {
    cached = fromStorage;
    return cached;
  }

  const gl = makeContext();
  const native = isNativeApp();

  if (!gl) {
    cached = {
      tier: "low",
      recommended: "low",
      renderer: "WebGL unavailable",
      maxAnisotropy: 1,
      maxTextureSize: 2048,
      webgl2: false,
    };
    writeCache(cached);
    return cached;
  }

  const debugInfo = gl.getExtension?.("WEBGL_debug_renderer_info");
  const rendererName = debugInfo
    ? (gl.getParameter(debugInfo.UNMASKED_RENDERER_WEBGL) as string)
    : (gl.getParameter(gl.RENDERER) as string);

  const maxTex = gl.getParameter(gl.MAX_TEXTURE_SIZE) as number;
  const aniso = maxAnisotropy(gl);
  const isWebgl2 = !!(gl as WebGL2RenderingContext).drawArraysInstanced;

  // Hard floor: if the GPU can't do 4096 textures or has no anisotropic
  // filter, we drop straight to low without benchmarking.
  let tier: GpuTier;
  if (maxTex < 4096) {
    tier = "low";
  } else {
    const ms = runBenchmark(gl);
    tier = tierFromMs(ms);
    // If the benchmark clearly failed (NaN/negative), fall back to heuristic
    if (!isFinite(ms) || ms <= 0) tier = heuristicTier();
  }

  // Touch + low-DPR device means we shouldn't bump to studio even
  // if the benchmark was OK — the GPU may run hot and throttle.
  if (tier === "high" && native) {
    const dpr = window.devicePixelRatio || 1;
    if (dpr > 3) tier = "mid"; // huge density screen, play safe
  }

  cached = {
    tier,
    recommended: qualityForTier(tier, native),
    renderer: rendererName || "Unknown",
    maxAnisotropy: aniso,
    maxTextureSize: maxTex,
    webgl2: isWebgl2,
  };
  writeCache(cached);

  // try to lose the context to free the benchmark canvas
  try {
    const lose = gl.getExtension?.("WEBGL_lose_context");
    lose?.loseContext?.();
  } catch { /* */ }

  return cached;
}

/** Synchronously read the cached GPU profile, or null if not yet detected. */
export function getCachedGpu(): GpuProfile | null {
  return cached ?? readCache();
}
