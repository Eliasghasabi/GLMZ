// ─────────────────────────────────────────────────────────────
//  Effects — pooled particles / tracers / muzzle flashes / shells.
//  Zero allocations during gameplay: everything recycled.
// ─────────────────────────────────────────────────────────────

import * as THREE from "three";

const MAX_PARTICLES = 380;
const MAX_TRACERS = 36;
const MAX_SHELLS = 40;
const MAX_DECALS = 56;

function glowTexture(): THREE.CanvasTexture {
  const cv = document.createElement("canvas");
  cv.width = cv.height = 64;
  const c = cv.getContext("2d")!;
  const g = c.createRadialGradient(32, 32, 0, 32, 32, 32);
  g.addColorStop(0, "rgba(255,255,255,1)");
  g.addColorStop(0.25, "rgba(255,240,210,0.85)");
  g.addColorStop(0.6, "rgba(255,180,90,0.25)");
  g.addColorStop(1, "rgba(255,140,40,0)");
  c.fillStyle = g;
  c.fillRect(0, 0, 64, 64);
  return new THREE.CanvasTexture(cv);
}


// ── wet blood decal textures ────────────────────────────────

/** irregular fresh-blood pool with drip tendrils and a specular sheen */
function bloodDecalTexture(seed: number): THREE.CanvasTexture {
  const S = 256;
  const cv = document.createElement("canvas");
  cv.width = cv.height = S;
  const c = cv.getContext("2d")!;
  c.clearRect(0, 0, S, S);
  const rnd = (() => {
    let x = seed * 9301 + 49297;
    return () => ((x = (x * 9301 + 49297) % 233280) / 233280);
  })();

  const cx = S / 2, cy = S / 2;

  // main body: overlapping blobs -> organic silhouette
  const blob = (x: number, y: number, r: number, a: number) => {
    const g = c.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, `rgba(96,5,7,${a})`);
    g.addColorStop(0.55, `rgba(74,3,5,${a * 0.95})`);
    g.addColorStop(0.85, `rgba(48,2,3,${a * 0.7})`);
    g.addColorStop(1, "rgba(38,2,3,0)");
    c.fillStyle = g;
    c.beginPath();
    c.arc(x, y, r, 0, Math.PI * 2);
    c.fill();
  };
  blob(cx, cy, 78, 1);
  for (let i = 0; i < 8; i++) {
    const a = rnd() * Math.PI * 2;
    const d = 24 + rnd() * 46;
    blob(cx + Math.cos(a) * d, cy + Math.sin(a) * d, 24 + rnd() * 34, 0.95);
  }

  // drip tendrils running outward (fluid spreading look)
  for (let i = 0; i < 12; i++) {
    const a = rnd() * Math.PI * 2;
    const len = 52 + rnd() * 62;
    const w0 = 5 + rnd() * 9;
    c.strokeStyle = `rgba(70,3,5,${0.55 + rnd() * 0.4})`;
    c.lineCap = "round";
    c.lineWidth = w0;
    c.beginPath();
    let px = cx + Math.cos(a) * 46;
    let py = cy + Math.sin(a) * 46;
    c.moveTo(px, py);
    const steps = 3;
    for (let j = 0; j < steps; j++) {
      px += Math.cos(a) * (len / steps) + (rnd() - 0.5) * 16;
      py += Math.sin(a) * (len / steps) + (rnd() - 0.5) * 16;
      c.lineTo(px, py);
    }
    c.stroke();
    // droplet at the tip
    c.fillStyle = `rgba(78,3,5,${0.6 + rnd() * 0.35})`;
    c.beginPath();
    c.arc(px, py, 3 + rnd() * 6, 0, Math.PI * 2);
    c.fill();
  }

  // satellite spatter
  for (let i = 0; i < 40; i++) {
    const a = rnd() * Math.PI * 2;
    const d = 60 + rnd() * 62;
    const r = 1.2 + rnd() * 4.5;
    c.fillStyle = `rgba(84,4,6,${0.35 + rnd() * 0.5})`;
    c.beginPath();
    c.ellipse(cx + Math.cos(a) * d, cy + Math.sin(a) * d, r, r * (0.6 + rnd() * 0.8), a, 0, Math.PI * 2);
    c.fill();
  }

  // ── wet sheen: bright specular highlights baked on top ──
  c.globalCompositeOperation = "lighter";
  for (let i = 0; i < 5; i++) {
    const hx = cx + (rnd() - 0.5) * 74;
    const hy = cy + (rnd() - 0.5) * 74;
    const hr = 10 + rnd() * 30;
    const g = c.createRadialGradient(hx - hr * 0.3, hy - hr * 0.35, 0, hx, hy, hr);
    g.addColorStop(0, `rgba(255,150,140,${0.3 + rnd() * 0.25})`);
    g.addColorStop(0.4, "rgba(190,60,50,0.1)");
    g.addColorStop(1, "rgba(120,20,20,0)");
    c.fillStyle = g;
    c.beginPath();
    c.arc(hx, hy, hr, 0, Math.PI * 2);
    c.fill();
  }
  // crescent rim light along the pool edge
  c.strokeStyle = "rgba(255,120,110,0.22)";
  c.lineWidth = 3;
  c.beginPath();
  c.arc(cx, cy, 70, Math.PI * 0.75, Math.PI * 1.65);
  c.stroke();
  c.globalCompositeOperation = "source-over";

  const t = new THREE.CanvasTexture(cv);
  t.anisotropy = 4;
  return t;
}

