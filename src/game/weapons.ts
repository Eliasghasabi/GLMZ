// ─────────────────────────────────────────────────────────────
//  Weapons — definitions, procedural view models and a per-weapon
//  ANIMATION PERSONALITY system.
//
//  Every weapon owns its own `anim` implementation supplying three
//  distinct motion tracks — idle, fire and reload — plus its own
//  hand choreography. Nothing is shared between guns, so the AR,
//  shotgun, sniper, SMG and revolver all handle differently.
//
//  Each also carries an engraved ELIAS signature plate and
//  animated skin details (glowing counters, spinning parts…).
// ─────────────────────────────────────────────────────────────

import * as THREE from "three";
import { dragonScaleTexture, moltenTexture } from "./textures";
import { SNIPER_VARIANTS } from "./snipers";
import { setHandStyle } from "./hands/rig";
import {
  captureSkinTargets, applySkin, animateSkin, clearGenerated,
  type SkinTargets, type SkinDef,
} from "./customize/skins";
import {
  deriveAnchors, mountAttachments, makeAttachMats,
  type Anchors, type AttachMats,
} from "./customize/attachments";
import {
  B, C, tubeZ, addHands, eliasPlate, zeroPose,
  seg, ease, pulse, overshoot,
  type Pose, type WeaponAnim, type WeaponModel, type Hands,
  type WeaponId, type WeaponDef, type ReloadMark,
} from "./wpnkit";

// re-exported so existing importers keep working unchanged
export type { Pose, WeaponAnim, WeaponModel, Hands, WeaponId, WeaponDef, ReloadMark };

const BASE_WEAPONS: Record<string, WeaponDef> = {
  assault: {
    id: "assault", slot: 0, name: "SPECTRE AR", short: "AR",
    damage: 26, headMult: 2.2, rpm: 600,
    magSize: 30, reserveStart: 210, reloadTime: 1.85,
    spreadHip: 1.25, spreadAds: 0.32,
    pellets: 1, auto: true,
    recoilPitch: 0.0115, recoilYaw: 0.0042, kickZ: 0.028,
    zoom: 1.8, falloffStart: 25, falloffEnd: 75, falloffMin: 0.5,
    tracerColor: 0xffd080, flashScale: 0.5, scoped: false,
  },
  shotgun: {
    id: "shotgun", slot: 1, name: "JUDGE-12", short: "SG",
    damage: 12, headMult: 1.6, rpm: 120,
    magSize: 8, reserveStart: 48, reloadTime: 2.6,
    spreadHip: 5.2, spreadAds: 4.0,
    pellets: 8, auto: false,
    recoilPitch: 0.048, recoilYaw: 0.012, kickZ: 0.075,
    zoom: 1.5, falloffStart: 9, falloffEnd: 38, falloffMin: 0.16,
    tracerColor: 0xffb060, flashScale: 0.82, scoped: false,
  },
  sniper: {
    id: "sniper", slot: 2, name: "CINDERFANG", short: "DRG",
    damage: 115, headMult: 2.6, rpm: 75,
    magSize: 5, reserveStart: 30, reloadTime: 3.0,
    spreadHip: 3.4, spreadAds: 0.03,
    pellets: 1, auto: false,
    recoilPitch: 0.078, recoilYaw: 0.01, kickZ: 0.12,
    zoom: 6.2, falloffStart: 60, falloffEnd: 140, falloffMin: 0.75,
    tracerColor: 0xff8a1e, flashScale: 1.15, scoped: true,
    muzzleFx: "dragon", boltDelay: 0.3, boltCycle: 0.8, velocity: 880,
    shake: { amp: 0.032, freq: 15, dur: 0.3 },
    blurb: "Dragon-forged bolt-action. Molten veins glow hotter as the chamber heats.",
  },
  smg: {
    id: "smg", slot: 3, name: "WRAITH-9", short: "SMG",
    damage: 16, headMult: 1.9, rpm: 1000,
    magSize: 40, reserveStart: 280, reloadTime: 1.35,
    spreadHip: 2.1, spreadAds: 0.72,
    pellets: 1, auto: true,
    recoilPitch: 0.0072, recoilYaw: 0.0052, kickZ: 0.018,
    zoom: 1.6, falloffStart: 14, falloffEnd: 45, falloffMin: 0.34,
    tracerColor: 0x9ff0ff, flashScale: 0.4, scoped: false,
  },
  revolver: {
    id: "revolver", slot: 4, name: "MAGNUS .44", short: "RV",
    damage: 82, headMult: 2.4, rpm: 115,
    magSize: 6, reserveStart: 42, reloadTime: 2.35,
    spreadHip: 1.05, spreadAds: 0.09,
    pellets: 1, auto: false,
    recoilPitch: 0.062, recoilYaw: 0.014, kickZ: 0.095,
    zoom: 2.1, falloffStart: 32, falloffEnd: 85, falloffMin: 0.55,
    tracerColor: 0xffc46a, flashScale: 0.66, scoped: false,
  },
};

// ── model container ─────────────────────────────────────────

/**
 * The live weapon table. Base weapons are declared above; every
 * entry in a family registry (currently the sniper variants) is
 * merged in here, so a new variant needs no edits in this file.
 */
export const WEAPONS: Record<WeaponId, WeaponDef> = (() => {
  const table = { ...BASE_WEAPONS } as Record<WeaponId, WeaponDef>;
  for (const v of SNIPER_VARIANTS) table[v.def.id] = v.def;
  return table;
})();

export const WEAPON_ORDER: WeaponId[] = ["assault", "shotgun", "sniper"];

/** ids that count as sniper variants — used for kill-confirm routing */
export const SNIPER_IDS: ReadonlySet<WeaponId> = new Set(
  SNIPER_VARIANTS.map((v) => v.def.id)
);

/** per-weapon model factories, keyed by id */
const WEAPON_BUILDERS: Record<string, () => WeaponModel> = {
  assault: () => buildAssault(),
  shotgun: () => buildShotgun(),
  sniper: () => buildSniper(),
  smg: () => buildSmg(),
  revolver: () => buildRevolver(),
  ...Object.fromEntries(SNIPER_VARIANTS.map((v) => [v.def.id, v.build])),
};

/**
 * Build a standalone weapon model. Used by the loadout screen's 3D
 * preview, which needs its own instance separate from the in-game
 * view model so previewing never disturbs live gameplay.
 */
export function createWeaponModel(id: WeaponId): WeaponModel {
  return WEAPON_BUILDERS[id]();
}

/** view-model scale for a weapon, exposed for the preview renderer */
export function weaponViewScale(id: WeaponId): number {
  return VIEW_SCALE[id] ?? 0.72;
}

function ammoStrip(segments: number, color: number, w: number, h: number, gap: number) {
  const group = new THREE.Group();
  const mats: THREE.MeshStandardMaterial[] = [];
  const geo = new THREE.BoxGeometry(w, h, 0.004);
  for (let i = 0; i < segments; i++) {
    const mat = new THREE.MeshStandardMaterial({
      color: 0x0a0d10, emissive: color, emissiveIntensity: 1.6, roughness: 0.3, metalness: 0.4,
    });
    const m = new THREE.Mesh(geo, mat);
    m.position.z = (i - (segments - 1) / 2) * (w + gap);
    group.add(m);
    mats.push(mat);
  }
  return { group, mats };
}

// ═════════════════════════════════════════════════════════════
//  SPECTRE AR — precise, mechanical. Mag swap + charging handle.
// ═════════════════════════════════════════════════════════════

