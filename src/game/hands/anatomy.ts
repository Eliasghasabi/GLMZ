// ─────────────────────────────────────────────────────────────
//  HAND ANATOMY
//
//  Real skeletal proportions for an adult hand, expressed in
//  metres and then scaled into view-model space. Keeping the
//  measurements anatomical (rather than eyeballed boxes) is what
//  makes the silhouette read as a hand instead of a paddle.
//
//  Bone lengths are derived from standard anthropometric ratios:
//  the middle finger is longest, the ring slightly shorter than
//  the index, and every finger follows the ~2:1.2:1 ratio between
//  proximal / middle / distal phalanges.
// ─────────────────────────────────────────────────────────────

/**
 * Maps real-world metres onto the weapon view-model space. The
 * legacy block hand was ~0.056 wide; a real palm is ~0.088, so
 * this factor keeps the new hand drop-in compatible with all the
 * existing per-weapon grip anchors while staying proportional.
 */
export const HAND_SCALE = 0.66;

const m = (metres: number) => metres * HAND_SCALE;

export type FingerName = "index" | "middle" | "ring" | "pinky";

export interface PhalanxSpec {
  /** bone length along its own axis */
  len: number;
  /** radius at the base (knuckle end) */
  r0: number;
  /** radius at the tip */
  r1: number;
}

export interface FingerSpec {
  name: FingerName;
  /** knuckle position on the palm, relative to palm centre */
  base: [number, number, number];
  /** splay away from the hand's centre line (radians) */
  splay: number;
  proximal: PhalanxSpec;
  middle: PhalanxSpec;
  distal: PhalanxSpec;
  /**
   * Resting curl of each joint when the hand is relaxed and open.
   * A real hand never sits perfectly straight — this is what kills
   * the "blocky mannequin" look.
   */
  rest: [number, number, number];
}

export interface ThumbSpec {
  base: [number, number, number];
  metacarpal: PhalanxSpec;
  proximal: PhalanxSpec;
  distal: PhalanxSpec;
  rest: [number, number, number];
}

export interface PalmSpec {
  width: number;
  length: number;
  thickness: number;
  /** the palm narrows toward the wrist */
  wristWidth: number;
  /** thenar eminence (muscle pad at the thumb base) */
  thenar: { w: number; h: number; d: number };
  /** hypothenar eminence (pad along the pinky edge) */
  hypothenar: { w: number; h: number; d: number };
}

export interface ForearmSpec {
  /** radius at the wrist */
  wristR: number;
  /** radius at the elbow — forearms taper toward the hand */
  elbowR: number;
  length: number;
}

export const PALM: PalmSpec = {
  width: m(0.086),
  length: m(0.098),
  thickness: m(0.031),
  wristWidth: m(0.062),
  thenar: { w: m(0.03), h: m(0.026), d: m(0.052) },
  hypothenar: { w: m(0.024), h: m(0.022), d: m(0.056) },
};

export const FOREARM: ForearmSpec = {
  wristR: m(0.029),
  elbowR: m(0.049),
  length: m(0.26),
};

/**
 * Four fingers. `base` is measured from the palm centre: +x toward
 * the pinky, +y up the back of the hand, -z toward the fingertips.
 */
export const FINGERS: FingerSpec[] = [
  {
    name: "index",
    base: [m(-0.028), 0, m(-0.049)],
    splay: -0.085,
    proximal: { len: m(0.0445), r0: m(0.0098), r1: m(0.0090) },
    middle:   { len: m(0.0265), r0: m(0.0090), r1: m(0.0082) },
    distal:   { len: m(0.0205), r0: m(0.0082), r1: m(0.0068) },
    rest: [0.18, 0.22, 0.14],
  },
  {
    name: "middle",
    base: [m(-0.0075), 0, m(-0.052)],
    splay: -0.012,
    proximal: { len: m(0.0495), r0: m(0.0101), r1: m(0.0093) },
    middle:   { len: m(0.0310), r0: m(0.0093), r1: m(0.0084) },
    distal:   { len: m(0.0220), r0: m(0.0084), r1: m(0.0069) },
    rest: [0.20, 0.25, 0.16],
  },
  {
    name: "ring",
    base: [m(0.0125), 0, m(-0.049)],
    splay: 0.055,
    proximal: { len: m(0.0455), r0: m(0.0095), r1: m(0.0087) },
    middle:   { len: m(0.0285), r0: m(0.0087), r1: m(0.0079) },
    distal:   { len: m(0.0205), r0: m(0.0079), r1: m(0.0066) },
    rest: [0.23, 0.29, 0.18],
  },
  {
    name: "pinky",
    base: [m(0.0315), m(-0.002), m(-0.043)],
    splay: 0.125,
    proximal: { len: m(0.0355), r0: m(0.0082), r1: m(0.0075) },
    middle:   { len: m(0.0215), r0: m(0.0075), r1: m(0.0068) },
    distal:   { len: m(0.0175), r0: m(0.0068), r1: m(0.0057) },
    rest: [0.27, 0.33, 0.20],
  },
];

/**
 * The thumb is hinged off the thenar pad and rotated out of the
 * palm plane, which is what gives a hand its readable silhouette.
 */
export const THUMB: ThumbSpec = {
  base: [m(-0.035), m(-0.006), m(0.018)],
  metacarpal: { len: m(0.040), r0: m(0.0125), r1: m(0.0108) },
  proximal:   { len: m(0.0325), r0: m(0.0108), r1: m(0.0094) },
  distal:     { len: m(0.0255), r0: m(0.0094), r1: m(0.0078) },
  rest: [0.30, 0.22, 0.12],
};

/**
 * How strongly each joint responds to a single 0..1 curl value.
 * Real fingers close proximal-last: the PIP joint travels furthest,
 * the DIP follows, and the MCP contributes least.
 */
export const CURL_RATIO = {
  mcp: 1.05,
  pip: 1.55,
  dip: 0.95,
} as const;

/** maximum joint rotation at curl = 1 (radians) */
export const CURL_MAX = 1.05;
