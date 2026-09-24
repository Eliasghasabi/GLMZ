// ─────────────────────────────────────────────────────────────
//  GRIP POSES + HAND ANIMATION
//
//  Two responsibilities:
//
//   1. Grip profiles — each weapon declares how thick its grip is
//      and what kind of hold each hand takes, so fingers wrap the
//      actual geometry instead of floating beside it.
//
//   2. A weighted animator — idle breathing, trigger pull, recoil
//      flex, ADS tightening and reload hand-offs, all on eased
//      curves rather than linear ramps.
// ─────────────────────────────────────────────────────────────

import * as THREE from "three";
import { curlFinger, curlThumb, type HandRig } from "./rig";

export type GripKind =
  | "pistol"     // wrapped around a vertical grip, finger on the trigger
  | "foregrip"   // support hand under a handguard
  | "vertical"   // support hand on a vertical foregrip
  | "pump"       // shotgun pump, fingers fully closed
  | "cup"        // support hand cupping a pistol butt
  | "bolt"       // hand rolled onto a bolt handle
  | "relaxed";

export interface GripProfile {
  kind: GripKind;
  /** radius of the thing being held, in view-model units */
  radius: number;
  /** extra roll of the whole hand about the forearm axis */
  roll?: number;
  /** pitch of the wrist */
  pitch?: number;
  /** yaw of the wrist */
  yaw?: number;
}

export const DEFAULT_RIGHT: GripProfile = { kind: "pistol", radius: 0.026 };
export const DEFAULT_LEFT: GripProfile = { kind: "foregrip", radius: 0.030 };

/**
 * Convert a grip radius into a finger curl. A fat handguard forces
 * the fingers open; a slim pistol grip lets them close right up.
 */
function curlForRadius(radius: number, base: number): number {
  const norm = THREE.MathUtils.clamp((0.046 - radius) / 0.034, 0, 1);
  return THREE.MathUtils.clamp(base * (0.55 + norm * 0.65), 0, 1.2);
}

export interface PoseParams {
  /** 0..1 trigger squeeze — only affects the firing hand's index */
  trigger: number;
  /** 0..1 aim-down-sights blend; the grip tightens when aiming */
  ads: number;
  /** 0..1 recoil impulse, decays after each shot */
  recoil: number;
  /** 0..1 breathing phase contribution */
  breath: number;
  /** open the hand up (used when the support hand leaves the weapon) */
  release: number;
}

/**
 * Apply a grip to one hand. Every finger gets its own target so the
 * hold is asymmetric the way a real grip is — the index sits on the
 * trigger, the little finger closes hardest.
 */
export function applyGrip(
  rig: HandRig,
  profile: GripProfile,
  p: PoseParams,
  isTriggerHand: boolean
) {
  const side = rig.side === "right" ? 1 : -1;
  const tight = 1 + p.ads * 0.12 + p.recoil * 0.1;
  const open = p.release;

  // per-finger base curl; the hand closes progressively toward the pinky
  let base: [number, number, number, number];
  switch (profile.kind) {
    case "pistol":   base = [0.62, 0.86, 0.94, 1.00]; break;
    case "foregrip": base = [0.74, 0.80, 0.84, 0.88]; break;
    case "vertical": base = [0.88, 0.94, 0.98, 1.02]; break;
    case "pump":     base = [0.96, 1.02, 1.04, 1.06]; break;
    case "cup":      base = [0.46, 0.54, 0.60, 0.66]; break;
    case "bolt":     base = [0.70, 0.78, 0.74, 0.70]; break;
    default:         base = [0.16, 0.20, 0.24, 0.28]; break;
  }

  for (let i = 0; i < rig.fingers.length; i++) {
    const f = rig.fingers[i];
    let amount = curlForRadius(profile.radius, base[i]) * tight;

    // the trigger finger is the exception: it reaches forward onto the
    // trigger shoe and only closes as the shot breaks
    if (isTriggerHand && f.name === "index" && profile.kind === "pistol") {
      amount = 0.30 + p.trigger * 0.46 + p.recoil * 0.08;
    }

    // recoil momentarily loosens the outer fingers
    if (!isTriggerHand) amount -= p.recoil * 0.05;

    amount = THREE.MathUtils.lerp(amount, 0.12, open);
    // a touch of splay keeps the fingers from looking glued together
    curlFinger(f, amount, (i - 1.5) * 0.018 * side * (1 - open));
  }

  const thumbAmt = profile.kind === "cup" ? 0.35
    : profile.kind === "pump" ? 0.85
      : profile.kind === "relaxed" ? 0.12
        : 0.62;
  curlThumb(rig.thumb, THREE.MathUtils.lerp(thumbAmt * tight, 0.1, open), side);

  // wrist orientation, plus a small recoil snap back through the joint
  rig.wrist.rotation.set(
    (profile.pitch ?? 0) + p.breath * 0.012 - p.recoil * 0.16,
    (profile.yaw ?? 0) * side,
    (profile.roll ?? 0) * side + p.recoil * 0.05 * side
  );
}

