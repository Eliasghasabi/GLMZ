// ─────────────────────────────────────────────────────────────
//  LOCOMOTION SOLVER
//
//  The old walk drove every joint from a raw sine wave, which is
//  exactly why it read as robotic: a sine has no stance phase, no
//  weight transfer and no impact. Real gait is asymmetric — a foot
//  is planted for roughly 60% of the cycle and swinging for 40%.
//
//  This module models that properly:
//
//    · stance / swing split with a real duty factor
//    · the planted leg straightens and carries the body over it
//    · the swing leg lifts, bends and reaches
//    · pelvis drops onto the unsupported side (Trendelenburg)
//    · vertical travel peaks at midstance, lowest at double support
//    · ground impact spike on heel strike, scaled by body weight
//    · torso counter-rotates against the pelvis
//    · arms swing opposite their same-side leg
//
//  Everything is eased; nothing is a bare sine.
// ─────────────────────────────────────────────────────────────

import type { Gait } from "./archetypes";

// ── easing ──────────────────────────────────────────────────

export const clamp01 = (t: number) => (t < 0 ? 0 : t > 1 ? 1 : t);
/** classic smoothstep */
export const smooth = (t: number) => { const k = clamp01(t); return k * k * (3 - 2 * k); };
/** smootherstep — zero 1st AND 2nd derivative at both ends */
export const smoother = (t: number) => {
  const k = clamp01(t);
  return k * k * k * (k * (k * 6 - 15) + 10);
};
export const easeOutCubic = (t: number) => 1 - Math.pow(1 - clamp01(t), 3);
export const easeInCubic = (t: number) => Math.pow(clamp01(t), 3);
export const easeOutQuint = (t: number) => 1 - Math.pow(1 - clamp01(t), 5);
/** ease-out with a small overshoot, for limbs that carry momentum */
export function overshoot(t: number, amount = 1.4): number {
  const k = clamp01(t);
  return 1 + (amount + 1) * Math.pow(k - 1, 3) + amount * Math.pow(k - 1, 2);
}
/** damped spring ring-out, 1 → 0 */
export function springDown(t: number, freq = 3, decay = 6): number {
  return Math.cos(t * freq * Math.PI * 2) * Math.exp(-t * decay);
}
/** smooth 0→1→0 */
export const arc = (t: number) => Math.sin(clamp01(t) * Math.PI);

/** normalised progress of `t` inside [a,b] */
export function span(t: number, a: number, b: number): number {
  if (t <= a) return 0;
  if (t >= b) return 1;
  return (t - a) / (b - a);
}

// ── per-leg gait solution ───────────────────────────────────

/**
 * Knee flexion at toe-off, as a fraction of the stride amplitude.
 * Stance ends here and swing begins here, which is what keeps the
 * two halves of the cycle continuous.
 */
const TOE_OFF_KNEE = 0.42;

/** ankle plantarflexion at toe-off, as a fraction of amplitude */
const TOE_OFF_ANKLE = 0.40;

/** anatomical joint limits, radians */
export const LIMITS = {
  kneeMax: 2.36,      // ~135°, a deep sprint fold
  hipFlexMax: 1.20,   // ~69° forward
  hipExtMax: 0.52,    // ~30° behind
  ankleMax: 0.70,
} as const;

export interface LegPose {
  /** hip flexion: +forward */
  thigh: number;
  /** knee flexion, always ≥ 0 (knees only bend one way) */
  knee: number;
  /** ankle pitch */
  ankle: number;
  /** thigh abduction (outward) */
  splay: number;
  /** 0 = airborne, 1 = fully weighted — drives pelvis drop and impact */
  load: number;
  /** spike on heel strike, decays fast */
  strike: number;
}

export interface BodyPose {
  /** vertical travel of the pelvis */
  rise: number;
  /** pelvis roll toward the unsupported side */
  pelvisRoll: number;
  /** pelvis yaw (counter to the torso) */
  pelvisYaw: number;
  /** pelvis lateral shift over the planted foot */
  shift: number;
  /** torso yaw, opposite the pelvis */
  torsoYaw: number;
  /** torso side-bend */
  torsoRoll: number;
  /** forward lean */
  lean: number;
  /** vertical head bob, lagging the body */
  headBob: number;
  /** impact compression, 0..1 */
  impact: number;
}

