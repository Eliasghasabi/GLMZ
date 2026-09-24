// ─────────────────────────────────────────────────────────────
//  TouchControls — on-screen controls for touch devices.
//
//  Rendered only when a touch device is detected, so desktop
//  keyboard/mouse play is completely untouched.
//
//  Layout
//    left  : virtual joystick (drag to move, push far to sprint)
//    right : full-area look pad (drag to aim) + action buttons
//
//  Every control is pointer-event based and tracks its own
//  pointerId, so multi-touch works — you can strafe, aim and fire
//  simultaneously. Buttons live ABOVE the look pad in z-order and
//  stop propagation so a button press never also swings the camera.
// ─────────────────────────────────────────────────────────────

import { useEffect, useRef, useState } from "react";
import { getGame } from "../game/instance";
import { WEAPONS, WEAPON_ORDER, type WeaponId } from "../game/weapons";
import { bus, hud as initialHud, type HudData } from "../store";
import { Flame, Crosshair, RotateCcw, ChevronsUp, Swords, Pause as PauseIcon } from "lucide-react";

/** touch-capable device with no fine pointer (i.e. not a laptop trackpad).
 *
 *  Inside an Android WebView (Capacitor wrapper), the standard
 *  `pointer: coarse` media query and `ontouchstart` flag can be
 *  unreliable — some WebView builds report a fine pointer even on
 *  a touch-only phone. So we additionally check the Capacitor native
 *  bridge signal: if `Capacitor.isNativePlatform()` returns true we
 *  know we're inside the APK and the device is guaranteed to be a
 *  touch device (phones/tablets are the only thing the APK ships
 *  to). This makes the touch UI show up correctly inside the
 *  Android build without breaking the desktop browser experience. */
export function isTouchDevice(): boolean {
  if (typeof window === "undefined") return false;
  // 1. Capacitor native bridge = Android/iOS shell → always touch
  try {
    const cap = (window as any).Capacitor;
    if (cap?.isNativePlatform?.()) return true;
  } catch { /* ignore */ }
  // 2. Standard web touch detection
  const coarse = window.matchMedia?.("(pointer: coarse)").matches ?? false;
  const touch = "ontouchstart" in window || (navigator.maxTouchPoints ?? 0) > 0;
  // On the web build, require BOTH signals to avoid false-positives
  // on laptops with touchscreens (which the player uses mouse+kb on).
  return touch && coarse;
}

const JOY_R = 62;      // joystick base radius (px)
const KNOB_R = 27;
const SPRINT_AT = 0.82; // push past this fraction of the ring to sprint

