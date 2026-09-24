// ─────────────────────────────────────────────────────────────
//  ENEMY ANIMATOR
//
//  Drives an EnemyRig from the blended state weights. Every state
//  contributes an ADDITIVE offset on top of the archetype's resting
//  posture, so states can overlap during a transition without ever
//  snapping or passing through a T-pose.
//
//  Layer order (later layers add on top):
//    1. rest posture      (per archetype)
//    2. idle variations   (weight shift, head scan, breathing)
//    3. locomotion        (walk / run solved by locomotion.ts)
//    4. aim               (weapon up, torso squares to target)
//    5. fire recoil       (impulse through arm → chest → head)
//    6. melee             (wind-up and strike)
//    7. hit reaction      (directional, zone-specific)
//    8. death             (overrides everything as it ramps in)
// ─────────────────────────────────────────────────────────────

import * as THREE from "three";
import type { EnemyRig } from "./rig";
import { StateBlender, type HitInfo } from "./states";
import {
  advancePhase, solveLeg, solveBody, solveArm,
  smooth, smoother, easeOutCubic, easeInCubic, easeOutQuint,
  springDown, arc, span, clamp01,
} from "./locomotion";

export interface AnimInput {
  dt: number;
  /** 0..1 fraction of this type's top speed */
  speed: number;
  running: boolean;
  aiming: boolean;
  /** radians to pitch the weapon up/down toward the target */
  aimPitch: number;
}

type IdleVariant = "settle" | "scan" | "checkWeapon" | "shiftWeight";
const IDLES: IdleVariant[] = ["settle", "scan", "checkWeapon", "shiftWeight"];

export class EnemyAnimator {
  readonly state = new StateBlender();
  private rig: EnemyRig;
  private phase = Math.random();
  private t = Math.random() * 10;
  private breathT = Math.random() * 10;

  // idle variation cycling
  private idle: IdleVariant = IDLES[Math.floor(Math.random() * IDLES.length)];
  private idleT = 0;
  private idleHold = 2.5 + Math.random() * 3;

  // decaying impulses
  private recoil = 0;
  private landImpact = 0;
  /** animation-side speed, eased so an instant AI stop still winds down */
  private smoothSpeed = 0;

  private _q = new THREE.Quaternion();
  private _v = new THREE.Vector3();

  constructor(rig: EnemyRig) {
    this.rig = rig;
  }

  // ── triggers ──────────────────────────────────────────────

  fire(power = 1) {
    this.recoil = Math.min(1.4, this.recoil + power);
    this.state.trigger("fire", 0.22);
  }

  melee() { this.state.trigger("melee", 0.62); }
  special(dur: number) { this.state.trigger("special", dur); }

  /** hit reaction; `dir` is world-space, converted to the rig's frame */
  hit(zone: HitInfo["zone"], worldDir: THREE.Vector3, power: number) {
    this.rig.root.getWorldQuaternion(this._q).invert();
    const local = this._v.copy(worldDir).applyQuaternion(this._q).normalize();
    this.state.triggerHit({ zone, dirX: local.x, dirZ: local.z, power: clamp01(power) });
  }

  kill() { this.state.kill(); }
  get dying() { return this.state.dying; }
  get deathTime() { return this.state.deathTime; }

  // ── main update ───────────────────────────────────────────