export interface ArmPose {
  /** shoulder flexion: +forward */
  shoulder: number;
  /** elbow flexion, ≥ 0 */
  elbow: number;
  /** shoulder abduction */
  out: number;
}

/**
 * Duty factor: fraction of the cycle a foot spends on the ground.
 * ~0.62 at a walk, dropping below 0.5 at a run (where both feet
 * leave the ground and the gait becomes a series of hops).
 */
function dutyFactor(run: number): number {
  return 0.62 - run * 0.20;
}

/**
 * Solve one leg at cycle position `phase` (0..1).
 * `offset` is 0 for the left leg and 0.5 for the right.
 */
export function solveLeg(
  phase: number, offset: number, gait: Gait, run: number, speed: number
): LegPose {
  const duty = dutyFactor(run);
  // p: 0 at heel strike, wrapping through stance then swing
  let p = (phase + offset) % 1;
  if (p < 0) p += 1;

  const amp = speed * (0.85 + run * 0.55) * gait.stride;
  const out: LegPose = { thigh: 0, knee: 0, ankle: 0, splay: 0, load: 0, strike: 0 };

  if (p < duty) {
    // ── STANCE: foot planted, body travels over it ──
    const s = p / duty;                       // 0 heel strike → 1 toe off
    // the thigh rotates from flexed (forward) to extended (behind)
    out.thigh = (0.5 - smoother(s)) * 2 * amp * 0.55;
    // knee: small yield after heel strike, then straightens, then
    // flexes again as the toe rolls off
    const yield_ = arc(span(s, 0, 0.34)) * 0.17 * amp;
    // toe-off flexion ramps to exactly TOE_OFF_KNEE * amp at s = 1,
    // which is where the swing phase picks it up
    const toeOff = smoother(span(s, 0.68, 1)) * TOE_OFF_KNEE * amp;
    out.knee = yield_ + toeOff;
    // ankle rolls heel → flat → toe, finishing at TOE_OFF_ANKLE so the
    // swing phase can pick up from the same value
    out.ankle = -0.18 * amp * (1 - smooth(span(s, 0, 0.25)))
              + smoother(span(s, 0.6, 1)) * TOE_OFF_ANKLE * amp;
    // full weight through midstance, easing at both transitions
    out.load = smooth(span(s, 0, 0.14)) * (1 - smooth(span(s, 0.86, 1)));
    // impact spike in the first ~12% of stance
    out.strike = easeOutQuint(1 - span(s, 0, 0.12)) * (s < 0.12 ? 1 : 0);
  } else {
    // ── SWING: foot off the ground, reaching forward ──
    const s = (p - duty) / (1 - duty);         // 0 toe off → 1 heel strike
    // thigh sweeps back-to-front, decelerating into the strike
    out.thigh = (smoother(s) - 0.5) * 2 * amp * 0.72;
    // Knee continues from the toe-off angle rather than restarting at
    // zero, so stance and swing join with no step at the boundary.
    // The fold is spread across the whole swing and eased at both
    // ends; a narrow window produces superhuman angular velocity.
    const carry = (1 - smoother(span(s, 0, 0.5))) * TOE_OFF_KNEE * amp;
    const fold = smoother(span(s, 0, 0.55)) * (1 - smoother(span(s, 0.5, 1)));
    out.knee = carry + fold * (0.5 + run * 0.34) * amp;
    // Ankle continues from the toe-off angle, relaxes through the
    // swing, then dorsiflexes to present the heel for the strike.
    const carryA = (1 - smoother(span(s, 0, 0.45))) * TOE_OFF_ANKLE * amp;
    out.ankle = carryA - smoother(span(s, 0.25, 0.85)) * 0.34 * amp;
    out.load = 0;
    out.strike = 0;
  }

  // wider stance under load; heavies stand much wider
  out.splay = 0.04 + out.load * 0.03;

  // ── soft anatomical limits ──
  // A hard clamp would pin the joint flat against the limit for a run
  // of frames, erasing the phase information; when the blend weight
  // then changed the joint would snap off the rail. softLimit()
  // compresses smoothly into the limit instead, so the value keeps
  // moving with the cycle and never flattens.
  out.knee = softLimit(Math.max(0, out.knee), LIMITS.kneeMax);
  out.thigh = out.thigh >= 0
    ? softLimit(out.thigh, LIMITS.hipFlexMax)
    : -softLimit(-out.thigh, LIMITS.hipExtMax);
  out.ankle = out.ankle >= 0
    ? softLimit(out.ankle, LIMITS.ankleMax)
    : -softLimit(-out.ankle, LIMITS.ankleMax);
  return out;
}

