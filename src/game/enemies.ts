// ─────────────────────────────────────────────────────────────
//  Enemies — AI-controlled hostiles.
//  Types: Soldier (balanced), Runner (fast melee), Heavy (tank).
//  State machine: advance → combat (strafe + burst fire) with
//  occasional cover-seeking when hit. Believable, not random.
// ─────────────────────────────────────────────────────────────

import * as THREE from "three";
import { raycastWorld, resolveBody } from "./map";
import { audio } from "./audio";
import { SoldierRig, bodyMetrics } from "./enemy";
import { DIFFICULTIES, type Difficulty, type DifficultyProfile } from "./settings";
import type { Effects } from "./effects";

export type EnemyKind = "soldier" | "runner" | "heavy";

export interface EnemyContext {
  playerPos(): THREE.Vector3; // player eye position
  playerSpeed(): number;
  colliders: THREE.Box3[];
  onEnemyShoot(e: Enemy): void;
  onMeleeHit(dmg: number): void;
  onEnemyDeath(e: Enemy): void;
  effects: Effects;
  coverPoints: THREE.Vector3[];
  navPoints: THREE.Vector3[];
  cameraPos: THREE.Vector3;
}

interface EnemyConfig {
  hp: number;
  speed: number;
  damage: number;
  range: number;
  fireInterval: number;
  burstCount: number;
  burstGap: number;
  score: number;
  melee: boolean;
}

export const ENEMY_CONFIG: Record<EnemyKind, EnemyConfig> = {
  soldier: { hp: 100, speed: 3.4, damage: 9, range: 30, fireInterval: 1.15, burstCount: 3, burstGap: 0.13, score: 100, melee: false },
  runner: { hp: 55, speed: 5.6, damage: 16, range: 2.0, fireInterval: 1.25, burstCount: 1, burstGap: 0, score: 120, melee: true },
  heavy: { hp: 290, speed: 2.15, damage: 17, range: 34, fireInterval: 1.75, burstCount: 4, burstGap: 0.16, score: 250, melee: false },
};

// ── character model ─────────────────────────────────────────
//  Enemies use the fully rigged SoldierRig (see soldier.ts):
//  detailed tactical gear, humanoid skeleton and a procedural
//  idle / walk / run / aim / flinch / death animator.


// ── enemy entity ────────────────────────────────────────────

const _ray = new THREE.Ray();
const _v1 = new THREE.Vector3();
const _v2 = new THREE.Vector3();
const _v3 = new THREE.Vector3();
const _box = new THREE.Box3();
const _headBox = new THREE.Box3();

let nextEnemyId = 1;

export class Enemy {
  id = nextEnemyId++;
  kind: EnemyKind;
  cfg: EnemyConfig;
  rig: SoldierRig;
  group: THREE.Group;
  pos: THREE.Vector3;
  hp: number;
  maxHp: number;
  alive = true;
  deadT = 0;

  yaw = 0;
  state: "advance" | "combat" | "cover" | "dead" = "advance";
  private losOK = false;
  private losT = Math.random() * 0.25;
  private strafeDir = 1;
  private strafeT = 0;
  private fireT = 1 + Math.random();
  private burstLeft = 0;
  private burstT = 0;
  private coverTarget = new THREE.Vector3();
  private coverT = 0;
  private repathT = 0;
  private waypoint = new THREE.Vector3();
  private hasWaypoint = false;
  private meleeT = 0;
  private meleeWindup = 0;
  private meleeAnim = 0;
  private firingAnim = 0;          // recoil pulse, 1 -> 0 after each shot
  private specialT = 0;            // signature move progress 0..1
  private specialDur = 1.6;
  private specialCooldown = 4 + Math.random() * 8;
  private hitDir = new THREE.Vector3(0, 0, 1);
  private animPrev = new THREE.Vector3();
  private animSpeed = 0;
  private animT = Math.random() * 5;
  private walkPhase = Math.random() * 6;
  private flinch = 0;
  private stunT = 0;
  private speedMult = 1;
  aggression = 1;
  private stuckT = 0;
  private lastPos = new THREE.Vector3();
  private removeMe = false;

