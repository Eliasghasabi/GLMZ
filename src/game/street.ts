// ─────────────────────────────────────────────────────────────
//  ELIAS STREET — endless procedural street.
//
//  The street is streamed in fixed-length chunks along +X. A pool
//  of chunk instances is recycled from behind the player to ahead
//  of them, so the road and buildings never end in either
//  direction. Thick exponential fog closes in at ~45 m, so the
//  recycle boundary — and everything already walked past — is
//  completely hidden.
//
//  Facades are 90 m tall: their tops are so far away that fog
//  swallows them entirely, giving the environment no visible
//  ceiling.
//
//  Colliders / cover / nav arrays are MUTATED IN PLACE because
//  the enemy AI context holds direct references to them.
// ─────────────────────────────────────────────────────────────

import * as THREE from "three";
import type { MapData } from "./map";
import {
  asphaltPBR, wallPBR, sidewalkPBR,
  tyreTexture, paintTexture, grimeTexture,
  eliasStencil, rng, type PBRSet,
} from "./textures";

// ── street metrics ──────────────────────────────────────────

const CHUNK = 30;        // metres per chunk (texture repeats align to this)
const BEHIND = 3;        // chunks kept behind the player
const AHEAD = 5;         // chunks kept ahead
const LIVE = BEHIND + AHEAD + 1;

const ROAD_HALF = 12;    // road half-width
const WALK_OUT = 14.5;   // outer edge of the pavement
const WALL_Z = 15.2;     // facade centre
const WALL_T = 1.2;      // facade thickness
const WALL_H = 90;       // facade height — top is lost in fog

export const STREET_HALF_Z = 14.1; // player lateral clamp

// ── material helpers ────────────────────────────────────────

function matFrom(
  pbr: PBRSet,
  rx: number,
  ry: number,
  opts: Partial<THREE.MeshStandardMaterialParameters> = {}
): THREE.MeshStandardMaterial {
  const map = pbr.map.clone(); map.needsUpdate = true; map.repeat.set(rx, ry);
  const nrm = pbr.normalMap.clone(); nrm.needsUpdate = true; nrm.repeat.set(rx, ry);
  const rgh = pbr.roughnessMap.clone(); rgh.needsUpdate = true; rgh.repeat.set(rx, ry);
  return new THREE.MeshStandardMaterial({
    map, normalMap: nrm, roughnessMap: rgh,
    normalScale: new THREE.Vector2(1, 1),
    ...opts,
  });
}

// ── chunk ───────────────────────────────────────────────────

interface LampSlot {
  lx: number;            // local x
  z: number;
  headMat: THREE.MeshStandardMaterial;
  glowMat: THREE.SpriteMaterial;
  seed: number;
  offT: number;
  nextFlicker: number;
  k: number;             // current brightness 0..1
  worldX: number;
}

class Chunk {
  group = new THREE.Group();
  index = -99999;
  local: THREE.Box3[] = [];
  world: THREE.Box3[] = [];
  localCover: THREE.Vector3[] = [];
  worldCover: THREE.Vector3[] = [];
  localNav: THREE.Vector3[] = [];
  worldNav: THREE.Vector3[] = [];
  lamps: LampSlot[] = [];
  /** facade meshes + graffiti, re-skinned whenever the chunk is recycled */
  walls: THREE.Mesh[] = [];
  tags: THREE.Mesh[] = [];

  addBox(
    w: number, h: number, d: number,
    x: number, y: number, z: number,
    mat: THREE.Material,
    opts: { collide?: boolean; cover?: boolean; shadow?: boolean } = {}
  ): THREE.Mesh {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
    mesh.position.set(x, y + h / 2, z);
    mesh.castShadow = opts.shadow !== false;
    mesh.receiveShadow = true;
    this.group.add(mesh);
    if (opts.collide !== false) {
      this.local.push(new THREE.Box3(
        new THREE.Vector3(x - w / 2, y, z - d / 2),
        new THREE.Vector3(x + w / 2, y + h, z + d / 2)
      ));
      this.world.push(new THREE.Box3());
    }
    if (opts.cover) {
      for (const [ox, oz] of [[w / 2 + 1, 0], [-w / 2 - 1, 0], [0, d / 2 + 1], [0, -d / 2 - 1]] as const) {
        this.localCover.push(new THREE.Vector3(x + ox, 0, z + oz));
        this.worldCover.push(new THREE.Vector3());
      }
    }
    return mesh;
  }