function buildAssault(): WeaponModel {
  const g = new THREE.Group();
  const body = new THREE.MeshStandardMaterial({ color: 0x1a1d22, metalness: 0.82, roughness: 0.3 });
  const dark = new THREE.MeshStandardMaterial({ color: 0x2b3038, metalness: 0.7, roughness: 0.4 });
  const poly = new THREE.MeshStandardMaterial({ color: 0x101215, metalness: 0.1, roughness: 0.9 });
  const trim = new THREE.MeshStandardMaterial({ color: 0x6d7681, metalness: 0.95, roughness: 0.22 });

  g.add(B(0.075, 0.105, 0.52, body, 0, 0, -0.05));
  g.add(B(0.02, 0.026, 0.36, dark, 0, 0.066, -0.13));
  for (let i = 0; i < 9; i++) g.add(B(0.024, 0.008, 0.012, trim, 0, 0.08, -0.28 + i * 0.038));
  g.add(tubeZ(0.016, 0.016, 0.32, body, 0, 0.008, -0.46));
  g.add(tubeZ(0.027, 0.027, 0.085, dark, 0, 0.008, -0.62));
  for (let i = 0; i < 3; i++) g.add(B(0.058, 0.006, 0.012, trim, 0, 0.008, -0.6 + i * 0.022));
  g.add(B(0.068, 0.072, 0.27, poly, 0, -0.01, -0.34));
  for (let i = 0; i < 5; i++) g.add(B(0.072, 0.01, 0.026, dark, 0, 0.015, -0.44 + i * 0.045));
  g.add(B(0.014, 0.05, 0.02, trim, 0, 0.075, -0.55));
  g.add(B(0.032, 0.048, 0.05, dark, 0, 0.078, 0.06));

  g.add(B(0.042, 0.05, 0.09, dark, 0, 0.095, -0.09));
  const lensMat = new THREE.MeshStandardMaterial({
    color: 0x0a1a22, emissive: 0x35e0ff, emissiveIntensity: 0.8,
    metalness: 0.9, roughness: 0.12, transparent: true, opacity: 0.85,
  });
  g.add(B(0.03, 0.034, 0.004, lensMat, 0, 0.098, -0.135));
  const dotMat = new THREE.MeshStandardMaterial({ color: 0xff2a2a, emissive: 0xff2a2a, emissiveIntensity: 3 });
  g.add(B(0.005, 0.005, 0.004, dotMat, 0, 0.098, -0.138));

  const mag = B(0.046, 0.16, 0.085, dark, 0, -0.12, -0.02);
  mag.rotation.x = 0.22;
  g.add(mag);
  const magHome = mag.position.clone();

  g.add(B(0.055, 0.095, 0.24, poly, 0, -0.015, 0.27));
  g.add(B(0.02, 0.06, 0.14, dark, 0, -0.05, 0.2));
  g.add(B(0.05, 0.12, 0.055, poly, 0, -0.1, 0.12));
  g.add(B(0.082, 0.032, 0.09, dark, 0, 0.01, -0.06));

  const charge = B(0.02, 0.016, 0.05, trim, 0.05, 0.045, 0.02);
  g.add(charge);
  const chargeHome = charge.position.clone();

  const cellMat = new THREE.MeshStandardMaterial({
    color: 0x08161c, emissive: 0x2fd4ff, emissiveIntensity: 1.4, metalness: 0.6, roughness: 0.3,
  });
  g.add(B(0.079, 0.014, 0.18, cellMat, 0, -0.03, -0.05));

  const strip = ammoStrip(6, 0x39e6ff, 0.02, 0.012, 0.008);
  strip.group.position.set(-0.04, 0.028, -0.02);
  strip.group.rotation.y = -Math.PI / 2;
  g.add(strip.group);

  const heatMat = new THREE.MeshStandardMaterial({ color: 0x140a06, emissive: 0xff5a18, emissiveIntensity: 0, roughness: 0.6 });
  for (let i = 0; i < 3; i++) g.add(B(0.078, 0.008, 0.02, heatMat, 0, 0.03, -0.2 - i * 0.035));

  const plate = eliasPlate(0.17, 0.05, "#e2c98d", "#fff4d0", 0xffbe4d);
  plate.mesh.position.set(0.0395, -0.012, 0.16);
  g.add(plate.mesh);

  const hands = addHands(g, new THREE.Vector3(0, -0.115, 0.14), new THREE.Vector3(0, -0.075, -0.31), {
    // AR: pistol grip 0.05 wide, polymer handguard 0.068 wide
    rightGrip: { kind: "pistol", radius: 0.026 },
    leftGrip: { kind: "foregrip", radius: 0.032 },
  });
  // spare magazine carried during the reload
  const spare = B(0.046, 0.16, 0.085, dark, 0, -0.08, 0);
  hands.carried.add(spare);

  const muzzle = new THREE.Object3D();
  muzzle.position.set(0, 0.008, -0.68);
  g.add(muzzle);

  let chargePull = 0;

  const anim: WeaponAnim = {
    marks: [{ t: 0.16, s: 0 }, { t: 0.55, s: 1 }, { t: 0.8, s: 2 }],
    actionRate: 3.6,
    idle(p, t, speedN, ads) {
      // crisp figure-of-eight; tightens right down when aiming
      const a = (1 - ads * 0.85) * (1 - speedN * 0.4);
      p.px += Math.sin(t * 0.9) * 0.0032 * a;
      p.py += Math.sin(t * 1.8 + 0.6) * 0.0024 * a;
      p.rx += Math.sin(t * 1.15) * 0.011 * a;
      p.ry += Math.sin(t * 0.72) * 0.014 * a;
    },
    fire(p, k) {
      // sharp muzzle rise with a touch of left yaw
      p.rx += k * 0.1;
      p.ry += k * 0.028;
      p.pz += k * 0.02;
      chargePull = k;
    },
    reload(p, t) {
      // 1 · drop the weapon and cant it toward the mag well
      const present = pulse(t, 0, 0.28) * 0.55 + seg(t, 0, 0.2) * (1 - seg(t, 0.82, 1));
      p.py -= 0.075 * (seg(t, 0, 0.18) - seg(t, 0.84, 1)) * 1;
      p.rz += 0.5 * (seg(t, 0, 0.2) - seg(t, 0.84, 1));
      p.ry -= 0.32 * (seg(t, 0, 0.2) - seg(t, 0.84, 1));
      p.rx += 0.1 * present * 0.3;

      // 2 · old magazine drops free
      const drop = seg(t, 0.14, 0.34);
      if (t < 0.5) {
        mag.position.y = magHome.y - ease(drop) * 0.34;
        mag.position.z = magHome.z + ease(drop) * 0.06;
        mag.rotation.x = 0.22 + drop * 0.5;
        mag.visible = drop < 0.98;
      }
      // 3 · left hand dives for a fresh mag, brings it up, seats it
      const dive = seg(t, 0.1, 0.32);
      const rise = seg(t, 0.34, 0.6);
      const seat = seg(t, 0.6, 0.68);
      hands.carried.visible = t > 0.3 && t < 0.66;
      if (t < 0.62) {
        hands.left.position.set(
          hands.leftHome.x + 0.02 * ease(dive),
          hands.leftHome.y - 0.3 * ease(dive) + 0.3 * ease(rise),
          hands.leftHome.z + 0.34 * ease(dive) - 0.3 * ease(rise)
        );
        hands.left.rotation.set(-0.5 * ease(dive) + 0.4 * ease(rise), 0, 0);
        if (rise > 0) {
          mag.visible = true;
          mag.position.y = magHome.y - 0.34 * (1 - ease(rise));
          mag.position.z = magHome.z + 0.06 * (1 - ease(rise));
          mag.rotation.x = 0.22;
        }
      } else {
        // 4 · palm-slap the base home, then travel to the charging handle
        const toCharge = seg(t, 0.66, 0.8);
        const back = seg(t, 0.86, 1);
        mag.visible = true;
        mag.position.copy(magHome);
        mag.position.y -= (1 - ease(seat)) * 0.02;
        hands.left.position.set(
          hands.leftHome.x + 0.05 * ease(toCharge) * (1 - back),
          hands.leftHome.y + 0.14 * ease(toCharge) * (1 - back),
          hands.leftHome.z + 0.3 * ease(toCharge) * (1 - back)
        );
        hands.left.rotation.set(0.35 * ease(toCharge) * (1 - back), 0, 0);
        hands.carried.visible = false;
      }
      // 5 · charging handle yanked and released
      chargePull = Math.max(chargePull, pulse(t, 0.74, 0.86));
      p.pz += pulse(t, 0.74, 0.86) * 0.035;
      p.rx -= pulse(t, 0.74, 0.86) * 0.08;
      // settle back to ready
      p.rx += overshoot(seg(t, 0.88, 1)) * 0 - pulse(t, 0.9, 1) * 0.05;
    },
  };

  return {
    group: g, muzzle, hands, anim,
    animate: (t, _dt, ammo, heat) => {
      charge.position.z = chargeHome.z + chargePull * 0.06;
      chargePull *= 0.86;
      cellMat.emissiveIntensity = 1.1 + Math.sin(t * 3.4) * 0.35 + heat * 2.2;
      lensMat.emissiveIntensity = 0.65 + Math.sin(t * 2.2) * 0.2;
      dotMat.emissiveIntensity = 2.6 + Math.sin(t * 11) * 0.9;
      heatMat.emissiveIntensity = heat * 2.6;
      const lit = ammo * strip.mats.length;
      for (let i = 0; i < strip.mats.length; i++) {
        const on = lit > i + 0.35;
        const low = ammo < 0.26;
        strip.mats[i].emissive.setHex(low ? 0xff3524 : 0x39e6ff);
        strip.mats[i].emissiveIntensity = on ? (low ? 1.6 + Math.sin(t * 12) * 1.1 : 1.9) : 0.05;
      }
      plate.mat.emissiveIntensity = 0.42 + Math.sin(t * 1.9) * 0.16 + heat * 0.5;
    },
  };
}

// ═════════════════════════════════════════════════════════════
//  JUDGE-12 — heavy and physical. Shell-by-shell tube loading.
// ═════════════════════════════════════════════════════════════

