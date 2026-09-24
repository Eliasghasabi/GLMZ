// ─────────────────────────────────────────────────────────────
//  POST-PROCESSING STACK
//
//  Wraps three.js EffectComposer with the mobile-optimised set of
//  passes the studio tier asks for:
//
//    RenderPass          → render the scene
//    BloomPass           → glow on emissive elements (muzzle flash,
//                          street lights, weapon skin fx, neon details)
//    OutputPass          → apply ACES filmic tone mapping + sRGB
//
//  Optional (gated behind settings.cinematicGrain):
//    FilmPass             → subtle film grain + scanlines
//    (chromatic aberration is implemented in the OutputPass)
//
//  Performance: every pass has a cost. The composer's render target
//  is sized at half resolution by default on mobile to keep fill-rate
//  reasonable — the player won't notice on a phone screen and we cut
//  the per-frame work substantially.
// ─────────────────────────────────────────────────────────────

import * as THREE from "three";
import { EffectComposer } from "three/examples/jsm/postprocessing/EffectComposer.js";
import { RenderPass } from "three/examples/jsm/postprocessing/RenderPass.js";
import { BloomPass } from "three/examples/jsm/postprocessing/BloomPass.js";
import { FilmPass } from "three/examples/jsm/postprocessing/FilmPass.js";
import { OutputPass } from "three/examples/jsm/postprocessing/OutputPass.js";
import type { Quality } from "./settings";

export interface PostFXConfig {
  enabled: boolean;
  bloom: boolean;
  grain: boolean;
  /** 0..1 — strength of bloom. 0 disables. */
  bloomStrength: number;
  /** radius of bloom kernel, in screen pixels */
  bloomRadius: number;
  /** luminance threshold below which bloom is suppressed */
  bloomThreshold: number;
  /** 0..1 — film grain intensity */
  grainIntensity: number;
}

export const DEFAULT_CONFIG: PostFXConfig = {
  enabled: true,
  bloom: true,
  grain: false,
  bloomStrength: 0.45,
  bloomRadius: 0.5,
  bloomThreshold: 0.78,
  grainIntensity: 0.18,
};

export class PostFX {
  private composer: EffectComposer | null = null;
  private renderPass: RenderPass | null = null;
  private bloomPass: BloomPass | null = null;
  private filmPass: FilmPass | null = null;
  private outputPass: OutputPass | null = null;
  private renderer: THREE.WebGLRenderer;
  private scene: THREE.Scene;
  private camera: THREE.Camera;
  private config: PostFXConfig = { ...DEFAULT_CONFIG };

  constructor(renderer: THREE.WebGLRenderer, scene: THREE.Scene, camera: THREE.Camera) {
    this.renderer = renderer;
    this.scene = scene;
    this.camera = camera;
  }

  /**
   * Configure the post-processing stack for a quality tier.
   * Pass quality="low" or "medium" and the stack is fully disabled
   * — the renderer falls back to direct render with its built-in
   * ACES tone mapping, which costs almost nothing.
   */
  setQuality(q: Quality, postProcessing: boolean, cinematicGrain: boolean) {
    this.config.enabled = postProcessing && (q === "high" || q === "studio");
    this.config.bloom = this.config.enabled;
    this.config.grain = cinematicGrain && q === "studio";
    this.rebuild();
  }

  private rebuild() {
    // tear down any previous composer
    this.dispose();

    if (!this.config.enabled) return;

    // Half-resolution render target on mobile studio for fill-rate, full on desktop high.
    // studio on native → half res
    // high on web → full res
    const isNative = typeof window !== "undefined" &&
      (window as any).Capacitor?.isNativePlatform?.();
    const w = this.renderer.domElement.width;
    const h = this.renderer.domElement.height;
    const scale = isNative ? 0.5 : 1.0;

    this.composer = new EffectComposer(this.renderer);
    this.composer.setSize(w, h);
    this.composer.setPixelRatio((this.renderer.getPixelRatio() || 1) * scale);

    this.renderPass = new RenderPass(this.scene, this.camera);
    this.composer.addPass(this.renderPass);

    if (this.config.bloom) {
      // Three.js r185 BloomPass takes (strength, kernelSize, sigma).
      // Older versions took a Vector2 + 4 args; we use the new API.
      const kernelSize = isNative ? 16 : 25;
      this.bloomPass = new BloomPass(
        this.config.bloomStrength,
        kernelSize,
        4.0,
      );
      this.composer.addPass(this.bloomPass);
    }

    if (this.config.grain) {
      this.filmPass = new FilmPass(this.config.grainIntensity, false);
      this.composer.addPass(this.filmPass);
    }

    // OutputPass applies ACES filmic tone mapping + sRGB colour space.
    // This supersedes the renderer's built-in tone mapping while the
    // composer is active — make sure they don't double-apply.
    this.outputPass = new OutputPass();
    this.composer.addPass(this.outputPass);
  }