  /** materials supplied by the builder, used when reskinning */
  wallPool: THREE.MeshStandardMaterial[] = [];
  tagPool: THREE.MeshStandardMaterial[] = [];

  /**
   * Re-place this chunk at a new street index (no geometry rebuild).
   * Facade materials and graffiti are re-picked from the pools using a
   * hash of the WORLD index, so the nine recycled chunks never present
   * the same wall twice in a row — and walking back shows the same
   * street you left.
   */
  setIndex(i: number) {
    this.index = i;
    const ox = (i + 0.5) * CHUNK;
    this.group.position.x = ox;

    const hash = (n: number) => {
      let h = (n * 2654435761) >>> 0;
      h ^= h >>> 15; h = (h * 2246822519) >>> 0; h ^= h >>> 13;
      return h >>> 0;
    };
    for (let k = 0; k < this.walls.length; k++) {
      const h = hash(i * 131 + k * 7919);
      this.walls[k].material = this.wallPool[h % this.wallPool.length];
    }
    for (let k = 0; k < this.tags.length; k++) {
      const h = hash(i * 977 + k * 4231);
      const t = this.tags[k];
      // ~40% of walls carry a tag; the rest stay bare so it reads as
      // real graffiti rather than wallpaper
      t.visible = h % 5 < 2;
      t.material = this.tagPool[h % this.tagPool.length];
      const sc = 0.8 + ((h >>> 8) % 100) / 250;
      t.scale.set(sc, sc, 1);
      t.position.y = 2.2 + ((h >>> 16) % 100) / 28;
    }
    for (let k = 0; k < this.local.length; k++) {
      const l = this.local[k], w = this.world[k];
      w.min.set(l.min.x + ox, l.min.y, l.min.z);
      w.max.set(l.max.x + ox, l.max.y, l.max.z);
    }
    for (let k = 0; k < this.localCover.length; k++) {
      this.worldCover[k].set(this.localCover[k].x + ox, 0, this.localCover[k].z);
    }
    for (let k = 0; k < this.localNav.length; k++) {
      this.worldNav[k].set(this.localNav[k].x + ox, 0, this.localNav[k].z);
    }
    for (const lp of this.lamps) lp.worldX = lp.lx + ox;
  }
}

// ─────────────────────────────────────────────────────────────

