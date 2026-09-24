// ─────────────────────────────────────────────────────────────
//  SNIPER VARIANTS — three complete, independent weapon systems.
//
//  Each variant owns its stats, its model, its material theme and
//  its full motion set (idle · equip · ADS · fire · bolt/reload ·
//  holster · kill-confirm). Nothing is shared between them: the
//  easing curves, frequencies, decay rates, travel distances and
//  mechanical beats are all authored per weapon so they feel
//  different in the hands.
//
//    LONGBOW MK VII  brushed gunmetal   · heavy anti-materiel bolt
//    VECTOR-7 DMR    carbon composite   · fast semi-auto marksman
//    OBSIDIAN VSS    matte tactical     · high-zoom suppressed
//
//  Adding a fourth variant = append one entry to SNIPER_VARIANTS.
// ─────────────────────────────────────────────────────────────

import * as THREE from "three";
import {
  B, C, tubeZ, hexZ, ringZ, addHands, eliasPlate,
  weaponPBR, pbrMaterial,
  seg, ease, easeOutHeavy, easeInSharp, pulse, damped, elastic,
  type WeaponAnim, type WeaponModel, type WeaponDef,
} from "./wpnkit";

/** a variant bundles its stats with the factory that builds it */
export interface SniperVariant {
  def: WeaponDef;
  build: () => WeaponModel;
  /** view-model shrink so it doesn't swamp the screen */
  viewScale: number;
  /** sight offset applied at full ADS, aligning the optic to the crosshair */
  adsOffset: THREE.Vector3;
}

// ═════════════════════════════════════════════════════════════
//  1 · LONGBOW MK VII
//  Brushed gunmetal anti-materiel rifle. Enormous, slow, brutal.
//  Straight-pull bolt, 3-port brake, folded bipod, skeleton stock.
//  Motion identity: HEAVY — long travel, low-frequency ring-out,
//  everything settles slowly under its own mass.
// ═════════════════════════════════════════════════════════════

