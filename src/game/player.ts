// ─────────────────────────────────────────────────────────────
//  Player — first-person controller.
//  Pointer-lock mouse look, WASD with acceleration/friction,
//  sprint, jump + gravity, stair step-up, capsule-vs-AABB
//  collision, head bob, landing dip, health / armor / damage.
// ─────────────────────────────────────────────────────────────

import * as THREE from "three";
import { groundHeight, resolveBody } from "./map";
import { audio } from "./audio";
import { bus, pushHud } from "../store";
import type { Settings } from "./settings";

export const PLAYER_HEIGHT = 1.72;
export const EYE_HEIGHT = 1.6;
export const PLAYER_RADIUS = 0.38;
const STEP = 0.42;

export class Player {
  yawObj = new THREE.Group();
  pitchObj = new THREE.Group();
  camera: THREE.PerspectiveCamera;

  pos = new THREE.Vector3();
  vel = new THREE.Vector3();
  grounded = true;

  keys = new Set<string>();
  /** analog movement from a virtual joystick: x = strafe, y = forward (-1 = fwd) */
  moveAxis = { x: 0, y: 0 };
  /** virtual button states driven by the touch HUD */
  touchSprint = false;
  /** movement multiplier from the equipped weapon's attachments */
  speedMul = 1;
  private jumpQueued = false;
  mouseDX = 0;
  mouseDY = 0;

  // look state
  private yaw = 0;
  private pitch = 0;
  recoilP = 0; // accumulated recoil (recovers over time)
  recoilY = 0;

  // ── camera shake (weapon impact / kill feedback) ──
  private shakeAmp = 0;
  private shakeFreq = 14;
  private shakeT = 0;
  private shakeDur = 0;
  private shakeSeed = 0;

  // bob
  bobPhase = 0;
  bobAmount = 0;
  private landDip = 0;
  private stepSmoothY = 0;
  private stepAcc = 0;

  // vitals
  health = 100;
  armor = 50;
  dead = false;

  sprinting = false;
  speed = 0;

  baseFov = 75;
  private fovKick = 0; // sprint fov boost
  adsFovMult = 1; // set by game (weapon zoom)

  constructor(aspect: number) {
    this.camera = new THREE.PerspectiveCamera(75, aspect, 0.05, 400);
    this.yawObj.add(this.pitchObj);
    this.pitchObj.add(this.camera);
    this.camera.position.set(0, EYE_HEIGHT, 0);
  }

  place(x: number, z: number, yaw: number) {
    this.pos.set(x, 0, z);
    this.vel.set(0, 0, 0);
    this.yaw = yaw;
    this.pitch = 0;
    this.health = 100;
    this.armor = 50;
    this.dead = false;
    this.recoilP = 0;
    this.recoilY = 0;
    this.shakeAmp = 0;
    this.shakeT = 0;
    this.shakeDur = 0;
    this.moveAxis.x = 0;
    this.moveAxis.y = 0;
    this.touchSprint = false;
    this.jumpQueued = false;
    this.keys.clear();
    this.syncObjects();
    pushHud({ health: 100, armor: 50 });
  }

  applySettings(s: Settings) {
    this.baseFov = s.fov;
  }

  onMouseMove(dx: number, dy: number, sensitivity: number) {
    if (this.dead) return;
    const k = 0.0021 * sensitivity;
    this.yaw -= dx * k;
    this.pitch -= dy * k;
    this.pitch = THREE.MathUtils.clamp(this.pitch, -1.5, 1.5);
    this.mouseDX += dx;
    this.mouseDY += dy;
  }

  onKey(code: string, down: boolean) {
    if (down) this.keys.add(code);
    else this.keys.delete(code);
  }

  /** virtual joystick input (already normalised to the unit disc) */
  setMoveAxis(x: number, y: number) {
    this.moveAxis.x = x;
    this.moveAxis.y = y;
  }

  /** queued so a tap is never missed between frames */
  queueJump() {
    this.jumpQueued = true;
  }

  /**
   * Kick a decaying camera shake. Layers on top of recoil rather
   * than replacing it: recoil throws the aim off, shake is felt.
   */
  addShake(amp: number, freq: number, dur: number) {
    // take the stronger of the two so rapid fire doesn't cancel itself
    if (amp >= this.shakeAmp * (1 - this.shakeT / Math.max(this.shakeDur, 1e-3))) {
      this.shakeAmp = amp;
      this.shakeFreq = freq;
      this.shakeDur = dur;
      this.shakeT = 0;
      this.shakeSeed = Math.random() * 100;
    }
  }