function buildShotgun(): WeaponModel {
  const g = new THREE.Group();
  const steel = new THREE.MeshStandardMaterial({ color: 0x24282e, metalness: 0.85, roughness: 0.28 });
  const brass = new THREE.MeshStandardMaterial({ color: 0x9a7433, metalness: 0.95, roughness: 0.24 });
  const wood = new THREE.MeshStandardMaterial({ color: 0x5a4126, metalness: 0.05, roughness: 0.72 });
  const dark = new THREE.MeshStandardMaterial({ color: 0x14171b, metalness: 0.5, roughness: 0.6 });

  g.add(B(0.082, 0.112, 0.4, steel, 0, 0, 0.02));
  g.add(B(0.086, 0.03, 0.3, brass, 0, 0.052, 0.02));
  g.add(tubeZ(0.021, 0.021, 0.44, steel, 0, 0.018, -0.4));
  g.add(tubeZ(0.026, 0.026, 0.07, brass, 0, 0.018, -0.6));
  g.add(tubeZ(0.018, 0.018, 0.4, dark, 0, -0.035, -0.38));

  const pump = new THREE.Group();
  const pumpBody = C(0.031, 0.031, 0.15, wood, 0, 0, 0, 14);
  pumpBody.rotation.x = Math.PI / 2;
  pump.add(pumpBody);
  for (let i = 0; i < 4; i++) {
    const ring = C(0.033, 0.033, 0.008, dark, 0, 0, -0.05 + i * 0.033, 14);
    ring.rotation.x = Math.PI / 2;
    pump.add(ring);
  }
  pump.position.set(0, -0.035, -0.34);
  g.add(pump);
  const pumpHome = pump.position.clone();

  g.add(B(0.02, 0.05, 0.03, brass, 0, 0.058, -0.6));
  g.add(B(0.062, 0.1, 0.26, wood, 0, -0.03, 0.3));
  g.add(B(0.066, 0.02, 0.1, brass, 0, -0.075, 0.4));
  g.add(B(0.05, 0.1, 0.05, wood, 0, -0.09, 0.14));

  const shellMats: THREE.MeshStandardMaterial[] = [];
  for (let i = 0; i < 5; i++) {
    const sm = new THREE.MeshStandardMaterial({
      color: 0x6b1410, emissive: 0xff4a22, emissiveIntensity: 1.2, metalness: 0.5, roughness: 0.45,
    });
    const shell = C(0.011, 0.011, 0.05, sm, -0.048, 0.012, -0.06 + i * 0.058, 8);
    shell.rotation.x = Math.PI / 2;
    g.add(shell);
    shellMats.push(sm);
  }

  const heatMat = new THREE.MeshStandardMaterial({ color: 0x18100c, emissive: 0xff6a20, emissiveIntensity: 0, roughness: 0.55 });
  for (let i = 0; i < 6; i++) {
    const band = C(0.024, 0.024, 0.012, heatMat, 0, 0.018, -0.28 - i * 0.05, 10);
    band.rotation.x = Math.PI / 2;
    g.add(band);
  }

  const plate = eliasPlate(0.15, 0.045, "#f0d9a4", "#fff6dc", 0xffa030);
  plate.mesh.position.set(0.0425, -0.014, 0.1);
  g.add(plate.mesh);

  const hands = addHands(g, new THREE.Vector3(0, -0.105, 0.15), new THREE.Vector3(0, -0.075, -0.34), {
    // shotgun: support hand fully closed around the 0.031r pump
    rightGrip: { kind: "pistol", radius: 0.026 },
    leftGrip: { kind: "pump", radius: 0.031 },
  });
  // a single shell pinched between the fingers while loading
  const shellProp = C(0.012, 0.012, 0.055, new THREE.MeshStandardMaterial({ color: 0x7a1a12, roughness: 0.5 }), 0, 0, -0.04, 8);
  shellProp.rotation.x = Math.PI / 2;
  hands.carried.add(shellProp);
  hands.carried.add(C(0.013, 0.013, 0.016, brass, 0, 0, -0.012, 8));
  (hands.carried.children[1] as THREE.Mesh).rotation.x = Math.PI / 2;

  const muzzle = new THREE.Object3D();
  muzzle.position.set(0, 0.018, -0.64);
  g.add(muzzle);

  let pumpCycle = 0;

  const anim: WeaponAnim = {
    marks: [{ t: 0.16, s: 0 }, { t: 0.46, s: 1 }, { t: 0.86, s: 2 }],
    actionRate: 2.9,
    idle(p, t, speedN, ads) {
      // heavy, slow, with a touch of muzzle droop
      const a = (1 - ads * 0.8) * (1 - speedN * 0.35);
      p.py += Math.sin(t * 0.85) * 0.0042 * a;
      p.rx += Math.sin(t * 0.62) * 0.016 * a + 0.006 * a;
      p.rz += Math.sin(t * 0.44) * 0.02 * a;
    },
    fire(p, k) {
      // violent climb + roll, then the pump is worked
      p.rx += k * 0.24;
      p.rz += k * 0.06;
      p.pz += k * 0.06;
      p.py += k * 0.012;
      pumpCycle = Math.max(pumpCycle, Math.sin(Math.min(1, 1 - k) * Math.PI));
    },
    reload(p, t) {
      // 1 · cant the weapon over to expose the loading gate
      const up = seg(t, 0, 0.14) - seg(t, 0.88, 1);
      p.rz -= 0.62 * up;
      p.ry += 0.5 * up;
      p.py -= 0.09 * up;
      p.rx += 0.16 * up;

      // 2 · four shells thumbed in one at a time
      const LO = 0.16, HI = 0.76;
      const shells = 4;
      const span = (HI - LO) / shells;
      let loading = false;
      for (let i = 0; i < shells; i++) {
        const a = LO + i * span;
        const k = seg(t, a, a + span);
        if (k > 0 && k < 1) {
          loading = true;
          // hand dips to the belt then pushes the shell into the tube
          const grab = Math.min(1, k * 2.2);
          const push = Math.max(0, (k - 0.55) / 0.45);
          hands.left.position.set(
            hands.leftHome.x - 0.03 * ease(grab) + 0.03 * ease(push),
            hands.leftHome.y - 0.26 * ease(grab) + 0.26 * ease(push),
            hands.leftHome.z + 0.4 * ease(grab) - 0.06 * ease(push)
          );
          hands.left.rotation.set(-0.6 * ease(grab) + 0.75 * ease(push), 0.3 * ease(grab), 0);
          hands.carried.visible = k > 0.3 && push < 0.9;
          // small kick as each shell seats
          p.rx -= pulse(k, 0.82, 1) * 0.05;
          p.py -= pulse(k, 0.82, 1) * 0.008;
        }
      }
      if (!loading) {
        hands.carried.visible = false;
        const back = seg(t, 0.76, 0.92);
        hands.left.position.lerpVectors(
          hands.left.position, hands.leftHome, Math.min(1, back + 0.15)
        );
        hands.left.rotation.set(0, 0, 0);
      }

      // 3 · rack the pump to chamber
      const rack = pulse(t, 0.8, 0.95);
      pumpCycle = Math.max(pumpCycle, rack);
      p.pz += rack * 0.05;
      p.rx -= rack * 0.1;
    },
  };

  return {
    group: g, muzzle, hands, anim,
    animate: (t, dt, ammo, heat) => {
      pump.position.z = pumpHome.z + pumpCycle * 0.075;
      pumpCycle = Math.max(0, pumpCycle - dt * 3.4);
      heatMat.emissiveIntensity = heat * 3.2;
      const lit = ammo * shellMats.length;
      for (let i = 0; i < shellMats.length; i++) {
        shellMats[i].emissiveIntensity = lit > i + 0.3 ? 1.0 + Math.sin(t * 2.2 + i * 0.7) * 0.3 : 0.06;
      }
      plate.mat.emissiveIntensity = 0.4 + Math.sin(t * 1.6) * 0.14 + heat * 0.6;
    },
  };
}

// ═════════════════════════════════════════════════════════════
//  CINDERFANG — legendary dragon-fire anti-materiel rifle.
//
//  Forged from a dragon: the receiver is wrapped in interlocking
//  scales, a carved dragon skull forms the muzzle (the round exits
//  through its jaws), talons clutch the barrel and forestock, and
//  molten veins run the length of the weapon, pulsing brighter as
//  the chamber heats. Firing breathes flame from the jaws.
// ═════════════════════════════════════════════════════════════