function buildLongbow(): WeaponModel {
  const g = new THREE.Group();
  const pbr = weaponPBR("brushedGunmetal", 256, 4711);

  const steel = pbrMaterial(pbr, 2, { color: 0x9aa0a8 });
  const dark = pbrMaterial(pbr, 3, { color: 0x4e535a, roughness: 1.25 });
  const receiver = pbrMaterial(pbr, 1.4, { color: 0x8d939b });
  const rubber = new THREE.MeshStandardMaterial({ color: 0x14161a, metalness: 0.05, roughness: 0.95 });

  // ── receiver: squared, machined, massive ──
  g.add(B(0.088, 0.118, 0.56, receiver, 0, 0, 0.02));
  g.add(B(0.094, 0.03, 0.5, dark, 0, 0.07, 0.0));                 // dovetail rail
  for (let i = 0; i < 11; i++) g.add(B(0.026, 0.01, 0.014, steel, 0, 0.088, -0.2 + i * 0.042));
  // machined lightening cuts down the flank
  for (let i = 0; i < 3; i++) g.add(B(0.092, 0.036, 0.055, dark, 0, -0.024, -0.1 + i * 0.085));

  // ── heavy fluted barrel ──
  g.add(tubeZ(0.021, 0.025, 0.86, steel, 0, 0.014, -0.72));
  for (let i = 0; i < 6; i++) {
    g.add(hexZ(0.027, 0.02, dark, 0, 0.014, -0.4 - i * 0.11));      // flutes
  }
  // ── 3-port muzzle brake ──
  const brake = new THREE.Group();
  brake.add(tubeZ(0.042, 0.042, 0.15, steel, 0, 0, 0));
  for (let i = 0; i < 3; i++) {
    brake.add(B(0.094, 0.012, 0.022, dark, 0, 0.012, -0.05 + i * 0.042));
    brake.add(B(0.094, 0.012, 0.022, dark, 0, -0.012, -0.05 + i * 0.042));
  }
  brake.position.set(0, 0.014, -1.18);
  g.add(brake);

  // ── folded bipod under the forend ──
  for (const sx of [-1, 1]) {
    const leg = C(0.011, 0.008, 0.26, dark, sx * 0.03, -0.06, -0.52, 6);
    leg.rotation.set(1.32, 0, sx * 0.16);
    g.add(leg);
  }
  g.add(B(0.07, 0.03, 0.07, dark, 0, -0.046, -0.5));

  // ── scope: tall, big objective, canted 20-MOA rail ──
  const scope = new THREE.Group();
  scope.add(tubeZ(0.034, 0.034, 0.3, dark, 0, 0, 0));
  scope.add(tubeZ(0.046, 0.046, 0.05, steel, 0, 0, -0.16));        // objective bell
  scope.add(tubeZ(0.04, 0.04, 0.04, steel, 0, 0, 0.155));          // ocular
  const lensMat = new THREE.MeshStandardMaterial({
    color: 0x0a1420, emissive: 0x3c6f9c, emissiveIntensity: 0.9,
    metalness: 0.95, roughness: 0.06,
  });
  const lens = C(0.036, 0.036, 0.004, lensMat, 0, 0, -0.183, 16);
  lens.rotation.x = Math.PI / 2;
  scope.add(lens);
  const turret = C(0.021, 0.021, 0.03, steel, 0, 0.04, -0.02, 10);
  scope.add(turret);
  scope.add(C(0.019, 0.019, 0.026, steel, 0.036, 0.004, -0.02, 10));
  scope.children[scope.children.length - 1].rotation.z = Math.PI / 2;
  scope.position.set(0, 0.115, -0.03);
  scope.rotation.x = -0.012;                                        // canted rail
  g.add(scope);
  g.add(B(0.026, 0.05, 0.03, dark, 0, 0.082, -0.14));
  g.add(B(0.026, 0.05, 0.03, dark, 0, 0.082, 0.06));

  // ── straight-pull bolt with a big round knob ──
  const bolt = new THREE.Group();
  bolt.add(C(0.017, 0.017, 0.1, steel, 0.058, 0.036, 0.12, 10));
  bolt.children[0].rotation.z = Math.PI / 2;
  const knob = new THREE.Mesh(new THREE.SphereGeometry(0.026, 12, 10), steel);
  knob.position.set(0.108, 0.036, 0.12);
  bolt.add(knob);
  bolt.add(B(0.05, 0.05, 0.16, dark, 0.0, 0.036, 0.14));
  g.add(bolt);
  const boltHome = bolt.position.clone();

  // ── ejection port + chamber (glows after firing) ──
  const chamberMat = new THREE.MeshStandardMaterial({
    color: 0x1a1410, emissive: 0xff5a12, emissiveIntensity: 0.0,
    metalness: 0.8, roughness: 0.45,
  });
  g.add(B(0.092, 0.05, 0.11, chamberMat, 0, 0.014, 0.1));
  const port = B(0.006, 0.042, 0.1, chamberMat, 0.047, 0.014, 0.1);
  g.add(port);

  // ── detachable box magazine ──
  const mag = new THREE.Group();
  mag.add(B(0.06, 0.15, 0.11, dark, 0, 0, 0));
  mag.add(B(0.064, 0.02, 0.114, steel, 0, -0.082, 0));
  mag.position.set(0, -0.12, -0.02);
  g.add(mag);
  const magHome = mag.position.clone();

  // ── skeletonised stock ──
  g.add(B(0.07, 0.11, 0.3, receiver, 0, -0.01, 0.36));
  for (let i = 0; i < 3; i++) g.add(B(0.074, 0.05, 0.05, dark, 0, -0.01, 0.28 + i * 0.07));
  g.add(B(0.04, 0.06, 0.14, steel, 0, 0.062, 0.34));                // cheek riser
  g.add(B(0.076, 0.03, 0.1, rubber, 0, -0.062, 0.48));              // recoil pad
  g.add(B(0.056, 0.13, 0.06, dark, 0, -0.11, 0.14));                // grip
  g.add(B(0.05, 0.02, 0.08, rubber, 0, -0.175, 0.15));

  const plate = eliasPlate(0.18, 0.05, "#e6e2d6", "#ffffff", 0x9fb6cc);
  plate.mesh.position.set(0.046, -0.03, 0.24);
  g.add(plate.mesh);

  const hands = addHands(g, new THREE.Vector3(0, -0.115, 0.16), new THREE.Vector3(0, -0.075, -0.4), {
    // LONGBOW: heavy rifle, wide forend, deliberate deep grip
    rightGrip: { kind: "pistol", radius: 0.028 },
    leftGrip: { kind: "foregrip", radius: 0.034 },
  });
  const spare = B(0.06, 0.15, 0.11, dark, 0, -0.08, 0);
  hands.carried.add(spare);

  const muzzle = new THREE.Object3D();
  muzzle.position.set(0, 0.014, -1.27);
  g.add(muzzle);
  // optical axis: centre of the scope tube
  const sight = new THREE.Object3D();
  sight.position.set(0, 0.115, -0.03);
  g.add(sight);

  // ── mechanical state ──
  let boltBack = 0;     // 0..1 bolt travel
  let boltLift = 0;
  let chamberHeat = 0;

  const anim: WeaponAnim = {
    marks: [{ t: 0.2, s: 0 }, { t: 0.5, s: 1 }, { t: 0.84, s: 2 }],
    actionRate: 1.45,          // slowest action in the game
    killDur: 0.66,
    equipDur: 0.62,
    holsterDur: 0.3,

    idle(p, t, speedN, ads) {
      // slow, muzzle-heavy drift — the weight is always felt
      const a = (1 - ads * 0.9) * (1 - speedN * 0.45);
      p.px += Math.sin(t * 0.31) * 0.0046 * a;
      p.py += Math.sin(t * 0.43 + 1.1) * 0.0037 * a - 0.0012 * a;   // droop
      p.rx += Math.sin(t * 0.37) * 0.0115 * a + 0.004 * a;
      p.ry += Math.sin(t * 0.24) * 0.0138 * a;
      p.rz += Math.sin(t * 0.19) * 0.008 * a;
      // held-breath tremor only once the scope is up
      p.rx += Math.sin(t * 7.1) * 0.0005 * ads;
    },

    fire(p, k) {
      // huge straight-back shove; slow low-frequency ring-out
      const shove = easeOutHeavy(1 - k);
      p.pz += k * 0.155;
      p.rx += k * 0.36 + damped(1 - k, 2.1, 3.2) * k * 0.06;
      p.rz += k * 0.05;
      p.py += k * 0.02;
      p.px -= k * 0.012;
      // the bolt does NOT move on fire — this is a manual straight-pull
      chamberHeat = Math.max(chamberHeat, k);
      void shove;
    },

    reload(p, t) {
      // 1 · break the rifle down out of the shoulder (slow, two-handed)
      const down = easeOutHeavy(seg(t, 0, 0.2)) - ease(seg(t, 0.85, 1));
      p.py -= 0.115 * down;
      p.rz += 0.5 * down;
      p.ry -= 0.4 * down;
      p.rx += 0.24 * down;

      // 2 · straight-pull bolt yanked fully to the rear
      boltBack = Math.max(boltBack, easeInSharp(seg(t, 0.1, 0.24)) - ease(seg(t, 0.66, 0.8)));
      boltLift = Math.max(boltLift, seg(t, 0.06, 0.14) - seg(t, 0.78, 0.86));

      // 3 · magazine drops under its own weight, new one rammed home
      const out = seg(t, 0.26, 0.42);
      const inn = seg(t, 0.5, 0.7);
      if (t < 0.5) {
        mag.position.y = magHome.y - easeOutHeavy(out) * 0.34;
        mag.rotation.x = out * 0.5;
        mag.visible = out < 0.98;
      } else {
        mag.visible = true;
        mag.rotation.x = 0;
        mag.position.y = magHome.y - 0.34 * (1 - ease(inn));
      }
      hands.carried.visible = t > 0.44 && t < 0.68;

      const dive = seg(t, 0.24, 0.46);
      const rise = seg(t, 0.48, 0.7);
      hands.left.position.set(
        hands.leftHome.x,
        hands.leftHome.y - 0.36 * easeOutHeavy(dive) + 0.36 * ease(rise),
        hands.leftHome.z + 0.4 * easeOutHeavy(dive) - 0.4 * ease(rise)
      );
      hands.left.rotation.set(-0.6 * ease(dive) + 0.6 * ease(rise), 0, 0);
      // heavy thump as the magazine seats
      p.py -= pulse(t, 0.66, 0.74) * 0.02;
      p.rx -= pulse(t, 0.66, 0.74) * 0.05;

      // 4 · bolt driven forward, shoulder it again
      p.pz += pulse(t, 0.78, 0.9) * 0.05;
      p.rx -= pulse(t, 0.86, 1) * 0.08;
    },

    equip(p, t) {
      // swung up from low-ready; the mass overshoots then settles
      const k = easeOutHeavy(t);
      p.py -= (1 - k) * 0.26;
      p.pz += (1 - k) * 0.12;
      p.rx += (1 - k) * 0.72 - damped(t, 1.6, 5) * (1 - t) * 0.09;
      p.rz += (1 - k) * 0.5;
      p.ry += (1 - k) * 0.3;
      boltLift = Math.max(boltLift, pulse(t, 0.4, 0.7) * 0.3);
    },

    holster(p, t) {
      const k = easeInSharp(t);
      p.py -= k * 0.3;
      p.rx += k * 0.8;
      p.rz += k * 0.42;
      p.pz += k * 0.06;
    },

    adsTransition(p, blend, vel) {
      // the barrel lags as this much weight is dragged onto the eye
      p.pz -= vel * 0.016;
      p.rx += vel * 0.05;
      p.py -= Math.sin(blend * Math.PI) * 0.008;
    },

    // ── KILL CONFIRM: bolt-cycle flourish ──
    // Rip the bolt, hold the beat while the case clears, slam it
    // home. The whole rifle rocks with the mass of the action.
    killConfirm(p, t) {
      const rip = easeInSharp(seg(t, 0.0, 0.22));       // snatch it back
      const hold = seg(t, 0.22, 0.46);                   // case in the air
      const slam = elastic(seg(t, 0.46, 0.8), 2.4, 7);   // drive it forward
      boltBack = Math.max(boltBack, rip - slam * 0.98);
      boltLift = Math.max(boltLift, seg(t, 0, 0.12) - seg(t, 0.72, 0.86));

      // the rifle rolls into the operator as the bolt is worked
      p.rz += rip * 0.2 - slam * 0.13;
      p.ry -= rip * 0.12;
      p.rx += rip * 0.1 - slam * 0.16;
      p.px += rip * 0.02;
      p.pz += rip * 0.03;
      // a final settling thump once the bolt is closed
      p.rx += pulse(t, 0.8, 1) * 0.055;
      p.py -= pulse(t, 0.8, 1) * 0.012;
      void hold;
      chamberHeat = Math.max(chamberHeat, 1 - seg(t, 0.3, 1));
    },
  };

  return {
    group: g, muzzle, sight, hands, anim,
    animate: (t, dt, ammo, heat) => {
      // bolt travel is authoritative on the mesh
      bolt.position.z = boltHome.z + boltBack * 0.16;
      bolt.position.y = boltHome.y + boltLift * 0.03;
      boltBack = Math.max(0, boltBack - dt * 2.6);
      boltLift = Math.max(0, boltLift - dt * 3);
      chamberHeat = Math.max(0, chamberHeat - dt * 1.1);
      chamberMat.emissiveIntensity = chamberHeat * 2.6 + heat * 1.4;
      lensMat.emissiveIntensity = 0.7 + Math.sin(t * 1.9) * 0.22;
      turret.rotation.y = t * 0.22;
      plate.mat.emissiveIntensity = 0.38 + Math.sin(t * 1.5) * 0.14 + heat * 0.5;
      void ammo;
    },
    killFx: (t) => {
      // white-hot chamber flare that cools across the flourish
      chamberHeat = Math.max(chamberHeat, 1.6 * (1 - ease(seg(t, 0.15, 1))));
    },
  };
}