  update(inp: AnimInput) {
    const dt = Math.min(inp.dt, 0.05);
    const r = this.rig;
    const a = r.archetype;
    const P = a.posture;
    const S = this.state;

    this.t += dt;
    this.breathT += dt;
    this.recoil = Math.max(0, this.recoil - dt * 4.6 * (0.35 + this.recoil));
    this.landImpact = Math.max(0, this.landImpact - dt * 5);

    // Ease the speed the ANIMATION uses. The AI may cut speed to zero
    // in one frame; the body cannot. Deceleration is slower than
    // acceleration, which also reads as momentum.
    const accel = inp.speed > this.smoothSpeed ? 9 : 5.5;
    // exact exponential smoothing — identical result at any timestep
    this.smoothSpeed += (inp.speed - this.smoothSpeed) * (1 - Math.exp(-accel * dt));
    if (this.smoothSpeed < 0.002) this.smoothSpeed = 0;

    S.setLocomotion(this.smoothSpeed, inp.running, inp.aiming);
    S.update(dt);

    // ── 1. REST POSTURE ──
    r.root.position.set(0, 0, 0);
    r.root.rotation.set(0, 0, 0);
    r.hips.position.set(0, a.proportions.hipY, 0);
    r.hips.rotation.set(0, 0, 0);
    r.spine.rotation.set(P.spineLean, 0, 0);
    r.chest.rotation.set(P.chestLean, 0, 0);
    r.chest.scale.set(1, 1, 1);
    r.neck.rotation.set(P.headPitch, 0, 0);
    r.head.rotation.set(0, 0, 0);

    const wide = a.proportions.hipW * (P.stanceWidth - 1);
    r.thighL.position.x = -a.proportions.hipW - wide;
    r.thighR.position.x = a.proportions.hipW + wide;
    r.thighL.rotation.set(0, 0, 0.04);
    r.thighR.rotation.set(0, 0, -0.04);
    r.shinL.rotation.set(0, 0, 0);
    r.shinR.rotation.set(0, 0, 0);
    r.footL.rotation.set(0, 0, 0);
    r.footR.rotation.set(0, 0, 0);

    r.shoulderL.rotation.set(0, 0, P.shoulderRoll);
    r.shoulderR.rotation.set(0, 0, -P.shoulderRoll);
    r.shoulderL.position.y = a.proportions.chestLen * 0.82;
    r.shoulderR.position.y = a.proportions.chestLen * 0.82;
    r.upperL.rotation.set(0, 0, 0.1);
    r.upperR.rotation.set(0, 0, -0.1);
    r.foreL.rotation.set(P.elbowBend, 0, 0);
    r.foreR.rotation.set(P.elbowBend, 0, 0);
    r.weapon.rotation.set(0, 0, 0);

    // ── DEATH: ramps in over everything else ──
    const dw = S.weight("death");
    if (dw > 0.001) {
      this.applyDeath(S.deathTime, dw);
      this.pulseLamps(dt, 1 - dw);
      r.bar.visible = false;
      return;
    }

    // ── 2. IDLE VARIATIONS ──
    const idleW = S.weight("idle");
    if (idleW > 0.02) this.applyIdle(dt, idleW, inp.aiming);
    else this.idleT = 0;

    // breathing is always present, strongest when still
    const breath = Math.sin(this.breathT * 1.25) * (0.6 + idleW * 0.4);
    r.chest.scale.y = 1 + breath * 0.018 * (0.4 + idleW * 0.6);
    r.spine.rotation.x += breath * 0.012 * idleW;

    // ── 3. LOCOMOTION ──
    const walkW = S.weight("walk");
    const runW = S.weight("run");
    const moveW = Math.min(1, walkW + runW);
    if (moveW > 0.0004) {
      const runBlend = runW / Math.max(0.0001, walkW + runW);
      // The gait clock is advanced ONLY here, so the cycle is purely a
      // function of elapsed time and stays identical at any framerate.
      // Wind-down is handled by the eased smoothSpeed above.
      this.phase = advancePhase(this.phase, dt, a.gait, Math.max(0.2, this.smoothSpeed), runBlend);
      this.applyLocomotion(moveW, runBlend, this.smoothSpeed);
    }

    // ── 4. AIM / CARRY ──
    // These two are complementary poses of the same arms. They must
    // be driven by weights that sum to exactly 1 at every instant,
    // otherwise the arm snaps across the gap between them. Both are
    // blended from one raw value, and carry is always evaluated (not
    // an else-branch) so the two overlap smoothly through the whole
    // transition.
    const aimW = S.raw("aim");
    const aimE = smoother(aimW);
    if (aimW < 0.999) this.applyCarry(1 - aimE);
    if (aimW > 0.001) this.applyAim(aimE, inp.aimPitch);

    // ── 5. FIRE RECOIL ──
    if (this.recoil > 0.002) this.applyRecoil(this.recoil);

    // ── 6. MELEE ──
    const mw = S.weight("melee");
    if (mw > 0.002) this.applyMelee(S.progress("melee"), mw);

    // ── 7. SPECIAL ──
    const spw = S.weight("special");
    if (spw > 0.002) this.applySpecial(S.progress("special"), spw);

    // ── 8. HIT REACTION ──
    const hw = S.weight("hit");
    if (hw > 0.002 && S.hit) this.applyHit(S.hit, S.progress("hit"), hw);

    this.pulseLamps(dt, 1);
  }

