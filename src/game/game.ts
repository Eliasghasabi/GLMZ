// ─────────────────────────────────────────────────────────────
//  Game — top-level orchestrator.
//  Rendering, game loop, input, shooting raycasts, ammo/reload,
//  waves, scoring, pickups, pause & pointer-lock flow.
// ─────────────────────────────────────────────────────────────

import * as THREE from "three";
import { buildStreet } from "./street";
import { raycastWorld, type MapData } from "./map";
import { Player } from "./player";
import { ViewArms, WEAPONS, WEAPON_ORDER, SNIPER_IDS, type WeaponId } from "./weapons";
import {
  effectiveDef, equippedSkin, equippedAttachments, getLoadout,
  onLoadoutChange, bumpCareerLive, recordRun,
} from "./customize/loadout";
import { applyCharacter, applyWrist, currentHandStyle } from "./customize/character";
import { EnemyManager, type Enemy, type EnemyContext, type EnemyKind } from "./enemies";
import { Effects } from "./effects";
import { audio } from "./audio";
import { loadSettings, saveBest, type Settings } from "./settings";
import { bus, pushHud } from "../store";

type State = "idle" | "playing" | "paused" | "over";

interface Pickup {
  kind: "ammo" | "health" | "armor";
  mesh: THREE.Group;
  t: number;
}

const KIND_LABEL: Record<EnemyKind, string> = {
  soldier: "SOLDIER",
  runner: "RUNNER",
  heavy: "HEAVY",
};

const _origin = new THREE.Vector3();
const _dir = new THREE.Vector3();
const _hit = new THREE.Vector3();
const _muzzle = new THREE.Vector3();
const _tmp = new THREE.Vector3();
const _tmp2 = new THREE.Vector3();
const _quat = new THREE.Quaternion();
const _fwd = new THREE.Vector3();
const _spawn = new THREE.Vector3();

export class Game {
  private container: HTMLElement;
  private renderer: THREE.WebGLRenderer;
  private scene: THREE.Scene;
  private clock = new THREE.Clock();
  private map: MapData;
  private player: Player;
  private arms: ViewArms;
  private enemies: EnemyManager;
  private effects: Effects;

  state: State = "idle";
  settings: Settings;

  // weapons state
  private ammo: Record<WeaponId, { mag: number; reserve: number }>;
  private firing = false;
  private adsHeld = false;
  private nextFireAt = 0;
  private time = 0;
  private reloadPlanned = false;
  private boltSoundAt = -1;
  private lastSplatterAt = -1;
  private emberUntil = -1;
  private emberTick = 0;
  private lastDir = 1;
  private offLoadout: (() => void) | null = null;
  private runKills = 0;
  private pendingHeadshots = 0;
  private runStartedAt = 0;
  /** true on touch devices: pointer lock is skipped entirely */
  touchMode = false;

  // run stats
  private wave = 1;
  private score = 0;
  private kills = 0;
  private shotsFired = 0;
  private shotsHit = 0;
  private waveActive = false;
  private intermissionT = 0;
  private inIntermission = false;

  private pickups: Pickup[] = [];
  private crosshairKick = 0;
  private lastSpreadEmitted = -1;
  private scopeEmitted = false;
  private hudT = 0;
  private bannerTimer = 0;
  private boundHandlers: { [k: string]: (e: any) => void } = {};

  constructor(container: HTMLElement) {
    this.container = container;
    this.settings = loadSettings();

    this.renderer = new THREE.WebGLRenderer({
      antialias: this.settings.quality !== "low",
      powerPreference: "high-performance",
    });
    this.renderer.setSize(container.clientWidth, container.clientHeight);
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.3;
    container.appendChild(this.renderer.domElement);

    this.scene = new THREE.Scene();
    this.map = buildStreet(this.scene);

    this.player = new Player(container.clientWidth / container.clientHeight);
    this.player.applySettings(this.settings);
    this.scene.add(this.player.yawObj);

    this.arms = new ViewArms(this.player.camera);
    this.enemies = new EnemyManager(this.scene);
    this.effects = new Effects(this.scene);

    // soft fill light so the first-person weapon is always readable
    const fill = new THREE.PointLight(0xd6e2f5, 0.55, 2.4, 2);
    fill.position.set(0.25, -0.1, -0.2);
    this.player.camera.add(fill);

    // ammo state per weapon (built from the weapon table)
    this.ammo = {} as Record<WeaponId, { mag: number; reserve: number }>;
    for (const id of WEAPON_ORDER) {
      const d0 = effectiveDef(id);
      this.ammo[id] = { mag: d0.magSize, reserve: d0.reserveStart };
    }

    // enemy context is wired here (map/effects must exist first)
    this.enemyCtx = {
      playerPos: () => this.player.eyePos,
      playerSpeed: () => this.player.speed,
      colliders: this.map.colliders,
      coverPoints: this.map.coverPoints,
      navPoints: this.map.navPoints,
      cameraPos: new THREE.Vector3(),
      effects: this.effects,
      onEnemyShoot: (e: Enemy) => this.enemyShoot(e),
      onMeleeHit: (dmg: number) => {
        if (this.player.takeDamage(dmg)) this.gameOver();
      },
      onEnemyDeath: (e: Enemy) => this.onEnemyDeath(e),
    };

    this.player.place(0, 0, -Math.PI / 2);
    this.applySettings(this.settings);
    this.applyLoadout();
    // live-refresh whenever the player changes their loadout
    this.offLoadout = onLoadoutChange(() => this.applyLoadout());
    // keep per-weapon skins in sync as the player swaps weapons
    this.arms.onModelChanged = () => this.refreshActiveWeapon();
    this.bindInput();
    this.renderer.setAnimationLoop(() => this.loop());
    bus.emit("screen", "menu");
  }