/**
 * Asymptotic soft limit. Values below ~70% of the ceiling pass
 * through untouched; beyond that they compress and approach the
 * ceiling without ever reaching it, so the joint never flat-lines.
 */
function softLimit(v: number, max: number): number {
  const knee = max * 0.7;
  if (v <= knee) return v;
  const over = v - knee;
  const room = max - knee;
  return knee + room * (1 - Math.exp(-over / room));
}

/**
 * Whole-body response to the two legs. This is where the weight
 * actually reads: pelvis drop, lateral shift, counter-rotation and
 * the two-per-cycle vertical bob.
 */
export function solveBody(
  phase: number, gait: Gait, run: number, speed: number, left: LegPose, right: LegPose
): BodyPose {
  const p = phase % 1;

  // ── vertical travel: highest at midstance, lowest at double support ──
  // two peaks per stride, shaped rather than a raw sine
  const rawBob = Math.sin(p * Math.PI * 4 - Math.PI / 2);
  const rise = (rawBob * 0.5 + 0.5) * gait.bob * speed * (0.7 + run * 0.6);

  // ── ground impact: a sharp dip when either foot strikes ──
  const strike = Math.max(left.strike, right.strike);
  const impact = strike * gait.impact * speed * 0.055;

  // ── pelvis drops toward the UNSUPPORTED side ──
  const loadDiff = right.load - left.load;
  const pelvisRoll = -loadDiff * gait.sway * 0.55 * speed;

  // ── weight shifts laterally over the planted foot ──
  const shift = loadDiff * gait.sway * 0.28 * speed;

  // ── pelvis and torso counter-rotate about the spine ──
  const swing = Math.sin(p * Math.PI * 2);
  const pelvisYaw = swing * gait.sway * 1.05 * speed;
  const torsoYaw = -swing * gait.counterRot * speed;
  const torsoRoll = -swing * gait.sway * 0.3 * speed;

  // ── forward lean grows with speed, more so at a run ──
  const lean = speed * (0.06 + run * gait.runLean);

  // ── head lags the pelvis slightly, which sells the mass ──
  const headBob = (Math.sin((p - 0.06) * Math.PI * 4 - Math.PI / 2) * 0.5 + 0.5)
    * gait.bob * speed * 0.45;

  return { rise, pelvisRoll, pelvisYaw, shift, torsoYaw, torsoRoll, lean, headBob, impact };
}

/**
 * Arms swing opposite their same-side leg. Elbow flexion increases
 * through the forward swing, which is what stops the arms looking
 * like straight pendulums.
 */
export function solveArm(
  phase: number, offset: number, gait: Gait, run: number, speed: number, aiming: number
): ArmPose {
  let p = (phase + offset) % 1;
  if (p < 0) p += 1;

  const amp = speed * gait.armSwing * (0.5 + run * 0.85) * (1 - aiming * 0.88);
  // smootherstep in both directions gives an eased swing with no
  // constant-velocity segment
  const tri = p < 0.5 ? smoother(p * 2) : 1 - smoother((p - 0.5) * 2);
  const shoulder = (tri - 0.5) * 2 * amp * 0.75;
  // the elbow tucks as the arm drives forward
  const elbow = (0.22 + Math.max(0, shoulder) * 0.95 + run * 0.35 * speed) * (1 - aiming * 0.6);
  const out = 0.06 + amp * 0.06;
  return { shoulder, elbow, out };
}

/**
 * Advance the gait clock. Cadence rises with speed but sub-linearly:
 * real movers lengthen their stride as well as quickening it.
 */
export function advancePhase(
  phase: number, dt: number, gait: Gait, speed: number, run: number
): number {
  const rate = gait.cadence * (0.85 + run * 0.75) * Math.max(0.15, Math.pow(speed, 0.75));
  return (phase + dt * rate) % 1;
}