  constructor(kind: EnemyKind, spawn: THREE.Vector3, waveScale: { hp: number; dmg: number; speed: number; aggression: number }) {
    this.kind = kind;
    this.cfg = ENEMY_CONFIG[kind];
    this.rig = new SoldierRig(kind);
    this.group = new THREE.Group();
    this.group.add(this.rig.root);
    this.pos = this.group.position;
    this.pos.copy(spawn);
    this.animPrev.copy(spawn);
    this.maxHp = Math.round(this.cfg.hp * waveScale.hp);
    this.hp = this.maxHp;
    this.cfg = { ...this.cfg, damage: this.cfg.damage * waveScale.dmg };
    this.speedMult = waveScale.speed;
    this.aggression = waveScale.aggression;
    // aggressive squads fire in longer, tighter bursts
    this.cfg = {
      ...this.cfg,
      fireInterval: this.cfg.fireInterval / this.aggression,
      burstCount: Math.max(1, Math.round(this.cfg.burstCount * (this.aggression > 1.2 ? 1.35 : 1))),
    };
    this.yaw = Math.random() * Math.PI * 2;
  }

  /** proportions derived from this type's archetype spec */
  get metrics() {
    return bodyMetrics(this.kind);
  }

  get bodyScale(): number {
    return this.metrics.scale;
  }

  /** eye line sits at the head centre of this type's rig */
  get eyeHeight(): number {
    return this.metrics.eyeHeight;
  }

  /** ray vs body/head AABBs — returns closest hit or null */
  hitTest(origin: THREE.Vector3, dir: THREE.Vector3, maxT: number, out: { t: number; head: boolean }): boolean {
    if (!this.alive) return false;
    // Hitboxes come straight from the archetype's proportions, so
    // the scout's narrow frame and the heavy's wide one are both
    // shot-accurate rather than sharing one generic box.
    const M = this.metrics;
    const hr = M.halfWidth * 0.42;
    _headBox.min.set(this.pos.x - hr, this.pos.y + M.headMinY, this.pos.z - hr);
    _headBox.max.set(this.pos.x + hr, this.pos.y + M.headMaxY, this.pos.z + hr);
    _box.min.set(this.pos.x - M.halfWidth, this.pos.y, this.pos.z - M.halfDepth);
    _box.max.set(this.pos.x + M.halfWidth, this.pos.y + M.headMinY, this.pos.z + M.halfDepth);
    _ray.origin.copy(origin);
    _ray.direction.copy(dir);
    let bestT = Infinity;
    let head = false;
    const hp = _ray.intersectBox(_headBox, _v1);
    if (hp) {
      const t = _v1.distanceTo(origin);
      if (t < maxT) { bestT = t; head = true; }
    }
    const bp = _ray.intersectBox(_box, _v2);
    if (bp) {
      const t = _v2.distanceTo(origin);
      if (t < maxT && t < bestT) { bestT = t; head = false; }
    }
    if (bestT === Infinity) return false;
    out.t = bestT;
    out.head = head;
    return true;
  }

  /** returns "kill" | "head" | "hit" */
  takeDamage(amount: number, head: boolean, ctx: EnemyContext): "kill" | "head" | "hit" {
    if (!this.alive) return "hit";
    // remember where the shot came from so the rig can flinch correctly
    this.hitDir.subVectors(ctx.playerPos(), this.pos).setY(0).normalize();
    // classify the impact so the reaction matches the location:
    // a body shot that lands wide of centre reads as a limb hit
    if (head) {
      this.rig.reportHitZone("head");
    } else {
      const lateral = Math.abs(
        (ctx.playerPos().x - this.pos.x) * this.hitDir.z -
        (ctx.playerPos().z - this.pos.z) * this.hitDir.x
      );
      this.rig.reportHitZone(lateral > this.metrics.halfWidth * 0.55 ? "limb" : "torso");
    }
    this.hp -= amount;
    this.flinch = 1;
    this.stunT = Math.max(this.stunT, 0.1);
    this.rig.bar.visible = true;
    // chance to seek cover when hit (soldiers & heavies)
    if (this.hp > 0 && this.kind !== "runner" && this.state !== "cover" && Math.random() < 0.3) {
      this.enterCover(ctx);
    }
    if (this.hp <= 0) {
      this.die(ctx);
      return "kill";
    }
    return head ? "head" : "hit";
  }

  private die(ctx: EnemyContext) {
    this.alive = false;
    this.state = "dead";
    this.deadT = 0;
    this.rig.bar.visible = false;
    audio.enemyDie();
    ctx.effects.blood(_v3.set(this.pos.x, this.pos.y + 1, this.pos.z), _v1.set(0, 1, 0));
    ctx.effects.bloodSplatter(this.pos.x, this.pos.y, this.pos.z, true);
    ctx.onEnemyDeath(this);
  }