  // ── input binding ─────────────────────────────────────────

  private bindInput() {
    const onMouseMove = (e: MouseEvent) => {
      if (document.pointerLockElement === this.renderer.domElement && this.state === "playing") {
        // sensitivity scales down while aiming down sights
        const sens = this.settings.sensitivity / Math.sqrt(Math.max(1, this.player.adsFovMult));
        this.player.onMouseMove(e.movementX, e.movementY, sens);
      }
    };
    const onMouseDown = (e: MouseEvent) => {
      if (this.state !== "playing" || document.pointerLockElement !== this.renderer.domElement) return;
      if (e.button === 0) {
        this.firing = true;
        this.tryFire(true);
      } else if (e.button === 2) {
        this.adsHeld = true;
      }
    };
    const onMouseUp = (e: MouseEvent) => {
      if (e.button === 0) this.firing = false;
      if (e.button === 2) this.adsHeld = false;
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (["Space", "Tab"].includes(e.code)) e.preventDefault();
      this.player.onKey(e.code, true);
      if (this.state !== "playing") return;
      if (e.code === "KeyR") this.tryReload();
      if (e.code === "Digit1") this.switchWeapon("assault");
      if (e.code === "Digit2") this.switchWeapon("shotgun");
      if (e.code === "Digit3") this.switchWeapon("sniper");
      if (e.code === "Digit4") this.switchWeapon("smg");
      if (e.code === "Digit5") this.switchWeapon("revolver");
      if (e.code === "Digit6") this.switchWeapon("longbow");
      if (e.code === "Digit7") this.switchWeapon("vector");
      if (e.code === "Digit8") this.switchWeapon("obsidian");
    };
    const onKeyUp = (e: KeyboardEvent) => this.player.onKey(e.code, false);
    const onLockChange = () => {
      if (this.touchMode) return;
      const locked = document.pointerLockElement === this.renderer.domElement;
      if (!locked && this.state === "playing") this.pause();
    };
    const onResize = () => {
      const w = this.container.clientWidth;
      const h = this.container.clientHeight;
      this.renderer.setSize(w, h);
      this.player.camera.aspect = w / h;
      this.player.camera.updateProjectionMatrix();
    };
    const onClick = () => {
      // click canvas to re-acquire lock mid-game (e.g. after alt-tab)
      if (this.touchMode) return;
      if (this.state === "playing" && document.pointerLockElement !== this.renderer.domElement) {
        this.lock();
      }
    };
    const onCtx = (e: Event) => e.preventDefault();

    document.addEventListener("mousemove", onMouseMove);
    document.addEventListener("mousedown", onMouseDown);
    document.addEventListener("mouseup", onMouseUp);
    document.addEventListener("keydown", onKeyDown);
    document.addEventListener("keyup", onKeyUp);
    document.addEventListener("pointerlockchange", onLockChange);
    window.addEventListener("resize", onResize);
    this.renderer.domElement.addEventListener("click", onClick);
    this.renderer.domElement.addEventListener("contextmenu", onCtx);

    this.boundHandlers = { onMouseMove, onMouseDown, onMouseUp, onKeyDown, onKeyUp, onLockChange, onResize, onClick, onCtx };
  }

  /**
   * Request pointer lock. This is a best-effort convenience: it must NEVER
   * throw, because it is called during start()/resume() and an exception
   * here would abort the rest of the game-start sequence.
   */
  private lock() {
    if (this.touchMode) return;   // no pointer lock on touch devices
    const el = this.renderer.domElement as any;
    if (!el || typeof el.requestPointerLock !== "function") return;
    try {
      // the options form is not supported everywhere; fall back quietly
      const p = el.requestPointerLock({ unadjustedMovement: true });
      if (p && typeof p.catch === "function") {
        p.catch(() => {
          try { el.requestPointerLock(); } catch { /* not critical */ }
        });
      }
    } catch {
      try { el.requestPointerLock(); } catch { /* not critical */ }
    }
  }

  /**
   * Push the saved loadout onto every weapon: skins, attachments and
   * the player's character gear. Called at startup and whenever the
   * customization screen commits a change.
   */
  applyLoadout() {
    const lo = getLoadout();
    for (const id of WEAPON_ORDER) {
      this.arms.applyWeaponSkin(id, equippedSkin(id));
      this.arms.applyWeaponAttachments(id, equippedAttachments(id));
      const hand = this.arms.handGroup(id);
      if (hand) applyWrist(hand, lo.character.wrist);
    }
    applyCharacter(lo.character);
    // glove coverage / plating are geometry-level switches
    const style = currentHandStyle(lo.character);
    this.arms.applyHandStyle(style.coverage, style.plating);
    this.refreshActiveWeapon();
    this.syncAmmoHud();
  }