export function buildStreet(scene: THREE.Scene): MapData {
  const group = new THREE.Group();
  const colliders: THREE.Box3[] = [];
  const coverPoints: THREE.Vector3[] = [];
  const navPoints: THREE.Vector3[] = [];

  // ── generate the PBR sets once ──
  const asphalt = asphaltPBR(640, 20260308);
  const wallTex = wallPBR(384, 5150);
  const walkTex = sidewalkPBR(384, 3311);
  const tyre = tyreTexture(7);
  const paint = paintTexture(11);
  const grime = grimeTexture(23);

  // shared materials (repeats chosen so tiles align to CHUNK exactly)
  const matRoad = matFrom(asphalt, CHUNK / 6, (ROAD_HALF * 2) / 6, { color: 0xb9bcc0 });
  const matWalk = matFrom(walkTex, CHUNK / 3, 1, { color: 0xb2b4b0 });
  // ── wall variant pool ──────────────────────────────────────
  // Five structurally DIFFERENT facades (not just recoloured): each
  // has its own brick exposure, staining, damage and panel layout.
  // Every variant is then issued at several UV scales/offsets and
  // mirror states, so no two wall segments show the same tile
  // alignment even when they share a source texture.
  const wallVariants: PBRSet[] = [
    wallTex,                                                                     // baseline render
    wallPBR(384, 8821, { brickExposure: 0.92, stain: 0.35, damage: 0.8, seams: 0 }),   // blown-open brickwork
    wallPBR(384, 4407, { brickExposure: 0.05, stain: 0.9, damage: 0.25, seams: 6,
                         tint: [0.94, 0.96, 1.02] }),                            // clean panels, heavy staining
    wallPBR(384, 6913, { brickExposure: 0.45, stain: 0.7, damage: 1.0, seams: 3,
                         tint: [1.05, 0.99, 0.9] }),                             // shell-damaged, warm
    wallPBR(384, 2255, { brickExposure: 0.2, stain: 0.2, damage: 0.45, seams: 5,
                         tint: [0.9, 0.92, 0.95] }),                             // cold, drier concrete
  ];

  const wallTints = [0xa9a8a4, 0x8e8b86, 0x9d9489, 0xb0aea6, 0x87888a];
  const wallMats: THREE.MeshStandardMaterial[] = [];
  wallVariants.forEach((v, vi) => {
    // 3 UV treatments per variant => 15 visually distinct facades
    const treatments: [number, number, number, number][] = [
      [CHUNK / 5, WALL_H / 5, 0, 0],
      [CHUNK / 7, WALL_H / 6, 0.37, 0.21],
      [-CHUNK / 6, WALL_H / 7, 0.63, 0.48],   // negative X repeat = mirrored
    ];
    treatments.forEach(([rx, ry, ox, oy], ti) => {
      const m = matFrom(v, rx, ry, { color: wallTints[(vi + ti) % wallTints.length] });
      for (const t of [m.map, m.normalMap, m.roughnessMap]) {
        if (t) t.offset.set(ox, oy);
      }
      wallMats.push(m);
    });
  });
  const matWallB = wallMats[3];
  const matWallC = wallMats[7];
  const matBlock = matFrom(wallVariants[2], 3, 6, { color: 0x7e8288 });
  const matKerb = matFrom(walkTex, CHUNK / 2, 1, { color: 0xc2c3bf });

  const matSteel = new THREE.MeshStandardMaterial({ color: 0x24272c, metalness: 0.72, roughness: 0.44 });
  const matRust = new THREE.MeshStandardMaterial({ color: 0x53381f, metalness: 0.4, roughness: 0.86 });
  const matSand = new THREE.MeshStandardMaterial({ color: 0x4a4636, roughness: 1 });
  const matHazard = new THREE.MeshStandardMaterial({ color: 0x9d7a24, roughness: 0.85 });
  const matRubble = matFrom(walkTex, 2, 2, { color: 0x8d8a83 });
  const matCarBody = [0x1a1d21, 0x2b2118, 0x1e2833, 0x30231f, 0x22262a];

  const decalMat = (tex: THREE.Texture, opacity: number, rough = 0.55) =>
    new THREE.MeshStandardMaterial({
      map: tex, transparent: true, opacity, roughness: rough, metalness: 0.05,
      depthWrite: false, polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -3,
    });

  const matTyre = decalMat(tyre, 0.85, 0.42);
  const matPaint = decalMat(paint, 0.9, 0.7);
  const matGrime = decalMat(grime, 0.8, 0.95);
  // tyre streaks run along the street: tile along their length
  (matTyre.map as THREE.Texture).repeat.set(1, CHUNK / 7.5);

  // ── ELIAS spray-stencil tags ───────────────────────────────
  // A pool of genuinely different sprays (colour, wear, drip count)
  // so repeated tags never look copy-pasted.
  const tagMats = [
    { color: "#eae6da", seed: 5, drips: 8, wear: 0.45 },
    { color: "#d64b32", seed: 23, drips: 6, wear: 0.62 },
    { color: "#e8b545", seed: 71, drips: 9, wear: 0.35 },
    { color: "#5fa9d8", seed: 129, drips: 5, wear: 0.55 },
    { color: "#cfd3d6", seed: 244, drips: 11, wear: 0.7 },
  ].map((o) =>
    new THREE.MeshStandardMaterial({
      map: eliasStencil({ ...o, width: 512, height: 256 }),
      transparent: true,
      roughness: 0.88,
      metalness: 0.0,
      depthWrite: false,
      polygonOffset: true,
      polygonOffsetFactor: -4,
      polygonOffsetUnits: -4,
    })
  );

  const glowSprite = (() => {
    const cv = document.createElement("canvas");
    cv.width = cv.height = 64;
    const c = cv.getContext("2d")!;
    const g = c.createRadialGradient(32, 32, 0, 32, 32, 32);
    g.addColorStop(0, "rgba(255,255,255,1)");
    g.addColorStop(0.35, "rgba(255,255,255,0.42)");
    g.addColorStop(1, "rgba(255,255,255,0)");
    c.fillStyle = g;
    c.fillRect(0, 0, 64, 64);
    return new THREE.CanvasTexture(cv);
  })();

  // ── chunk content generator ──
  const roadGeo = new THREE.PlaneGeometry(CHUNK, ROAD_HALF * 2);
  const decalGeo = new THREE.PlaneGeometry(1, 1);

  function buildChunk(seed: number): Chunk {
    const ch = new Chunk();
    const r = rng(seed);
    const g = ch.group;

    // ── road surface ──
    const road = new THREE.Mesh(roadGeo, matRoad);
    road.rotation.x = -Math.PI / 2;
    road.receiveShadow = true;
    g.add(road);

    // tyre tracks (two lanes) + worn centre dashes
    for (const tz of [-6.6, -3.4, 3.4, 6.6]) {
      const t = new THREE.Mesh(decalGeo, matTyre);
      t.rotation.set(-Math.PI / 2, 0, Math.PI / 2); // V (streaks) -> world X
      t.scale.set(1.7, CHUNK, 1);                   // U = width, V = length
      t.position.set(0, 0.014, tz);                 // fixed lanes: continuous
      t.renderOrder = 1;
      g.add(t);
    }
    for (let i = 0; i < 5; i++) {
      const dash = new THREE.Mesh(decalGeo, matPaint);
      dash.rotation.x = -Math.PI / 2;
      dash.scale.set(2.6, 0.16, 1);
      dash.position.set(-CHUNK / 2 + 3 + i * 6, 0.016, 0);
      dash.renderOrder = 2;
      g.add(dash);
    }
    // kerb grime strips
    for (const s of [-1, 1]) {
      const gm = new THREE.Mesh(decalGeo, matGrime);
      gm.rotation.x = -Math.PI / 2;
      gm.rotation.z = s > 0 ? 0 : Math.PI;
      gm.scale.set(CHUNK, 3.2, 1);
      gm.position.set(0, 0.015, s * (ROAD_HALF - 1.2));
      gm.renderOrder = 1;
      g.add(gm);
    }

    // ── pavements + kerbs ──
    for (const s of [-1, 1] as const) {
      const cz = s * (ROAD_HALF + (WALK_OUT - ROAD_HALF) / 2);
      ch.addBox(CHUNK, 0.16, WALK_OUT - ROAD_HALF, 0, 0, cz, matWalk, { shadow: false });
      // kerb lip
      ch.addBox(CHUNK, 0.17, 0.3, 0, 0, s * (ROAD_HALF + 0.15), matKerb, { collide: false, shadow: false });
    }

    // ── facades ──
    for (const s of [-1, 1] as const) {
      const wm = wallMats[Math.floor(r() * wallMats.length)];
      const alley = r() < 0.3;
      if (alley) {
        // gap in the facade with a recessed dead-end alley
        const gapW = 5 + r() * 2;
        const gapC = (r() - 0.5) * (CHUNK - gapW - 6);
        const leftW = gapC - gapW / 2 + CHUNK / 2;
        const rightW = CHUNK / 2 - (gapC + gapW / 2);
        if (leftW > 0.5) ch.walls.push(ch.addBox(leftW, WALL_H, WALL_T, -CHUNK / 2 + leftW / 2, 0, s * WALL_Z, wm, { shadow: false }));
        if (rightW > 0.5) ch.walls.push(ch.addBox(rightW, WALL_H, WALL_T, CHUNK / 2 - rightW / 2, 0, s * WALL_Z, wm, { shadow: false }));
        // alley walls + back wall
        const depth = 7;
        ch.addBox(0.8, 14, depth, gapC - gapW / 2, 0, s * (WALL_Z + depth / 2), matWallC, { shadow: false });
        ch.addBox(0.8, 14, depth, gapC + gapW / 2, 0, s * (WALL_Z + depth / 2), matWallC, { shadow: false });
        ch.addBox(gapW + 1.6, 16, 1, gapC, 0, s * (WALL_Z + depth), matWallB, { shadow: false });
        ch.addBox(gapW + 1.6, WALL_H - 16, 1.2, gapC, 16, s * WALL_Z, wm, { collide: false, shadow: false });
        // alley dressing: dumpster + crates give real cover
        ch.addBox(2.2, 1.35, 1.2, gapC + (r() - 0.5) * 2, 0, s * (WALL_Z + 3), matRust, { cover: true });
        ch.localNav.push(new THREE.Vector3(gapC, 0, s * (WALL_Z - 2.5)));
        ch.worldNav.push(new THREE.Vector3());
      } else {
        ch.walls.push(ch.addBox(CHUNK, WALL_H, WALL_T, 0, 0, s * WALL_Z, wm, { shadow: false }));
        // ground-floor detailing: doorways + shuttered shopfronts
        const bays = 2 + Math.floor(r() * 2);
        for (let i = 0; i < bays; i++) {
          const bx = -CHUNK / 2 + (i + 0.5) * (CHUNK / bays) + (r() - 0.5) * 3;
          ch.addBox(2.6, 3.6, 0.5, bx, 0, s * (WALL_Z - WALL_T / 2 - 0.24), matSteel, { collide: true, shadow: false });
          ch.addBox(3.3, 0.42, 1, bx, 3.6, s * (WALL_Z - WALL_T / 2 - 0.4), matRubble, { collide: false, shadow: false });
        }
      }
      // upper-storey massing so the skyline isn't a flat slab
      const blocks = 2 + Math.floor(r() * 2);
      for (let i = 0; i < blocks; i++) {
        const bw = CHUNK / blocks;
        const bx = -CHUNK / 2 + (i + 0.5) * bw;
        const bd = 6 + r() * 10;
        ch.addBox(bw * (0.8 + r() * 0.2), WALL_H * (0.5 + r() * 0.5), bd,
          bx, 4 + r() * 10, s * (WALL_Z + WALL_T / 2 + bd / 2), matBlock,
          { collide: false, shadow: false });
      }
      // ELIAS tag sprayed directly onto the wall face
      {
        const sw = 5 + r() * 3.4;
        const sh = sw * 0.5;
        const inner = WALL_Z - WALL_T / 2;
        const tag = new THREE.Mesh(new THREE.PlaneGeometry(sw, sh), tagMats[0]);
        tag.position.set((r() - 0.5) * (CHUNK - sw - 3), 2.4 + r() * 3.4, s * (inner - 0.06));
        tag.rotation.y = s > 0 ? Math.PI : 0;
        tag.rotation.z = (r() - 0.5) * 0.07;   // hand-sprayed tilt
        tag.renderOrder = 2;
        g.add(tag);
        ch.tags.push(tag);
      }

      // wall-base grime
      const gm = new THREE.Mesh(decalGeo, matGrime);
      gm.rotation.x = -Math.PI / 2;
      gm.scale.set(CHUNK, 2.4, 1);
      gm.position.set(0, 0.018, s * (WALL_OUT_INNER() - 1));
      gm.renderOrder = 1;
      g.add(gm);
    }

    // ── street props ──
    const propCount = 3 + Math.floor(r() * 4);
    for (let i = 0; i < propCount; i++) {
      const px = -CHUNK / 2 + r() * CHUNK;
      const side = r() < 0.5 ? -1 : 1;
      const pz = side * (2.5 + r() * 9);
      const kind = r();
      if (kind < 0.24) {
        // wrecked car
        const col = matCarBody[Math.floor(r() * matCarBody.length)];
        const cm = new THREE.MeshStandardMaterial({ color: col, metalness: 0.55, roughness: 0.72 });
        const across = r() < 0.35;
        const L = across ? 1.9 : 4.2, W = across ? 4.2 : 1.9;
        ch.addBox(L, 1.0, W, px, 0, pz, cm, { cover: true });
        ch.addBox(across ? 1.7 : 2.1, 0.6, across ? 2.1 : 1.7, px, 1.0, pz, cm, {});
        const wheel = new THREE.CylinderGeometry(0.34, 0.34, 0.24, 10);
        wheel.rotateX(Math.PI / 2);
        for (const [ox, oz] of [[-1.5, -0.8], [1.5, -0.8], [-1.5, 0.8], [1.5, 0.8]] as const) {
          const wm2 = new THREE.Mesh(wheel, matSteel);
          wm2.position.set(px + (across ? oz : ox), 0.34, pz + (across ? ox : oz));
          g.add(wm2);
        }
      } else if (kind < 0.42) {
        ch.addBox(2.2, 1.35, 1.2, px, 0, pz, matRust, { cover: true });
        ch.addBox(2.2, 0.14, 1.28, px, 1.35, pz, matSteel, { collide: false });
      } else if (kind < 0.58) {
        // jersey barrier
        const rot = r() < 0.5;
        ch.addBox(rot ? 1.1 : 3.4, 1.05, rot ? 3.4 : 1.1, px, 0, pz, matHazard, { cover: true });
      } else if (kind < 0.74) {
        // sandbag nest
        const rot = r() < 0.5;
        ch.addBox(rot ? 1.1 : 3, 0.9, rot ? 3 : 1.1, px, 0, pz, matSand, { cover: true });
      } else if (kind < 0.88) {
        // rubble pile
        const s2 = 1.2 + r() * 1.4;
        const m = ch.addBox(s2, 0.8 + r() * 0.8, s2, px, 0, pz, matRubble, { cover: true });
        m.rotation.y = r() * 3;
      } else {
        // barrel cluster
        const bg = new THREE.CylinderGeometry(0.42, 0.42, 1.15, 12);
        const n = 1 + Math.floor(r() * 3);
        for (let b = 0; b < n; b++) {
          const bx = px + (r() - 0.5) * 1.6;
          const bz = pz + (r() - 0.5) * 1.6;
          const bm = new THREE.Mesh(bg, r() < 0.5 ? matRust : matSteel);
          bm.position.set(bx, 0.575, bz);
          bm.castShadow = true;
          g.add(bm);
          ch.local.push(new THREE.Box3(
            new THREE.Vector3(bx - 0.42, 0, bz - 0.42),
            new THREE.Vector3(bx + 0.42, 1.15, bz + 0.42)
          ));
          ch.world.push(new THREE.Box3());
        }
      }
    }

    // ── streetlights ──
    const lampCount = 1 + (r() < 0.4 ? 1 : 0);
    for (let i = 0; i < lampCount; i++) {
      const side = i === 0 ? (r() < 0.5 ? -1 : 1) : -1;
      const lx = -CHUNK / 2 + (i + 0.5) * (CHUNK / lampCount) + (r() - 0.5) * 4;
      const lz = side * (ROAD_HALF + 0.9);
      const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.13, 6.2, 8), matSteel);
      pole.position.set(lx, 3.1, lz);
      pole.castShadow = true;
      g.add(pole);
      ch.local.push(new THREE.Box3(
        new THREE.Vector3(lx - 0.15, 0, lz - 0.15),
        new THREE.Vector3(lx + 0.15, 6.2, lz + 0.15)
      ));
      ch.world.push(new THREE.Box3());
      const armDir = -Math.sign(lz);
      const arm = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.09, 1.9), matSteel);
      arm.position.set(lx, 6.05, lz + armDir * 0.9);
      g.add(arm);
      const headMat = new THREE.MeshStandardMaterial({ color: 0x14161a, emissive: 0xffb163, emissiveIntensity: 2.4 });
      const head = new THREE.Mesh(new THREE.BoxGeometry(0.46, 0.16, 0.62), headMat);
      head.position.set(lx, 5.98, lz + armDir * 1.7);
      g.add(head);
      const glowMat = new THREE.SpriteMaterial({
        map: glowSprite, color: 0xffb163, transparent: true, opacity: 0.5,
        blending: THREE.AdditiveBlending, depthWrite: false,
      });
      const sp = new THREE.Sprite(glowMat);
      sp.scale.setScalar(3);
      sp.position.copy(head.position);
      g.add(sp);
      // light shaft through the fog
      const cone = new THREE.Mesh(
        new THREE.ConeGeometry(2.7, 6, 12, 1, true),
        new THREE.MeshBasicMaterial({
          color: 0xff9a44, transparent: true, opacity: 0.06,
          blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide,
        })
      );
      cone.position.set(lx, 3, lz + armDir * 1.7);
      g.add(cone);
      ch.lamps.push({
        lx, z: lz + armDir * 1.7, headMat, glowMat,
        seed: r() * 40, offT: 0, nextFlicker: 1 + r() * 5, k: 1, worldX: lx,
      });
    }

    // nav points down the centre of the street
    for (let i = 0; i < 2; i++) {
      ch.localNav.push(new THREE.Vector3(-CHUNK / 2 + (i + 0.5) * (CHUNK / 2), 0, (r() - 0.5) * 12));
      ch.worldNav.push(new THREE.Vector3());
    }

    return ch;
  }

  function WALL_OUT_INNER() {
    return WALL_Z - WALL_T / 2;
  }

  // ── build the live pool ──
  const chunks: Chunk[] = [];
  for (let i = 0; i < LIVE; i++) {
    const ch = buildChunk(90210 + i * 7717);
    ch.wallPool = wallMats;
    ch.tagPool = tagMats;
    chunks.push(ch);
    group.add(ch.group);
  }

  // ── shared streetlight pool (only the nearest lamps get real lights) ──
  const isCoarsePointer =
    typeof window !== "undefined" &&
    (window.matchMedia?.("(pointer: coarse)").matches ?? false) &&
    ("ontouchstart" in window || navigator.maxTouchPoints > 0);
  const LIGHTS = isCoarsePointer ? 3 : 6;
  const lightPool: THREE.PointLight[] = [];
  for (let i = 0; i < LIGHTS; i++) {
    const l = new THREE.PointLight(0xffab5e, 0, 34, 2);
    group.add(l);
    lightPool.push(l);
  }

  let baseIndex = Number.NaN;

  function rebuildArrays() {
    colliders.length = 0;
    coverPoints.length = 0;
    navPoints.length = 0;
    for (const ch of chunks) {
      for (const b of ch.world) colliders.push(b);
      for (const c of ch.worldCover) coverPoints.push(c);
      for (const nv of ch.worldNav) navPoints.push(nv);
    }
  }

  /** move chunks so the player always has BEHIND/AHEAD coverage */
  function stream(playerPos: THREE.Vector3) {
    const pIdx = Math.floor(playerPos.x / CHUNK);
    const start = pIdx - BEHIND;
    if (start === baseIndex) return;
    baseIndex = start;
    for (let i = 0; i < LIVE; i++) {
      const target = start + i;
      // keep each pool member on a stable modulo slot so it only
      // ever jumps a whole pool-length forward or backward
      const ch = chunks[((target % LIVE) + LIVE) % LIVE];
      if (ch.index !== target) ch.setIndex(target);
    }
    rebuildArrays();
  }

  // ── atmosphere ──
  // Thick, bright fog: the road dissolves ~45 m out in both
  // directions and the 90 m facades never show a top edge.
  const FOG = 0x76839a;
  scene.fog = new THREE.FogExp2(FOG, 0.033);
  scene.background = new THREE.Color(FOG);

  group.add(new THREE.HemisphereLight(0xa8bcd8, 0x4c4638, 1.35));
  group.add(new THREE.AmbientLight(0x8ea3bd, 0.5));

  const moon = new THREE.DirectionalLight(0xcfe0ff, 1.9);
  moon.position.set(-34, 60, 26);
  moon.castShadow = true;
  moon.shadow.mapSize.set(2048, 2048);
  moon.shadow.camera.left = -40;
  moon.shadow.camera.right = 40;
  moon.shadow.camera.top = 40;
  moon.shadow.camera.bottom = -40;
  moon.shadow.camera.far = 180;
  moon.shadow.bias = -0.0007;
  group.add(moon);
  group.add(moon.target);

  const bounce = new THREE.DirectionalLight(0xffb877, 0.5);
  bounce.position.set(20, 8, -30);
  group.add(bounce);

  scene.add(group);

  // initial placement
  stream(new THREE.Vector3(0, 0, 0));

  // ── per-frame ambience ──
  const update = (dt: number, t: number) => {
    for (const ch of chunks) {
      for (const lp of ch.lamps) {
        if (lp.offT > 0) {
          lp.offT -= dt;
          lp.k = 0.42;
        } else {
          lp.nextFlicker -= dt;
          if (lp.nextFlicker <= 0) {
            lp.offT = 0.04 + Math.random() * 0.26;
            lp.nextFlicker = 0.8 + Math.random() * 7;
          }
          lp.k = 0.88 + 0.08 * Math.sin(t * 18 + lp.seed) + 0.04 * Math.sin(t * 41 + lp.seed * 1.7);
        }
        lp.headMat.emissiveIntensity = 2.4 * lp.k;
        lp.glowMat.opacity = 0.5 * lp.k;
      }
    }
  };

  /** attach the real point lights to whichever lamps are closest */
  const assignLights = (playerPos: THREE.Vector3) => {
    const all: LampSlot[] = [];
    for (const ch of chunks) for (const lp of ch.lamps) all.push(lp);
    all.sort(
      (a, b) => Math.abs(a.worldX - playerPos.x) - Math.abs(b.worldX - playerPos.x)
    );
    for (let i = 0; i < lightPool.length; i++) {
      const lamp = all[i];
      if (!lamp) { lightPool[i].intensity = 0; continue; }
      lightPool[i].position.set(lamp.worldX, 5.7, lamp.z);
      lightPool[i].intensity = 42 * lamp.k;
    }
  };

  // moon target + shadow frustum follow the player down the street
  const followLights = (playerPos: THREE.Vector3) => {
    moon.position.set(playerPos.x - 34, 60, 26);
    moon.target.position.set(playerPos.x, 0, 0);
    moon.target.updateMatrixWorld();
    bounce.position.set(playerPos.x + 20, 8, -30);
  };

  return {
    group,
    colliders,
    enemySpawns: [],
    coverPoints,
    navPoints,
    bounds: { minX: -1e6, maxX: 1e6, minZ: -STREET_HALF_Z, maxZ: STREET_HALF_Z },
    moon,
    update,
    stream: (playerPos: THREE.Vector3) => {
      stream(playerPos);
      assignLights(playerPos);
      followLights(playerPos);
    },
  };
}