// ═════════════════════════════════════════════════════════════
//  2 · VECTOR-7 DMR
//  Carbon-fibre composite semi-auto marksman rifle. Light, fast,
//  low-power prism optic (no scope blackout — you keep the model
//  on screen while zoomed). Motion identity: SNAPPY — short
//  travel, high-frequency ring, immediate recovery.
// ═════════════════════════════════════════════════════════════

function buildVector(): WeaponModel {
  const g = new THREE.Group();
  const pbr = weaponPBR("carbonFiber", 256, 8123);

  const weave = pbrMaterial(pbr, 2.6, { color: 0xb9c2c8 });
  const weaveFine = pbrMaterial(pbr, 4.5, { color: 0x9aa4ab });
  const alloy = new THREE.MeshStandardMaterial({ color: 0x2c3138, metalness: 0.88, roughness: 0.32 });
  const accent = new THREE.MeshStandardMaterial({ color: 0x1f6b52, metalness: 0.6, roughness: 0.4 });
  const poly = new THREE.MeshStandardMaterial({ color: 0x111417, metalness: 0.08, roughness: 0.9 });

  // ── angular chassis: faceted, not a plain box ──
  g.add(B(0.07, 0.096, 0.42, weave, 0, 0, 0.02));
  const chamfer = B(0.05, 0.05, 0.42, weave, 0, 0.048, 0.02);
  chamfer.rotation.z = Math.PI / 4;
  g.add(chamfer);
  g.add(B(0.074, 0.022, 0.34, alloy, 0, 0.062, 0.0));               // top rail
  for (let i = 0; i < 8; i++) g.add(B(0.02, 0.008, 0.011, accent, 0, 0.076, -0.13 + i * 0.038));

  // ── slim barrel + compact 4-port compensator ──
  g.add(tubeZ(0.013, 0.015, 0.44, alloy, 0, 0.01, -0.4));
  const comp = new THREE.Group();
  comp.add(tubeZ(0.024, 0.024, 0.08, alloy, 0, 0, 0));
  for (let i = 0; i < 4; i++) comp.add(B(0.05, 0.006, 0.008, accent, 0, 0.014, -0.026 + i * 0.018));
  comp.position.set(0, 0.01, -0.64);
  g.add(comp);
  // carbon handguard with lightening slots
  g.add(B(0.058, 0.058, 0.3, weaveFine, 0, -0.004, -0.34));
  for (let i = 0; i < 4; i++) {
    g.add(B(0.062, 0.016, 0.03, poly, 0, 0.012, -0.44 + i * 0.058));
    g.add(B(0.062, 0.016, 0.03, poly, 0, -0.02, -0.44 + i * 0.058));
  }
  g.add(ringZ(0.031, 0.005, accent, 0, -0.004, -0.2));

  // ── low-profile prism optic (stays visible while zoomed) ──
  const optic = new THREE.Group();
  optic.add(B(0.05, 0.052, 0.14, weaveFine, 0, 0, 0));
  optic.add(B(0.056, 0.014, 0.15, accent, 0, 0.032, 0));
  const glassMat = new THREE.MeshStandardMaterial({
    color: 0x0d1a16, emissive: 0x2ad39a, emissiveIntensity: 1.0,
    metalness: 0.9, roughness: 0.08, transparent: true, opacity: 0.86,
  });
  optic.add(B(0.038, 0.04, 0.005, glassMat, 0, 0, -0.073));
  // floating chevron reticle
  const reticleMat = new THREE.MeshStandardMaterial({
    color: 0x061410, emissive: 0x35ffbe, emissiveIntensity: 3.4,
  });
  optic.add(B(0.012, 0.0035, 0.004, reticleMat, 0, 0.002, -0.077));
  optic.add(B(0.0035, 0.01, 0.004, reticleMat, 0, -0.005, -0.077));
  optic.position.set(0, 0.088, -0.05);
  g.add(optic);

  // ── side charging handle (the signature moving part) ──
  const charge = new THREE.Group();
  charge.add(B(0.05, 0.016, 0.03, alloy, -0.052, 0.03, 0.1));
  charge.add(B(0.018, 0.03, 0.05, alloy, -0.07, 0.03, 0.1));
  g.add(charge);
  const chargeHome = charge.position.clone();

  // ── curved 20-round magazine ──
  const mag = new THREE.Group();
  mag.add(B(0.042, 0.17, 0.072, weaveFine, 0, 0, 0));
  mag.add(B(0.046, 0.03, 0.076, accent, 0, -0.088, 0.004));
  mag.rotation.x = 0.13;
  mag.position.set(0, -0.13, -0.01);
  g.add(mag);
  const magHome = mag.position.clone();

  // ── adjustable tube stock + angled foregrip ──
  g.add(tubeZ(0.02, 0.02, 0.24, alloy, 0, 0.0, 0.34));
  g.add(B(0.062, 0.086, 0.12, weave, 0, -0.006, 0.4));
  g.add(B(0.03, 0.05, 0.1, weaveFine, 0, 0.05, 0.36));              // cheek weld
  g.add(B(0.066, 0.024, 0.05, poly, 0, -0.056, 0.46));
  g.add(B(0.05, 0.1, 0.05, weaveFine, 0, -0.086, 0.12));            // grip
  const fore = B(0.032, 0.086, 0.034, weaveFine, 0, -0.068, -0.3);  // angled foregrip
  fore.rotation.x = -0.34;
  g.add(fore);

  // ── round counter strip on the flank ──
  const counterMats: THREE.MeshStandardMaterial[] = [];
  for (let i = 0; i < 5; i++) {
    const cm = new THREE.MeshStandardMaterial({
      color: 0x08120f, emissive: 0x2ad39a, emissiveIntensity: 1.6, roughness: 0.3,
    });
    g.add(B(0.004, 0.012, 0.026, cm, -0.036, 0.014, -0.04 + i * 0.034));
    counterMats.push(cm);
  }

  const plate = eliasPlate(0.13, 0.04, "#c8f5e4", "#ffffff", 0x2ad39a);
  plate.mesh.position.set(0.037, -0.026, 0.14);
  g.add(plate.mesh);

  const hands = addHands(g, new THREE.Vector3(0, -0.1, 0.13), new THREE.Vector3(0, -0.072, -0.3), {
    // VECTOR: carbon handguard with an angled foregrip
    rightGrip: { kind: "pistol", radius: 0.025 },
    leftGrip: { kind: "vertical", radius: 0.019 },
  });
  const spare = B(0.042, 0.17, 0.072, poly, 0, -0.09, 0);
  hands.carried.add(spare);

  const muzzle = new THREE.Object3D();
  muzzle.position.set(0, 0.01, -0.7);
  g.add(muzzle);
  // optical axis: the prism reticle itself
  const sight = new THREE.Object3D();
  sight.position.set(0, 0.09, -0.123);
  g.add(sight);

  // ── mechanical state ──
  let chargePull = 0;
  let confirmFlash = 0;
  let boltCycle = 0;

  const anim: WeaponAnim = {
    marks: [{ t: 0.12, s: 0 }, { t: 0.44, s: 1 }, { t: 0.74, s: 2 }],
    actionRate: 6.2,           // gas-operated: cycles almost instantly
    killDur: 0.42,             // shortest flourish — keeps pace with the rifle
    equipDur: 0.3,
    holsterDur: 0.18,

    idle(p, t, speedN, ads) {
      // light and alert: quick, small, high-frequency figure-8
      const a = (1 - ads * 0.86) * (1 - speedN * 0.35);
      p.px += Math.sin(t * 1.45) * 0.0026 * a;
      p.py += Math.sin(t * 2.3 + 0.7) * 0.002 * a;
      p.rx += Math.sin(t * 1.7) * 0.0072 * a;
      p.ry += Math.sin(t * 1.1) * 0.0095 * a + Math.sin(t * 3.9) * 0.0016 * a;
      p.rz += Math.sin(t * 0.9) * 0.004 * a;
    },

    fire(p, k) {
      // short sharp impulse, high-frequency ring, instant recovery
      p.pz += k * 0.042;
      p.rx += k * 0.105 + damped(1 - k, 9.5, 15) * k * 0.03;
      p.ry += damped(1 - k, 7, 12) * k * 0.014;
      p.rz -= k * 0.016;
      boltCycle = Math.max(boltCycle, Math.sin(Math.min(1, (1 - k) * 2.4) * Math.PI));
    },

    reload(p, t) {
      // brisk, economical — no wasted motion
      const down = ease(seg(t, 0, 0.1)) - ease(seg(t, 0.84, 1));
      p.py -= 0.06 * down;
      p.rz += 0.42 * down;
      p.ry -= 0.26 * down;

      const out = seg(t, 0.08, 0.2);
      const inn = seg(t, 0.32, 0.48);
      if (t < 0.32) {
        mag.position.y = magHome.y - easeInSharp(out) * 0.3;
        mag.rotation.z = out * 0.42;
        mag.visible = out < 0.96;
      } else {
        mag.visible = true;
        mag.rotation.z = 0;
        // slammed in with a hard overshoot
        mag.position.y = magHome.y - 0.3 * (1 - elastic(inn, 2.2, 9));
      }
      hands.carried.visible = t > 0.24 && t < 0.5;

      const dive = seg(t, 0.04, 0.26);
      const rise = seg(t, 0.28, 0.48);
      const toCharge = seg(t, 0.52, 0.66);
      const back = seg(t, 0.72, 0.9);
      hands.left.position.set(
        hands.leftHome.x - 0.05 * ease(toCharge) * (1 - back),
        hands.leftHome.y - 0.28 * easeInSharp(dive) + 0.28 * ease(rise) + 0.1 * ease(toCharge) * (1 - back),
        hands.leftHome.z + 0.28 * easeInSharp(dive) - 0.28 * ease(rise) + 0.2 * ease(toCharge) * (1 - back)
      );
      hands.left.rotation.set(-0.45 * ease(dive) + 0.45 * ease(rise), 0, 0);

      p.py -= pulse(t, 0.46, 0.54) * 0.016;
      // charging handle raked back and released
      chargePull = Math.max(chargePull, pulse(t, 0.58, 0.72));
      p.pz += pulse(t, 0.58, 0.72) * 0.02;
      p.rx -= pulse(t, 0.86, 1) * 0.045;
    },

    equip(p, t) {
      // flicked up fast — light weapon, crisp settle
      const k = elastic(t, 1.6, 8);
      p.py -= (1 - k) * 0.16;
      p.rx += (1 - k) * 0.46;
      p.rz += (1 - k) * 0.34;
      p.ry -= (1 - k) * 0.2;
      chargePull = Math.max(chargePull, pulse(t, 0.15, 0.5) * 0.6);
    },

    holster(p, t) {
      const k = easeInSharp(t);
      p.py -= k * 0.2;
      p.rx += k * 0.55;
      p.rz += k * 0.3;
    },

    adsTransition(p, blend, vel) {
      // barely any lag — it snaps to the eye
      p.pz -= vel * 0.005;
      p.rx += vel * 0.018;
      p.px += Math.sin(blend * Math.PI) * 0.004;
    },

    // ── KILL CONFIRM: digital confirm ──
    // Charging handle snaps, the prism flashes its confirm glyph
    // and the rifle rolls once, crisply, back on target.
    killConfirm(p, t) {
      const snap = pulse(t, 0.0, 0.34);
      chargePull = Math.max(chargePull, snap);
      confirmFlash = Math.max(confirmFlash, 1 - ease(seg(t, 0.05, 0.9)));

      // tight roll-and-recover — reads as a nod of acknowledgement
      const roll = Math.sin(seg(t, 0, 1) * Math.PI * 2) * (1 - t * 0.5);
      p.rz += roll * 0.16;
      p.ry += Math.sin(seg(t, 0, 1) * Math.PI) * 0.05;
      p.rx -= pulse(t, 0.0, 0.3) * 0.075;
      p.pz += pulse(t, 0.0, 0.24) * 0.025;
      p.py += pulse(t, 0.3, 0.8) * 0.008;
    },
  };

  return {
    group: g, muzzle, sight, hands, anim,
    animate: (t, dt, ammo, heat) => {
      charge.position.z = chargeHome.z + chargePull * 0.055 + boltCycle * 0.03;
      chargePull = Math.max(0, chargePull - dt * 6);
      boltCycle = Math.max(0, boltCycle - dt * 7);
      confirmFlash = Math.max(0, confirmFlash - dt * 2.6);

      glassMat.emissiveIntensity = 0.8 + Math.sin(t * 2.4) * 0.2 + confirmFlash * 3.5;
      // reticle blazes on a confirmed kill, then settles
      reticleMat.emissiveIntensity = 3.0 + Math.sin(t * 8) * 0.5 + confirmFlash * 9;
      reticleMat.emissive.setHex(confirmFlash > 0.25 ? 0xff4d3a : 0x35ffbe);

      const lit = ammo * counterMats.length;
      for (let i = 0; i < counterMats.length; i++) {
        const on = lit > i + 0.3;
        const low = ammo < 0.25;
        counterMats[i].emissive.setHex(low ? 0xff5230 : 0x2ad39a);
        counterMats[i].emissiveIntensity = on ? (low ? 1.5 + Math.sin(t * 13) * 1 : 1.7) : 0.05;
      }
      plate.mat.emissiveIntensity = 0.42 + Math.sin(t * 2.5) * 0.16 + heat * 0.4 + confirmFlash * 1.2;
    },
    killFx: (t) => {
      confirmFlash = Math.max(confirmFlash, 1 - ease(seg(t, 0.1, 0.95)));
    },
  };
}

