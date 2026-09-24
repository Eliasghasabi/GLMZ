// ─────────────────────────────────────────────────────────────
//  ENEMY CHARACTER FACADE
//
//  Presents the new archetype rig + animator behind the exact
//  surface `enemies.ts` already consumes (`SoldierRig`), so the AI,
//  spawn, hit-detection and cleanup systems integrate unchanged.
//
//  Adding a fourth enemy type means:
//    1. add an entry to ARCHETYPES
//    2. add its id to the EnemyKind union
//  Geometry, textures, gait and all animation states are derived
//  from that spec — no new code paths.
// ─────────────────────────────────────────────────────────────

import * as THREE from "three";
import { buildEnemyRig, disposeRig, type EnemyRig } from "./rig";
import { EnemyAnimator } from "./animator";
import { ARCHETYPES, rigHeight, type EnemyKind, type Archetype } from "./archetypes";

export type { EnemyKind, Archetype };
export { ARCHETYPES, rigHeight };
export { enemyTextureCount } from "./textures";

/** Pose payload — unchanged from the previous rig so the AI is untouched. */
export interface PoseInput {
  t: number;
  speed: number;
  running: boolean;
  aiming: boolean;
  aimPitch: number;
  flinch: number;
  dead: number;
  melee: number;
  firing?: number;
  special?: number;
  hitDir?: THREE.Vector3;
}

/** proportions the collision / hitbox system needs, per type */
export interface BodyMetrics {
  /** rig scale multiplier */
  scale: number;
  /** total height in world units */
  height: number;
  /** eye line height in world units */
  eyeHeight: number;
  /** half-width of the torso hitbox */
  halfWidth: number;
  /** half-depth of the torso hitbox */
  halfDepth: number;
  /** y where the head box starts */
  headMinY: number;
  /** y where the head box ends */
  headMaxY: number;
  /** collision cylinder radius */
  radius: number;
}

const metricsCache = new Map<EnemyKind, BodyMetrics>();

/**
 * Derive hitboxes from the archetype's real proportions, so shots
 * land where the model actually is for every type.
 */
export function bodyMetrics(kind: EnemyKind): BodyMetrics {
  let m = metricsCache.get(kind);
  if (m) return m;
  const a = ARCHETYPES[kind];
  const p = a.proportions;
  const s = p.scale;

  const neckY = p.hipY + p.spineLen + p.chestLen;
  const headCentre = neckY + p.neckLen + p.headR;
  const crown = neckY + p.neckLen + p.headR * 2.4;

  m = {
    scale: s,
    height: crown * s,
    eyeHeight: headCentre * s,
    // shoulders are the widest point; pad a little for pauldrons
    halfWidth: (p.shoulderW + p.limbR * 0.085) * s,
    halfDepth: (p.torsoD * 0.5 + p.limbR * 0.05) * s,
    headMinY: (neckY + p.neckLen * 0.2) * s,
    headMaxY: crown * s,
    radius: (p.hipW * 1.5 + p.limbR * 0.10) * s,
  };
  metricsCache.set(kind, m);
  return m;
}

/**
 * Drop-in replacement for the old SoldierRig. Same constructor,
 * same methods — new character underneath.
 */
export class SoldierRig {
  readonly rig: EnemyRig;
  readonly anim: EnemyAnimator;
  readonly kind: EnemyKind;
  readonly metrics: BodyMetrics;

  root: THREE.Group;
  bar: THREE.Group;
  muzzle: THREE.Object3D;

  private prevFiring = 0;
  private prevMelee = 0;
  private prevSpecial = 0;
  private prevFlinch = 0;
  private killed = false;

  constructor(kind: EnemyKind) {
    this.kind = kind;
    this.rig = buildEnemyRig(kind);
    this.anim = new EnemyAnimator(this.rig);
    this.metrics = bodyMetrics(kind);
    this.root = this.rig.root;
    this.bar = this.rig.bar;
    this.muzzle = this.rig.muzzle;
  }

  /**
   * Translate the legacy PoseInput into animator triggers. The AI
   * still speaks in continuous 0..1 values; edges are detected here
   * and converted into one-shot animation states.
   */
  pose(p: PoseInput, dt: number) {
    // ── death ──
    if (p.dead > 0 && !this.killed) {
      this.killed = true;
      this.anim.kill();
    }

    // ── firing: a rising edge means a fresh shot ──
    const f = p.firing ?? 0;
    if (f > this.prevFiring + 0.25) this.anim.fire(Math.min(1, f));
    this.prevFiring = f;

    // ── melee swing ──
    const m = p.melee ?? 0;
    if (m > 0.02 && this.prevMelee <= 0.02) this.anim.melee();
    this.prevMelee = m;

    // ── signature move ──
    const sp = p.special ?? 0;
    if (sp > 0.001 && this.prevSpecial <= 0.001) {
      this.anim.special(this.kind === "runner" ? 0.85 : this.kind === "heavy" ? 1.5 : 1.25);
    }
    this.prevSpecial = sp;

    // ── hit reaction: flinch spiking means a fresh impact ──
    if (p.flinch > this.prevFlinch + 0.3) {
      const dir = p.hitDir ?? _fwd;
      this.anim.hit(this.lastHitZone, dir, Math.min(1, p.flinch));
    }
    this.prevFlinch = p.flinch;

    this.anim.update({
      dt,
      speed: p.speed,
      running: p.running,
      aiming: p.aiming,
      aimPitch: p.aimPitch,
    });
  }

  /** the combat system calls this just before a hit is registered */
  lastHitZone: "head" | "torso" | "limb" = "torso";
  reportHitZone(zone: "head" | "torso" | "limb") {
    this.lastHitZone = zone;
  }

  setFlash(v: number) {
    this.anim.setFlash(v);
  }

  setHealthBar(pct: number, cameraPos: THREE.Vector3) {
    const fg = this.rig.barFg;
    fg.scale.x = Math.max(0.001, pct);
    fg.position.x = -(1 - pct) * 0.32;
    (fg.material as THREE.MeshBasicMaterial).color.setHSL(pct * 0.33, 0.85, 0.5);
    this.rig.bar.lookAt(cameraPos);
  }

  muzzleWorld(out: THREE.Vector3): THREE.Vector3 {
    return this.rig.muzzle.getWorldPosition(out);
  }

  dispose() {
    disposeRig(this.rig);
  }
}

const _fwd = new THREE.Vector3(0, 0, 1);