  private enterCover(ctx: EnemyContext) {
    let best: THREE.Vector3 | null = null;
    let bestD = 18 * 18;
    const p = ctx.playerPos();
    for (const c of ctx.coverPoints) {
      const d = (c.x - this.pos.x) ** 2 + (c.z - this.pos.z) ** 2;
      if (d < bestD) {
        // is this cover actually blocking LOS to the player?
        _v1.set(c.x, c.y + 1.5, c.z);
        _v2.subVectors(p, _v1).normalize();
        const dist = _v1.distanceTo(p);
        const t = raycastWorld(_v1, _v2, dist, ctx.colliders);
        if (t !== null && t < dist - 1.2) {
          best = c;
          bestD = d;
        }
      }
    }
    if (best) {
      this.state = "cover";
      this.coverTarget.copy(best);
      this.coverT = 1.3 + Math.random() * 1.3;
    }
  }

  private moveToward(target: THREE.Vector3, speed: number, dt: number, serpentine: boolean) {
    _v1.subVectors(target, this.pos);
    _v1.y = 0;
    const dist = _v1.length();
    if (dist < 0.05) return dist;
    _v1.divideScalar(dist);
    if (serpentine) {
      const w = Math.sin(this.walkPhase * 0.5) * 0.7;
      const px = -_v1.z, pz = _v1.x;
      _v1.x += px * w * 0.5;
      _v1.z += pz * w * 0.5;
      _v1.normalize();
    }
    this.pos.x += _v1.x * speed * dt;
    this.pos.z += _v1.z * speed * dt;
    this.walkPhase += speed * dt * 2.6;
    // desired facing
    const targetYaw = Math.atan2(_v1.x, _v1.z);
    let dy = targetYaw - this.yaw;
    while (dy > Math.PI) dy -= Math.PI * 2;
    while (dy < -Math.PI) dy += Math.PI * 2;
    this.yaw += dy * Math.min(1, dt * 8);
    return dist;
  }

