// ─────────────────────────────────────────────────────────────
//  LOADOUT PREVIEW RENDERER
//
//  A small self-contained Three.js viewport for the customization
//  screen. It builds its OWN weapon instances so previewing never
//  touches the live in-game view model — the player can audition
//  skins and attachment combinations freely and only what they
//  commit is persisted.
//
//  Supports drag-to-rotate, wheel zoom, and an idle auto-spin.
// ─────────────────────────────────────────────────────────────

import * as THREE from "three";
import { createWeaponModel, weaponViewScale } from "../weapons";
import type { WeaponId, WeaponModel } from "../wpnkit";
import {
  captureSkinTargets, applySkin, animateSkin, clearGenerated,
  SKIN_BY_ID, type SkinTargets, type SkinDef,
} from "./skins";
import {
  deriveAnchors, mountAttachments, makeAttachMats,
  type Anchors, type AttachMats,
} from "./attachments";
import { applyCharacter, applyWrist, currentHandStyle, type CharacterLoadout } from "./character";
import { buildHand, setHandStyle, applyRestPose, curlFinger, curlThumb, type HandRig } from "../hands/rig";

interface Entry {
  model: WeaponModel;
  targets: SkinTargets;
  anchors: Anchors;
  host: THREE.Group;
  pivot: THREE.Group;
}

export class LoadoutPreview {
  private renderer: THREE.WebGLRenderer;
  private scene = new THREE.Scene();
  private camera: THREE.PerspectiveCamera;
  private root = new THREE.Group();
  private entries = new Map<WeaponId, Entry>();
  private attachMats: AttachMats = makeAttachMats();
  private current: WeaponId | null = null;
  private skin: SkinDef | null = null;
  // ── character mode: the hands shown on their own ──
  private handPivot: THREE.Group | null = null;
  private handRig: HandRig | null = null;
  private mode: "weapon" | "character" = "weapon";

  private yaw = -0.6;
  private pitch = 0.12;
  private dist = 1.25;
  private targetYaw = -0.6;
  private targetPitch = 0.12;
  private spin = true;
  private t = 0;
  private raf = 0;
  private disposed = false;

  constructor(private container: HTMLElement) {
    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.15;
    container.appendChild(this.renderer.domElement);
    this.renderer.domElement.style.cssText = "width:100%;height:100%;display:block;cursor:grab;touch-action:none";

    this.camera = new THREE.PerspectiveCamera(38, 1, 0.01, 40);
    this.scene.add(this.root);

    // three-point studio lighting so materials read clearly
    this.scene.add(new THREE.AmbientLight(0x8ea3bd, 0.85));
    const key = new THREE.DirectionalLight(0xffffff, 2.6);
    key.position.set(2.2, 2.6, 2.4);
    this.scene.add(key);
    const fill = new THREE.DirectionalLight(0x9fc4ff, 1.1);
    fill.position.set(-2.4, 0.6, 1.2);
    this.scene.add(fill);
    const rim = new THREE.DirectionalLight(0xe8b545, 1.5);
    rim.position.set(-1.2, 1.4, -2.6);
    this.scene.add(rim);
    // subtle warm bounce from below so undersides aren't black
    const bounce = new THREE.DirectionalLight(0xffb877, 0.5);
    bounce.position.set(0, -2, 0.6);
    this.scene.add(bounce);

    this.bindInput();
    this.resize();
    this.loop();
  }

  // ── input ─────────────────────────────────────────────────

  private pointerId: number | null = null;
  private lastX = 0;
  private lastY = 0;

  private bindInput() {
    const el = this.renderer.domElement;
    el.addEventListener("pointerdown", (e) => {
      if (this.pointerId !== null) return;
      this.pointerId = e.pointerId;
      this.lastX = e.clientX;
      this.lastY = e.clientY;
      this.spin = false;
      el.setPointerCapture?.(e.pointerId);
      el.style.cursor = "grabbing";
    });
    el.addEventListener("pointermove", (e) => {
      if (this.pointerId !== e.pointerId) return;
      this.targetYaw += (e.clientX - this.lastX) * 0.011;
      this.targetPitch = THREE.MathUtils.clamp(
        this.targetPitch + (e.clientY - this.lastY) * 0.009, -0.9, 0.9
      );
      this.lastX = e.clientX;
      this.lastY = e.clientY;
    });
    const end = (e: PointerEvent) => {
      if (this.pointerId !== e.pointerId) return;
      this.pointerId = null;
      el.style.cursor = "grab";
    };
    el.addEventListener("pointerup", end);
    el.addEventListener("pointercancel", end);
    el.addEventListener("wheel", (e) => {
      e.preventDefault();
      this.dist = THREE.MathUtils.clamp(this.dist + e.deltaY * 0.0012, 0.55, 2.4);
    }, { passive: false });
  }

  // ── content ───────────────────────────────────────────────

  private ensure(id: WeaponId): Entry {
    let e = this.entries.get(id);
    if (e) return e;

    const model = createWeaponModel(id);
    const pivot = new THREE.Group();
    const s = weaponViewScale(id);
    model.group.scale.setScalar(s);
    model.group.visible = true;
    model.group.traverse((o) => {
      const m = o as THREE.Mesh;
      if (m.isMesh) {
        m.castShadow = false;
        m.receiveShadow = false;
        m.frustumCulled = false;
      }
    });

    const host = new THREE.Group();
    model.group.add(host);

    // centre the weapon on the pivot so it spins about its own mass
    const box = new THREE.Box3().setFromObject(model.group);
    const c = new THREE.Vector3();
    box.getCenter(c);
    model.group.position.sub(c);
    pivot.add(model.group);

    e = {
      model,
      targets: captureSkinTargets(model.group),
      anchors: deriveAnchors(model.group, model.muzzle, model.sight),
      host,
      pivot,
    };
    this.entries.set(id, e);
    return e;
  }