  addRecoil(pitch: number, yawAmt: number) {
    this.recoilP += pitch;
    this.recoilY += (Math.random() - 0.5) * 2 * yawAmt;
  }

  private _eye = new THREE.Vector3();

  get eyePos(): THREE.Vector3 {
    return this._eye.set(this.pos.x, this.pos.y + EYE_HEIGHT, this.pos.z);
  }

  /** consume accumulated mouse deltas (per frame) */
  consumeMouse(): { dx: number; dy: number } {
    const r = { dx: this.mouseDX, dy: this.mouseDY };
    this.mouseDX = 0;
    this.mouseDY = 0;
    return r;
  }

  update(
    dt: number,
    colliders: THREE.Box3[],
    bounds: { minX: number; maxX: number; minZ: number; maxZ: number }
  ) {
    if (this.dead) {
      // collapse camera toward the ground
      this.camera.position.y += (0.45 - this.camera.position.y) * Math.min(1, dt * 2.2);
      this.camera.rotation.z += (0.35 - this.camera.rotation.z) * Math.min(1, dt * 2);
      return;
    }

    // ── movement input ──
    let mx = 0, mz = 0;
    if (this.keys.has("KeyW")) mz -= 1;
    if (this.keys.has("KeyS")) mz += 1;
    if (this.keys.has("KeyA")) mx -= 1;
    if (this.keys.has("KeyD")) mx += 1;
    // analog joystick (touch) is additive with WASD, then clamped
    mx += this.moveAxis.x;
    mz += this.moveAxis.y;
    const mag = Math.hypot(mx, mz);
    if (mag > 1) { mx /= mag; mz /= mag; }
    const moving = mag > 0.06;
    const wantSprint = this.keys.has("ShiftLeft") || this.touchSprint;
    this.sprinting = wantSprint && mz < -0.35 && this.grounded;

    // analog sticks scale speed by how far they are pushed
    const throttle = Math.min(1, mag);
    const targetSpeed = (this.sprinting ? 6.6 : 4.35) * this.speedMul * (moving ? Math.max(0.35, throttle) : 0);
    // ads slows movement slightly (felt through game setting sprinting=false anyway)
    const sin = Math.sin(this.yaw), cos = Math.cos(this.yaw);
    let wx = 0, wz = 0;
    if (moving) {
      const inv = 1 / Math.hypot(mx, mz);
      mx *= inv; mz *= inv;
      wx = (mx * cos + mz * sin) * targetSpeed;
      wz = (-mx * sin + mz * cos) * targetSpeed;
    }

    // ── acceleration & friction (exponential approach to wish velocity) ──
    const approach = Math.min(1, (this.grounded ? 21 : 3.6) * dt);
    this.vel.x += (wx - this.vel.x) * approach;
    this.vel.z += (wz - this.vel.z) * approach;

    // ── jump & gravity ──
    if ((this.keys.has("Space") || this.jumpQueued) && this.grounded) {
      this.jumpQueued = false;
      this.vel.y = 5.4;
      this.grounded = false;
      audio.jump();
    }
    if (!this.grounded) this.jumpQueued = false;
    this.vel.y -= 15.5 * dt;

    // ── integrate ──
    this.pos.x += this.vel.x * dt;
    this.pos.z += this.vel.z * dt;
    this.pos.y += this.vel.y * dt;

    // bounds clamp
    this.pos.x = THREE.MathUtils.clamp(this.pos.x, bounds.minX + PLAYER_RADIUS, bounds.maxX - PLAYER_RADIUS);
    this.pos.z = THREE.MathUtils.clamp(this.pos.z, bounds.minZ + PLAYER_RADIUS, bounds.maxZ - PLAYER_RADIUS);

    // horizontal collision
    resolveBody(this.pos, PLAYER_RADIUS, PLAYER_HEIGHT, colliders, STEP);

    // vertical
    const ground = groundHeight(this.pos.x, this.pos.z, this.pos.y + 0.001, PLAYER_RADIUS, colliders, STEP);
    if (this.pos.y <= ground + 0.001 && this.vel.y <= 0) {
      if (!this.grounded) {
        // landing
        const impact = Math.min(1, Math.abs(this.vel.y) / 10);
        this.landDip = Math.min(0.22, 0.08 + impact * 0.22);
        audio.land();
      }
      this.pos.y = ground;
      this.vel.y = 0;
      this.grounded = true;
    } else if (this.pos.y - ground > 0.02) {
      this.grounded = false;
    } else if (this.grounded && ground < this.pos.y + STEP && this.vel.y <= 0) {
      this.pos.y = ground; // glue down steps
    }

    // smooth stair ascent
    this.stepSmoothY += (this.pos.y - this.stepSmoothY) * Math.min(1, dt * (this.grounded ? 16 : 60));

    // ── head bob ──
    this.speed = Math.hypot(this.vel.x, this.vel.z);
    const speedN = Math.min(1, this.speed / 6.6);
    if (this.grounded && this.speed > 0.4) {
      this.bobPhase += this.speed * dt * 1.85;
      this.bobAmount += (speedN - this.bobAmount) * Math.min(1, dt * 6);
      // footsteps
      this.stepAcc += this.speed * dt;
      const stride = this.sprinting ? 3.4 : 2.5;
      if (this.stepAcc > stride) {
        this.stepAcc = 0;
        audio.footstep();
      }
    } else {
      this.bobAmount += (0 - this.bobAmount) * Math.min(1, dt * 6);
    }
    this.landDip += (0 - this.landDip) * Math.min(1, dt * 7);

    // ── camera shake decay ──
    if (this.shakeT < this.shakeDur) this.shakeT += dt;

    // ── recoil recovery ──
    this.recoilP += (0 - this.recoilP) * Math.min(1, dt * 7.5);
    this.recoilY += (0 - this.recoilY) * Math.min(1, dt * 6);

    // sprint fov kick
    this.fovKick += ((this.sprinting ? 6 : 0) - this.fovKick) * Math.min(1, dt * 6);

    this.syncObjects();
  }