  /** Call from the render loop instead of renderer.render(). */
  render() {
    if (this.config.enabled && this.composer) {
      this.composer.render();
    } else {
      this.renderer.render(this.scene, this.camera);
    }
  }

  /** Re-target the composer when the canvas size changes. */
  resize() {
    if (!this.composer) return;
    const w = this.renderer.domElement.width;
    const h = this.renderer.domElement.height;
    this.composer.setSize(w, h);
  }

  /** Update the scene/camera the render pass draws from (e.g. after weapon swap). */
  setCamera(camera: THREE.Camera) {
    this.camera = camera;
    if (this.renderPass) this.renderPass.camera = camera;
  }

  dispose() {
    if (this.bloomPass) { this.bloomPass.dispose(); this.bloomPass = null; }
    if (this.filmPass) { this.filmPass.dispose(); this.filmPass = null; }
    if (this.outputPass) { this.outputPass.dispose(); this.outputPass = null; }
    if (this.composer) { this.composer.dispose(); this.composer = null; }
    this.renderPass = null;
  }
}

// ── FPS monitor with auto-step-down ─────────────────────────
//
// Watches frame deltas over a rolling window. If the average drops
// below the target for a sustained period (default 4s @ <45fps), we
// step down the quality in this order:
//   1. studio → high      (kill AO + grain, keep bloom at half-res)
//   2. high → medium      (kill bloom, halve shadow map)
//   3. medium → low       (kill shadows entirely)
// We never go below "low" — the game is still playable there.

export interface FpsMonitorOptions {
  target: number;          // fps target threshold
  sustainedMs: number;     // how long the FPS must stay below target before we step down
  onStepDown?: (from: Quality, to: Quality) => void;
}

export class FpsMonitor {
  private samples: number[] = [];
  private windowMs = 1000;       // 1s rolling window
  private lowSince = -1;          // timestamp when FPS first dropped below target
  private opts: FpsMonitorOptions;
  private current: Quality;
  private lastFrameAt = performance.now();

  constructor(current: Quality, opts: Partial<FpsMonitorOptions> = {}) {
    this.current = current;
    this.opts = {
      target: 45,
      sustainedMs: 4000,
      ...opts,
    };
  }

  setCurrent(q: Quality) {
    this.current = q;
    this.lowSince = -1; // reset the watchdog whenever the player manually changes quality
  }

  /** Call once per frame from the game loop. Returns the new quality, or null if unchanged. */
  tick(now: number): Quality | null {
    const dt = now - this.lastFrameAt;
    this.lastFrameAt = now;

    if (dt > 0 && dt < 250) { // ignore huge gaps (tab switches)
      this.samples.push(dt);
      // trim to the rolling window
      const cutoff = now - this.windowMs;
      // samples are pushed in order; pop from front while old
      while (this.samples.length > 0 && (now - (this.samples.length > 0 ? 0 : 0)) > 0 && this.samples[0] < cutoff - now + now) {
        // simpler: keep only the last 60 samples (~1s at 60fps)
        if (this.samples.length > 60) this.samples.shift();
        else break;
      }
      if (this.samples.length > 60) this.samples.shift();
    }

    if (this.samples.length < 30) return null; // not enough data yet

    const avgMs = this.samples.reduce((a, b) => a + b, 0) / this.samples.length;
    const fps = 1000 / avgMs;

    if (fps < this.opts.target) {
      if (this.lowSince < 0) this.lowSince = now;
      const sustainedFor = now - this.lowSince;
      if (sustainedFor >= this.opts.sustainedMs) {
        const next = this.stepDown(this.current);
        if (next !== this.current) {
          this.current = next;
          this.lowSince = -1;
          this.samples.length = 0;
          this.opts.onStepDown?.(this.current, next);
          return next;
        }
      }
    } else {
      this.lowSince = -1;
    }
    return null;
  }

  private stepDown(q: Quality): Quality {
    switch (q) {
      case "studio": return "high";
      case "high": return "medium";
      case "medium": return "low";
      default: return "low";
    }
  }

  /** Average FPS over the last window, for diagnostic display. */
  fps(): number {
    if (this.samples.length === 0) return 0;
    const avgMs = this.samples.reduce((a, b) => a + b, 0) / this.samples.length;
    return 1000 / avgMs;
  }
}