  /** show a weapon with a given skin + attachment set */
  show(id: WeaponId, skinId: string, attachIds: string[], character: CharacterLoadout) {
    if (this.disposed) return;
    this.mode = "weapon";
    if (this.handPivot) this.root.remove(this.handPivot);
    const e = this.ensure(id);
    if (this.current && this.current !== id) {
      const prev = this.entries.get(this.current);
      if (prev) this.root.remove(prev.pivot);
    }
    if (!this.root.children.includes(e.pivot)) this.root.add(e.pivot);
    this.current = id;

    const skin = SKIN_BY_ID.get(skinId);
    if (skin) {
      clearGenerated(e.targets);
      applySkin(e.targets, skin);
      this.skin = skin;
    }
    mountAttachments(e.host, e.anchors, attachIds, this.attachMats);
    applyCharacter(character);
    applyWrist(e.model.hands.right, character.wrist);

    // frame the weapon so longer rifles still fit the viewport
    const box = new THREE.Box3().setFromObject(e.pivot);
    const size = new THREE.Vector3();
    box.getSize(size);
    this.dist = Math.max(0.75, Math.max(size.x, size.z) * 1.5);
  }

  /**
   * Switch the viewport to the bare hand so glove materials can be
   * judged up close. Uses its own rig instance, so nothing the
   * player previews touches the in-game hands.
   */
  showCharacter(character: CharacterLoadout) {
    if (this.disposed) return;
    this.mode = "character";
    if (this.current) {
      const prev = this.entries.get(this.current);
      if (prev) this.root.remove(prev.pivot);
    }
    if (!this.handPivot) {
      this.handPivot = new THREE.Group();
      this.handRig = buildHand({ side: "right", coverage: "full", plating: true });
      // present the back of the hand to the camera at a readable angle
      this.handRig.root.rotation.set(0.15, 2.5, 0.35);
      this.handRig.root.position.set(0.02, -0.01, 0.06);
      this.handPivot.add(this.handRig.root);
    }
    if (!this.root.children.includes(this.handPivot)) this.root.add(this.handPivot);

    applyCharacter(character);
    const style = currentHandStyle(character);
    setHandStyle(this.handRig!, style.coverage, style.plating);
    applyWrist(this.handRig!.root, character.wrist);

    // relaxed inspection pose — fingers softly open, not gripping
    applyRestPose(this.handRig!);
    for (const f of this.handRig!.fingers) curlFinger(f, 0.22);
    curlThumb(this.handRig!.thumb, 0.18, 1);

    this.dist = 0.42;
  }

  /** return the viewport to weapon inspection */
  hideCharacter() {
    this.mode = "weapon";
    if (this.handPivot) this.root.remove(this.handPivot);
  }

  resetView() {
    this.targetYaw = -0.6;
    this.targetPitch = 0.12;
    this.spin = true;
  }

  // ── loop ──────────────────────────────────────────────────

  resize() {
    const w = this.container.clientWidth || 1;
    const h = this.container.clientHeight || 1;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }

  private loop = () => {
    if (this.disposed) return;
    this.raf = requestAnimationFrame(this.loop);
    const dt = 1 / 60;
    this.t += dt;

    if (this.spin) this.targetYaw += dt * 0.32;
    this.yaw += (this.targetYaw - this.yaw) * 0.14;
    this.pitch += (this.targetPitch - this.pitch) * 0.14;

    this.root.rotation.y = this.yaw;
    this.root.rotation.x = this.pitch;

    this.camera.position.set(0, 0.06, this.dist);
    this.camera.lookAt(0, 0, 0);

    // subtle life in the character preview so gloves read in motion
    if (this.mode === "character" && this.handRig) {
      const b = Math.sin(this.t * 1.2);
      this.handRig.wrist.rotation.x = b * 0.05;
      this.handRig.wrist.rotation.z = Math.sin(this.t * 0.8) * 0.04;
      for (let i = 0; i < this.handRig.fingers.length; i++) {
        curlFinger(this.handRig.fingers[i], 0.22 + Math.sin(this.t * 1.1 - i * 0.4) * 0.07);
      }
    }

    // keep animated skins and weapon detail alive in the preview
    const e = this.mode === "weapon" && this.current ? this.entries.get(this.current) : null;
    if (e) {
      e.model.animate?.(this.t, dt, 1, 0);
      if (this.skin) animateSkin(e.targets, this.skin, this.t, 0);
    }
    this.renderer.render(this.scene, this.camera);
  };

  dispose() {
    this.disposed = true;
    cancelAnimationFrame(this.raf);
    for (const e of this.entries.values()) {
      clearGenerated(e.targets);
      e.model.group.traverse((o) => {
        const m = o as THREE.Mesh;
        if (m.isMesh) m.geometry.dispose();
      });
    }
    this.entries.clear();
    this.handRig = null;
    this.handPivot = null;
    this.renderer.dispose();
    this.renderer.domElement.remove();
  }
}