  // ── layers ────────────────────────────────────────────────

  private applyIdle(dt: number, w: number, aiming: boolean) {
    const r = this.rig;
    this.idleT += dt;
    if (this.idleT > this.idleHold) {
      this.idleT = 0;
      this.idleHold = 2.6 + Math.random() * 3.4;
      let next = IDLES[Math.floor(Math.random() * IDLES.length)];
      if (next === this.idle) next = IDLES[(IDLES.indexOf(next) + 1) % IDLES.length];
      this.idle = next;
    }
    // ease the variation in and out so it never snaps
    const env = arc(clamp01(this.idleT / this.idleHold)) * w;
    const it = this.idleT;

    switch (this.idle) {
      case "scan": {
        // sweeps the head across the arc, pausing at the extremes
        const s = Math.sin(it * 0.85);
        const eased = Math.sign(s) * smoother(Math.abs(s));
        r.neck.rotation.y += eased * 0.55 * env;
        r.chest.rotation.y += eased * 0.16 * env;
        r.neck.rotation.z += eased * 0.05 * env;
        break;
      }
      case "shiftWeight": {
        // rocks from one hip to the other
        const s = Math.sin(it * 0.95);
        const eased = Math.sign(s) * smoother(Math.abs(s));
        r.hips.position.x += eased * 0.035 * env;
        r.hips.rotation.z += eased * 0.07 * env;
        r.spine.rotation.z -= eased * 0.045 * env;
        r.neck.rotation.z += eased * 0.03 * env;
        r.hips.position.y -= Math.abs(eased) * 0.012 * env;
        break;
      }
      case "checkWeapon": {
        if (aiming) break;
        // glances down at the weapon and thumbs the selector
        const k = arc(clamp01(it / 2.2));
        r.neck.rotation.x += k * 0.34 * env;
        r.foreR.rotation.x -= k * 0.30 * env;
        r.upperR.rotation.x -= k * 0.14 * env;
        r.chest.rotation.x += k * 0.05 * env;
        break;
      }
      default: {
        // micro settle: tiny sway that keeps the pose alive
        r.hips.rotation.y += Math.sin(it * 0.55) * 0.03 * env;
        r.neck.rotation.y += Math.sin(it * 0.4 + 1) * 0.06 * env;
        break;
      }
    }
  }