  /** re-apply state that depends on which weapon is currently up */
  private refreshActiveWeapon() {
    const id = this.arms.currentId;
    this.arms.applyWeaponSkin(id, equippedSkin(id));
    this.arms.adsSpeedMul = effectiveDef(id).adsSpeedMul;
  }

  // ── touch API (driven by the on-screen controls) ──────────

  /** switch the game into touch mode; disables pointer lock */
  enableTouchMode() {
    this.touchMode = true;
  }

  /** virtual joystick, components already inside the unit disc */
  touchMove(x: number, y: number) {
    this.player.setMoveAxis(x, y);
  }

  /** drag delta from the look pad, in CSS pixels */
  touchLook(dx: number, dy: number) {
    if (this.state !== "playing") return;
    const sens = this.settings.sensitivity / Math.sqrt(Math.max(1, this.player.adsFovMult));
    // touch drags travel further than mouse deltas, so scale down a little
    this.player.onMouseMove(dx * 0.72, dy * 0.72, sens);
  }

  touchFire(down: boolean) {
    if (this.state !== "playing") { this.firing = false; return; }
    this.firing = down;
    if (down) this.tryFire(true);   // semi-autos fire on the initial tap
  }

  touchAds(down: boolean) {
    this.adsHeld = this.state === "playing" ? down : false;
  }

  touchSprint(down: boolean) {
    this.player.touchSprint = down;
  }

  touchJump() {
    if (this.state === "playing") this.player.queueJump();
  }

  touchReload() {
    if (this.state === "playing") this.tryReload();
  }

  touchSwitchWeapon(id: WeaponId) {
    if (this.state === "playing") this.switchWeapon(id);
  }

  /** cycle to the next weapon in the rack (compact HUDs) */
  touchNextWeapon() {
    if (this.state !== "playing") return;
    const i = WEAPON_ORDER.indexOf(this.arms.currentId);
    this.switchWeapon(WEAPON_ORDER[(i + 1) % WEAPON_ORDER.length]);
  }

  /** current weapon slot, for the touch HUD */
  get currentWeaponId(): WeaponId {
    return this.arms.currentId;
  }

  // ── public commands (from React menus) ────────────────────

  /**
   * Begin a new run.
   *
   * Ordering matters: everything the game needs in order to actually be
   * playable happens first and unconditionally. Audio and pointer lock are
   * best-effort side effects that depend on browser permissions, so they
   * are isolated — a failure there must never leave the player on a live
   * "playing" screen with no wave spawned.
   */
  start() {
    this.resetRun();
    this.state = "playing";
    bus.emit("screen", "playing");
    this.beginWave(1);

    // ── best-effort side effects ──
    try {
      audio.init();
      audio.applySettings(this.settings);
      audio.startAmbient();
    } catch (err) {
      console.warn("[game] audio unavailable:", err);
    }
    this.lock();
  }

  restart() {
    this.resetRun();
    this.state = "playing";
    bus.emit("screen", "playing");
    this.beginWave(1);
    try {
      audio.init();
      audio.uiClick();
    } catch (err) {
      console.warn("[game] audio unavailable:", err);
    }
    this.lock();
  }

  resume() {
    this.state = "playing";
    bus.emit("screen", "playing");
    try {
      audio.uiClick();
    } catch { /* non-critical */ }
    this.lock();
  }

  pause() {
    if (this.state !== "playing") return;
    this.state = "paused";
    this.firing = false;
    this.adsHeld = false;
    this.player.setMoveAxis(0, 0);
    this.player.touchSprint = false;
    bus.emit("scope", false);
    bus.emit("screen", "paused");
  }

  quitToMenu() {
    audio.uiClick();
    this.state = "idle";
    this.resetRun();
    if (document.pointerLockElement) document.exitPointerLock();
    bus.emit("screen", "menu");
  }

  applySettings(s: Settings) {
    this.settings = s;
    this.player.applySettings(s);
    audio.applySettings(s);
    this.enemies.setDifficulty(s.difficulty);
    // graphics quality
    const q = s.quality;
    const dpr = window.devicePixelRatio || 1;
    if (q === "low") {
      this.renderer.setPixelRatio(Math.min(dpr, 1) * 0.6);
      this.map.moon.castShadow = false;
      this.map.moon.shadow.mapSize.set(512, 512);
    } else if (q === "medium") {
      this.renderer.setPixelRatio(Math.min(dpr, 1.25));
      this.map.moon.castShadow = true;
      this.map.moon.shadow.mapSize.set(1024, 1024);
    } else {
      this.renderer.setPixelRatio(Math.min(dpr, 1.75));
      this.map.moon.castShadow = true;
      this.map.moon.shadow.mapSize.set(2048, 2048);
    }
    if (this.map.moon.shadow.map) {
      this.map.moon.shadow.map.dispose();
      (this.map.moon.shadow as any).map = null;
    }
  }