function buildSniper(): WeaponModel {
  const g = new THREE.Group();

  const scaleSet = dragonScaleTexture(512, 777);
  const molten = moltenTexture(512, 909);

  // scaled dragon-hide plating over the receiver
  const hide = new THREE.MeshStandardMaterial({
    map: scaleSet.map,
    normalMap: scaleSet.normalMap,
    normalScale: new THREE.Vector2(1.4, 1.4),
    color: 0xb0a2a0,
    metalness: 0.72,
    roughness: 0.42,
    emissive: 0xff4a08,
    emissiveIntensity: 0.05,
  });
  // blackened forge-iron
  const iron = new THREE.MeshStandardMaterial({ color: 0x1b1517, metalness: 0.88, roughness: 0.36 });
  // aged bronze fittings
  const bronze = new THREE.MeshStandardMaterial({ color: 0x8a5a24, metalness: 0.95, roughness: 0.3 });
  // bone / talon
  const bone = new THREE.MeshStandardMaterial({ color: 0xd8cbb0, metalness: 0.1, roughness: 0.62 });
  // molten crust with glowing veins
  const lava = new THREE.MeshStandardMaterial({
    map: molten.map,
    emissiveMap: molten.emissive,
    emissive: 0xffffff,
    emissiveIntensity: 1.6,
    metalness: 0.4,
    roughness: 0.72,
  });
  // pure fire glow (ember cores, eyes, vents)
  const fire = new THREE.MeshStandardMaterial({
    color: 0x2a0a02, emissive: 0xff5a12, emissiveIntensity: 3.2, roughness: 0.4,
  });
  const ember = new THREE.MeshStandardMaterial({
    color: 0x1a0600, emissive: 0xff8c22, emissiveIntensity: 2.4, roughness: 0.5,
  });

  // ── receiver clad in dragon scale ──
  g.add(B(0.076, 0.104, 0.5, hide, 0, 0, 0));
  g.add(B(0.08, 0.03, 0.44, iron, 0, 0.056, -0.01));        // spine rail
  // dorsal fin ridge running along the receiver
  for (let i = 0; i < 7; i++) {
    const finH = 0.05 - Math.abs(i - 3) * 0.007;
    const fin = B(0.014, finH, 0.03, bone, 0, 0.078 + finH / 2, -0.16 + i * 0.055);
    fin.rotation.x = -0.22;
    g.add(fin);
  }

  // ── molten core channel down the flank ──
  g.add(B(0.079, 0.026, 0.34, lava, 0, -0.024, -0.04));
  g.add(B(0.024, 0.079, 0.3, lava, 0, 0.0, -0.02));

  // ── barrel: iron shaft wrapped in lava cracks + scale bands ──
  g.add(tubeZ(0.015, 0.019, 0.72, iron, 0, 0.012, -0.6));
  g.add(tubeZ(0.0205, 0.0205, 0.5, lava, 0, 0.012, -0.56, 14));
  for (let i = 0; i < 5; i++) {
    const band = C(0.026, 0.026, 0.02, bronze, 0, 0.012, -0.36 - i * 0.11, 12);
    band.rotation.x = Math.PI / 2;
    g.add(band);
  }
  // heat-glow vent slots cut into the barrel shroud
  const ventMats: THREE.MeshStandardMaterial[] = [];
  for (let i = 0; i < 4; i++) {
    const vm = new THREE.MeshStandardMaterial({
      color: 0x160800, emissive: 0xff4a0a, emissiveIntensity: 1.4, roughness: 0.5,
    });
    g.add(B(0.05, 0.008, 0.05, vm, 0, 0.03, -0.3 - i * 0.12));
    ventMats.push(vm);
  }

  // ── DRAGON SKULL muzzle: the round leaves through the jaws ──
  const skull = new THREE.Group();
  skull.position.set(0, 0.012, -0.94);
  // cranium + snout
  skull.add(B(0.062, 0.058, 0.1, bone, 0, 0.004, 0.03));
  skull.add(B(0.05, 0.042, 0.1, bone, 0, -0.002, -0.06));
  // brow ridges
  skull.add(B(0.018, 0.02, 0.05, bone, -0.03, 0.03, 0.01));
  skull.add(B(0.018, 0.02, 0.05, bone, 0.03, 0.03, 0.01));
  // swept horns
  for (const sx of [-1, 1]) {
    const horn = C(0.011, 0.002, 0.16, bone, sx * 0.032, 0.055, 0.07, 8);
    horn.rotation.set(0.75, 0, sx * 0.42);
    skull.add(horn);
    const horn2 = C(0.008, 0.002, 0.1, bone, sx * 0.042, 0.03, 0.02, 6);
    horn2.rotation.set(0.4, 0, sx * 0.8);
    skull.add(horn2);
  }
  // glowing eye sockets
  const eyeMat = new THREE.MeshStandardMaterial({
    color: 0x1a0400, emissive: 0xffb020, emissiveIntensity: 3.4, roughness: 0.3,
  });
  skull.add(B(0.014, 0.012, 0.008, eyeMat, -0.026, 0.016, -0.018));
  skull.add(B(0.014, 0.012, 0.008, eyeMat, 0.026, 0.016, -0.018));
  // upper and lower jaws with fangs — the bore sits between them
  const jawUpper = new THREE.Group();
  jawUpper.add(B(0.046, 0.016, 0.07, bone, 0, 0, -0.035));
  for (let i = 0; i < 4; i++) {
    const fang = C(0.005, 0.0008, 0.026, bone, -0.018 + i * 0.012, -0.016, -0.06, 5);
    fang.rotation.x = Math.PI;
    jawUpper.add(fang);
  }
  jawUpper.position.set(0, -0.006, -0.03);
  skull.add(jawUpper);

  const jawLower = new THREE.Group();
  jawLower.add(B(0.042, 0.014, 0.066, bone, 0, 0, -0.033));
  for (let i = 0; i < 4; i++) {
    jawLower.add(C(0.0045, 0.0008, 0.022, bone, -0.017 + i * 0.011, 0.016, -0.058, 5));
  }
  jawLower.position.set(0, -0.03, -0.03);
  skull.add(jawLower);
  // throat furnace glowing between the jaws
  const throat = new THREE.Mesh(new THREE.SphereGeometry(0.019, 10, 8), fire);
  throat.position.set(0, -0.014, -0.05);
  skull.add(throat);
  g.add(skull);

  // ── talons clutching the forestock ──
  const claw = (x: number, z: number, rot: number, len: number) => {
    const c1 = C(0.009, 0.004, len, bone, x, -0.03, z, 8);
    c1.rotation.set(rot, 0, x > 0 ? -0.5 : 0.5);
    g.add(c1);
  };
  claw(-0.038, -0.34, 1.15, 0.11);
  claw(0.038, -0.34, 1.15, 0.11);
  claw(-0.032, -0.46, 1.35, 0.09);
  claw(0.032, -0.46, 1.35, 0.09);
  // knuckle mounts for the talons
  g.add(B(0.078, 0.03, 0.05, bronze, 0, -0.024, -0.34));
  g.add(B(0.07, 0.026, 0.045, bronze, 0, -0.022, -0.46));

  // ── forestock in scale hide ──
  g.add(B(0.062, 0.062, 0.38, hide, 0, -0.02, -0.36));

  // ── scope: bronze spyglass with an ember reticle ──
  g.add(tubeZ(0.029, 0.029, 0.21, iron, 0, 0.104, -0.02));
  g.add(tubeZ(0.035, 0.035, 0.032, bronze, 0, 0.104, -0.1));
  g.add(tubeZ(0.031, 0.031, 0.026, bronze, 0, 0.104, 0.07));
  const lensMat = new THREE.MeshStandardMaterial({
    color: 0x1a0a04, emissive: 0xff7a1e, emissiveIntensity: 1.3, metalness: 0.9, roughness: 0.1,
  });
  const lens = C(0.027, 0.027, 0.004, lensMat, 0, 0.104, -0.12, 16);
  lens.rotation.x = Math.PI / 2;
  g.add(lens);
  // scope mounts shaped like small claws
  g.add(B(0.014, 0.04, 0.022, bronze, 0, 0.077, -0.06));
  g.add(B(0.014, 0.04, 0.022, bronze, 0, 0.077, 0.03));
  const turret = C(0.018, 0.018, 0.024, bronze, 0, 0.138, -0.02, 10);
  g.add(turret);

  // ── magazine: obsidian cell with molten window ──
  const mag = new THREE.Group();
  mag.add(B(0.052, 0.13, 0.094, iron, 0, 0, 0));
  const magGlow = new THREE.MeshStandardMaterial({
    color: 0x1a0600, emissive: 0xff6a12, emissiveIntensity: 2.0, roughness: 0.45,
  });
  mag.add(B(0.056, 0.06, 0.03, magGlow, 0, -0.01, 0.035));
  mag.position.set(0, -0.1, 0.02);
  g.add(mag);
  const magHome = mag.position.clone();

  // ── stock: bone frame with a burning core ──
  g.add(B(0.06, 0.1, 0.26, hide, 0, -0.02, 0.3));
  g.add(B(0.03, 0.052, 0.1, bone, 0, 0.042, 0.28));          // cheek rest
  g.add(B(0.064, 0.022, 0.2, lava, 0, -0.062, 0.3));         // molten underbelly
  g.add(B(0.052, 0.112, 0.05, iron, 0, -0.1, 0.13));         // grip
  // tail-spike counterweight
  const tail = C(0.026, 0.006, 0.1, bone, 0, -0.02, 0.47, 8);
  tail.rotation.x = Math.PI / 2;
  g.add(tail);

  // ── bolt shaped like a claw ──
  const bolt = new THREE.Group();
  bolt.add(B(0.017, 0.017, 0.072, bronze, 0.046, 0.032, 0.06));
  const boltClaw = C(0.012, 0.004, 0.05, bone, 0.076, 0.032, 0.06, 6);
  boltClaw.rotation.z = -Math.PI / 2;
  bolt.add(boltClaw);
  g.add(bolt);
  const boltHome = bolt.position.clone();

  // ── ELIAS plate, branded into the scale hide ──
  const plate = eliasPlate(0.16, 0.046, "#ffd9a0", "#fff3d8", 0xff7a1e);
  plate.mesh.position.set(0.039, -0.026, 0.2);
  g.add(plate.mesh);

  const hands = addHands(g, new THREE.Vector3(0, -0.11, 0.15), new THREE.Vector3(0, -0.07, -0.34), {
    // CINDERFANG: scaled forestock, hand rides the dragon-hide grip
    rightGrip: { kind: "pistol", radius: 0.026 },
    leftGrip: { kind: "foregrip", radius: 0.033 },
  });
  const spare = B(0.052, 0.13, 0.094, iron, 0, -0.07, 0);
  hands.carried.add(spare);

  const muzzle = new THREE.Object3D();
  muzzle.position.set(0, 0.0, -1.0);
  g.add(muzzle);

  let boltLift = 0, boltPull = 0;
  let breath = 0;          // furnace charge, spikes on each shot
  let jawOpen = 0;

  const anim: WeaponAnim = {
    marks: [{ t: 0.22, s: 0 }, { t: 0.52, s: 1 }, { t: 0.78, s: 2 }],
    actionRate: 2.3,
    idle(p, t, speedN, ads) {
      // the weapon feels alive — a slow, breathing sway
      const a = (1 - ads * 0.94) * (1 - speedN * 0.5);
      p.px += Math.sin(t * 0.38) * 0.0038 * a;
      p.py += Math.sin(t * 0.51 + 1.2) * 0.003 * a;
      p.rx += Math.sin(t * 0.44) * 0.009 * a;
      p.ry += Math.sin(t * 0.29) * 0.012 * a;
      // faint molten "heartbeat" shudder
      p.py += Math.sin(t * 2.1) * 0.0009 * a;
      p.rx += Math.sin(t * 8.5) * 0.0006 * ads;
      p.ry += Math.sin(t * 6.3) * 0.0007 * ads;
    },
    fire(p, k) {
      // massive shove; the dragon lurches as it breathes fire
      p.rx += k * 0.32;
      p.pz += k * 0.11;
      p.rz += k * 0.035;
      p.py += k * 0.012;
      breath = Math.max(breath, k);
      jawOpen = Math.max(jawOpen, k);
      const cyc = Math.sin(Math.min(1, 1 - k) * Math.PI);
      boltLift = Math.max(boltLift, cyc);
      boltPull = Math.max(boltPull, cyc);
    },
    reload(p, t) {
      const down = seg(t, 0, 0.16) - seg(t, 0.86, 1);
      p.py -= 0.1 * down;
      p.rz += 0.42 * down;
      p.ry -= 0.34 * down;
      p.rx += 0.2 * down;

      boltLift = Math.max(boltLift, seg(t, 0.14, 0.24) - seg(t, 0.74, 0.84));
      boltPull = Math.max(boltPull, seg(t, 0.18, 0.3) - seg(t, 0.78, 0.9));

      const out = seg(t, 0.3, 0.44);
      const inn = seg(t, 0.5, 0.68);
      if (t < 0.5) {
        mag.position.y = magHome.y - ease(out) * 0.3;
        mag.rotation.x = ease(out) * 0.4;
        mag.visible = out < 0.97;
      } else {
        mag.visible = true;
        mag.position.y = magHome.y - 0.3 * (1 - ease(inn));
        mag.rotation.x = 0;
      }
      hands.carried.visible = t > 0.44 && t < 0.66;
      const dive = seg(t, 0.26, 0.46);
      const rise = seg(t, 0.48, 0.68);
      const home = seg(t, 0.7, 0.86);
      hands.left.position.set(
        hands.leftHome.x,
        hands.leftHome.y - 0.32 * ease(dive) + 0.32 * ease(rise),
        hands.leftHome.z + 0.36 * ease(dive) - 0.36 * ease(rise) + 0.1 * ease(home) * (1 - seg(t, 0.9, 1))
      );
      hands.left.rotation.set(-0.55 * ease(dive) + 0.55 * ease(rise), 0, 0);
      p.py -= pulse(t, 0.6, 0.7) * 0.012;

      // the beast snarls as a fresh cell seats
      jawOpen = Math.max(jawOpen, pulse(t, 0.56, 0.74) * 0.8);
      breath = Math.max(breath, pulse(t, 0.58, 0.72) * 0.6);

      p.pz += pulse(t, 0.78, 0.9) * 0.04;
      p.rx -= pulse(t, 0.78, 0.9) * 0.07;
    },
  };

  return {
    group: g, muzzle, hands, anim,
    animate: (t, dt, ammo, heat) => {
      bolt.position.y = boltHome.y + boltLift * 0.028;
      bolt.position.z = boltHome.z + boltPull * 0.07;
      boltLift = Math.max(0, boltLift - dt * 2.4);
      boltPull = Math.max(0, boltPull - dt * 2.4);

      breath = Math.max(0, breath - dt * 1.6);
      jawOpen = Math.max(0, jawOpen - dt * 3.2);

      // jaws gape when the furnace fires
      jawLower.rotation.x = jawOpen * 0.55;
      jawUpper.rotation.x = -jawOpen * 0.22;
      throat.scale.setScalar(0.7 + jawOpen * 1.9 + Math.sin(t * 5) * 0.06);
      (throat.material as THREE.MeshStandardMaterial).emissiveIntensity = 2.4 + jawOpen * 9 + breath * 5;

      // molten veins pulse; they flare white-hot with heat and low ammo
      const beat = 0.72 + Math.sin(t * 1.8) * 0.2 + Math.sin(t * 5.1) * 0.06;
      lava.emissiveIntensity = beat * 1.5 + heat * 3.4 + breath * 2.6;
      magGlow.emissiveIntensity = 0.25 + ammo * 2.2 + breath * 1.5;
      for (let i = 0; i < ventMats.length; i++) {
        const wave = Math.sin(t * 3.4 - i * 0.8) * 0.5 + 0.5;
        ventMats[i].emissiveIntensity = 0.6 + wave * 1.2 + heat * 4 + breath * 3;
      }
      // eyes track the heat — they burn brighter the hotter it gets
      eyeMat.emissiveIntensity = 2.6 + Math.sin(t * 2.6) * 0.5 + heat * 5 + jawOpen * 6;
      lensMat.emissiveIntensity = 1.0 + Math.sin(t * 2.6) * 0.35 + heat * 1.5;
      // scale hide catches the internal glow
      hide.emissiveIntensity = 0.05 + heat * 0.5 + breath * 0.35;
      ember.emissiveIntensity = 2.0 + Math.sin(t * 4) * 0.6;
      turret.rotation.y = t * 0.35;
      plate.mat.emissiveIntensity = 0.5 + Math.sin(t * 2.1) * 0.2 + heat * 0.8;
    },
  };
}