interface BloodDecal {
  mesh: THREE.Mesh;
  mat: THREE.MeshStandardMaterial;
  life: number;
  maxLife: number;
  grow: number;      // 0..1 spread progress
  growRate: number;
  target: number;    // final radius
  born: number;
}

interface Particle {
  alive: boolean;
  life: number;
  maxLife: number;
  px: number; py: number; pz: number;
  vx: number; vy: number; vz: number;
  gravity: number;
  size: number;
  r: number; g: number; b: number;
  additive: boolean;
}

export class Effects {
  private scene: THREE.Scene;

  // two particle pools: additive (sparks/flash) + alpha (blood/dust)
  private pools: Particle[] = [];
  private pointsAdd!: THREE.Points;
  private pointsSoft!: THREE.Points;
  private posAdd!: Float32Array;
  private colAdd!: Float32Array;
  private sizeAdd!: Float32Array;
  private posSoft!: Float32Array;
  private colSoft!: Float32Array;
  private sizeSoft!: Float32Array;

  // tracers
  private tracers: {
    line: THREE.Line;
    mat: THREE.LineBasicMaterial;
    life: number;
    maxLife: number;
  }[] = [];

  // muzzle flash sprites + pooled lights
  private flashes: { sprite: THREE.Sprite; life: number }[] = [];
  private lights: { light: THREE.PointLight; life: number }[] = [];

  // shell casings
  private shells: {
    mesh: THREE.Mesh;
    vel: THREE.Vector3;
    spin: THREE.Vector3;
    life: number;
  }[] = [];

  private glow: THREE.CanvasTexture;

  // wet blood decals
  private decals: BloodDecal[] = [];
  private decalCursor = 0;
  private bloodTextures: THREE.CanvasTexture[] = [];
  private decalTime = 0;

  constructor(scene: THREE.Scene) {
    this.scene = scene;
    this.glow = glowTexture();
    this.initParticles();
    this.initTracers();
    this.initFlashes();
    this.initShells();
    this.initDecals();
  }

  // ── blood decals ──────────────────────────────────────────