  private applyLocomotion(w: number, run: number, speed: number) {
    const r = this.rig;
    const g = r.archetype.gait;
    const sp = Math.max(0.25, speed);

    const left = solveLeg(this.phase, 0, g, run, sp);
    const right = solveLeg(this.phase, 0.5, g, run, sp);
    const body = solveBody(this.phase, g, run, sp, left, right);

    // ── legs ──
    r.thighL.rotation.x += left.thigh * w;
    r.thighR.rotation.x += right.thigh * w;
    r.shinL.rotation.x -= left.knee * w;
    r.shinR.rotation.x -= right.knee * w;
    r.footL.rotation.x += left.ankle * w;
    r.footR.rotation.x += right.ankle * w;
    r.thighL.rotation.z += left.splay * w;
    r.thighR.rotation.z -= right.splay * w;

    // ── pelvis: rise, drop, shift, counter-rotation ──
    r.hips.position.y += (body.rise - body.impact) * w;
    r.hips.position.x += body.shift * w;
    r.hips.rotation.z += body.pelvisRoll * w;
    r.hips.rotation.y += body.pelvisYaw * w;

    // ── torso counter-rotates against the pelvis ──
    r.spine.rotation.x += body.lean * w;
    r.spine.rotation.z += body.torsoRoll * w;
    r.chest.rotation.y += body.torsoYaw * w;
    // the chest lags the pelvis slightly, which reads as spine flex
    r.chest.rotation.z -= body.torsoRoll * 0.45 * w;

    // ── head stabilises: counter-rotates to stay level ──
    r.neck.rotation.y -= body.torsoYaw * 0.55 * w;
    r.neck.rotation.x -= body.lean * 0.45 * w;
    r.head.position.y = -body.headBob * 0.35 * w;

    // ── ground impact ripples up the body ──
    const strike = Math.max(left.strike, right.strike) * g.impact;
    if (strike > 0.01) {
      const k = strike * w * sp;
      r.spine.rotation.x += k * 0.05;
      r.chest.rotation.x -= k * 0.035;
      r.neck.rotation.x += k * 0.06;
      r.shoulderL.position.y -= k * 0.012;
      r.shoulderR.position.y -= k * 0.012;
    }

    // ── arms counter-swing (opposite the same-side leg) ──
    const aimW = this.state.weight("aim");
    // Left arm swings opposite the LEFT leg. solveArm's waveform is
    // already inverted with respect to solveLeg, so sharing the same
    // offset yields the correct contralateral swing — offsetting by
    // half would (wrongly) put them in phase.
    const armL = solveArm(this.phase, 0, g, run, sp, aimW);
    const armR = solveArm(this.phase, 0.5, g, run, sp, aimW);
    r.upperL.rotation.x += armL.shoulder * w;
    r.upperR.rotation.x += armR.shoulder * w;
    r.foreL.rotation.x -= armL.elbow * w * 0.5;
    r.foreR.rotation.x -= armR.elbow * w * 0.5 * (1 - aimW * 0.7);
    r.upperL.rotation.z += armL.out * w;
    r.upperR.rotation.z -= armR.out * w;

    // ── armour jostle lags the torso ──
    const jost = Math.sin(this.phase * Math.PI * 4 + 0.7) * 0.05 * w * sp;
    r.shoulderL.rotation.z += jost;
    r.shoulderR.rotation.z += jost;
  }

  /** weapon carried at low ready when not aiming */
  private applyCarry(w: number) {
    const r = this.rig;
    if (w < 0.002) return;
    r.upperR.rotation.x += -0.52 * w;
    r.upperR.rotation.z += -0.18 * w;
    r.foreR.rotation.x += 0.28 * w;
    r.upperL.rotation.x += -0.72 * w;
    r.upperL.rotation.z += 0.34 * w;
    r.foreL.rotation.x += 0.18 * w;
    r.weapon.rotation.x += 0.36 * w;
  }

  /** weapon shouldered, torso squares up to the target */
  private applyAim(w: number, pitch: number) {
    const r = this.rig;
    const a = r.archetype;
    // heavies swing the weapon up more slowly and hold it lower
    const hold = a.kind === "heavy" ? 0.86 : a.kind === "runner" ? 1.06 : 1.0;

    r.upperR.rotation.x += (-1.32 * hold) * w;
    r.upperR.rotation.z += -0.16 * w;
    r.foreR.rotation.x += (0.42 * hold) * w;
    // support hand comes across to the handguard
    r.upperL.rotation.x += (-1.24 * hold) * w;
    r.upperL.rotation.z += 0.42 * w;
    r.foreL.rotation.x += 0.30 * w;
    r.shoulderR.rotation.z += -0.12 * w;
    r.shoulderL.rotation.z += 0.08 * w;
    // square the chest to the target and drop the head to the sights
    r.chest.rotation.y += 0.14 * w;
    r.neck.rotation.x += (-pitch * 0.5 + 0.1) * w;
    // pitch the weapon itself toward the aim point
    r.weapon.rotation.x += (-pitch * 0.85) * w;
  }