  update(dt: number, ctx: EnemyContext, others: Enemy[]): boolean {
    // death animation & removal
    if (!this.alive) {
      this.deadT += dt;
      // the rig plays a full collapse animation
      this.rig.pose(
        {
          t: this.deadT, speed: 0, running: false, aiming: false, aimPitch: 0,
          flinch: 0, dead: Math.min(1, this.deadT / 0.62), melee: 0,
          hitDir: this.hitDir,
        },
        dt
      );
      this.rig.setFlash(Math.max(0, 0.5 - this.deadT * 2));
      if (this.deadT > 1.5) this.pos.y -= dt * 0.9;   // sink out of sight
      if (this.deadT > 2.4) this.removeMe = true;
      return this.removeMe;
    }

    const player = ctx.playerPos();
    const distToPlayer = _v3.subVectors(player, this.pos).setY(0).length();
    this.flinch = Math.max(0, this.flinch - dt * 5);
    this.stunT -= dt;
    this.strafeT -= dt;
    this.fireT -= dt;
    this.repathT -= dt;

    // separation from other enemies
    for (const o of others) {
      if (o === this || !o.alive) continue;
      const dx = this.pos.x - o.pos.x;
      const dz = this.pos.z - o.pos.z;
      const d2 = dx * dx + dz * dz;
      const minSep = this.metrics.halfWidth + o.metrics.halfWidth + 0.12;
      if (d2 < minSep * minSep && d2 > 0.0001) {
        const d = Math.sqrt(d2);
        const push = (minSep - d) * 0.5 / d;
        this.pos.x += dx * push;
        this.pos.z += dz * push;
      }
    }

    // throttled LOS check
    this.losT -= dt;
    if (this.losT <= 0) {
      this.losT = 0.22 + Math.random() * 0.08;
      _v1.set(this.pos.x, this.pos.y + this.eyeHeight, this.pos.z);
      _v2.subVectors(player, _v1);
      const d = _v2.length();
      _v2.divideScalar(d || 1);
      const t = raycastWorld(_v1, _v2, d, ctx.colliders);
      this.losOK = t === null || t > d - 0.6;
    }

    const speed = this.cfg.speed * this.speedMult;

    // ── state machine ──
    switch (this.state) {
      case "advance": {
        if (this.losOK && distToPlayer < this.cfg.range * (this.cfg.melee ? 3 : 1)) {
          this.state = "combat";
          break;
        }
        // choose destination: player directly, or a nav waypoint with better angles
        if (!this.losOK) {
          if (this.repathT <= 0 || !this.hasWaypoint) {
            this.repathT = 1.3;
            let best: THREE.Vector3 | null = null;
            let bestScore = Infinity;
            for (const n of ctx.navPoints) {
              const dn = (n.x - player.x) ** 2 + (n.z - player.z) ** 2;
              const dm = (n.x - this.pos.x) ** 2 + (n.z - this.pos.z) ** 2;
              const score = dn * 0.7 + dm * 0.55;
              if (score < bestScore) { bestScore = score; best = n; }
            }
            if (best) {
              this.waypoint.copy(best);
              this.hasWaypoint = true;
            }
          }
          // if direct path is closer than waypoint, go direct
          const directD = distToPlayer;
          const wayD = _v1.subVectors(this.waypoint, this.pos).setY(0).length() + this.waypoint.distanceTo(player);
          const dest = this.hasWaypoint && wayD < directD * 1.15 ? this.waypoint : player;
          this.moveToward(dest, speed, dt, this.kind === "runner");
        } else {
          this.hasWaypoint = false;
          this.moveToward(player, speed, dt, this.kind === "runner");
        }
        break;
      }

      case "combat": {
        // face the player
        const targetYaw = Math.atan2(player.x - this.pos.x, player.z - this.pos.z);
        let dy = targetYaw - this.yaw;
        while (dy > Math.PI) dy -= Math.PI * 2;
        while (dy < -Math.PI) dy += Math.PI * 2;
        this.yaw += dy * Math.min(1, dt * 10);

        if (!this.losOK) {
          this.state = "advance";
          this.repathT = 0;
          break;
        }

        if (this.cfg.melee) {
          // ── RUNNER: charge + lunge ──
          if (this.meleeT > 0) {
            this.meleeT -= dt;
          } else if (this.meleeWindup > 0) {
            this.meleeWindup -= dt;
            this.meleeAnim = 1 - this.meleeWindup / 0.32;
            if (this.meleeWindup <= 0) {
              this.meleeAnim = 1;
              if (distToPlayer < this.cfg.range + 0.5) {
                ctx.onMeleeHit(this.cfg.damage);
              }
              this.meleeT = this.cfg.fireInterval;
            }
          } else if (distToPlayer < this.cfg.range) {
            this.meleeWindup = 0.32;
          } else {
            this.moveToward(player, speed * 1.08, dt, true);
          }
          if (distToPlayer > this.cfg.range * 8) this.state = "advance";
          break;
        }

        // ── RANGED: strafe + burst fire ──
        if (this.strafeT <= 0) {
          this.strafeT = 0.9 + Math.random() * 1.4;
          this.strafeDir = Math.random() < 0.5 ? -1 : 1;
          if (Math.random() < 0.22 && this.kind !== "heavy") this.enterCover(ctx);
        }
        // maintain preferred range band
        _v1.subVectors(this.pos, player).setY(0);
        const d = _v1.length() || 1;
        _v1.divideScalar(d);
        const strafeSpeed = speed * 0.62;
        const bandIn = this.cfg.range * 0.45;
        const bandOut = this.cfg.range * 0.9;
        let radial = 0;
        if (d < bandIn) radial = 1;
        else if (d > bandOut) radial = -1;
        // perpendicular strafe
        const px = -_v1.z, pz = _v1.x;
        this.pos.x += (px * this.strafeDir * strafeSpeed + _v1.x * radial * strafeSpeed) * dt;
        this.pos.z += (pz * this.strafeDir * strafeSpeed + _v1.z * radial * strafeSpeed) * dt;
        this.walkPhase += Math.abs(strafeSpeed) * dt * 2.6;

        // fire control
        if (this.stunT <= 0) {
          if (this.burstLeft > 0) {
            this.burstT -= dt;
            if (this.burstT <= 0) {
              this.burstT = this.cfg.burstGap;
              this.burstLeft--;
              this.firingAnim = 1;
              ctx.onEnemyShoot(this);
            }
          } else if (this.fireT <= 0) {
            this.fireT = this.cfg.fireInterval * (0.85 + Math.random() * 0.4);
            this.burstLeft = this.cfg.burstCount;
            this.burstT = 0.05;
          }
        }
        if (distToPlayer > this.cfg.range * 1.3) this.state = "advance";
        break;
      }

      case "cover": {
        this.coverT -= dt;
        const d = this.moveToward(this.coverTarget, speed * 1.1, dt, false);
        // crouch behind cover
        const crouch = d < 0.7 ? 0.74 : 1;
        this.group.scale.y += (crouch - this.group.scale.y) * Math.min(1, dt * 8);
        if (this.coverT <= 0 || (distToPlayer < 4 && d < 1)) {
          this.state = "combat";
          this.group.scale.y = 1;
        }
        break;
      }

      case "dead":
        break;
    }

    if (this.state !== "cover") this.group.scale.y += (1 - this.group.scale.y) * Math.min(1, dt * 8);

    // collision & bounds
    resolveBody(this.pos, this.metrics.radius, this.metrics.height, ctx.colliders, 0.42);

    // stuck detection → force repath
    if (this.state === "advance") {
      if (this.lastPos.distanceToSquared(this.pos) < 0.0004 * dt * 60) {
        this.stuckT += dt;
        if (this.stuckT > 1.4) {
          this.stuckT = 0;
          this.repathT = 0;
          this.hasWaypoint = false;
          if (this.losOK) this.state = "combat";
        }
      } else {
        this.stuckT = 0;
      }
      this.lastPos.copy(this.pos);
    }

    // ── visuals: drive the rigged character animator ──
    this.group.rotation.y = this.yaw;
    // locomotion blend from actual displacement this frame
    const moved = Math.hypot(this.pos.x - this.animPrev.x, this.pos.z - this.animPrev.z) / Math.max(dt, 0.0001);
    this.animPrev.copy(this.pos);
    const maxSpeed = this.cfg.speed * this.speedMult;
    const speedN = THREE.MathUtils.clamp(moved / Math.max(1.2, maxSpeed), 0, 1);
    this.animSpeed += (speedN - this.animSpeed) * Math.min(1, dt * 9);
    // aim pitch toward the player's head
    const aimPitch = Math.atan2(player.y - (this.pos.y + 1.35), Math.max(1.5, distToPlayer));
    const aiming = !this.cfg.melee && (this.state === "combat" || this.burstLeft > 0) && this.losOK;
    // melee swing decay
    if (this.meleeAnim > 0) this.meleeAnim = Math.max(0, this.meleeAnim - dt * 3.2);
    // recoil pulse decay
    if (this.firingAnim > 0) this.firingAnim = Math.max(0, this.firingAnim - dt * 5.5);

    // ── signature move scheduling ──
    if (this.specialT > 0) {
      this.specialT = Math.min(1.0001, this.specialT + dt / this.specialDur);
      if (this.specialT >= 1) {
        this.specialT = 0;
        this.specialCooldown = 6 + Math.random() * 9;
      }
    } else {
      this.specialCooldown -= dt;
      if (this.specialCooldown <= 0 && this.losOK && this.stunT <= 0) {
        // heavies pound the ground up close, runners leap in, soldiers roar
        const near = distToPlayer < (this.kind === "heavy" ? 9 : this.kind === "runner" ? 12 : 26);
        if (near) {
          this.specialT = 0.0001;
          this.specialDur = this.kind === "runner" ? 0.85 : this.kind === "heavy" ? 1.5 : 1.25;
          if (this.kind === "heavy") audio.enemyShot(distToPlayer * 0.5);
        } else {
          this.specialCooldown = 3 + Math.random() * 4;
        }
      }
    }

    this.rig.pose(
      {
        t: this.animT += dt,
        speed: this.animSpeed,
        running: maxSpeed > 4.2 || this.kind === "runner",
        aiming,
        aimPitch,
        flinch: this.flinch,
        dead: 0,
        melee: this.meleeAnim,
        firing: this.firingAnim,
        special: this.specialT,
        hitDir: this.hitDir,
      },
      dt
    );

    // health bar + damage flash
    if (this.rig.bar.visible) {
      this.rig.setHealthBar(Math.max(0, this.hp / this.maxHp), ctx.cameraPos);
    }
    this.rig.setFlash(this.flinch);

    return this.removeMe;
  }