export default function TouchControls() {
  const [hud, setHud] = useState<HudData>({ ...initialHud });
  useEffect(() => bus.on("hud", (h: HudData) => setHud(h)), []);

  const [scoped, setScoped] = useState(false);
  useEffect(() => bus.on("scope", (v: boolean) => setScoped(v)), []);

  // ── joystick ──
  const joyRef = useRef<HTMLDivElement>(null);
  const joyId = useRef<number | null>(null);
  const joyOrigin = useRef({ x: 0, y: 0 });
  const [knob, setKnob] = useState({ x: 0, y: 0 });
  const [sprinting, setSprinting] = useState(false);
  // authoritative sprint state — refs update synchronously, state is only
  // for the visual ring and lags behind a burst of pointermove events
  const sprintOn = useRef(false);

  const applyJoy = (cx: number, cy: number) => {
    let dx = cx - joyOrigin.current.x;
    let dy = cy - joyOrigin.current.y;
    const d = Math.hypot(dx, dy);
    const max = JOY_R;
    if (d > max) { dx = (dx / d) * max; dy = (dy / d) * max; }
    setKnob({ x: dx, y: dy });
    const nx = dx / max;
    const ny = dy / max;
    const g = getGame();
    // screen-up (-y) is forward, matching the player's -Z forward axis
    g?.touchMove(nx, ny);
    const far = Math.hypot(nx, ny) > SPRINT_AT && ny < -0.35;
    if (far !== sprintOn.current) {
      sprintOn.current = far;
      setSprinting(far);
      g?.touchSprint(far);
    }
  };

  const endJoy = () => {
    joyId.current = null;
    sprintOn.current = false;
    setKnob({ x: 0, y: 0 });
    setSprinting(false);
    const g = getGame();
    g?.touchMove(0, 0);
    g?.touchSprint(false);
  };

  // ── look pad ──
  const lookId = useRef<number | null>(null);
  const lookLast = useRef({ x: 0, y: 0 });
  const lookMoved = useRef(0);
  const lookTapStart = useRef(0);      // look pad only

  // ── weapon rack ──
  const [rackOpen, setRackOpen] = useState(false);
  const weaponPressStart = useRef(0);  // weapon button only
  const weaponPressId = useRef<number | null>(null);

  // release everything if the component unmounts mid-input
  useEffect(() => {
    return () => {
      const g = getGame();
      g?.touchMove(0, 0);
      g?.touchSprint(false);
      g?.touchFire(false);
      g?.touchAds(false);
    };
  }, []);

  const btn = (extra = "") =>
    `pointer-events-auto select-none touch-none flex items-center justify-center ` +
    `rounded-full border active:scale-95 transition-transform ${extra}`;

  /**
   * Wire a button so it owns exactly one pointer for the whole press.
   * Without this, a second finger landing on a held button (or a release
   * belonging to a different control) could toggle it off early, so a
   * hold-button like AIM would drop out while still physically pressed.
   */
  const press = (
    owner: React.MutableRefObject<number | null>,
    onDown: () => void,
    onUp?: () => void
  ) => ({
    onPointerDown: (e: React.PointerEvent) => {
      e.stopPropagation();
      e.preventDefault();
      if (owner.current !== null) return;          // already held
      owner.current = e.pointerId;
      (e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId);
      onDown();
    },
    onPointerUp: (e: React.PointerEvent) => {
      e.stopPropagation();
      if (owner.current !== e.pointerId) return;   // not our finger
      owner.current = null;
      onUp?.();
    },
    onPointerCancel: (e: React.PointerEvent) => {
      e.stopPropagation();
      if (owner.current !== e.pointerId) return;
      owner.current = null;
      onUp?.();
    },
    onLostPointerCapture: (e: React.PointerEvent) => {
      if (owner.current !== e.pointerId) return;
      owner.current = null;
      onUp?.();
    },
  });

  // one owner ref per button (stable across renders)
  const fireOwner = useRef<number | null>(null);
  const fireLast = useRef({ x: 0, y: 0 });
  const aimOwner = useRef<number | null>(null);
  const reloadOwner = useRef<number | null>(null);
  const jumpOwner = useRef<number | null>(null);
  const pauseOwner = useRef<number | null>(null);
  const rackOwner = useRef<number | null>(null);

  // ── layout customization: drag any control to reposition it, saved locally ──
  const LAYOUT_KEY = "shadowstrike.touchLayout.v1";
  const [editMode, setEditMode] = useState(false);
  const [layout, setLayout] = useState<Record<string, { x: number; y: number }>>(() => {
    try {
      return JSON.parse(localStorage.getItem(LAYOUT_KEY) || "{}");
    } catch {
      return {};
    }
  });
  const dragRef = useRef<{ id: string; pointerId: number; startX: number; startY: number; origX: number; origY: number } | null>(null);

  const offsetOf = (id: string) => layout[id] ?? { x: 0, y: 0 };
  const dragStyle = (id: string): React.CSSProperties => {
    const o = offsetOf(id);
    return o.x || o.y ? { transform: `translate(${o.x}px, ${o.y}px)` } : {};
  };

  const dragHandlers = (id: string) => ({
    onPointerDown: (e: React.PointerEvent) => {
      e.stopPropagation();
      e.preventDefault();
      (e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId);
      const o = offsetOf(id);
      dragRef.current = { id, pointerId: e.pointerId, startX: e.clientX, startY: e.clientY, origX: o.x, origY: o.y };
    },
    onPointerMove: (e: React.PointerEvent) => {
      const d = dragRef.current;
      if (!d || d.id !== id || d.pointerId !== e.pointerId) return;
      const nx = d.origX + (e.clientX - d.startX);
      const ny = d.origY + (e.clientY - d.startY);
      setLayout((prev) => ({ ...prev, [id]: { x: nx, y: ny } }));
    },
    onPointerUp: (e: React.PointerEvent) => {
      e.stopPropagation();
      if (dragRef.current?.id === id) dragRef.current = null;
      setLayout((prev) => {
        try { localStorage.setItem(LAYOUT_KEY, JSON.stringify(prev)); } catch { /* ignore */ }
        return prev;
      });
    },
    onPointerCancel: (e: React.PointerEvent) => {
      e.stopPropagation();
      if (dragRef.current?.id === id) dragRef.current = null;
    },
  });

  const resetLayout = () => {
    setLayout({});
    try { localStorage.removeItem(LAYOUT_KEY); } catch { /* ignore */ }
  };
  const editToggleOwner = useRef<number | null>(null);
  const resetOwner = useRef<number | null>(null);
  const doneOwner = useRef<number | null>(null);

  return (
    <div className="safe-inset pointer-events-none absolute inset-0 z-40 select-none">
      {/* ── LOOK PAD: covers the right half, sits under the buttons ── */}
      <div
        className="pointer-events-auto absolute inset-y-0 right-0 w-[62%] touch-none"
        onPointerDown={(e) => {
          if (editMode || lookId.current !== null) return;
          lookId.current = e.pointerId;
          lookLast.current = { x: e.clientX, y: e.clientY };
          lookMoved.current = 0;
          lookTapStart.current = performance.now();
          (e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId);
        }}
        onPointerMove={(e) => {
          if (lookId.current !== e.pointerId) return;
          const dx = e.clientX - lookLast.current.x;
          const dy = e.clientY - lookLast.current.y;
          lookLast.current = { x: e.clientX, y: e.clientY };
          lookMoved.current += Math.abs(dx) + Math.abs(dy);
          getGame()?.touchLook(dx, dy);
        }}
        onPointerUp={(e) => {
          if (lookId.current !== e.pointerId) return;
          lookId.current = null;
          // a quick stationary tap on the look pad fires a shot
          const quick = performance.now() - lookTapStart.current < 220;
          if (quick && lookMoved.current < 12) {
            const g = getGame();
            g?.touchFire(true);
            window.setTimeout(() => getGame()?.touchFire(false), 90);
          }
        }}
        onPointerCancel={() => { lookId.current = null; }}
      />

      {/* ── JOYSTICK (left) ── */}
      <div
        ref={joyRef}
        className={`pointer-events-auto absolute bottom-6 left-5 touch-none ${editMode ? "ring-2 ring-[#e8b545] ring-offset-2 ring-offset-transparent rounded-full" : ""}`}
        style={{ width: JOY_R * 2, height: JOY_R * 2, ...dragStyle("joy") }}
        {...(editMode
          ? dragHandlers("joy")
          : {
              onPointerDown: (e: React.PointerEvent) => {
                if (joyId.current !== null) return;
                joyId.current = e.pointerId;
                const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
                joyOrigin.current = { x: r.left + r.width / 2, y: r.top + r.height / 2 };
                (e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId);
                applyJoy(e.clientX, e.clientY);
              },
              onPointerMove: (e: React.PointerEvent) => {
                if (joyId.current !== e.pointerId) return;
                applyJoy(e.clientX, e.clientY);
              },
              onPointerUp: (e: React.PointerEvent) => { if (joyId.current === e.pointerId) endJoy(); },
              onPointerCancel: endJoy,
            })}
      >
        {/* ring */}
        <div
          className={`absolute inset-0 rounded-full border-2 transition-colors ${
            sprinting
              ? "border-[#e8b545]/80 bg-[#e8b545]/10"
              : "border-[#8fa8bf]/35 bg-[#0a0e13]/55"
          }`}
        />
        {/* cardinal ticks */}
        <div className="absolute inset-0 opacity-40">
          {[0, 90, 180, 270].map((a) => (
            <div
              key={a}
              className="absolute left-1/2 top-1/2 h-2 w-0.5 bg-[#8fa8bf]"
              style={{ transform: `rotate(${a}deg) translateY(-${JOY_R - 7}px)` }}
            />
          ))}
        </div>
        {/* knob */}
        <div
          className={`absolute rounded-full border shadow-lg transition-colors ${
            sprinting
              ? "border-[#e8b545] bg-[#e8b545]/35"
              : "border-[#aebdcb]/60 bg-[#16202a]/80"
          }`}
          style={{
            width: KNOB_R * 2,
            height: KNOB_R * 2,
            left: JOY_R - KNOB_R + knob.x,
            top: JOY_R - KNOB_R + knob.y,
          }}
        />
        <div className="absolute -top-6 left-1/2 -translate-x-1/2 whitespace-nowrap text-[9px] tracking-[0.2em] text-[#6d7f93]">
          {sprinting ? "SPRINT" : "MOVE"}
        </div>
      </div>

      {/* ── ACTION BUTTONS (right) ── */}
      {/* FIRE — press to shoot, drag while holding to also aim */}
      <div
        {...(editMode
          ? dragHandlers("fire")
          : {
              onPointerDown: (e: React.PointerEvent) => {
                e.stopPropagation();
                e.preventDefault();
                if (fireOwner.current !== null) return;
                fireOwner.current = e.pointerId;
                fireLast.current = { x: e.clientX, y: e.clientY };
                (e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId);
                getGame()?.touchFire(true);
              },
              onPointerMove: (e: React.PointerEvent) => {
                if (fireOwner.current !== e.pointerId) return;
                const dx = e.clientX - fireLast.current.x;
                const dy = e.clientY - fireLast.current.y;
                fireLast.current = { x: e.clientX, y: e.clientY };
                getGame()?.touchLook(dx * 0.8, dy * 0.8);
              },
              onPointerUp: (e: React.PointerEvent) => {
                e.stopPropagation();
                if (fireOwner.current !== e.pointerId) return;
                fireOwner.current = null;
                getGame()?.touchFire(false);
              },
              onPointerCancel: (e: React.PointerEvent) => {
                e.stopPropagation();
                if (fireOwner.current !== e.pointerId) return;
                fireOwner.current = null;
                getGame()?.touchFire(false);
              },
              onLostPointerCapture: (e: React.PointerEvent) => {
                if (fireOwner.current !== e.pointerId) return;
                fireOwner.current = null;
                getGame()?.touchFire(false);
              },
            })}
        style={dragStyle("fire")}
        className={btn(
          `absolute bottom-8 right-6 h-24 w-24 flex-col border-[#ff6a5a]/60 bg-[#3a1512]/75 text-[#ffb0a6] active:bg-[#ff5546]/50 ${editMode ? "ring-2 ring-[#e8b545]" : ""}`
        )}
      >
        <Flame size={20} className="mb-0.5" />
        <span className="text-[11px] font-bold tracking-[0.2em]">FIRE</span>
      </div>


      {/* AIM (hold) */}
      <div
        {...(editMode ? dragHandlers("aim") : press(aimOwner, () => getGame()?.touchAds(true), () => getGame()?.touchAds(false)))}
        style={dragStyle("aim")}
        className={btn(
          `absolute bottom-36 right-32 h-16 w-16 flex-col text-[10px] tracking-[0.15em] ${editMode ? "ring-2 ring-[#e8b545]" : ""} ${
            scoped
              ? "border-[#e8b545] bg-[#e8b545]/25 text-[#e8b545]"
              : "border-[#8fa8bf]/50 bg-[#0a0e13]/70 text-[#aebdcb]"
          }`
        )}
      >
        <Crosshair size={16} />
        AIM
      </div>

      {/* RELOAD */}
      <div
        {...(editMode ? dragHandlers("reload") : press(reloadOwner, () => getGame()?.touchReload()))}
        style={dragStyle("reload")}
        className={btn(
          `absolute bottom-8 right-32 h-16 w-16 flex-col text-[10px] tracking-[0.15em] ${editMode ? "ring-2 ring-[#e8b545]" : ""} ${
            hud.ammo === 0
              ? "border-[#e8b545] bg-[#e8b545]/25 text-[#e8b545]"
              : "border-[#8fa8bf]/50 bg-[#0a0e13]/70 text-[#aebdcb]"
          }`
        )}
      >
        <RotateCcw size={16} />
        {hud.reloading ? "···" : "RELOAD"}
      </div>

      {/* JUMP */}
      <div
        {...(editMode ? dragHandlers("jump") : press(jumpOwner, () => getGame()?.touchJump()))}
        style={dragStyle("jump")}
        className={btn(
          `absolute bottom-36 right-6 h-16 w-16 flex-col border-[#8fa8bf]/50 bg-[#0a0e13]/70 text-[10px] tracking-[0.15em] text-[#aebdcb] ${editMode ? "ring-2 ring-[#e8b545]" : ""}`
        )}
      >
        <ChevronsUp size={16} />
        JUMP
      </div>

      {/* WEAPON — tap to cycle, long-press opens the rack */}
      <div
        {...(editMode
          ? dragHandlers("weapon")
          : {
              onPointerDown: (e: React.PointerEvent) => {
                e.stopPropagation();
                e.preventDefault();
                if (weaponPressId.current !== null) return;
                weaponPressId.current = e.pointerId;
                weaponPressStart.current = performance.now();
                (e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId);
              },
              onPointerUp: (e: React.PointerEvent) => {
                e.stopPropagation();
                if (weaponPressId.current !== e.pointerId) return;
                weaponPressId.current = null;
                if (performance.now() - weaponPressStart.current > 420) setRackOpen((o) => !o);
                else getGame()?.touchNextWeapon();
              },
              onPointerCancel: (e: React.PointerEvent) => {
                e.stopPropagation();
                if (weaponPressId.current === e.pointerId) weaponPressId.current = null;
              },
            })}
        style={dragStyle("weapon")}
        className={btn(
          `pointer-events-auto absolute bottom-[8.5rem] left-[10.5rem] h-14 w-14 flex-col border-[#e8b545]/50 bg-[#2a2210]/75 text-[10px] font-bold tracking-[0.1em] text-[#e8b545] ${editMode ? "ring-2 ring-white" : ""}`
        )}
      >
        <Swords size={14} />
        {WEAPONS[WEAPON_ORDER[hud.weaponSlot] ?? "assault"].short}
      </div>

      {/* full weapon rack */}
      {rackOpen && (
        <div className="pointer-events-auto absolute bottom-[11.5rem] left-20 grid max-h-[52vh] grid-cols-2 gap-1">
          {WEAPON_ORDER.map((id: WeaponId, i) => (
            <div
              key={id}
              {...press(rackOwner, () => {
                rackOwner.current = null;   // this row unmounts immediately
                getGame()?.touchSwitchWeapon(id);
                setRackOpen(false);
              })}
              className={`clip-btn pointer-events-auto flex items-center gap-1.5 border px-2 py-1 text-[9px] tracking-[0.1em] ${
                hud.weaponSlot === i
                  ? "border-[#e8b545] bg-[#2a2210]/85 text-[#e8b545]"
                  : "border-[#2c3641] bg-[#10161d]/85 text-[#9fb0c2]"
              }`}
            >
              <span className="font-bold">{WEAPONS[id].short}</span>
              <span className="truncate">{WEAPONS[id].name}</span>
            </div>
          ))}
        </div>
      )}

      {/* PAUSE */}
      {!editMode && (
        <div
          {...press(pauseOwner, () => getGame()?.pause())}
          className={btn(
            "absolute right-4 top-16 h-10 w-10 border-[#8fa8bf]/40 bg-[#0a0e13]/70 text-[13px] text-[#aebdcb]"
          )}
        >
          <PauseIcon size={16} />
        </div>
      )}

      {/* EDIT LAYOUT toggle */}
      {!editMode && (
        <div
          {...press(editToggleOwner, () => setEditMode(true))}
          className={btn(
            "pointer-events-auto absolute left-4 top-16 h-10 w-10 border-[#8fa8bf]/40 bg-[#0a0e13]/70 text-[15px] text-[#aebdcb]"
          )}
        >
          ⚙
        </div>
      )}

      {editMode && (
        <>
          <div className="pointer-events-auto absolute left-1/2 top-16 -translate-x-1/2 whitespace-nowrap rounded-full border border-[#e8b545]/50 bg-[#0a0e13]/80 px-4 py-1.5 text-[10px] tracking-[0.1em] text-[#e8b545]">
            دکمه‌ها رو بکش و جابه‌جا کن
          </div>
          <div
            {...press(resetOwner, resetLayout)}
            className="pointer-events-auto absolute left-4 top-16 rounded-full border border-[#8fa8bf]/40 bg-[#0a0e13]/70 px-3 py-2 text-[10px] tracking-[0.1em] text-[#aebdcb] active:scale-95"
          >
            بازنشانی
          </div>
          <div
            {...press(doneOwner, () => setEditMode(false))}
            className="pointer-events-auto absolute right-4 top-16 rounded-full border border-[#e8b545] bg-[#2a2210]/85 px-4 py-2 text-[10px] font-bold tracking-[0.1em] text-[#e8b545] active:scale-95"
          >
            پایان
          </div>
        </>
      )}
    </div>
  );
}