  private applyRecoil(k: number) {
    const r = this.rig;
    const a = r.archetype;
    // recoil is absorbed differently by build: the heavy barely moves
    const absorb = a.kind === "heavy" ? 0.45 : a.kind === "runner" ? 1.15 : 1.0;
    const ring = springDown(1 - k, 3.2, 5) * k;

    r.foreR.rotation.x -= k * 0.30 * absorb;
    r.upperR.rotation.x -= k * 0.16 * absorb;
    r.shoulderR.position.z -= k * 0.035 * absorb;
    r.chest.rotation.x -= k * 0.10 * absorb;
    r.spine.rotation.x -= k * 0.05 * absorb;
    r.neck.rotation.x -= k * 0.09 * absorb;
    r.weapon.rotation.x -= (k * 0.26 + ring * 0.05) * absorb;
    // the whole frame rocks back a little
    r.root.position.z -= k * 0.012 * absorb;
  }

  private applyMelee(t: number, w: number) {
    const r = this.rig;
    const wind = smoother(span(t, 0, 0.38));
    const strike = easeInCubic(span(t, 0.38, 0.58));
    const rec = smoother(span(t, 0.58, 1));
    const swing = wind - strike * 1.7 + rec * 0.7;

    r.upperR.rotation.x += (-0.5 - wind * 1.5 + strike * 2.6 - rec * 0.6) * w;
    r.upperR.rotation.z += (-0.3 + swing * 0.5) * w;
    r.foreR.rotation.x += (-0.2 + wind * 0.6 - strike * 1.0) * w;
    r.chest.rotation.y += (-wind * 0.42 + strike * 0.78) * w;
    r.spine.rotation.x += (-wind * 0.22 + strike * 0.38) * w;
    r.hips.rotation.y += (-wind * 0.2 + strike * 0.34) * w;
    // step into the swing
    r.root.position.z += strike * 0.06 * w;
  }

  private applySpecial(t: number, w: number) {
    const r = this.rig;
    const a = r.archetype;
    if (a.kind === "heavy") {
      // ground pound: rear back, slam both fists, shockwave settle
      const rear = smoother(span(t, 0, 0.4));
      const slam = easeInCubic(span(t, 0.4, 0.55));
      const rec = smoother(span(t, 0.55, 1));
      r.spine.rotation.x += (-rear * 0.5 + slam * 1.0 - rec * 0.5) * w;
      r.upperL.rotation.x += (-rear * 1.9 + slam * 2.5 - rec * 0.6) * w;
      r.upperR.rotation.x += (-rear * 1.9 + slam * 2.5 - rec * 0.6) * w;
      r.root.position.y += (rear * 0.1 - arc(span(t, 0.4, 0.62)) * 0.14) * w;
      r.thighL.rotation.x += (slam * 0.36 - rec * 0.36) * w;
      r.thighR.rotation.x += (slam * 0.36 - rec * 0.36) * w;
    } else if (a.kind === "runner") {
      // leap: coil, launch, land
      const coil = smoother(span(t, 0, 0.3));
      const air = smoother(span(t, 0.3, 0.7));
      const land = smoother(span(t, 0.7, 1));
      r.root.position.y += (-coil * 0.18 + arc(span(t, 0.3, 0.75)) * 0.5 - land * 0.04) * w;
      r.spine.rotation.x += (coil * 0.5 - air * 0.3) * w;
      r.thighL.rotation.x += (-coil * 0.9 + air * 1.1) * w;
      r.thighR.rotation.x += (-coil * 0.9 + air * 0.6) * w;
      r.shinL.rotation.x -= (coil * 1.3 - air * 0.9) * w;
      r.shinR.rotation.x -= (coil * 1.3 - air * 0.5) * w;
      r.upperL.rotation.x += -air * 1.3 * w;
    } else {
      // soldier: shouts and signals, arm thrown up
      const rise = smoother(span(t, 0, 0.3));
      const fall = smoother(span(t, 0.7, 1));
      const k = (rise - fall) * w;
      r.spine.rotation.x -= k * 0.3;
      r.neck.rotation.x -= k * 0.55;
      r.upperL.rotation.x -= k * 1.5;
      r.upperL.rotation.z += k * 0.7;
      r.chest.scale.y = 1 + k * 0.07;
    }
  }