  muzzleWorld(out: THREE.Vector3): THREE.Vector3 {
    return this.rig.muzzleWorld(out);
  }

  /** relocate this enemy (used when the player outruns them) */
  teleport(to: THREE.Vector3) {
    this.pos.copy(to);
    this.animPrev.copy(to);
    this.lastPos.copy(to);
    this.state = "advance";
    this.hasWaypoint = false;
    this.repathT = 0;
    this.stuckT = 0;
  }

  dispose() {
    this.rig.dispose();
    this.group.parent?.remove(this.group);
  }
}

// ── manager ─────────────────────────────────────────────────

interface QueuedSpawn {
  kind: EnemyKind;
  delay: number;
}

export class EnemyManager {
  list: Enemy[] = [];
  private queue: QueuedSpawn[] = [];
  private scene: THREE.Scene;
  waveScale = { hp: 1, dmg: 1, speed: 1, aggression: 1 };
  private diff: DifficultyProfile = DIFFICULTIES.normal;

  constructor(scene: THREE.Scene) {
    this.scene = scene;
  }

  /** applied on the next wave (and immediately to live scaling) */
  setDifficulty(d: Difficulty) {
    this.diff = DIFFICULTIES[d];
  }

  /** how many hostiles may be alive at once */
  private get maxAlive(): number {
    return Math.round(12 * Math.min(1.5, this.diff.count));
  }