  private initDecals() {
    for (let i = 0; i < 5; i++) this.bloodTextures.push(bloodDecalTexture(i + 1));
    const geo = new THREE.PlaneGeometry(1, 1);
    for (let i = 0; i < MAX_DECALS; i++) {
      const mat = new THREE.MeshStandardMaterial({
        map: this.bloodTextures[i % this.bloodTextures.length],
        transparent: true,
        opacity: 0,
        // fresh blood: very smooth + slightly metallic => strong wet specular
        roughness: 0.06,
        metalness: 0.45,
        color: 0xd8d8d8,
        emissive: 0x2a0002,
        emissiveIntensity: 0.5,
        depthWrite: false,
        polygonOffset: true,
        polygonOffsetFactor: -4,
        polygonOffsetUnits: -4,
      });
      const mesh = new THREE.Mesh(geo, mat);
      mesh.rotation.x = -Math.PI / 2;
      mesh.visible = false;
      mesh.renderOrder = 3;
      mesh.frustumCulled = true;
      this.scene.add(mesh);
      this.decals.push({ mesh, mat, life: 0, maxLife: 1, grow: 0, growRate: 1, target: 1, born: 0 });
    }
  }

  /**
   * Spawn a spreading pool of fresh blood on the ground.
   * The pool grows outward, glistens, then slowly dries.
   */
  bloodPool(x: number, groundY: number, z: number, radius: number, life = 26) {
    const d = this.decals[this.decalCursor];
    this.decalCursor = (this.decalCursor + 1) % this.decals.length;
    d.mesh.position.set(x, groundY + 0.016 + Math.random() * 0.012, z);
    d.mesh.rotation.z = Math.random() * Math.PI * 2;
    d.mat.map = this.bloodTextures[Math.floor(Math.random() * this.bloodTextures.length)];
    d.mat.needsUpdate = true;
    d.target = radius;
    d.grow = 0.16;
    d.growRate = 1.5 + Math.random() * 1.4;
    d.life = d.maxLife = life;
    d.born = this.decalTime;
    d.mesh.scale.setScalar(radius * d.grow);
    d.mat.opacity = 0;
    d.mesh.visible = true;
  }