  private syncObjects() {
    this.yawObj.position.set(this.pos.x, this.stepSmoothY, this.pos.z);
    const bobY = Math.sin(this.bobPhase * 2) * 0.026 * this.bobAmount * (this.sprinting ? 1.5 : 1);
    const bobX = Math.sin(this.bobPhase) * 0.017 * this.bobAmount;
    this.camera.position.y = EYE_HEIGHT + bobY - this.landDip;
    this.camera.position.x = bobX;
    // decaying multi-axis shake — two detuned sines so it never
    // reads as a clean oscillation
    let shX = 0, shY = 0, shZ = 0;
    if (this.shakeT < this.shakeDur) {
      const k = 1 - this.shakeT / this.shakeDur;
      const decay = k * k;
      const w = this.shakeT * this.shakeFreq * Math.PI * 2;
      shX = Math.sin(w + this.shakeSeed) * this.shakeAmp * decay;
      shY = Math.sin(w * 0.77 + this.shakeSeed * 1.7) * this.shakeAmp * 0.7 * decay;
      shZ = Math.sin(w * 0.53 + this.shakeSeed * 2.3) * this.shakeAmp * 0.85 * decay;
    }
    this.pitchObj.rotation.x = this.pitch + this.recoilP + shX;
    this.pitchObj.rotation.z = Math.sin(this.bobPhase) * 0.0032 * this.bobAmount + shZ;
    this.yawObj.rotation.y = this.yaw + this.recoilY + shY;
    const fov = (this.baseFov + this.fovKick) / this.adsFovMult;
    if (Math.abs(this.camera.fov - fov) > 0.05) {
      this.camera.fov += (fov - this.camera.fov) * 0.35;
      this.camera.updateProjectionMatrix();
    }
  }

  takeDamage(amount: number): boolean {
    if (this.dead) return false;
    let remaining = amount;
    if (this.armor > 0) {
      const absorbed = Math.min(this.armor, amount * 0.6);
      this.armor -= absorbed;
      remaining = amount - absorbed;
    }
    this.health -= remaining;
    pushHud({ health: Math.max(0, Math.ceil(this.health)), armor: Math.max(0, Math.ceil(this.armor)) });
    bus.emit("damage", { amount });
    audio.playerHurt();
    // camera flinch
    this.recoilP += 0.012 + Math.random() * 0.01;
    this.recoilY += (Math.random() - 0.5) * 0.02;
    if (this.health <= 0) {
      this.health = 0;
      this.dead = true;
      audio.playerDie();
      return true;
    }
    return false;
  }

  heal(amount: number) {
    this.health = Math.min(100, this.health + amount);
    pushHud({ health: Math.ceil(this.health) });
    bus.emit("healflash");
  }

  addArmor(amount: number) {
    this.armor = Math.min(100, this.armor + amount);
    pushHud({ armor: Math.ceil(this.armor) });
    bus.emit("healflash");
  }
}