// ═════════════════════════════════════════════════════════════
//  3 · OBSIDIAN VSS
//  Matte tactical precision rifle with an integral suppressor and
//  fully exposed mechanics — visible recoil springs, guide rods
//  and a reciprocating bolt carrier riding open rails.
//  Motion identity: GLIDING — straight-line travel, minimal muzzle
//  rise, everything moves on rails with a mechanical mid-frequency
//  clack.
// ═════════════════════════════════════════════════════════════

function buildObsidian(): WeaponModel {
  const g = new THREE.Group();
  const pbr = weaponPBR("matteTactical", 256, 3391);

  const matte = pbrMaterial(pbr, 2.2, { color: 0x8e949c });
  const matteFine = pbrMaterial(pbr, 3.6, { color: 0x767c84 });
  const steel = new THREE.MeshStandardMaterial({ color: 0x9ba3ac, metalness: 0.96, roughness: 0.22 });
  const oiled = new THREE.MeshStandardMaterial({ color: 0x33383f, metalness: 0.9, roughness: 0.28 });
  const poly = new THREE.MeshStandardMaterial({ color: 0x0d0f12, metalness: 0.05, roughness: 0.94 });

  // ── skeletonised chassis with the internals on show ──
  g.add(B(0.072, 0.05, 0.5, matte, 0, -0.032, 0.0));                // lower spine
  g.add(B(0.076, 0.016, 0.46, matteFine, 0, 0.056, 0.0));           // upper rail bridge
  for (const sx of [-1, 1]) {
    g.add(B(0.008, 0.07, 0.46, matteFine, sx * 0.036, 0.014, 0.0)); // side plates
    // cut-outs revealing the action
    for (let i = 0; i < 3; i++) g.add(B(0.012, 0.03, 0.06, poly, sx * 0.036, 0.014, -0.12 + i * 0.11));
  }

  // ── EXPOSED MECHANICS: twin guide rods + recoil springs ──
  const springs: THREE.Mesh[] = [];
  for (const sx of [-1, 1]) {
    g.add(tubeZ(0.005, 0.005, 0.34, steel, sx * 0.022, 0.034, 0.06));  // guide rod
    // coil spring rendered as stacked rings so compression is visible
    for (let i = 0; i < 6; i++) {
      const coil = ringZ(0.0105, 0.0028, steel, sx * 0.022, 0.034, -0.05 + i * 0.042, 4, 9);
      springs.push(coil);
      g.add(coil);
    }
  }
  // reciprocating bolt carrier riding the open rails
  const carrier = new THREE.Group();
  carrier.add(B(0.056, 0.03, 0.13, oiled, 0, 0.034, 0));
  carrier.add(B(0.064, 0.012, 0.05, steel, 0, 0.05, 0.01));
  carrier.add(C(0.012, 0.012, 0.06, steel, 0.038, 0.034, 0.02, 8));
  carrier.children[2].rotation.z = Math.PI / 2;
  carrier.position.set(0, 0, 0.12);
  g.add(carrier);
  const carrierHome = carrier.position.clone();

  // ── integral suppressor: fat shroud over most of the barrel ──
  g.add(tubeZ(0.038, 0.04, 0.62, matteFine, 0, 0.006, -0.52));
  for (let i = 0; i < 7; i++) {
    g.add(ringZ(0.041, 0.004, oiled, 0, 0.006, -0.28 - i * 0.085, 4, 10)); // baffle collars
  }
  // heat-bleed slots that glow as the can warms
  const heatMats: THREE.MeshStandardMaterial[] = [];
  for (let i = 0; i < 4; i++) {
    const hm = new THREE.MeshStandardMaterial({
      color: 0x120c08, emissive: 0xff6a1e, emissiveIntensity: 0, roughness: 0.6,
    });
    g.add(B(0.07, 0.006, 0.05, hm, 0, 0.042, -0.34 - i * 0.12));
    heatMats.push(hm);
  }
  g.add(tubeZ(0.02, 0.02, 0.1, steel, 0, 0.006, -0.85));

  // ── long precision scope with sunshade + external turrets ──
  const scope = new THREE.Group();
  scope.add(tubeZ(0.03, 0.03, 0.4, oiled, 0, 0, 0));
  scope.add(tubeZ(0.038, 0.038, 0.11, matteFine, 0, 0, -0.24));       // sunshade
  scope.add(tubeZ(0.036, 0.036, 0.05, oiled, 0, 0, 0.21));
  const lensMat = new THREE.MeshStandardMaterial({
    color: 0x07121c, emissive: 0x5f9dd8, emissiveIntensity: 1.2,
    metalness: 0.95, roughness: 0.05,
  });
  const lens = C(0.03, 0.03, 0.004, lensMat, 0, 0, -0.293, 16);
  lens.rotation.x = Math.PI / 2;
  scope.add(lens);
  const elevTurret = C(0.023, 0.023, 0.038, steel, 0, 0.042, -0.02, 12);
  scope.add(elevTurret);
  const windTurret = C(0.02, 0.02, 0.032, steel, 0.04, 0.002, -0.02, 12);
  windTurret.rotation.z = Math.PI / 2;
  scope.add(windTurret);
  scope.add(C(0.018, 0.018, 0.026, steel, 0, -0.038, -0.02, 10));     // parallax
  scope.position.set(0, 0.125, -0.02);
  g.add(scope);
  g.add(B(0.024, 0.06, 0.028, matteFine, 0, 0.086, -0.16));
  g.add(B(0.024, 0.06, 0.028, matteFine, 0, 0.086, 0.09));

  // ── rail glow strips (pulse down the length on a confirm) ──
  const railMats: THREE.MeshStandardMaterial[] = [];
  for (let i = 0; i < 6; i++) {
    const rm = new THREE.MeshStandardMaterial({
      color: 0x05090d, emissive: 0x4fb4ff, emissiveIntensity: 0.5, roughness: 0.35,
    });
    g.add(B(0.004, 0.008, 0.05, rm, -0.041, 0.03, -0.16 + i * 0.062));
    g.add(B(0.004, 0.008, 0.05, rm, 0.041, 0.03, -0.16 + i * 0.062));
    railMats.push(rm);
  }

  // ── straight box magazine ──
  const mag = new THREE.Group();
  mag.add(B(0.048, 0.14, 0.086, poly, 0, 0, 0));
  mag.add(B(0.052, 0.016, 0.09, matteFine, 0, -0.077, 0));
  mag.position.set(0, -0.115, 0.0);
  g.add(mag);
  const magHome = mag.position.clone();

  // ── frame stock + grip ──
  g.add(B(0.062, 0.09, 0.26, matte, 0, -0.02, 0.34));
  g.add(B(0.066, 0.03, 0.06, poly, 0, -0.062, 0.45));
  g.add(B(0.032, 0.05, 0.11, matteFine, 0, 0.042, 0.32));
  for (let i = 0; i < 2; i++) g.add(B(0.066, 0.04, 0.04, poly, 0, -0.02, 0.29 + i * 0.08));
  g.add(B(0.05, 0.115, 0.055, poly, 0, -0.098, 0.12));

  const plate = eliasPlate(0.15, 0.044, "#cfe2f2", "#ffffff", 0x4fb4ff);
  plate.mesh.position.set(0.041, -0.052, 0.2);
  g.add(plate.mesh);

  const hands = addHands(g, new THREE.Vector3(0, -0.108, 0.14), new THREE.Vector3(0, -0.07, -0.32), {
    // OBSIDIAN: fat integral suppressor forces the hand open
    rightGrip: { kind: "pistol", radius: 0.026 },
    leftGrip: { kind: "foregrip", radius: 0.040 },
  });
  const spare = B(0.048, 0.14, 0.086, poly, 0, -0.075, 0);
  hands.carried.add(spare);

  const muzzle = new THREE.Object3D();
  muzzle.position.set(0, 0.006, -0.92);
  g.add(muzzle);
  // optical axis: centre of the long scope tube
  const sight = new THREE.Object3D();
  sight.position.set(0, 0.125, -0.02);
  g.add(sight);

  // ── mechanical state ──
  let carrierBack = 0;
  let railPulse = -1;      // <0 = idle; 0..1 = travelling wave position
  let canHeat = 0;
  let spinT = 0;

  const anim: WeaponAnim = {
    marks: [{ t: 0.16, s: 0 }, { t: 0.48, s: 1 }, { t: 0.8, s: 2 }],
    actionRate: 2.9,
    killDur: 0.55,
    equipDur: 0.46,
    holsterDur: 0.24,

    idle(p, t, speedN, ads) {
      // machine-steady: a slow glide with a faint mechanical tick
      const a = (1 - ads * 0.95) * (1 - speedN * 0.5);
      p.px += Math.sin(t * 0.52) * 0.0031 * a;
      p.py += Math.sin(t * 0.68 + 0.5) * 0.0024 * a;
      p.rx += Math.sin(t * 0.61) * 0.0068 * a;
      p.ry += Math.sin(t * 0.4) * 0.0092 * a;
      // servo tick — this weapon never fully relaxes
      p.rz += Math.sin(t * 5.4) * 0.0009 * a;
      p.rx += Math.sin(t * 11.3) * 0.0004 * ads;
    },

    fire(p, k) {
      // suppressed: the impulse goes straight back, almost no rise
      p.pz += k * 0.088;
      p.rx += k * 0.135 + damped(1 - k, 5.2, 8) * k * 0.022;
      p.py += k * 0.006;
      p.rz += damped(1 - k, 4.4, 9) * k * 0.012;
      carrierBack = Math.max(carrierBack, Math.sin(Math.min(1, (1 - k) * 1.9) * Math.PI));
      canHeat = Math.max(canHeat, k);
    },

    reload(p, t) {
      const down = ease(seg(t, 0, 0.14)) - ease(seg(t, 0.86, 1));
      p.py -= 0.085 * down;
      p.rz += 0.46 * down;
      p.ry -= 0.32 * down;
      p.rx += 0.16 * down;

      // carrier locked to the rear for the whole magazine change
      carrierBack = Math.max(carrierBack, ease(seg(t, 0.06, 0.16)) - ease(seg(t, 0.76, 0.88)));

      const out = seg(t, 0.2, 0.36);
      const inn = seg(t, 0.44, 0.62);
      if (t < 0.44) {
        mag.position.y = magHome.y - ease(out) * 0.3;
        mag.rotation.x = out * 0.28;
        mag.visible = out < 0.97;
      } else {
        mag.visible = true;
        mag.rotation.x = 0;
        mag.position.y = magHome.y - 0.3 * (1 - ease(inn));
      }
      hands.carried.visible = t > 0.36 && t < 0.62;

      const dive = seg(t, 0.16, 0.4);
      const rise = seg(t, 0.42, 0.62);
      hands.left.position.set(
        hands.leftHome.x,
        hands.leftHome.y - 0.3 * ease(dive) + 0.3 * ease(rise),
        hands.leftHome.z + 0.32 * ease(dive) - 0.32 * ease(rise)
      );
      hands.left.rotation.set(-0.5 * ease(dive) + 0.5 * ease(rise), 0, 0);

      p.py -= pulse(t, 0.6, 0.68) * 0.014;
      // bolt release paddle — carrier glides forward on the rails
      p.pz += pulse(t, 0.78, 0.9) * 0.03;
      p.rx -= pulse(t, 0.88, 1) * 0.05;
      railPulse = Math.max(railPulse, seg(t, 0.8, 1));
    },

    equip(p, t) {
      // presented level, gliding onto the line — no flourish
      const k = ease(t);
      p.py -= (1 - k) * 0.2;
      p.pz -= (1 - k) * 0.06;
      p.rx += (1 - k) * 0.54;
      p.rz += (1 - k) * 0.28;
      p.ry += (1 - k) * 0.34;
      carrierBack = Math.max(carrierBack, pulse(t, 0.2, 0.62) * 0.55);
      railPulse = Math.max(railPulse, seg(t, 0.3, 1));
    },

    holster(p, t) {
      const k = ease(t);
      p.py -= k * 0.24;
      p.rx += k * 0.62;
      p.rz += k * 0.36;
      p.ry -= k * 0.12;
    },

    adsTransition(p, blend, vel) {
      // rides up on rails: pure translation, no roll
      p.pz -= vel * 0.01;
      p.py += vel * 0.012;
      p.rx += vel * 0.026;
      void blend;
    },

    // ── KILL CONFIRM: precision spin ──
    // The rifle rolls a full turn about the bore axis while a charge
    // pulse runs down the exposed rails and the carrier cycles once.
    killConfirm(p, t) {
      const spin = easeOutHeavy(seg(t, 0.02, 0.72));
      spinT = spin;
      p.rz += spin * Math.PI * 2;                    // one clean revolution
      // slight lift and settle so the spin has weight
      p.py += Math.sin(seg(t, 0, 0.8) * Math.PI) * 0.032;
      p.pz += Math.sin(seg(t, 0, 0.55) * Math.PI) * 0.03;
      p.rx -= pulse(t, 0.0, 0.3) * 0.06;
      p.rx += pulse(t, 0.72, 1) * 0.04;              // catch it at the end
      carrierBack = Math.max(carrierBack, pulse(t, 0.05, 0.45));
      railPulse = Math.max(railPulse, seg(t, 0.0, 0.85));
    },
  };

  return {
    group: g, muzzle, sight, hands, anim,
    animate: (t, dt, ammo, heat) => {
      carrier.position.z = carrierHome.z + carrierBack * 0.1;
      // springs visibly compress as the carrier travels
      const squash = 1 - carrierBack * 0.42;
      for (let i = 0; i < springs.length; i++) {
        const side = i < springs.length / 2 ? 0 : 1;
        const k = i % 6;
        springs[i].position.z = -0.05 + k * 0.042 * squash + carrierBack * 0.03;
        void side;
      }
      carrierBack = Math.max(0, carrierBack - dt * 3.4);
      canHeat = Math.max(0, canHeat - dt * 0.9);

      // travelling charge pulse down the rails
      if (railPulse >= 0) {
        railPulse += dt * 2.2;
        if (railPulse > 1.6) railPulse = -1;
      }
      for (let i = 0; i < railMats.length; i++) {
        const at = i / (railMats.length - 1);
        let v = 0.35 + Math.sin(t * 1.6 + i * 0.5) * 0.12;
        if (railPulse >= 0) {
          const d = Math.abs(at - (1 - railPulse));
          v += Math.max(0, 1 - d * 5.5) * 3.4;
        }
        railMats[i].emissiveIntensity = v;
      }
      for (let i = 0; i < heatMats.length; i++) {
        heatMats[i].emissiveIntensity = canHeat * 2.2 + heat * 1.6;
      }
      lensMat.emissiveIntensity = 1.0 + Math.sin(t * 2.1) * 0.28;
      elevTurret.rotation.y = t * 0.3;
      windTurret.rotation.x = -t * 0.24;
      plate.mat.emissiveIntensity = 0.4 + Math.sin(t * 1.8) * 0.15 + heat * 0.5 + spinT * 0.8;
      spinT *= 0.9;
      void ammo;
    },
    killFx: (t) => {
      canHeat = Math.max(canHeat, 0.9 * (1 - ease(seg(t, 0.2, 1))));
    },
  };
}