// ═════════════════════════════════════════════════════════════
//  WRAITH-9 — frantic. Slammed mag, bolt slap, snappy recovery.
// ═════════════════════════════════════════════════════════════

function buildSmg(): WeaponModel {
  const g = new THREE.Group();
  const body = new THREE.MeshStandardMaterial({ color: 0x191c21, metalness: 0.78, roughness: 0.34 });
  const teal = new THREE.MeshStandardMaterial({ color: 0x1d4650, metalness: 0.72, roughness: 0.32 });
  const poly = new THREE.MeshStandardMaterial({ color: 0x0e1013, metalness: 0.1, roughness: 0.92 });
  const trim = new THREE.MeshStandardMaterial({ color: 0x7fd6e0, metalness: 0.9, roughness: 0.2 });

  g.add(B(0.068, 0.095, 0.34, body, 0, 0, -0.02));
  g.add(B(0.072, 0.022, 0.24, teal, 0, 0.052, -0.03));
  for (let i = 0; i < 6; i++) g.add(B(0.02, 0.008, 0.01, trim, 0, 0.066, -0.13 + i * 0.036));
  g.add(tubeZ(0.013, 0.013, 0.2, body, 0, 0.004, -0.28));
  g.add(tubeZ(0.021, 0.021, 0.06, teal, 0, 0.004, -0.38));
  const shroud = C(0.028, 0.028, 0.16, teal, 0, 0.004, -0.26, 14);
  shroud.rotation.x = Math.PI / 2;
  g.add(shroud);
  for (let i = 0; i < 4; i++) g.add(B(0.058, 0.007, 0.018, poly, 0, 0.018, -0.32 + i * 0.042));

  const turbine = new THREE.Group();
  const bladeMat = new THREE.MeshStandardMaterial({
    color: 0x0b1a1e, emissive: 0x38e8ff, emissiveIntensity: 1.5, metalness: 0.8, roughness: 0.25,
  });
  for (let i = 0; i < 6; i++) {
    const blade = B(0.006, 0.03, 0.012, bladeMat);
    blade.position.set(Math.cos((i / 6) * Math.PI * 2) * 0.018, Math.sin((i / 6) * Math.PI * 2) * 0.018, 0);
    blade.rotation.z = (i / 6) * Math.PI * 2;
    turbine.add(blade);
  }
  turbine.position.set(0, 0.004, -0.185);
  g.add(turbine);
  const hub = C(0.009, 0.009, 0.02, trim, 0, 0.004, -0.185, 10);
  hub.rotation.x = Math.PI / 2;
  g.add(hub);

  const mag = B(0.04, 0.19, 0.07, teal, 0, -0.135, 0.0);
  mag.rotation.x = 0.14;
  g.add(mag);
  const magHome = mag.position.clone();
  const roundsMat = new THREE.MeshStandardMaterial({
    color: 0x0a1b1f, emissive: 0x46f0ff, emissiveIntensity: 1.4, metalness: 0.5, roughness: 0.4,
  });
  const rounds = B(0.026, 0.14, 0.012, roundsMat, 0, -0.13, 0.038);
  rounds.rotation.x = 0.14;
  g.add(rounds);
  const roundsHome = rounds.position.clone();

  g.add(B(0.048, 0.105, 0.05, poly, 0, -0.085, 0.09));
  g.add(B(0.012, 0.012, 0.2, body, 0.026, 0.0, 0.23));
  g.add(B(0.012, 0.012, 0.2, body, -0.026, 0.0, 0.23));
  g.add(B(0.07, 0.05, 0.016, poly, 0, 0.0, 0.33));
  const fore = B(0.03, 0.075, 0.032, poly, 0, -0.06, -0.19);
  fore.rotation.x = -0.28;
  g.add(fore);
  g.add(B(0.032, 0.036, 0.05, body, 0, 0.084, -0.06));
  const dotMat = new THREE.MeshStandardMaterial({ color: 0x2a0000, emissive: 0xff3a2a, emissiveIntensity: 2.8 });
  g.add(B(0.005, 0.005, 0.004, dotMat, 0, 0.088, -0.086));

  const boltSlap = B(0.016, 0.016, 0.045, trim, -0.04, 0.03, 0.0);
  g.add(boltSlap);
  const boltHome = boltSlap.position.clone();

  const strip = ammoStrip(8, 0x46f0ff, 0.014, 0.01, 0.006);
  strip.group.position.set(-0.036, 0.02, -0.02);
  strip.group.rotation.y = -Math.PI / 2;
  g.add(strip.group);

  const plate = eliasPlate(0.13, 0.04, "#bff2fa", "#ffffff", 0x3fe0ff);
  plate.mesh.position.set(0.0355, -0.022, 0.1);
  g.add(plate.mesh);

  const hands = addHands(g, new THREE.Vector3(0, -0.1, 0.11), new THREE.Vector3(0, -0.075, -0.2), {
    // SMG: slim grip, support hand on the angled foregrip
    rightGrip: { kind: "pistol", radius: 0.024 },
    leftGrip: { kind: "vertical", radius: 0.018 },
  });
  const spare = B(0.04, 0.19, 0.07, teal, 0, -0.1, 0);
  hands.carried.add(spare);

  const muzzle = new THREE.Object3D();
  muzzle.position.set(0, 0.004, -0.42);
  g.add(muzzle);

  let spin = 0, slap = 0, jitter = 0;

  const anim: WeaponAnim = {
    marks: [{ t: 0.14, s: 0 }, { t: 0.46, s: 1 }, { t: 0.68, s: 2 }],
    actionRate: 7.5,
    idle(p, t, speedN, ads) {
      // light and twitchy — high frequency, small amplitude
      const a = (1 - ads * 0.8) * (1 - speedN * 0.3);
      p.px += Math.sin(t * 2.3) * 0.0022 * a;
      p.py += Math.sin(t * 3.1 + 0.9) * 0.0018 * a;
      p.rx += Math.sin(t * 2.7) * 0.008 * a;
      p.ry += Math.sin(t * 1.9) * 0.01 * a + Math.sin(t * 5.4) * 0.002 * a;
    },
    fire(p, k) {
      // buzzsaw: rapid random-ish shake rather than a single kick
      jitter += 0.6;
      p.rx += k * 0.05 + Math.sin(jitter * 2.1) * 0.012 * k;
      p.ry += Math.sin(jitter * 1.3) * 0.016 * k;
      p.pz += k * 0.012;
    },
    reload(p, t) {
      // 1 · violent cant inward
      const up = seg(t, 0, 0.1) - seg(t, 0.82, 1);
      p.rz += 0.7 * up;
      p.ry -= 0.45 * up;
      p.py -= 0.07 * up;

      // 2 · mag ripped out fast
      const out = seg(t, 0.1, 0.24);
      const inn = seg(t, 0.34, 0.5);
      if (t < 0.34) {
        mag.position.y = magHome.y - ease(out) * 0.32;
        mag.rotation.z = ease(out) * 0.5;
        mag.visible = out < 0.96;
        rounds.visible = mag.visible;
        rounds.position.y = roundsHome.y - ease(out) * 0.32;
      } else {
        mag.visible = true;
        rounds.visible = true;
        mag.rotation.z = 0;
        // slammed home, overshooting slightly
        const k = overshoot(inn, 2.2);
        mag.position.y = magHome.y - 0.32 * (1 - k);
        rounds.position.y = roundsHome.y - 0.32 * (1 - k);
      }
      hands.carried.visible = t > 0.26 && t < 0.5;
      const dive = seg(t, 0.06, 0.28);
      const rise = seg(t, 0.3, 0.5);
      const toBolt = seg(t, 0.54, 0.68);
      const back = seg(t, 0.72, 0.9);
      hands.left.position.set(
        hands.leftHome.x - 0.04 * ease(toBolt) * (1 - back),
        hands.leftHome.y - 0.3 * ease(dive) + 0.3 * ease(rise) + 0.12 * ease(toBolt) * (1 - back),
        hands.leftHome.z + 0.3 * ease(dive) - 0.3 * ease(rise) + 0.22 * ease(toBolt) * (1 - back)
      );
      hands.left.rotation.set(-0.5 * ease(dive) + 0.5 * ease(rise), 0, 0);

      // 3 · mag slap + bolt release
      p.py -= pulse(t, 0.48, 0.56) * 0.02;
      p.rx -= pulse(t, 0.48, 0.56) * 0.06;
      slap = Math.max(slap, pulse(t, 0.6, 0.72));
      p.pz += pulse(t, 0.6, 0.72) * 0.022;
      // 4 · snap back to ready with an overshoot
      p.rx += (1 - overshoot(seg(t, 0.84, 1), 2.4)) * 0.09;
    },
  };

  return {
    group: g, muzzle, hands, anim,
    animate: (t, dt, ammo, heat) => {
      spin += dt * (2.4 + heat * 46);
      turbine.rotation.z = spin;
      boltSlap.position.z = boltHome.z + slap * 0.05;
      slap = Math.max(0, slap - dt * 5);
      bladeMat.emissiveIntensity = 1.1 + heat * 2.6;
      dotMat.emissiveIntensity = 2.4 + Math.sin(t * 9) * 0.7;
      roundsMat.emissiveIntensity = 0.25 + ammo * 1.7;
      const lit = ammo * strip.mats.length;
      for (let i = 0; i < strip.mats.length; i++) {
        const on = lit > i + 0.3;
        const low = ammo < 0.22;
        strip.mats[i].emissive.setHex(low ? 0xff3524 : 0x46f0ff);
        strip.mats[i].emissiveIntensity = on ? (low ? 1.5 + Math.sin(t * 14) * 1.1 : 1.8) : 0.05;
      }
      plate.mat.emissiveIntensity = 0.45 + Math.sin(t * 2.7) * 0.2 + heat * 0.5;
    },
  };
}