  /**
   * Directional, zone-specific hit reaction. A headshot snaps the
   * neck; a torso hit folds the chest; a limb hit spins the shoulder.
   */
  private applyHit(h: HitInfo, t: number, w: number) {
    const r = this.rig;
    const a = r.archetype;
    // heavies absorb impacts; scouts get thrown around
    const mass = a.kind === "heavy" ? 0.42 : a.kind === "runner" ? 1.25 : 1.0;
    // sharp punch in, eased recovery out
    const punch = easeOutQuint(1 - span(t, 0, 0.18)) * (t < 0.18 ? 1 : 0)
      + (1 - smoother(span(t, 0.18, 1))) * 0.55;
    const k = punch * w * h.power * mass;
    const fx = h.dirX, fz = h.dirZ;

    switch (h.zone) {
      case "head": {
        r.neck.rotation.x += k * 0.62 * fz;
        r.neck.rotation.z -= k * 0.52 * fx;
        r.neck.rotation.y -= k * 0.3 * fx;
        r.chest.rotation.x += k * 0.16 * fz;
        r.spine.rotation.x += k * 0.1 * fz;
        break;
      }
      case "limb": {
        // the struck shoulder is driven back, body twists after it
        const side = fx > 0 ? 1 : -1;
        const sh = side > 0 ? r.shoulderR : r.shoulderL;
        const up = side > 0 ? r.upperR : r.upperL;
        sh.rotation.z += k * 0.42 * side;
        sh.position.z -= k * 0.05;
        up.rotation.x += k * 0.5 * fz;
        up.rotation.z += k * 0.34 * side;
        r.chest.rotation.y += k * 0.22 * side;
        r.spine.rotation.z -= k * 0.14 * fx;
        break;
      }
      default: {
        // torso: the whole frame folds around the impact
        r.spine.rotation.x += k * 0.42 * fz;
        r.spine.rotation.z -= k * 0.34 * fx;
        r.chest.rotation.x += k * 0.22 * fz;
        r.chest.rotation.z += k * 0.18 * fx;
        r.neck.rotation.x += k * 0.4 * fz;
        r.hips.rotation.z -= k * 0.1 * fx;
        r.shoulderL.rotation.z += k * 0.2;
        r.shoulderR.rotation.z -= k * 0.2;
        break;
      }
    }

    // stagger: a braced step back under a heavy enough hit
    const stagger = k * (1 - mass * 0.3);
    r.root.position.z -= stagger * 0.05 * fz;
    r.root.position.x -= stagger * 0.04 * fx;
    r.hips.position.y -= stagger * 0.03;
    // the rear leg braces
    const braceLeg = fx > 0 ? r.thighL : r.thighR;
    braceLeg.rotation.x -= stagger * 0.3;
  }