  dispose() {
    this.offLoadout?.();
    this.offLoadout = null;
    this.renderer.setAnimationLoop(null);
    const h: any = this.boundHandlers;
    document.removeEventListener("mousemove", h.onMouseMove);
    document.removeEventListener("mousedown", h.onMouseDown);
    document.removeEventListener("mouseup", h.onMouseUp);
    document.removeEventListener("keydown", h.onKeyDown);
    document.removeEventListener("keyup", h.onKeyUp);
    document.removeEventListener("pointerlockchange", h.onLockChange);
    window.removeEventListener("resize", h.onResize);
    this.renderer.domElement.removeEventListener("click", h.onClick);
    this.renderer.domElement.removeEventListener("contextmenu", h.onCtx);
    window.clearTimeout(this.bannerTimer);
    this.renderer.dispose();
    this.renderer.domElement.remove();
  }

  // ── run lifecycle ─────────────────────────────────────────

  private resetRun() {
    this.runKills = 0;
    this.pendingHeadshots = 0;
    this.runStartedAt = Date.now();
    this.wave = 1;
    this.score = 0;
    this.kills = 0;
    this.shotsFired = 0;
    this.shotsHit = 0;
    this.waveActive = false;
    this.inIntermission = false;
    this.intermissionT = 0;
    this.firing = false;
    this.adsHeld = false;
    this.time = 0;
    this.nextFireAt = 0;
    this.reloadPlanned = false;
    for (const id of WEAPON_ORDER) {
      const d = effectiveDef(id);
      this.ammo[id].mag = d.magSize;
      this.ammo[id].reserve = d.reserveStart;
    }
    this.enemies.clear();
    this.clearPickups();
    this.arms.forceEquip("assault");
    this.arms.cancelReload();
    this.player.place(0, 0, -Math.PI / 2);
    bus.emit("banner", null);
    bus.emit("scope", false);
    pushHud({
      score: 0, kills: 0, wave: 1, enemiesLeft: 0,
      weaponName: WEAPONS.assault.name, weaponSlot: 0,
      ammo: this.ammo.assault.mag, reserve: this.ammo.assault.reserve,
      health: 100, armor: 50, reloading: false,
    });
  }

  private beginWave(n: number) {
    this.wave = n;
    this.waveActive = true;
    this.inIntermission = false;
    // refill reserves between waves
    for (const id of WEAPON_ORDER) this.ammo[id].reserve = effectiveDef(id).reserveStart;
    this.enemies.startWave(n);
    audio.waveStart();
    bus.emit("banner", {
      title: `WAVE ${n}`,
      sub: n === 1 ? "HOSTILES INBOUND — HOLD THE STREET" : "REINFORCEMENTS DETECTED",
      tone: "wave",
    });
    window.clearTimeout(this.bannerTimer);
    this.bannerTimer = window.setTimeout(() => {
      if (this.state === "playing") bus.emit("banner", null);
    }, 2600);
    this.syncAmmoHud();
    pushHud({ wave: n, enemiesLeft: this.enemies.remaining });
  }

  private waveCleared() {
    this.waveActive = false;
    this.inIntermission = true;
    this.intermissionT = 4.2;
    const bonus = 250 * this.wave;
    this.score += bonus;
    this.player.heal(25);
    audio.waveComplete();
    bus.emit("killfeed", { text: `WAVE BONUS +${bonus}`, tone: "bonus" });
    bus.emit("banner", {
      title: "WAVE COMPLETE",
      sub: `+${bonus} PTS · STREET SECURE`,
      tone: "complete",
      countdown: 4,
    });
    pushHud({ score: this.score });
    this.syncAmmoHud();
  }

  private gameOver() {
    this.state = "over";
    this.firing = false;
    this.adsHeld = false;
    this.player.setMoveAxis(0, 0);
    this.player.touchSprint = false;
    if (document.pointerLockElement) document.exitPointerLock();
    bus.emit("scope", false);
    const accuracy = this.shotsFired > 0 ? Math.round((this.shotsHit / this.shotsFired) * 100) : 0;
    const isBest = saveBest({ score: this.score, wave: this.wave, kills: this.kills });
    // fold the run into career progression and surface any new unlocks
    const unlocked = recordRun({ score: this.score, wave: this.wave });
    if (unlocked.length) bus.emit("unlocks", unlocked);
    // Report the finished run. Anything that cares (leaderboard,
    // analytics, …) subscribes — gameplay knows nothing about them.
    bus.emit("runcomplete", {
      score: this.score,
      kills: this.kills,
      wave: this.wave,
      accuracy,
      difficulty: this.settings.difficulty,
      duration: this.runStartedAt ? (Date.now() - this.runStartedAt) / 1000 : 0,
    });

    window.setTimeout(() => {
      bus.emit("stats", {
        score: this.score,
        kills: this.kills,
        wave: this.wave,
        accuracy,
        best: isBest,
      });
      bus.emit("screen", "gameover");
    }, 1400);
  }

  // ── weapons ───────────────────────────────────────────────

  /**
   * The live weapon definition WITH the player's attachments folded
   * in. Everything downstream (damage, spread, zoom, reload, ammo)
   * reads through here, so a loadout change is felt immediately.
   */
  private get def() {
    return effectiveDef(this.arms.currentId);
  }

  private get ammoState() {
    return this.ammo[this.arms.currentId];
  }