// ═════════════════════════════════════════════════════════════
//  MAGNUS .44 — theatrical. Crane swings out, eject, speedloader,
//  wrist-flick close.
// ═════════════════════════════════════════════════════════════

function buildRevolver(): WeaponModel {
  const g = new THREE.Group();
  const blued = new THREE.MeshStandardMaterial({ color: 0x22252c, metalness: 0.92, roughness: 0.2 });
  const gold = new THREE.MeshStandardMaterial({ color: 0xa8842f, metalness: 0.96, roughness: 0.22 });
  const ivory = new THREE.MeshStandardMaterial({ color: 0xd9cdb4, metalness: 0.05, roughness: 0.55 });
  const dark = new THREE.MeshStandardMaterial({ color: 0x121417, metalness: 0.6, roughness: 0.5 });

  g.add(B(0.05, 0.075, 0.16, blued, 0, 0.005, -0.02));
  g.add(B(0.042, 0.05, 0.26, blued, 0, 0.015, -0.19));
  g.add(B(0.046, 0.014, 0.26, gold, 0, 0.043, -0.19));
  for (let i = 0; i < 5; i++) g.add(B(0.048, 0.012, 0.014, dark, 0, 0.043, -0.11 - i * 0.04));
  g.add(tubeZ(0.014, 0.014, 0.26, dark, 0, 0.012, -0.19, 14));
  g.add(B(0.05, 0.022, 0.05, blued, 0, -0.018, -0.19));

  // crane pivots the cylinder out to the left
  const crane = new THREE.Group();
  crane.position.set(-0.026, 0.004, -0.015);
  const cylinder = new THREE.Group();
  cylinder.position.set(0.026, 0, 0);
  const cyl = C(0.032, 0.032, 0.075, blued, 0, 0, 0, 6);
  cyl.rotation.x = Math.PI / 2;
  cylinder.add(cyl);
  const chamberMats: THREE.MeshStandardMaterial[] = [];
  const casings: THREE.Mesh[] = [];
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2;
    const cm = new THREE.MeshStandardMaterial({
      color: 0x3a2a10, emissive: 0xffa33a, emissiveIntensity: 1.3, metalness: 0.9, roughness: 0.3,
    });
    const round = C(0.007, 0.007, 0.05, cm, Math.cos(a) * 0.021, Math.sin(a) * 0.021, 0, 8);
    round.rotation.x = Math.PI / 2;
    cylinder.add(round);
    chamberMats.push(cm);
    casings.push(round);
    const flute = B(0.006, 0.014, 0.07, gold, Math.cos(a + 0.52) * 0.03, Math.sin(a + 0.52) * 0.03, 0);
    flute.rotation.z = a;
    cylinder.add(flute);
  }
  crane.add(cylinder);
  g.add(crane);

  const hammer = B(0.014, 0.038, 0.022, blued, 0, 0.05, 0.062);
  g.add(hammer);
  g.add(B(0.012, 0.03, 0.014, blued, 0, -0.036, 0.0));
  g.add(B(0.016, 0.008, 0.07, blued, 0, -0.052, 0.005));
  const grip = B(0.05, 0.13, 0.062, ivory, 0, -0.086, 0.076);
  grip.rotation.x = -0.34;
  g.add(grip);
  g.add(B(0.052, 0.014, 0.05, gold, 0, -0.14, 0.096));
  for (let i = 0; i < 3; i++) g.add(B(0.052, 0.006, 0.03, gold, 0, 0.03 - i * 0.022, 0.045));
  g.add(B(0.008, 0.022, 0.012, gold, 0, 0.055, -0.3));

  const plate = eliasPlate(0.1, 0.036, "#ffe9ae", "#fffbe8", 0xffb43a);
  plate.mesh.position.set(0.0265, -0.078, 0.08);
  plate.mesh.rotation.x = -0.34;
  g.add(plate.mesh);

  // single-handed grip with a support hand that leaves during reload
  const hands = addHands(g, new THREE.Vector3(0.004, -0.088, 0.082), new THREE.Vector3(-0.062, -0.104, 0.096), {
    // revolver: support hand cups the firing hand rather than the gun
    rightGrip: { kind: "pistol", radius: 0.025 },
    leftGrip: { kind: "cup", radius: 0.040 },
  });
  hands.right.rotation.x = -0.2;
  hands.left.rotation.set(0.2, 0.35, 0.25);
  // speedloader: six rounds in a carrier
  const loader = new THREE.Group();
  loader.add(C(0.03, 0.03, 0.014, dark, 0, 0, 0.012, 10));
  (loader.children[0] as THREE.Mesh).rotation.x = Math.PI / 2;
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2;
    const rd = C(0.007, 0.007, 0.045, gold, Math.cos(a) * 0.021, Math.sin(a) * 0.021, -0.016, 8);
    rd.rotation.x = Math.PI / 2;
    loader.add(rd);
  }
  loader.position.set(0, 0, -0.04);
  hands.carried.add(loader);

  const muzzle = new THREE.Object3D();
  muzzle.position.set(0, 0.012, -0.33);
  g.add(muzzle);

  let index = 0, prevHeat = 0, shown = 0, hammerCock = 0;

  const anim: WeaponAnim = {
    marks: [{ t: 0.12, s: 0 }, { t: 0.52, s: 1 }, { t: 0.8, s: 2 }],
    actionRate: 2.6,
    idle(p, t, speedN, ads) {
      // relaxed wrist: gentle roll with the muzzle floating
      const a = (1 - ads * 0.82) * (1 - speedN * 0.35);
      p.py += Math.sin(t * 1.05) * 0.0038 * a;
      p.rx += Math.sin(t * 0.78 + 0.4) * 0.015 * a;
      p.rz += Math.sin(t * 0.56) * 0.026 * a;
      p.ry += Math.sin(t * 0.63) * 0.01 * a;
    },
    fire(p, k) {
      // hand cannon: wrist flips the muzzle skyward
      p.rx += k * 0.34;
      p.rz -= k * 0.1;
      p.pz += k * 0.055;
      p.py += k * 0.014;
      hammerCock = Math.max(hammerCock, k);
    },
    reload(p, t) {
      // 1 · rotate the frame over, thumb the latch, crane swings out
      const open = seg(t, 0.04, 0.18);
      const close = seg(t, 0.76, 0.88);
      const openK = ease(open) * (1 - ease(close));
      crane.rotation.y = openK * 1.25;
      const tilt = seg(t, 0, 0.16) - seg(t, 0.86, 1);
      p.rz += 0.85 * tilt;
      p.ry -= 0.3 * tilt;
      p.py -= 0.05 * tilt;

      // 2 · muzzle up, eject rod punches the casings out
      const eject = seg(t, 0.2, 0.34);
      p.rx -= 0.5 * (seg(t, 0.18, 0.3) - seg(t, 0.44, 0.6));
      for (let i = 0; i < casings.length; i++) {
        const fall = Math.max(0, eject * 1.2 - i * 0.03);
        casings[i].visible = t < 0.22 || t > 0.62;
        casings[i].position.z = fall > 0 && t < 0.6 ? fall * 0.09 : 0;
      }

      // 3 · support hand fetches a speedloader and feeds it in
      const dive = seg(t, 0.24, 0.44);
      const rise = seg(t, 0.46, 0.62);
      const twist = seg(t, 0.6, 0.7);
      hands.carried.visible = t > 0.38 && t < 0.7;
      hands.left.position.set(
        hands.leftHome.x - 0.05 * ease(dive) + 0.05 * ease(rise),
        hands.leftHome.y - 0.34 * ease(dive) + 0.34 * ease(rise),
        hands.leftHome.z + 0.3 * ease(dive) - 0.3 * ease(rise)
      );
      hands.left.rotation.set(0.2 - 0.6 * ease(dive) + 0.6 * ease(rise), 0.35, 0.25 + ease(twist) * 0.6);
      if (t > 0.62) {
        for (const cs of casings) { cs.visible = true; cs.position.z = 0; }
      }

      // 4 · wrist-flick the cylinder shut and spin it
      const flick = pulse(t, 0.76, 0.9);
      p.rz -= flick * 0.5;
      p.rx += flick * 0.16;
      if (t > 0.76) index += 0.55 * flick;
      // 5 · settle back on target
      p.rx -= pulse(t, 0.9, 1) * 0.06;
    },
  };

  return {
    group: g, muzzle, hands, anim,
    animate: (t, dt, ammo, heat) => {
      if (heat > prevHeat + 0.2) index += Math.PI / 3;
      prevHeat = heat;
      shown += (index - shown) * Math.min(1, dt * 14);
      cylinder.rotation.z = shown;
      hammer.rotation.x = -hammerCock * 0.8;
      hammerCock = Math.max(0, hammerCock - dt * 4);
      const lit = ammo * chamberMats.length;
      for (let i = 0; i < chamberMats.length; i++) {
        chamberMats[i].emissiveIntensity = lit > i + 0.3 ? 1.0 + Math.sin(t * 2.4 + i) * 0.35 : 0.04;
      }
      plate.mat.emissiveIntensity = 0.5 + Math.sin(t * 1.7) * 0.22 + heat * 0.7;
    },
  };
}