  /**
   * Death. Three variants per type, and the timing scales with body
   * mass — the heavy topples slowly, the scout crumples fast.
   */
  private applyDeath(elapsed: number, w: number) {
    const r = this.rig;
    const a = r.archetype;
    const dur = a.kind === "heavy" ? 1.5 : a.kind === "runner" ? 0.75 : 1.05;
    const t = clamp01(elapsed / dur);
    const e = easeInCubic(t) * 0.45 + easeOutCubic(t) * 0.55;  // slow start, hard landing
    const v = this.state.deathVariant;
    const side = v === 2 ? -1 : 1;
    const k = e * w;

    // the body drops to the ground and settles
    const drop = a.proportions.hipY * 0.88;
    r.hips.position.y -= drop * k;

    if (v === 0) {
      // ── backward sprawl ──
      r.root.rotation.x = -k * 1.42;
      r.root.rotation.z = k * 0.26 * side;
      r.spine.rotation.x -= k * 0.34;
      r.chest.rotation.x += k * 0.4;
      r.neck.rotation.x -= k * 0.52;
      r.upperL.rotation.set(-k * 1.15, 0, k * 1.3);
      r.upperR.rotation.set(-k * 1.35, 0, -k * 1.0);
      r.foreL.rotation.x = -k * 0.5;
      r.foreR.rotation.x = -k * 0.4;
      r.thighL.rotation.set(k * 0.72, 0, k * 0.3);
      r.thighR.rotation.set(k * 0.44, 0, -k * 0.34);
      r.shinL.rotation.x = -k * 0.5;
      r.shinR.rotation.x = -k * 0.86;
    } else if (v === 1) {
      // ── forward faceplant: knees buckle first ──
      const buckle = smoother(clamp01(t * 2.1));
      r.root.rotation.x = k * 1.5;
      r.root.rotation.z = -k * 0.14 * side;
      r.hips.rotation.x += buckle * 0.5 * w;
      r.spine.rotation.x += k * 0.5;
      r.chest.rotation.x -= k * 0.24;
      r.neck.rotation.x += k * 0.6;
      r.upperL.rotation.set(k * 0.9, 0, k * 0.5);
      r.upperR.rotation.set(k * 1.15, 0, -k * 0.42);
      r.foreL.rotation.x = -k * 1.0;
      r.foreR.rotation.x = -k * 1.25;
      r.thighL.rotation.x = -buckle * 1.15 * w;
      r.thighR.rotation.x = -buckle * 0.95 * w;
      r.shinL.rotation.x = -buckle * 1.5 * w;
      r.shinR.rotation.x = -buckle * 1.35 * w;
    } else {
      // ── collapse onto one shoulder, spinning down ──
      r.root.rotation.x = k * 1.1;
      r.root.rotation.y = k * 0.9 * side;
      r.root.rotation.z = k * 0.78 * side;
      r.hips.rotation.z += k * 0.3 * side;
      r.spine.rotation.x += k * 0.42;
      r.spine.rotation.z -= k * 0.26 * side;
      r.chest.rotation.z += k * 0.3 * side;
      r.neck.rotation.x += k * 0.5;
      r.neck.rotation.z += k * 0.34 * side;
      r.upperL.rotation.set(k * 0.5, 0, k * 1.5);
      r.upperR.rotation.set(k * 0.7, 0, -k * 0.6);
      r.foreL.rotation.x = -k * 0.9;
      r.foreR.rotation.x = -k * 1.4;
      r.thighL.rotation.set(-k * 0.85, 0, k * 0.5);
      r.thighR.rotation.set(k * 0.3, 0, -k * 0.2);
      r.shinL.rotation.x = -k * 1.4;
      r.shinR.rotation.x = -k * 0.5;
    }

    // the weapon drops from the hand as the body goes limp
    const release = smoother(clamp01((t - 0.15) / 0.3));
    r.weapon.rotation.x += release * 1.2;
    r.weapon.position.y = -a.proportions.foreArm - 0.03 - release * 0.08;

    // lights die out
    for (const m of r.lamps) m.emissiveIntensity = Math.max(0, 2.6 * (1 - t));
  }

  private pulseLamps(dt: number, alive: number) {
    const k = 0.82 + Math.sin(this.t * 2.3) * 0.18;
    for (const m of this.rig.lamps) {
      const target = 2.6 * k * alive + this.recoil * 2.5;
      m.emissiveIntensity += (target - m.emissiveIntensity) * (1 - Math.exp(-8 * dt));
    }
  }

  /** hit flash across the body materials */
  setFlash(v: number) {
    const k = v * 0.55;
    for (const m of this.rig.mats.flashable) m.emissive.setScalar(k);
  }
}

// re-exported so callers don't need to reach into states.ts
export { smooth, smoother, easeOutCubic };