  private syncAmmoHud() {
    pushHud({
      ammo: this.ammoState.mag,
      reserve: this.ammoState.reserve,
      weaponName: this.def.name,
      weaponSlot: this.def.slot,
      reloading: this.arms.reloading,
    });
  }

  private switchWeapon(id: WeaponId) {
    if (id === this.arms.currentId || this.arms.switching) return;
    this.reloadPlanned = false;
    this.firing = false;
    if (this.arms.switchTo(id, () => {
      audio.weaponSwitch();
      this.syncAmmoHud();
    })) {
      this.arms.cancelReload();
      this.nextFireAt = this.time + 0.28;
      pushHud({ reloading: false });
    }
  }

  private tryReload() {
    const a = this.ammoState;
    const def = this.def;
    if (a.mag >= def.magSize || a.reserve <= 0) return;
    if (this.arms.startReload(def.reloadTime, (stage) => audio.reloadStage(stage))) {
      this.reloadPlanned = true;
      pushHud({ reloading: true });
    }
  }

  private completeReload() {
    const a = this.ammoState;
    const def = this.def;
    const need = def.magSize - a.mag;
    const take = Math.min(need, a.reserve);
    a.mag += take;
    a.reserve -= take;
    this.reloadPlanned = false;
    pushHud({ reloading: false });
    this.syncAmmoHud();
  }

  private currentSpreadDeg(): number {
    const def = this.def;
    const ads = this.arms.adsBlend;
    let spread = THREE.MathUtils.lerp(def.spreadHip, def.spreadAds, ads);
    // movement bloom
    const move = Math.min(1, this.player.speed / 6);
    spread *= 1 + move * 0.9;
    if (!this.player.grounded) spread *= 1.5;
    return spread;
  }