  /** heavy kill splatter: a main pool plus surrounding spatter */
  bloodSplatter(x: number, groundY: number, z: number, big: boolean) {
    this.bloodPool(x, groundY, z, big ? 2.5 + Math.random() * 1.1 : 1.35 + Math.random() * 0.6);
    const n = big ? 5 : 2;
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2;
      const dist = (big ? 0.7 : 0.4) + Math.random() * (big ? 2.3 : 1.1);
      this.bloodPool(
        x + Math.cos(a) * dist,
        groundY,
        z + Math.sin(a) * dist,
        (big ? 0.7 : 0.45) + Math.random() * 0.8,
        22
      );
    }
  }

  private updateDecals(dt: number) {
    this.decalTime += dt;
    for (const d of this.decals) {
      if (d.life <= 0) continue;
      d.life -= dt;
      // spread outward with an ease-out as the fluid settles
      if (d.grow < 1) {
        d.grow = Math.min(1, d.grow + dt * d.growRate * (1.05 - d.grow));
        d.mesh.scale.setScalar(d.target * d.grow);
      }
      const age = this.decalTime - d.born;
      // fade in fast, hold, then dry out and fade
      const fadeIn = Math.min(1, age * 5.5);
      const fadeOut = Math.min(1, d.life / 5);
      d.mat.opacity = 0.94 * fadeIn * fadeOut;
      // wet -> tacky: gloss dulls and the pool darkens as it dries
      const wet = Math.max(0, 1 - age / 14);
      d.mat.roughness = 0.06 + (1 - wet) * 0.62;
      d.mat.metalness = 0.45 * wet;
      d.mat.emissiveIntensity = 0.5 * wet;
      // subtle live shimmer while still fresh
      d.mat.color.setScalar(0.72 + wet * (0.28 + Math.sin(this.decalTime * 2.2 + d.born) * 0.05));
      if (d.life <= 0) d.mesh.visible = false;
    }
  }

  // ── particles ─────────────────────────────────────────────

  private initParticles() {
    for (let i = 0; i < MAX_PARTICLES; i++) {
      this.pools.push({
        alive: false, life: 0, maxLife: 1,
        px: 0, py: -999, pz: 0, vx: 0, vy: 0, vz: 0,
        gravity: 0, size: 1, r: 1, g: 1, b: 1, additive: true,
      });
    }
    const mkPoints = (additive: boolean) => {
      const geo = new THREE.BufferGeometry();
      const pos = new Float32Array(MAX_PARTICLES * 3);
      const col = new Float32Array(MAX_PARTICLES * 3);
      const size = new Float32Array(MAX_PARTICLES);
      pos.fill(-999);
      geo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
      geo.setAttribute("color", new THREE.BufferAttribute(col, 3));
      geo.setAttribute("size", new THREE.BufferAttribute(size, 1));
      const mat = new THREE.ShaderMaterial({
        transparent: true,
        depthWrite: false,
        blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending,
        uniforms: { map: { value: this.glow } },
        vertexShader: `
          attribute float size;
          varying vec3 vColor;
          void main() {
            vColor = color;
            vec4 mv = modelViewMatrix * vec4(position, 1.0);
            gl_PointSize = size * (180.0 / max(0.5, -mv.z));
            gl_Position = projectionMatrix * mv;
          }`,
        fragmentShader: `
          uniform sampler2D map;
          varying vec3 vColor;
          void main() {
            vec4 tex = texture2D(map, gl_PointCoord);
            gl_FragColor = vec4(vColor, tex.a) * tex;
          }`,
        vertexColors: true,
      });
      const pts = new THREE.Points(geo, mat);
      pts.frustumCulled = false;
      this.scene.add(pts);
      return { pts, pos, col, size };
    };
    const a = mkPoints(true);
    this.pointsAdd = a.pts; this.posAdd = a.pos; this.colAdd = a.col; this.sizeAdd = a.size;
    const s = mkPoints(false);
    this.pointsSoft = s.pts; this.posSoft = s.pos; this.colSoft = s.col; this.sizeSoft = s.size;
  }

  private allocParticle(additive: boolean): Particle | null {
    for (let i = 0; i < MAX_PARTICLES; i++) {
      const p = this.pools[i];
      if (!p.alive && p.additive === additive) return p;
    }
    return null;
  }

  burst(
    pos: THREE.Vector3,
    count: number,
    opts: {
      color: number;
      speed?: number;
      spread?: number;
      dir?: THREE.Vector3;
      life?: number;
      size?: number;
      gravity?: number;
      additive?: boolean;
      up?: number;
    }
  ) {
    const col = new THREE.Color(opts.color);
    const additive = opts.additive !== false;
    for (let i = 0; i < count; i++) {
      const p = this.allocParticle(additive);
      if (!p) return;
      p.alive = true;
      p.additive = additive;
      p.maxLife = (opts.life ?? 0.5) * (0.6 + Math.random() * 0.8);
      p.life = p.maxLife;
      p.px = pos.x; p.py = pos.y; p.pz = pos.z;
      const spread = opts.spread ?? 1;
      const speed = (opts.speed ?? 4) * (0.4 + Math.random() * 0.9);
      p.vx = (Math.random() - 0.5) * spread * speed;
      p.vy = (Math.random() - 0.5) * spread * speed + (opts.up ?? 1.5);
      p.vz = (Math.random() - 0.5) * spread * speed;
      if (opts.dir) {
        p.vx += opts.dir.x * speed * 0.7;
        p.vy += opts.dir.y * speed * 0.7;
        p.vz += opts.dir.z * speed * 0.7;
      }
      p.gravity = opts.gravity ?? 9;
      p.size = (opts.size ?? 0.5) * (0.7 + Math.random() * 0.7);
      p.r = col.r; p.g = col.g; p.b = col.b;
    }
  }

  sparks(pos: THREE.Vector3, dir: THREE.Vector3) {
    this.burst(pos, 7, { color: 0xffc36b, speed: 5, dir, spread: 0.9, life: 0.35, size: 0.42, gravity: 14 });
    this.burst(pos, 4, { color: 0x8d9297, speed: 2, dir, spread: 0.6, life: 0.7, size: 0.8, gravity: 2, additive: false, up: 1 });
  }

  dust(pos: THREE.Vector3) {
    this.burst(pos, 6, { color: 0x6f6a5e, speed: 1.6, spread: 1, life: 0.8, size: 1.5, gravity: 0.6, additive: false, up: 1.1 });
  }

  blood(pos: THREE.Vector3, dir: THREE.Vector3) {
    // heavy wet spray
    this.burst(pos, 18, { color: 0x8c0d10, speed: 5, dir, spread: 0.85, life: 0.6, size: 0.95, gravity: 15, additive: false, up: 1.2 });
    // fine mist
    this.burst(pos, 10, { color: 0x5e0508, speed: 2.6, dir, spread: 1.1, life: 0.8, size: 1.5, gravity: 5, additive: false, up: 1.5 });
    // impact spark
    this.burst(pos, 3, { color: 0xff9a5a, speed: 5, dir, spread: 0.4, life: 0.15, size: 0.5, gravity: 0 });
  }

  /** dragon-fire muzzle blast: flame plume, rising embers, ash smoke */
  dragonFire(pos: THREE.Vector3, dir: THREE.Vector3) {
    // white-hot core jetting out of the jaws
    this.burst(pos, 14, { color: 0xfff0c0, speed: 12, dir, spread: 0.28, life: 0.16, size: 0.75, gravity: -1, up: 0 });
    // orange flame plume
    this.burst(pos, 18, { color: 0xff7a14, speed: 8, dir, spread: 0.55, life: 0.3, size: 1.25, gravity: -3.5, up: 0.4 });
    // deep red trailing fire
    this.burst(pos, 10, { color: 0xd52c06, speed: 5, dir, spread: 0.8, life: 0.45, size: 1.5, gravity: -4.5, up: 0.7 });
    // embers that arc away and fall
    this.burst(pos, 16, { color: 0xffb43a, speed: 6.5, dir, spread: 1.25, life: 0.9, size: 0.4, gravity: 7, up: 2.2 });
    // ash smoke curling upward
    this.burst(pos, 6, { color: 0x3a3230, speed: 2, dir, spread: 0.7, life: 0.8, size: 1.7, gravity: -2.2, additive: false, up: 1.2 });
  }

  /** lingering embers drifting off a hot barrel */
  emberDrift(pos: THREE.Vector3) {
    this.burst(pos, 2, { color: 0xff8c22, speed: 0.6, spread: 0.5, life: 0.9, size: 0.32, gravity: -1.6, up: 1.1 });
  }

  muzzleSmoke(pos: THREE.Vector3, dir: THREE.Vector3) {
    this.burst(pos, 2, { color: 0x555a60, speed: 1.4, dir, spread: 0.4, life: 0.5, size: 0.7, gravity: -1.5, additive: false, up: 0.4 });
  }

  spawnFlashGround(pos: THREE.Vector3) {
    this.burst(pos, 16, { color: 0x69e1ff, speed: 3.5, spread: 1, life: 0.6, size: 0.9, gravity: -0.5, up: 3 });
  }

  // ── tracers ───────────────────────────────────────────────

  private initTracers() {
    for (let i = 0; i < MAX_TRACERS; i++) {
      const geo = new THREE.BufferGeometry();
      geo.setAttribute("position", new THREE.BufferAttribute(new Float32Array(6), 3));
      const mat = new THREE.LineBasicMaterial({
        color: 0xffd080, transparent: true, opacity: 0,
        blending: THREE.AdditiveBlending, depthWrite: false,
      });
      const line = new THREE.Line(geo, mat);
      line.visible = false;
      line.frustumCulled = false;
      this.scene.add(line);
      this.tracers.push({ line, mat, life: 0, maxLife: 0.06 });
    }
  }

  tracer(from: THREE.Vector3, to: THREE.Vector3, color: number) {
    const t = this.tracers.find((x) => x.life <= 0);
    if (!t) return;
    const attr = t.line.geometry.getAttribute("position") as THREE.BufferAttribute;
    attr.setXYZ(0, from.x, from.y, from.z);
    attr.setXYZ(1, to.x, to.y, to.z);
    attr.needsUpdate = true;
    t.mat.color.setHex(color);
    t.mat.opacity = 0.9;
    t.life = t.maxLife = 0.055 + Math.random() * 0.03;
    t.line.visible = true;
  }

  // ── muzzle flashes ────────────────────────────────────────

  private initFlashes() {
    for (let i = 0; i < 4; i++) {
      const sprite = new THREE.Sprite(new THREE.SpriteMaterial({
        map: this.glow, color: 0xffd9a0, transparent: true, opacity: 0,
        blending: THREE.AdditiveBlending, depthWrite: false,
      }));
      sprite.visible = false;
      this.scene.add(sprite);
      this.flashes.push({ sprite, life: 0 });
    }
    for (let i = 0; i < 2; i++) {
      const light = new THREE.PointLight(0xffc36b, 0, 14, 2);
      this.scene.add(light);
      this.lights.push({ light, life: 0 });
    }
  }

  muzzleFlash(pos: THREE.Vector3, scale: number, withLight: boolean, color?: number) {
    const f = this.flashes.find((x) => x.life <= 0);
    if (f) {
      f.sprite.position.copy(pos);
      f.sprite.scale.setScalar(scale * (0.8 + Math.random() * 0.5));
      f.sprite.material.rotation = Math.random() * Math.PI * 2;
      f.sprite.material.color.setHex(color ?? 0xffd9a0);
      f.sprite.material.opacity = 1;
      f.sprite.visible = true;
      f.life = 0.05;
    }
    if (withLight) {
      const l = this.lights.find((x) => x.life <= 0);
      if (l) {
        l.light.position.copy(pos);
        l.light.color.setHex(color ?? 0xffc36b);
        l.light.intensity = 30;
        l.life = 0.07;
      }
    }
  }

  // ── shell casings ─────────────────────────────────────────

  private initShells() {
    const geo = new THREE.BoxGeometry(0.02, 0.02, 0.055);
    const mat = new THREE.MeshStandardMaterial({ color: 0xc9a84c, metalness: 0.8, roughness: 0.3 });
    for (let i = 0; i < MAX_SHELLS; i++) {
      const mesh = new THREE.Mesh(geo, mat);
      mesh.visible = false;
      this.scene.add(mesh);
      this.shells.push({ mesh, vel: new THREE.Vector3(), spin: new THREE.Vector3(), life: 0 });
    }
  }

  ejectShell(pos: THREE.Vector3, right: THREE.Vector3, up: THREE.Vector3) {
    const s = this.shells.find((x) => x.life <= 0);
    if (!s) return;
    s.mesh.position.copy(pos);
    s.vel.set(
      right.x * (1.6 + Math.random()) + up.x * 1.4,
      2 + Math.random() * 1.2,
      right.z * (1.6 + Math.random()) + up.z * 1.4
    );
    s.spin.set(Math.random() * 22, Math.random() * 22, Math.random() * 22);
    s.life = 1.1;
    s.mesh.visible = true;
  }

  // ── update ────────────────────────────────────────────────

  update(dt: number) {
    this.updateDecals(dt);
    // particles
    let ai = 0, si = 0;
    const g9 = dt;
    for (let i = 0; i < MAX_PARTICLES; i++) {
      const p = this.pools[i];
      if (!p.alive) continue;
      p.life -= dt;
      if (p.life <= 0) {
        p.alive = false; p.py = -999;
        continue;
      }
      p.vy -= p.gravity * g9;
      p.px += p.vx * dt; p.py += p.vy * dt; p.pz += p.vz * dt;
      if (p.py < 0.02 && p.vy < 0) { p.py = 0.02; p.vy *= -0.35; p.vx *= 0.7; p.vz *= 0.7; }
      const k = p.life / p.maxLife;
      if (p.additive) {
        this.posAdd[ai * 3] = p.px; this.posAdd[ai * 3 + 1] = p.py; this.posAdd[ai * 3 + 2] = p.pz;
        this.colAdd[ai * 3] = p.r * k; this.colAdd[ai * 3 + 1] = p.g * k; this.colAdd[ai * 3 + 2] = p.b * k;
        this.sizeAdd[ai] = p.size * (0.5 + k * 0.5);
        ai++;
      } else {
        this.posSoft[si * 3] = p.px; this.posSoft[si * 3 + 1] = p.py; this.posSoft[si * 3 + 2] = p.pz;
        this.colSoft[si * 3] = p.r; this.colSoft[si * 3 + 1] = p.g; this.colSoft[si * 3 + 2] = p.b;
        this.sizeSoft[si] = p.size * (0.6 + (1 - k) * 0.8);
        si++;
      }
    }
    // compact dead space: fill remaining slots with offscreen
    for (let i = ai; i < MAX_PARTICLES; i++) { this.posAdd[i * 3 + 1] = -999; this.sizeAdd[i] = 0.001; }
    for (let i = si; i < MAX_PARTICLES; i++) { this.posSoft[i * 3 + 1] = -999; this.sizeSoft[i] = 0.001; }
    (this.pointsAdd.geometry.getAttribute("position") as THREE.BufferAttribute).needsUpdate = true;
    (this.pointsAdd.geometry.getAttribute("color") as THREE.BufferAttribute).needsUpdate = true;
    (this.pointsAdd.geometry.getAttribute("size") as THREE.BufferAttribute).needsUpdate = true;
    (this.pointsSoft.geometry.getAttribute("position") as THREE.BufferAttribute).needsUpdate = true;
    (this.pointsSoft.geometry.getAttribute("color") as THREE.BufferAttribute).needsUpdate = true;
    (this.pointsSoft.geometry.getAttribute("size") as THREE.BufferAttribute).needsUpdate = true;

    // tracers
    for (const t of this.tracers) {
      if (t.life > 0) {
        t.life -= dt;
        t.mat.opacity = Math.max(0, (t.life / t.maxLife)) * 0.9;
        if (t.life <= 0) t.line.visible = false;
      }
    }
    // flashes
    for (const f of this.flashes) {
      if (f.life > 0) {
        f.life -= dt;
        f.sprite.material.opacity = Math.max(0, f.life / 0.05);
        if (f.life <= 0) f.sprite.visible = false;
      }
    }
    for (const l of this.lights) {
      if (l.life > 0) {
        l.life -= dt;
        l.light.intensity = Math.max(0, (l.life / 0.07)) * 30;
        if (l.life <= 0) l.light.intensity = 0;
      }
    }
    // shells
    for (const s of this.shells) {
      if (s.life > 0) {
        s.life -= dt;
        s.vel.y -= 14 * dt;
        s.mesh.position.addScaledVector(s.vel, dt);
        if (s.mesh.position.y < 0.03) {
          s.mesh.position.y = 0.03;
          s.vel.y *= -0.4;
          s.vel.x *= 0.6; s.vel.z *= 0.6;
          s.spin.multiplyScalar(0.5);
        }
        s.mesh.rotation.x += s.spin.x * dt;
        s.mesh.rotation.y += s.spin.y * dt;
        s.mesh.rotation.z += s.spin.z * dt;
        if (s.life <= 0) s.mesh.visible = false;
      }
    }
  }
}
