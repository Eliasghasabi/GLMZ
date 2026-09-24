// ─────────────────────────────────────────────────────────────
//  ANIMATION STATE BLENDER
//
//  Guarantees there is never a pop or a T-pose flash between
//  states. Rather than switching clips, every state holds a
//  continuous 0..1 weight; the poser evaluates all active states
//  and mixes them by weight.
//
//  Weights are driven through eased springs with per-transition
//  timings, so e.g. idle→run ramps faster than run→idle (you snap
//  into a sprint but decelerate gradually).
//
//  One-shot states (hit, death, attack) own an internal clock and
//  auto-release, so the AI only needs to fire a trigger.
// ─────────────────────────────────────────────────────────────

import { clamp01, smoother } from "./locomotion";

export type AnimState =
  | "idle" | "walk" | "run" | "aim"
  | "fire" | "melee" | "hit" | "death" | "special";

/** how fast each state fades in / out, in units per second */
const RATES: Record<AnimState, { in: number; out: number }> = {
  idle:    { in: 3.2, out: 4.5 },
  walk:    { in: 4.0, out: 3.4 },
  // you commit to a sprint quickly but bleed out of it gradually
  run:     { in: 5.0, out: 2.6 },
  aim:     { in: 6.5, out: 4.0 },
  fire:    { in: 22.0, out: 7.0 },
  melee:   { in: 14.0, out: 6.0 },
  // hit reactions must punch in instantly to read as an impact
  hit:     { in: 26.0, out: 5.5 },
  death:   { in: 3.0, out: 0.0 },
  special: { in: 5.0, out: 4.0 },
};

export interface HitInfo {
  /** where the round landed */
  zone: "head" | "torso" | "limb";
  /** local-space direction the damage came from */
  dirX: number;
  dirZ: number;
  /** 0..1 severity, scales the stagger */
  power: number;
}

export class StateBlender {
  private w: Record<AnimState, number> = {
    idle: 1, walk: 0, run: 0, aim: 0,
    fire: 0, melee: 0, hit: 0, death: 0, special: 0,
  };
  private target: Record<AnimState, number> = { ...this.w };

  /** one-shot clocks, in seconds since the trigger */
  private clock: Partial<Record<AnimState, number>> = {};
  private duration: Partial<Record<AnimState, number>> = {};

  hit: HitInfo | null = null;
  /** random variant index, so repeats don't look identical */
  deathVariant = 0;
  hitVariant = 0;

  constructor() {
    this.deathVariant = Math.floor(Math.random() * 3);
  }

  /** continuous states are driven every frame from the AI */
  setLocomotion(speed: number, running: boolean, aiming: boolean) {
    if (this.w.death > 0.001 || this.target.death > 0) return;
    const moving = speed > 0.06;
    const runBlend = running && speed > 0.45 ? 1 : 0;
    this.target.run = moving ? runBlend : 0;
    this.target.walk = moving ? 1 - runBlend : 0;
    this.target.idle = moving ? 0 : 1;
    this.target.aim = aiming ? 1 : 0;
  }

  /** fire a one-shot; `dur` is how long it runs before releasing */
  trigger(state: AnimState, dur: number) {
    if (this.w.death > 0.001) return;
    this.clock[state] = 0;
    this.duration[state] = dur;
    this.target[state] = 1;
  }

  triggerHit(info: HitInfo) {
    if (this.w.death > 0.001) return;
    this.hit = info;
    this.hitVariant = Math.floor(Math.random() * 2);
    // heavier hits stagger for longer
    this.trigger("hit", 0.32 + info.power * 0.4);
  }

  kill() {
    // everything else releases; death owns the body from here
    for (const k of Object.keys(this.target) as AnimState[]) this.target[k] = 0;
    this.target.death = 1;
    this.clock.death = 0;
    this.duration.death = Infinity;
  }

  get dying(): boolean {
    return this.target.death > 0;
  }

  update(dt: number) {
    // retire finished one-shots
    for (const k of ["fire", "melee", "hit", "special"] as AnimState[]) {
      if (this.clock[k] !== undefined) {
        this.clock[k]! += dt;
        if (this.clock[k]! >= (this.duration[k] ?? 0)) {
          this.target[k] = 0;
          if (this.w[k] < 0.002) delete this.clock[k];
        }
      }
    }
    if (this.clock.death !== undefined) this.clock.death += dt;

    // ease every weight toward its target
    for (const k of Object.keys(this.w) as AnimState[]) {
      const t = this.target[k];
      const rate = t > this.w[k] ? RATES[k].in : RATES[k].out;
      // exact exponential blend: frame-rate independent by construction
      const step = 1 - Math.exp(-rate * dt);
      this.w[k] += (t - this.w[k]) * step;
      if (Math.abs(this.w[k] - t) < 0.0005) this.w[k] = t;
    }
  }

  /** eased weight for a state */
  weight(s: AnimState): number {
    return smoother(clamp01(this.w[s]));
  }

  /** raw (un-eased) weight, for things that must track linearly */
  raw(s: AnimState): number {
    return this.w[s];
  }

  /** normalised progress through a one-shot, 0..1 */
  progress(s: AnimState): number {
    const c = this.clock[s];
    const d = this.duration[s];
    if (c === undefined || !d || d === Infinity) return c !== undefined ? c : 0;
    return clamp01(c / d);
  }

  /** seconds since death began */
  get deathTime(): number {
    return this.clock.death ?? 0;
  }

  /** locomotion blend: 0 idle, 1 walking, 2 running (fractional) */
  get moveBlend(): number {
    return this.weight("walk") + this.weight("run") * 2;
  }
}