  private tryFire(immediate: boolean) {
    if (this.state !== "playing" || this.player.dead) return;
    const def = this.def;
    if (!this.arms.canFire()) return;
    if (!def.auto && !immediate) return; // semi needs fresh clicks
    if (this.time < this.nextFireAt) return;

    const a = this.ammoState;
    if (a.mag <= 0) {
      if (immediate) {
        audio.dryFire();
        this.tryReload();
        this.nextFireAt = this.time + 0.25;
      }
      return;
    }

    this.nextFireAt = this.time + 60 / def.rpm;
    a.mag--;
    this.firing = true;
    if (a.mag <= 0) this.tryReload(); // auto-reload the instant the mag runs dry

    // ── ballistics ──
    const cam = this.player.camera;
    cam.getWorldPosition(_origin);
    const spreadRad = (this.currentSpreadDeg() * Math.PI) / 180;
    const range = 220;
    let anyHit = false;
    let killed = false;
    let headshot = false;

    for (let p = 0; p < def.pellets; p++) {
      cam.getWorldDirection(_dir);
      // random cone spread
      _tmp.set(Math.random() * 2 - 1, Math.random() * 2 - 1, Math.random() * 2 - 1).normalize();
      _dir.addScaledVector(_tmp, Math.tan(spreadRad) * (0.35 + Math.random() * 0.75)).normalize();
      this.shotsFired++;

      const mapT = raycastWorld(_origin, _dir, range, this.map.colliders) ?? range;
      const eOut: { enemy: Enemy | null; t: number; head: boolean } = { enemy: null, t: 0, head: false };
      this.enemies.raycast(_origin, _dir, mapT, eOut);

      const endT = eOut.enemy ? eOut.t : mapT;
      _hit.copy(_origin).addScaledVector(_dir, endT);

      // tracer (limit pellets for perf)
      if (def.pellets === 1 || p % 3 === 0) {
        this.arms.muzzleWorld(_muzzle);
        this.effects.tracer(_muzzle, _hit, def.tracerColor);
      }

      if (eOut.enemy) {
        this.shotsHit++;
        anyHit = true;
        headshot = headshot || eOut.head;
        // distance falloff
        let dmg = def.damage;
        if (endT > def.falloffStart) {
          const k = Math.min(1, (endT - def.falloffStart) / (def.falloffEnd - def.falloffStart));
          dmg *= THREE.MathUtils.lerp(1, def.falloffMin, k);
        }
        if (eOut.head) dmg *= def.headMult;
        const res = eOut.enemy.takeDamage(Math.round(dmg), eOut.head, this.enemyCtx);
        this.effects.blood(_hit, _tmp2.copy(_dir).negate());
        // wet pool spreads on the ground beneath the impact
        if (res === "kill") {
          killed = true;
          this.effects.bloodSplatter(eOut.enemy.pos.x, eOut.enemy.pos.y, eOut.enemy.pos.z, true);
        } else if (this.time - this.lastSplatterAt > 0.22) {
          // throttled so high-RPM weapons don't thrash the decal pool
          this.lastSplatterAt = this.time;
          this.effects.bloodSplatter(
            eOut.enemy.pos.x + (Math.random() - 0.5) * 0.5,
            eOut.enemy.pos.y,
            eOut.enemy.pos.z + (Math.random() - 0.5) * 0.5,
            false
          );
        }
      } else if (endT < range) {
        this.effects.sparks(_hit, _tmp2.copy(_dir).negate());
        if (_dir.y < -0.3) this.effects.dust(_hit);
      }
    }

    // ── feedback ──
    this.arms.muzzleWorld(_muzzle);
    const skin = equippedSkin(def.id);
    this.effects.muzzleFlash(_muzzle, def.flashScale, true, skin.muzzleColor);
    // signature skins throw a coloured ember trail from the muzzle
    if (skin.trail) {
      cam.getWorldDirection(_tmp);
      this.effects.burst(_muzzle, 7, {
        color: skin.trail, speed: 6.5, dir: _tmp, spread: 0.5,
        life: 0.42, size: 0.42, gravity: 1.4, up: 0.5,
      });
    }
    cam.getWorldDirection(_tmp);
    switch (def.muzzleFx ?? "standard") {
      case "dragon":
        // CINDERFANG breathes fire: flame plume + embers down the sight line
        this.effects.dragonFire(_muzzle, _tmp);
        this.emberUntil = this.time + 1.4;
        break;
      case "heavyBrake":
        // anti-materiel brake dumps gas sideways in a broad concussion ring
        this.effects.burst(_muzzle, 16, {
          color: 0xfff0cf, speed: 9, dir: _tmp, spread: 1.5, life: 0.16, size: 0.9, gravity: 0, up: 0,
        });
        this.effects.burst(_muzzle, 10, {
          color: 0x8d9297, speed: 3.4, dir: _tmp, spread: 1.7, life: 0.6, size: 1.9,
          gravity: -1.2, additive: false, up: 0.5,
        });
        this.effects.muzzleSmoke(_muzzle, _tmp2.set(0, 0.4, 0));
        break;
      case "compensator":
        // small tight jet, minimal smoke — quick follow-up shots stay clear
        this.effects.burst(_muzzle, 6, {
          color: 0xd6ffe9, speed: 7, dir: _tmp, spread: 0.35, life: 0.1, size: 0.44, gravity: 0, up: 0,
        });
        break;
      case "suppressed":
        // just a soft warm bloom and a lazy curl of smoke
        this.effects.burst(_muzzle, 4, {
          color: 0xffbf85, speed: 2.2, dir: _tmp, spread: 0.5, life: 0.14, size: 0.4, gravity: 0, up: 0.2,
        });
        this.effects.burst(_muzzle, 5, {
          color: 0x5a5f66, speed: 1.1, dir: _tmp, spread: 0.6, life: 0.9, size: 1.5,
          gravity: -1.6, additive: false, up: 0.9,
        });
        break;
      default:
        this.effects.muzzleSmoke(_muzzle, _tmp.set(0, 0.4, 0));
    }

    // shell ejection
    cam.getWorldQuaternion(_quat);
    _tmp.set(1, 0, 0).applyQuaternion(_quat);
    _tmp2.set(0, 1, 0).applyQuaternion(_quat);
    this.effects.ejectShell(_muzzle, _tmp, _tmp2);

    audio.shot(def.id);
    if (def.boltDelay) this.boltSoundAt = this.time + def.boltDelay;

    // recoil + per-weapon camera shake
    this.player.addRecoil(def.recoilPitch, def.recoilYaw);
    if (def.shake) this.player.addShake(def.shake.amp, def.shake.freq, def.shake.dur);
    this.arms.triggerRecoil(def);
    this.crosshairKick = Math.min(26, this.crosshairKick + def.recoilPitch * 900);

    if (anyHit) {
      bus.emit("hit", { kill: killed, headshot });
      audio.hit(headshot);
      if (killed && headshot) this.pendingHeadshots++;
    }

    // ── KILL CONFIRM ──
    // Weapon-specific flourish, triggered on the killing shot. It is
    // additive to the view model only: firing, movement and reloading
    // all stay available throughout.
    if (killed && SNIPER_IDS.has(def.id) && this.arms.triggerKillConfirm()) {
      audio.killConfirm(def.id);
      if (def.killShake) {
        this.player.addShake(def.killShake.amp, def.killShake.freq, def.killShake.dur);
      }
      bus.emit("killconfirm", {
        weapon: def.short,
        name: def.name,
        headshot,
        duration: this.arms.killConfirmDuration(),
      });
    }
    this.syncAmmoHud();
  }

  // ── enemy context (callbacks into game) ──────────────────

  private enemyCtx!: EnemyContext;

  /** unit XZ direction the player is currently facing */
  private forward(out: THREE.Vector3): THREE.Vector3 {
    this.player.camera.getWorldDirection(out);
    out.y = 0;
    if (out.lengthSq() < 1e-6) out.set(1, 0, 0);
    return out.normalize();
  }

  /**
   * Which way down the street counts as "ahead".
   * The street is a corridor along X, so facing is resolved onto that
   * axis. If the player is looking straight at a side wall we fall
   * back to the direction they were last heading, so hostiles never
   * materialise behind them.
   */
  private streetDir(): number {
    const fwd = this.forward(_fwd);
    if (Math.abs(fwd.x) > 0.25) this.lastDir = Math.sign(fwd.x);
    else if (Math.abs(this.player.vel.x) > 0.6) this.lastDir = Math.sign(this.player.vel.x);
    return this.lastDir || 1;
  }