// ── weighted animation curves ───────────────────────────────

/** smoothstep — the workhorse ease-in-out */
export const ease = (t: number) => {
  const k = THREE.MathUtils.clamp(t, 0, 1);
  return k * k * (3 - 2 * k);
};

/** strong ease-out: quick departure, long settle (weighty motion) */
export const easeOut = (t: number) => 1 - Math.pow(1 - THREE.MathUtils.clamp(t, 0, 1), 3);

/** ease-in: slow build then snap (spring release, bolt slam) */
export const easeIn = (t: number) => Math.pow(THREE.MathUtils.clamp(t, 0, 1), 3);

/** overshoot-and-settle, for motion with real mass behind it */
export function elastic(t: number, freq = 2.6, decay = 7): number {
  const k = THREE.MathUtils.clamp(t, 0, 1);
  if (k <= 0) return 0;
  if (k >= 1) return 1;
  return 1 - Math.exp(-k * decay) * Math.cos(k * freq * Math.PI * 2);
}

/**
 * Per-hand animation state. Kept outside the rig so a rig can be
 * re-posed by the preview renderer without carrying game state.
 */
export class HandAnimator {
  private trigger = 0;
  private triggerTarget = 0;
  private recoil = 0;
  private breathT = Math.random() * 10;
  private releaseL = 0;
  private releaseR = 0;
  private adsBlend = 0;

  /** pull the trigger; released automatically as the shot decays */
  fire(strength = 1) {
    this.triggerTarget = 1;
    this.recoil = Math.min(1.3, this.recoil + strength);
  }

  /** lift the support hand off the weapon (reload magazine fetch) */
  setLeftRelease(v: number) { this.releaseL = THREE.MathUtils.clamp(v, 0, 1); }
  setRightRelease(v: number) { this.releaseR = THREE.MathUtils.clamp(v, 0, 1); }

  setAds(v: number) { this.adsBlend = THREE.MathUtils.clamp(v, 0, 1); }

  update(dt: number) {
    this.breathT += dt;
    // trigger: fast squeeze, slower release — matches a real pull
    const rate = this.triggerTarget > this.trigger ? 22 : 9;
    this.trigger += (this.triggerTarget - this.trigger) * Math.min(1, dt * rate);
    if (this.trigger > 0.85) this.triggerTarget = 0;
    // recoil decays on an exponential curve, never linearly
    this.recoil = Math.max(0, this.recoil - dt * 4.2 * (0.4 + this.recoil));
  }

  params(hand: "left" | "right"): PoseParams {
    // two detuned sines so breathing never reads as a clean loop
    const breath =
      Math.sin(this.breathT * 1.15) * 0.7 + Math.sin(this.breathT * 0.47 + 1.3) * 0.3;
    return {
      trigger: this.trigger,
      ads: this.adsBlend,
      recoil: this.recoil,
      // aiming steadies the hands markedly
      breath: breath * (1 - this.adsBlend * 0.72),
      release: hand === "left" ? this.releaseL : this.releaseR,
    };
  }

  get recoilLevel() { return this.recoil; }
  get breathPhase() { return this.breathT; }
}
