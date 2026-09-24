// ─────────────────────────────────────────────────────────────
//  Map — shared world types + collision / raycast helpers.
//  The live environment is built by street.ts (endless street).
// ─────────────────────────────────────────────────────────────

import * as THREE from "three";

export interface MapData {
  group: THREE.Group;
  colliders: THREE.Box3[];
  enemySpawns: THREE.Vector3[];
  coverPoints: THREE.Vector3[];
  navPoints: THREE.Vector3[];
  bounds: { minX: number; maxX: number; minZ: number; maxZ: number };
  moon: THREE.DirectionalLight;
  /** optional ambient animation driver (flicker, lights, …) */
  update?: (dt: number, t: number) => void;
  /** optional streaming driver for endless worlds — called each frame */
  stream?: (playerPos: THREE.Vector3) => void;
}

// ── physics helpers (shared by player & enemies) ────────────

/** push a vertical capsule (circle in XZ) out of collider boxes */
export function resolveBody(
  pos: THREE.Vector3,
  radius: number,
  height: number,
  colliders: THREE.Box3[],
  step: number
) {
  const feet = pos.y;
  const head = pos.y + height;
  for (let iter = 0; iter < 3; iter++) {
    let pushed = false;
    for (let i = 0; i < colliders.length; i++) {
      const b = colliders[i];
      if (b.max.y <= feet + step || b.min.y >= head) continue;
      const cx = Math.max(b.min.x, Math.min(pos.x, b.max.x));
      const cz = Math.max(b.min.z, Math.min(pos.z, b.max.z));
      let dx = pos.x - cx;
      let dz = pos.z - cz;
      const d2 = dx * dx + dz * dz;
      if (d2 >= radius * radius) continue;
      if (d2 > 1e-8) {
        const d = Math.sqrt(d2);
        const push = (radius - d) / d;
        pos.x += dx * push;
        pos.z += dz * push;
      } else {
        // center inside box — push along smallest penetration axis
        const pxl = pos.x - b.min.x + radius;
        const pxr = b.max.x - pos.x + radius;
        const pzl = pos.z - b.min.z + radius;
        const pzr = b.max.z - pos.z + radius;
        const m = Math.min(pxl, pxr, pzl, pzr);
        if (m === pxl) pos.x = b.min.x - radius;
        else if (m === pxr) pos.x = b.max.x + radius;
        else if (m === pzl) pos.z = b.min.z - radius;
        else pos.z = b.max.z + radius;
      }
      pushed = true;
    }
    if (!pushed) break;
  }
}

/** highest walkable surface under (x,z) at or below feet+step */
export function groundHeight(
  x: number,
  z: number,
  feetY: number,
  radius: number,
  colliders: THREE.Box3[],
  step: number
): number {
  let g = 0;
  const r = radius * 0.75;
  for (let i = 0; i < colliders.length; i++) {
    const b = colliders[i];
    if (b.max.y > feetY + step || b.max.y <= g) continue;
    if (
      x + r > b.min.x && x - r < b.max.x &&
      z + r > b.min.z && z - r < b.max.z
    ) {
      g = b.max.y;
    }
  }
  return g;
}

const _hitPoint = new THREE.Vector3();

/** analytic ray vs all colliders + ground plane. Returns distance or null. */
export function raycastWorld(
  origin: THREE.Vector3,
  dir: THREE.Vector3,
  far: number,
  colliders: THREE.Box3[]
): number | null {
  let best: number | null = null;
  const ray = new THREE.Ray(origin, dir);
  for (let i = 0; i < colliders.length; i++) {
    const hit = ray.intersectBox(colliders[i], _hitPoint);
    if (hit) {
      const t = hit.distanceTo(origin);
      if (t < far && (best === null || t < best)) best = t;
    }
  }
  if (dir.y < -1e-5) {
    const t = -origin.y / dir.y;
    if (t > 0 && t < far && (best === null || t < best)) best = t;
  }
  return best;
}