// ═════════════════════════════════════════════════════════════
//  Registry — append here to add a fourth variant.
// ═════════════════════════════════════════════════════════════

export const SNIPER_VARIANTS: SniperVariant[] = [
  {
    def: {
      id: "longbow", slot: 5, name: "LONGBOW MK VII", short: "LBW",
      damage: 155, headMult: 2.8, rpm: 36,
      magSize: 5, reserveStart: 35, reloadTime: 3.4,
      spreadHip: 4.6, spreadAds: 0.02,
      pellets: 1, auto: false,
      recoilPitch: 0.098, recoilYaw: 0.012, kickZ: 0.16,
      zoom: 6.0, falloffStart: 90, falloffEnd: 200, falloffMin: 0.88,
      tracerColor: 0xdfe9f5, flashScale: 1.35, scoped: true,
      muzzleFx: "heavyBrake", boltDelay: 0.42, boltCycle: 1.1, velocity: 930,
      shake: { amp: 0.05, freq: 13, dur: 0.42 },
      killShake: { amp: 0.022, freq: 9, dur: 0.34 },
      blurb: "Anti-materiel bolt-action. One shot, one kill — if you can carry the recoil.",
    },
    build: buildLongbow,
    viewScale: 0.58,
    adsOffset: new THREE.Vector3(0, 0.0153, 0.03),
  },
  {
    def: {
      id: "vector", slot: 6, name: "VECTOR-7 DMR", short: "DMR",
      damage: 58, headMult: 2.1, rpm: 190,
      magSize: 20, reserveStart: 160, reloadTime: 2.0,
      spreadHip: 1.6, spreadAds: 0.22,
      pellets: 1, auto: false,
      recoilPitch: 0.022, recoilYaw: 0.006, kickZ: 0.036,
      zoom: 3.2, falloffStart: 45, falloffEnd: 110, falloffMin: 0.6,
      tracerColor: 0x6effc4, flashScale: 0.6, scoped: false,
      muzzleFx: "compensator", boltCycle: 0.32, velocity: 810,
      shake: { amp: 0.012, freq: 22, dur: 0.14 },
      killShake: { amp: 0.008, freq: 18, dur: 0.18 },
      blurb: "Semi-auto marksman rifle. Fast follow-ups, prism optic, no scope blackout.",
    },
    build: buildVector,
    viewScale: 0.7,
    adsOffset: new THREE.Vector3(0, 0.0204, 0.02),
  },
  {
    def: {
      id: "obsidian", slot: 7, name: "OBSIDIAN VSS", short: "VSS",
      damage: 98, headMult: 2.5, rpm: 52,
      magSize: 8, reserveStart: 56, reloadTime: 2.6,
      spreadHip: 3.0, spreadAds: 0.015,
      pellets: 1, auto: false,
      recoilPitch: 0.042, recoilYaw: 0.007, kickZ: 0.08,
      zoom: 8.5, falloffStart: 70, falloffEnd: 170, falloffMin: 0.8,
      tracerColor: 0x9fd4ff, flashScale: 0.34, scoped: true,
      muzzleFx: "suppressed", boltDelay: 0.24, boltCycle: 0.62, velocity: 760,
      shake: { amp: 0.02, freq: 16, dur: 0.24 },
      killShake: { amp: 0.014, freq: 11, dur: 0.4 },
      blurb: "Integrally suppressed precision rifle. Highest zoom, quietest report.",
    },
    build: buildObsidian,
    viewScale: 0.64,
    adsOffset: new THREE.Vector3(0, 0.002, 0.02),
  },
];