// ── view arms controller ────────────────────────────────────

export interface ArmsFrame {
  dt: number;
  speed: number;
  sprinting: boolean;
  grounded: boolean;
  adsHeld: boolean;
  scopedBlocked: boolean;
}

const HIP_POS = new THREE.Vector3(0.2, -0.185, -0.44);
const ADS_POS = new THREE.Vector3(0, -0.082, -0.4);

const VIEW_SCALE: Record<WeaponId, number> = {
  assault: 0.72, shotgun: 0.72, sniper: 0.62, smg: 0.78, revolver: 0.84,
  ...Object.fromEntries(SNIPER_VARIANTS.map((v) => [v.def.id, v.viewScale])),
} as Record<WeaponId, number>;

const ADS_OFFSET: Record<WeaponId, THREE.Vector3> = {
  assault: new THREE.Vector3(0, -0.02, 0),
  shotgun: new THREE.Vector3(0, -0.024, 0),
  sniper: new THREE.Vector3(0, -0.03, 0.02),
  smg: new THREE.Vector3(0, -0.022, 0),
  revolver: new THREE.Vector3(0, -0.012, -0.04),
  ...Object.fromEntries(SNIPER_VARIANTS.map((v) => [v.def.id, v.adsOffset])),
} as Record<WeaponId, THREE.Vector3>;

export class ViewArms {
  root: THREE.Group;
  private rig: THREE.Group;
  private models: Record<WeaponId, WeaponModel>;
  current!: WeaponModel;
  currentId: WeaponId = "assault";

  adsBlend = 0;
  private swayRot = new THREE.Vector2();
  private swayPos = new THREE.Vector2();
  private bobPhase = 0;
  private bobAmp = 0;
  private kickPos = 0;
  private kickRot = 0;
  private sprintBlend = 0;
  private skinT = 0;
  private ammoRatio = 1;

  reloading = false;
  reloadT = 0;
  private reloadDur = 1;
  private markHit: boolean[] = [];
  private onReloadStage: ((s: 0 | 1 | 2) => void) | null = null;

  switching = false;
  private switchT = 0;
  private nextId: WeaponId | null = null;
  private onSwitchMid: (() => void) | null = null;

  actionT = 0;

  // ── kill-confirm flourish ──
  // Purely additive to the view-model pose. It never gates canFire(),
  // never touches movement, and is cancelled by any reload or swap,
  // so it can never interrupt the gameplay loop.
  killT = 0;
  private killDur = 0.6;
  killActive = false;

  // ── raise / lower choreography ──
  private equipT = -1;      // <0 = inactive
  private holsterT = -1;
  private prevAds = 0;

  private _pos = new THREE.Vector3();
  private _p: Pose = { px: 0, py: 0, pz: 0, rx: 0, ry: 0, rz: 0 };

  // ── customization ──
  private skinTargets = new Map<WeaponId, SkinTargets>();
  private anchors = new Map<WeaponId, Anchors>();
  private attachHosts = new Map<WeaponId, THREE.Group>();
  private attachMats: AttachMats = makeAttachMats();
  private activeSkin: SkinDef | null = null;
  /** ADS blend rate multiplier from attachments (1 = stock) */
  adsSpeedMul = 1;

  /** cosmetic only — hidden while scoped, never gates firing */
  visible = true;

  constructor(camera: THREE.Camera) {
    this.root = new THREE.Group();
    this.rig = new THREE.Group();
    this.root.add(this.rig);
    this.models = {
      assault: buildAssault(),
      shotgun: buildShotgun(),
      sniper: buildSniper(),
      smg: buildSmg(),
      revolver: buildRevolver(),
      ...Object.fromEntries(SNIPER_VARIANTS.map((v) => [v.def.id, v.build()])),
    } as Record<WeaponId, WeaponModel>;
    for (const id of WEAPON_ORDER) {
      const m = this.models[id];
      m.group.visible = false;
      m.group.scale.setScalar(VIEW_SCALE[id]);
      m.group.traverse((o) => {
        const mesh = o as THREE.Mesh;
        if (mesh.isMesh) {
          mesh.castShadow = false;
          mesh.receiveShadow = false;
          mesh.frustumCulled = false;
        }
      });
      // customization hooks: snapshot materials and add a mount host
      this.skinTargets.set(id, captureSkinTargets(m.group));
      const host = new THREE.Group();
      host.name = "attachments";
      m.group.add(host);
      this.attachHosts.set(id, host);
      this.anchors.set(id, deriveAnchors(m.group, m.muzzle, m.sight));
      this.rig.add(m.group);
    }
    this.alignSights();
    this.setModel("assault");
    camera.add(this.root);
  }

  /**
   * Derive each weapon's ADS offset from its declared sight anchor so
   * the optic lands exactly on the crosshair. Solving
   *   ADS_POS + offset + sightLocal * viewScale = 0   (x and y)
   * removes all hand-tuned alignment constants; the registry value is
   * kept only as the Z (eye-relief) term.
   */
  private alignSights() {
    for (const id of WEAPON_ORDER) {
      const m = this.models[id];
      if (!m.sight) continue;
      const s = VIEW_SCALE[id];
      const local = m.sight.position;
      const off = ADS_OFFSET[id];
      off.x = -(ADS_POS.x + local.x * s);
      off.y = -(ADS_POS.y + local.y * s);
    }
  }

  /** repaint a weapon with a skin (safe to call any time) */
  applyWeaponSkin(id: WeaponId, skin: SkinDef) {
    const t = this.skinTargets.get(id);
    if (!t) return;
    clearGenerated(t);
    applySkin(t, skin);
    if (id === this.currentId) this.activeSkin = skin;
  }

  /** rebuild the attachment geometry on a weapon */
  applyWeaponAttachments(id: WeaponId, ids: string[]) {
    const host = this.attachHosts.get(id);
    const anch = this.anchors.get(id);
    if (!host || !anch) return;
    mountAttachments(host, anch, ids, this.attachMats);
  }

  /** the hand group the wrist accessory mounts to */
  handGroup(id: WeaponId): THREE.Object3D | null {
    return this.models[id]?.hands.right ?? null;
  }

  /** apply glove coverage / plating to both hands of every weapon */
  applyHandStyle(coverage: "full" | "fingerless" | "bare", plating: boolean) {
    for (const id of WEAPON_ORDER) {
      const h = this.models[id]?.hands;
      if (!h) continue;
      setHandStyle(h.leftRig, coverage, plating);
      setHandStyle(h.rightRig, coverage, plating);
    }
  }

  allWeaponIds(): WeaponId[] {
    return [...WEAPON_ORDER];
  }

  private setModel(id: WeaponId) {
    this.models[this.currentId].group.visible = false;
    this.currentId = id;
    this.current = this.models[id];
    this.current.group.visible = true;
    this.onModelChanged?.(id);
  }

  /** notified whenever the live weapon changes, so skins can refresh */
  onModelChanged: ((id: WeaponId) => void) | null = null;

  forceEquip(id: WeaponId) {
    this.setModel(id);
    this.switching = false;
    this.reloading = false;
    this.adsBlend = 0;
    this.sprintBlend = 0;
    this.kickPos = 0;
    this.kickRot = 0;
    this.visible = true;
    this.nextId = null;
    this.killActive = false;
    this.killT = 0;
    this.equipT = -1;
    this.holsterT = -1;
    this.restHands();
  }

  /** return the animated hands / carried props to their rest pose */
  private restHands() {
    const h = this.current.hands;
    h.left.position.copy(h.leftHome);
    h.right.position.copy(h.rightHome);
    h.left.rotation.set(0, 0, 0);
    h.carried.visible = false;
  }