  /**
   * Pick a spawn point AHEAD of the player only — never behind or
   * beside them. Points land inside the fog bank so hostiles walk
   * out of the murk instead of popping into view.
   */
  private spawnAhead(): THREE.Vector3 {
    const dir = this.streetDir();
    const p = this.player.pos;
    for (let attempt = 0; attempt < 10; attempt++) {
      const dist = 30 + Math.random() * 18;
      const x = p.x + dir * dist;
      const z = THREE.MathUtils.clamp(p.z + (Math.random() - 0.5) * 16, -10.5, 10.5);
      if (!this.blocked(x, z)) return _spawn.set(x, 0, z);
    }
    return _spawn.set(p.x + dir * 34, 0, THREE.MathUtils.clamp(p.z, -9, 9));
  }

  /** true if a spawn point would land inside world geometry */
  private blocked(x: number, z: number): boolean {
    const cols = this.map.colliders;
    for (let i = 0; i < cols.length; i++) {
      const b = cols[i];
      if (b.max.y < 0.6) continue;
      if (x > b.min.x - 0.7 && x < b.max.x + 0.7 && z > b.min.z - 0.7 && z < b.max.z + 0.7) return true;
    }
    return false;
  }

  private enemyShoot(e: Enemy) {
    if (this.state !== "playing" || this.player.dead) return;
    e.muzzleWorld(_muzzle);
    const target = _tmp.copy(this.player.eyePos);
    target.y -= 0.22; // chest
    _dir.subVectors(target, _muzzle);
    const dist = _dir.length();
    _dir.divideScalar(dist || 1);

    audio.enemyShot(dist);
    this.effects.muzzleFlash(_muzzle, 0.5, false);

    // hit roll
    let chance = 0.6 - dist / 55 - Math.min(0.22, this.player.speed * 0.03);
    if (!this.player.grounded) chance -= 0.08;
    chance *= e.aggression;   // difficulty-driven marksmanship
    chance = THREE.MathUtils.clamp(chance, 0.05, 0.86);
    const hit = Math.random() < chance;

    if (hit) {
      this.effects.tracer(_muzzle, target, 0xff5040);
      if (this.player.takeDamage(e.cfg.damage)) this.gameOver();
    } else {
      // miss — trace past the player into scenery
      _tmp2.copy(target).addScaledVector(_dir, 30);
      _tmp2.x += (Math.random() - 0.5) * 3;
      _tmp2.y += (Math.random() - 0.5) * 3;
      _tmp2.z += (Math.random() - 0.5) * 3;
      this.effects.tracer(_muzzle, _tmp2, 0xff5040);
      const mT = raycastWorld(target, _dir, 40, this.map.colliders);
      if (mT !== null) {
        _hit.copy(target).addScaledVector(_dir, mT);
        this.effects.sparks(_hit, _tmp.copy(_dir).negate());
      }
    }
  }

  private onEnemyDeath(e: Enemy) {
    // find last damage context — score by kind
    const cfg = e.cfg;
    let pts = cfg.score;
    this.kills++;
    this.runKills++;
    // headshot kill bonus approximated by recent hit event; keep flat bonus for heavies
    this.score += pts;
    audio.kill();
    bus.emit("killfeed", { text: `${KIND_LABEL[e.kind]} ELIMINATED +${pts}`, tone: "kill" });
    pushHud({ score: this.score, kills: this.kills, enemiesLeft: this.enemies.remaining });
    // stream progress into the career so unlocks can fire mid-run
    const gained = bumpCareerLive(1, this.pendingHeadshots, this.score, this.wave);
    this.pendingHeadshots = 0;
    if (gained.length) bus.emit("unlocks", gained);
    // pickup drops
    this.maybeDrop(e.pos);
  }

  private maybeDrop(pos: THREE.Vector3) {
    const r = Math.random();
    let kind: Pickup["kind"] | null = null;
    if (r < 0.2) kind = "ammo";
    else if (r < 0.28) kind = "health";
    else if (r < 0.34) kind = "armor";
    if (!kind) return;
    const colors = { ammo: 0x69e1ff, health: 0x53d769, armor: 0x4d9fff } as const;
    const g = new THREE.Group();
    const core = new THREE.Mesh(
      new THREE.BoxGeometry(0.32, 0.32, 0.32),
      new THREE.MeshStandardMaterial({ color: 0x11151a, emissive: colors[kind], emissiveIntensity: 1.6, roughness: 0.4 })
    );
    core.position.y = 0.5;
    g.add(core);
    const glow = new THREE.PointLight(colors[kind], 3, 5, 2);
    glow.position.y = 0.6;
    g.add(glow);
    g.position.copy(pos);
    g.position.y = 0;
    this.scene.add(g);
    this.pickups.push({ kind, mesh: g, t: 0 });
  }

  private clearPickups() {
    for (const p of this.pickups) this.scene.remove(p.mesh);
    this.pickups = [];
  }