  /** build the composition queue for a wave */
  startWave(wave: number) {
    this.clear();
    this.queue = [];
    const D = this.diff;
    this.waveScale = {
      hp: (1 + (wave - 1) * 0.09) * D.hp,
      dmg: (1 + (wave - 1) * 0.07) * D.damage,
      speed: Math.min(1.45, 1 + (wave - 1) * 0.035) * D.speed,
      aggression: D.aggression,
    };
    const total = Math.max(3, Math.round(Math.min(5 + (wave - 1) * 3, 30) * D.count));
    let runners = wave >= 2 ? Math.min(2 + Math.floor((wave - 1) * 0.9), Math.floor(total * 0.3)) : 0;
    let heavies = wave >= 3 ? Math.min(1 + Math.floor((wave - 2) * 0.7), Math.floor(total * 0.22)) : 0;
    if (wave % 5 === 0) heavies += 2; // boss-ish waves
    const soldiers = Math.max(1, total - runners - heavies);
    const kinds: EnemyKind[] = [];
    for (let i = 0; i < soldiers; i++) kinds.push("soldier");
    for (let i = 0; i < runners; i++) kinds.push("runner");
    for (let i = 0; i < heavies; i++) kinds.push("heavy");
    // shuffle
    for (let i = kinds.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [kinds[i], kinds[j]] = [kinds[j], kinds[i]];
    }
    const gap = 0.62 * this.diff.spawnRate;
    kinds.forEach((kind, i) => {
      this.queue.push({ kind, delay: 0.7 * this.diff.spawnRate + i * gap });
    });
  }

  get remaining(): number {
    let n = this.queue.length;
    for (const e of this.list) if (e.alive) n++;
    return n;
  }

  update(dt: number, ctx: EnemyContext, getSpawn: () => THREE.Vector3) {
    // spawn queue (max 12 alive concurrently)
    if (this.queue.length && this.list.filter((e) => e.alive).length < this.maxAlive) {
      const next = this.queue[0];
      next.delay -= dt;
      if (next.delay <= 0) {
        this.queue.shift();
        // always spawn ahead of the player (provided by the game)
        const best = getSpawn();
        const e = new Enemy(next.kind, best, this.waveScale);
        this.scene.add(e.group);
        this.list.push(e);
        ctx.effects.spawnFlashGround(_v1.set(best.x, 0.1, best.z));
      }
    }
    // update & prune
    for (let i = this.list.length - 1; i >= 0; i--) {
      const remove = this.list[i].update(dt, ctx, this.list);
      if (remove) {
        this.list[i].dispose();
        this.list.splice(i, 1);
      }
    }
  }

  /**
   * Re-deploy hostiles the player has outrun. On an endless street a
   * slow Heavy can be left kilometres behind, which would stall the
   * wave — those are teleported back into the fog ahead.
   */
  recycleStragglers(
    playerPos: THREE.Vector3,
    streetDir: number,
    getSpawn: () => THREE.Vector3
  ) {
    for (const e of this.list) {
      if (!e.alive) continue;
      const along = (e.pos.x - playerPos.x) * streetDir;  // < 0 == behind
      if (along < -55 || along > 150) e.teleport(getSpawn());
    }
  }

  /** closest enemy hit along ray, or null */
  raycast(
    origin: THREE.Vector3,
    dir: THREE.Vector3,
    maxT: number,
    out: { enemy: Enemy | null; t: number; head: boolean }
  ): boolean {
    let found = false;
    const tmp = { t: 0, head: false };
    out.enemy = null;
    out.t = maxT;
    for (const e of this.list) {
      if (e.hitTest(origin, dir, out.t, tmp)) {
        out.t = tmp.t;
        out.head = tmp.head;
        out.enemy = e;
        found = true;
      }
    }
    return found;
  }

  clear() {
    for (const e of this.list) e.dispose();
    this.list = [];
    this.queue = [];
  }
}