  switchTo(id: WeaponId, onMid?: () => void) {
    if (id === this.currentId || this.switching) return false;
    this.killActive = false;
    // the outgoing weapon plays its own lower animation
    if (this.current.anim.holster) this.holsterT = 0;
    this.switching = true;
    this.switchT = 0;
    this.nextId = id;
    this.onSwitchMid = onMid || null;
    this.reloading = false;
    this.restHands();
    return true;
  }

  startReload(duration: number, onStage: (s: 0 | 1 | 2) => void) {
    if (this.reloading || this.switching) return false;
    this.killActive = false;
    this.reloading = true;
    this.reloadT = 0;
    this.reloadDur = duration;
    this.markHit = this.current.anim.marks.map(() => false);
    this.onReloadStage = onStage;
    return true;
  }

  cancelReload() {
    this.reloading = false;
    this.restHands();
  }

  /**
   * Fire the weapon-specific kill flourish. Returns false when the
   * weapon has no kill animation, or when a reload / weapon swap is
   * already playing (those always take priority over cosmetics).
   */
  triggerKillConfirm(): boolean {
    const anim = this.current.anim;
    if (!anim.killConfirm) return false;
    if (this.reloading || this.switching) return false;
    this.killT = 0;
    this.killDur = anim.killDur ?? 0.7;
    this.killActive = true;
    return true;
  }

  /** seconds the current weapon's kill flourish runs for */
  killConfirmDuration(): number {
    return this.current.anim.killDur ?? 0.7;
  }

  triggerRecoil(def: WeaponDef) {
    this.kickPos += def.kickZ * 3.2;
    this.kickRot += def.kickZ * 2.6;
    this.actionT = 1;
    // hand reacts with a trigger pull and a wrist flex scaled to the kick
    this.current.hands.animator.fire(THREE.MathUtils.clamp(def.kickZ * 9, 0.3, 1.3));
  }

  muzzleWorld(out: THREE.Vector3): THREE.Vector3 {
    return this.current.muzzle.getWorldPosition(out);
  }

  setAmmoRatio(r: number) {
    this.ammoRatio = THREE.MathUtils.clamp(r, 0, 1);
  }

  isScoped(def: WeaponDef): boolean {
    return def.scoped && this.adsBlend > 0.7;
  }

  /**
   * Gated by animation state ONLY — `visible` is deliberately not
   * consulted so a scoped sniper can still fire.
   */
  canFire(): boolean {
    return !this.reloading && !this.switching && this.sprintBlend < 0.55;
  }

  update(f: ArmsFrame, mouseDX: number, mouseDY: number) {
    const dt = Math.min(f.dt, 0.05);
    this.skinT += dt;
    const anim = this.current.anim;

    const sprintTarget = f.sprinting && f.speed > 2.5 && !f.adsHeld ? 1 : 0;
    this.sprintBlend += (sprintTarget - this.sprintBlend) * Math.min(1, dt * 7);
    const adsTarget = f.adsHeld && !f.scopedBlocked && !this.reloading && !this.switching && this.sprintBlend < 0.4 ? 1 : 0;
    // attachments change how fast the weapon comes up to the eye
    this.adsBlend += (adsTarget - this.adsBlend) * Math.min(1, dt * 9 * this.adsSpeedMul);

    this.swayRot.x += (-mouseDY * 0.0011 - this.swayRot.x) * Math.min(1, dt * 9);
    this.swayRot.y += (-mouseDX * 0.0016 - this.swayRot.y) * Math.min(1, dt * 9);
    this.swayPos.x += (-mouseDX * 0.00045 - this.swayPos.x) * Math.min(1, dt * 7);
    this.swayPos.y += (mouseDY * 0.0004 - this.swayPos.y) * Math.min(1, dt * 7);

    const speedN = Math.min(1, f.speed / 6);
    const targetAmp = f.grounded ? speedN : 0;
    this.bobAmp += (targetAmp - this.bobAmp) * Math.min(1, dt * 6);
    this.bobPhase += f.speed * dt * (f.sprinting ? 1.65 : 1.9);
    const adsDamp = 1 - this.adsBlend * 0.82;
    const sprintAmp = 1 + this.sprintBlend * 0.7;
    const bobX = Math.sin(this.bobPhase) * 0.0115 * this.bobAmp * adsDamp * sprintAmp;
    const bobY = Math.sin(this.bobPhase * 2) * 0.0072 * this.bobAmp * adsDamp * sprintAmp;

    this.kickPos += (0 - this.kickPos) * Math.min(1, dt * 11);
    this.kickRot += (0 - this.kickRot) * Math.min(1, dt * 9);
    if (this.actionT > 0) this.actionT = Math.max(0, this.actionT - dt * anim.actionRate);

    // ── per-weapon animation tracks ──
    const p = this._p;
    zeroPose(p);
    anim.idle(p, this.skinT, speedN, this.adsBlend);
    if (this.actionT > 0) anim.fire(p, this.actionT);

    // ── kill-confirm flourish (additive, non-blocking) ──
    if (this.killActive) {
      this.killT += dt;
      const kt = Math.min(1, this.killT / this.killDur);
      anim.killConfirm?.(p, kt);
      this.current.killFx?.(kt, dt);
      if (kt >= 1) {
        this.killActive = false;
        this.killT = 0;
      }
    }

    // ── ADS transition: report blend velocity to the weapon ──
    const adsVel = (this.adsBlend - this.prevAds) / Math.max(dt, 1e-4);
    this.prevAds = this.adsBlend;
    anim.adsTransition?.(p, this.adsBlend, THREE.MathUtils.clamp(adsVel, -12, 12));

    // ── raise / lower ──
    if (this.equipT >= 0) {
      this.equipT += dt;
      const d = anim.equipDur ?? 0.42;
      const t = Math.min(1, this.equipT / d);
      anim.equip?.(p, t);
      if (t >= 1) this.equipT = -1;
    }
    if (this.holsterT >= 0) {
      this.holsterT += dt;
      const d = anim.holsterDur ?? 0.24;
      const t = Math.min(1, this.holsterT / d);
      anim.holster?.(p, t);
      if (t >= 1) this.holsterT = -1;
    }

    if (this.reloading) {
      this.reloadT += dt;
      const t = Math.min(1, this.reloadT / this.reloadDur);
      anim.reload(p, t);
      const marks = anim.marks;
      for (let i = 0; i < marks.length; i++) {
        if (!this.markHit[i] && t >= marks[i].t) {
          this.markHit[i] = true;
          this.onReloadStage?.(marks[i].s);
        }
      }
      if (t >= 1) {
        this.reloading = false;
        this.restHands();
      }
    }

    // ── switch pose ──
    // Generic dip is a fallback: weapons that author their own
    // equip/holster tracks drive the whole motion themselves.
    let switchDip = 0, switchPitch = 0;
    const customSwap = !!(anim.equip || anim.holster);
    if (this.switching && !customSwap) {
      this.switchT += dt;
      const T = 0.42;
      const t = Math.min(1, this.switchT / T);
      if (t < 0.45) {
        const k = t / 0.45;
        switchDip = k * 0.34;
        switchPitch = k * 0.65;
      } else {
        if (this.nextId) {
          this.setModel(this.nextId);
          this.nextId = null;
          this.restHands();
          this.holsterT = -1;
          // the incoming weapon runs its own raise/ready
          if (this.current.anim.equip) this.equipT = 0;
          this.onSwitchMid?.();
          this.onSwitchMid = null;
        }
        const k = 1 - (t - 0.45) / 0.55;
        switchDip = k * 0.34;
        switchPitch = k * 0.65;
      }
      if (t >= 1) this.switching = false;
    } else if (this.switching) {
      this.switchT += dt;
      const T = 0.42;
      const t = Math.min(1, this.switchT / T);
      if (t >= 0.45 && this.nextId) {
        this.setModel(this.nextId);
        this.nextId = null;
        this.restHands();
        this.holsterT = -1;
        if (this.current.anim.equip) this.equipT = 0;
        this.onSwitchMid?.();
        this.onSwitchMid = null;
      }
      if (t >= 1) this.switching = false;
    }

    // ── hand rig: breathing, trigger, recoil, grip tightening ──
    const hands = this.current.hands;
    hands.animator.setAds(this.adsBlend);
    // the support hand leaves the weapon during the middle of a reload
    hands.animator.setLeftRelease(
      this.reloading ? Math.sin(Math.min(1, this.reloadT / this.reloadDur) * Math.PI) * 0.85 : 0
    );
    hands.animator.update(dt);
    hands.pose();

    // ── animated skin details ──
    this.current.animate?.(this.skinT, dt, this.ammoRatio, this.actionT);
    // ── skin flair (glow pulses, scrolling patterns, shimmer) ──
    if (this.activeSkin) {
      const t = this.skinTargets.get(this.currentId);
      if (t) animateSkin(t, this.activeSkin, this.skinT, this.actionT);
    }

    // ── compose ──
    const off = ADS_OFFSET[this.currentId];
    const adsPos = this._pos.copy(HIP_POS).lerp(ADS_POS, this.adsBlend);
    adsPos.addScaledVector(off, this.adsBlend);
    const spread = this.adsBlend;
    const animDamp = 1 - spread * 0.45; // aiming steadies the personality motion

    this.rig.position.set(
      adsPos.x + bobX + this.swayPos.x * (1 - spread * 0.8) + this.sprintBlend * 0.055 + p.px * animDamp,
      adsPos.y + bobY + this.swayPos.y * (1 - spread * 0.8) - switchDip - this.sprintBlend * 0.03 + p.py * animDamp,
      adsPos.z + this.kickPos * 0.4 + this.sprintBlend * 0.05 + p.pz * animDamp
    );
    this.rig.rotation.set(
      this.swayRot.x * (1 - spread * 0.75) + this.kickRot * 0.8 + switchPitch + this.sprintBlend * 0.42 + p.rx * animDamp,
      this.swayRot.y * (1 - spread * 0.75) - this.sprintBlend * 0.55 + p.ry * animDamp,
      this.sprintBlend * 0.3 + p.rz * animDamp
    );

    this.root.visible = this.visible;
  }
}