  private updatePickups(dt: number) {
    const p = this.player.pos;
    for (let i = this.pickups.length - 1; i >= 0; i--) {
      const pk = this.pickups[i];
      pk.t += dt;
      pk.mesh.rotation.y += dt * 2.2;
      pk.mesh.children[0].position.y = 0.5 + Math.sin(pk.t * 3) * 0.1;
      const dx = p.x - pk.mesh.position.x;
      const dz = p.z - pk.mesh.position.z;
      const d2 = dx * dx + dz * dz;
      if (d2 < 4.5 && d2 > 0.0001) {
        const d = Math.sqrt(d2);
        pk.mesh.position.x += (dx / d) * dt * 3.4;
        pk.mesh.position.z += (dz / d) * dt * 3.4;
      }
      if (d2 < 1.2) {
        // collect
        if (pk.kind === "ammo") {
          this.ammoState.reserve = Math.min(
            this.def.reserveStart,
            this.ammoState.reserve + this.def.magSize
          );
          this.syncAmmoHud();
          bus.emit("killfeed", { text: "AMMO RESUPPLIED", tone: "bonus" });
        } else if (pk.kind === "health") {
          this.player.heal(30);
          bus.emit("killfeed", { text: "+30 HEALTH", tone: "bonus" });
        } else {
          this.player.addArmor(25);
          bus.emit("killfeed", { text: "+25 ARMOR", tone: "bonus" });
        }
        audio.pickup();
        this.scene.remove(pk.mesh);
        this.pickups.splice(i, 1);
      } else if (pk.t > 20) {
        this.scene.remove(pk.mesh);
        this.pickups.splice(i, 1);
      }
    }
  }

  // ── main loop ─────────────────────────────────────────────

  private visT = 0;

  private loop() {
    const dt = Math.min(this.clock.getDelta(), 0.05);
    this.visT += dt;
    this.map.update?.(dt, this.visT);
    this.map.stream?.(this.player.pos);

    if (this.state === "playing") {
      this.time += dt;

      // player + arms
      this.player.speedMul = effectiveDef(this.arms.currentId).moveSpeedMul;
      this.player.update(dt, this.map.colliders, this.map.bounds);
      const mouse = this.player.consumeMouse();

      // ads fov smoothing handled in player via adsFovMult
      const targetAdsMult = this.arms.adsBlend > 0.02 ? 1 + (this.def.zoom - 1) * this.arms.adsBlend : 1;
      this.player.adsFovMult += (targetAdsMult - this.player.adsFovMult) * Math.min(1, dt * 10);

      const magSize = this.def.magSize || 1;
      this.arms.setAmmoRatio(this.ammoState.mag / magSize);

      this.arms.update(
        {
          dt,
          speed: this.player.speed,
          sprinting: this.player.sprinting && !this.adsHeld,
          grounded: this.player.grounded,
          adsHeld: this.adsHeld,
          scopedBlocked: false,
        },
        mouse.dx,
        mouse.dy
      );

      // hide weapon + show scope overlay for sniper
      const scoped = this.arms.isScoped(this.def) && !this.player.dead;
      this.arms.visible = !scoped;
      if (scoped !== this.scopeEmitted) {
        this.scopeEmitted = scoped;
        bus.emit("scope", scoped);
      }

      // firing (automatic weapons keep firing while held; semis fire on click)
      if (this.firing && !this.player.dead) this.tryFire(false);

      // smouldering embers drift off the dragon barrel after firing
      if (this.time < this.emberUntil && this.def.muzzleFx === "dragon") {
        this.emberTick -= dt;
        if (this.emberTick <= 0) {
          this.emberTick = 0.07;
          this.arms.muzzleWorld(_muzzle);
          this.effects.emberDrift(_muzzle);
        }
      }

      // sniper bolt sound
      if (this.boltSoundAt > 0 && this.time >= this.boltSoundAt) {
        this.boltSoundAt = -1;
        audio.sniperBolt();
      }

      // reload completion
      if (this.reloadPlanned && !this.arms.reloading) this.completeReload();

      // enemies
      this.enemyCtx.cameraPos.copy(this.player.eyePos);
      this.enemies.update(dt, this.enemyCtx, () => this.spawnAhead());
      // hostiles left far behind the advancing player are re-deployed ahead
      this.enemies.recycleStragglers(
        this.player.pos, this.streetDir(), () => this.spawnAhead()
      );

      // pickups
      this.updatePickups(dt);

      // wave flow
      if (this.waveActive && this.enemies.remaining === 0) {
        this.waveCleared();
      } else if (this.inIntermission) {
        this.intermissionT -= dt;
        if (this.intermissionT <= 0) {
          bus.emit("banner", null);
          this.beginWave(this.wave + 1);
        }
      }

      // crosshair spread for HUD
      const spreadPx = this.currentSpreadDeg() * 6 + this.crosshairKick + Math.min(10, this.player.speed);
      this.crosshairKick = Math.max(0, this.crosshairKick - dt * 90);
      if (Math.abs(spreadPx - this.lastSpreadEmitted) > 0.6) {
        this.lastSpreadEmitted = spreadPx;
        bus.emit("spread", spreadPx);
      }

      // periodic hud sync for enemy counts / reload state
      this.hudT -= dt;
      if (this.hudT <= 0) {
        this.hudT = 0.2;
        pushHud({ enemiesLeft: this.enemies.remaining, reloading: this.arms.reloading });
      }
    } else {
      // idle/paused: subtle menu camera drift
      if (this.state === "idle") {
        this.player.yawObj.rotation.y += dt * 0.04;
      }
    }

    this.effects.update(dt);
    this.renderer.render(this.scene, this.player.camera);
  }
}
