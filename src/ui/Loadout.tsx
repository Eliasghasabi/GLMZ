// ─────────────────────────────────────────────────────────────
//  LOADOUT / CUSTOMIZATION SCREEN
//
//  Three categories — Skins, Attachments, Character — over a live
//  3D preview the player can rotate and inspect. Attachment picks
//  show a stat delta BEFORE committing, and locked entries display
//  their unlock requirement with live progress.
// ─────────────────────────────────────────────────────────────

import { useEffect, useMemo, useRef, useState } from "react";
import { audio } from "../game/audio";
import { WEAPONS, WEAPON_ORDER } from "../game/weapons";
import type { WeaponId } from "../game/wpnkit";
import { LoadoutPreview } from "../game/customize/preview";
import { SKINS, type SkinDef, type SkinRarity } from "../game/customize/skins";
import {
  SLOTS, attachmentsForSlot, ATTACH_BY_ID,
  type SlotId, type AttachmentDef,
} from "../game/customize/attachments";
import { GLOVES, SLEEVES, WRISTS, type GearTier } from "../game/customize/character";
import {
  getLoadout, getWeaponLoadout, setWeaponSkin, setWeaponAttachment,
  setCharacter, resetWeaponLoadout, isUnlocked, describeUnlock,
  unlockProgress, unlockSummary, previewDef, effectiveDef,
  onLoadoutChange, type UnlockReq,
} from "../game/customize/loadout";
import {
  ChevronLeft, Lock, Check, RotateCcw, Palette, Wrench, User, Shield,
} from "lucide-react";

const RARITY: Record<SkinRarity, { label: string; ring: string; text: string }> = {
  standard: { label: "STANDARD", ring: "border-[#39424d]", text: "text-[#8fa8bf]" },
  rare: { label: "RARE", ring: "border-[#3f7fb8]", text: "text-[#6fb2ee]" },
  epic: { label: "EPIC", ring: "border-[#8a5fd0]", text: "text-[#b48cff]" },
  legendary: { label: "LEGENDARY", ring: "border-[#e8b545]", text: "text-[#ffd76a]" },
};

type Tab = "skins" | "attachments" | "character";

const TIER_TEXT: Record<GearTier, string> = {
  standard: "text-[#8fa8bf]",
  field: "text-[#6fb2ee]",
  specialist: "text-[#b48cff]",
  elite: "text-[#ffd76a]",
};

function click() { audio.init(); audio.uiClick(); }
function hover() { audio.uiHover(); }

/** locked overlay with live unlock progress */
function LockBadge({ req }: { req: UnlockReq }) {
  const { have, need } = unlockProgress(req);
  const pct = Math.min(100, (have / need) * 100);
  return (
    <div className="absolute inset-0 flex flex-col items-center justify-center gap-1 bg-[#05070b]/82 backdrop-blur-[1px]">
      <Lock size={13} className="text-[#e8b545]" />
      <div className="px-1 text-center text-[8px] leading-tight tracking-[0.12em] text-[#9fb0c2]">
        {describeUnlock(req)}
      </div>
      <div className="h-0.5 w-12 bg-[#1e2831]">
        <div className="h-full bg-[#e8b545]" style={{ width: `${pct}%` }} />
      </div>
      <div className="font-mono2 text-[8px] text-[#647489]">
        {Math.min(have, need).toLocaleString()}/{need.toLocaleString()}
      </div>
    </div>
  );
}

export default function Loadout({ onBack }: { onBack: () => void }) {
  const mountRef = useRef<HTMLDivElement>(null);
  const previewRef = useRef<LoadoutPreview | null>(null);

  const [weapon, setWeapon] = useState<WeaponId>("assault");
  const [tab, setTab] = useState<Tab>("skins");
  const [slot, setSlot] = useState<SlotId>("sight");
  const [, force] = useState(0);
  const rerender = () => force((n) => n + 1);

  // hovered attachment drives both the preview and the stat delta
  const [ghost, setGhost] = useState<string | null>(null);

  useEffect(() => onLoadoutChange(rerender), []);

  // ── preview lifecycle ──
  useEffect(() => {
    if (!mountRef.current) return;
    const p = new LoadoutPreview(mountRef.current);
    previewRef.current = p;
    const onResize = () => p.resize();
    window.addEventListener("resize", onResize);
    return () => {
      window.removeEventListener("resize", onResize);
      p.dispose();
      previewRef.current = null;
    };
  }, []);

  const wl = getWeaponLoadout(weapon);
  const lo = getLoadout();

  // attachment set including whatever is being previewed
  const shownAttachments = useMemo(() => {
    const ids = SLOTS.map((s) => wl.attachments[s.id]);
    if (ghost) {
      const g = ATTACH_BY_ID.get(ghost);
      if (g) {
        const i = SLOTS.findIndex((s) => s.id === g.slot);
        if (i >= 0) ids[i] = ghost;
      }
    }
    return ids;
  }, [wl, ghost]);

  // push state into the 3D preview — the Character tab swaps the
  // viewport to a close-up of the hand so gloves can be judged
  useEffect(() => {
    const p = previewRef.current;
    if (!p) return;
    if (tab === "character") p.showCharacter(lo.character);
    else p.show(weapon, wl.skin, shownAttachments, lo.character);
  }, [tab, weapon, wl.skin, shownAttachments, lo.character]);

  const base = effectiveDef(weapon);
  const ghosted = previewDef(weapon, shownAttachments);
  const summary = unlockSummary();

  // ── stat rows, with deltas against the committed loadout ──
  const statRows: [string, number, number, boolean][] = [
    ["DAMAGE", base.damage, ghosted.damage, true],
    ["FIRE RATE", base.rpm, ghosted.rpm, true],
    ["MAGAZINE", base.magSize, ghosted.magSize, true],
    ["RELOAD", base.reloadTime, ghosted.reloadTime, false],
    ["ZOOM", base.zoom, ghosted.zoom, true],
    ["ADS SPEED", base.adsSpeedMul, ghosted.adsSpeedMul, true],
    ["RECOIL", base.recoilPitch * 1000, ghosted.recoilPitch * 1000, false],
    ["ACCURACY", 1 / base.spreadAds, 1 / ghosted.spreadAds, true],
    ["MOBILITY", base.moveSpeedMul, ghosted.moveSpeedMul, true],
  ];

  const fmt = (label: string, v: number) => {
    if (label === "RELOAD") return `${v.toFixed(2)}s`;
    if (label === "ZOOM") return `${v.toFixed(1)}×`;
    if (label === "ADS SPEED" || label === "MOBILITY") return `${Math.round(v * 100)}%`;
    if (label === "ACCURACY") return v.toFixed(1);
    if (label === "RECOIL") return v.toFixed(1);
    return String(Math.round(v));
  };

  const cell = "relative overflow-hidden clip-btn border transition-all";

  return (
    <div className="absolute inset-0 z-30 flex flex-col bg-[#05070b]">
      <div className="menu-grid opacity-40" />

      {/* ── header ── */}
      <div className="relative flex shrink-0 items-center gap-4 border-b border-[#1e2831] px-5 py-3">
        <button
          type="button"
          onMouseDown={(e) => e.stopPropagation()}
          onClick={(e) => { e.stopPropagation(); click(); onBack(); }}
          onMouseEnter={hover}
          className="btn-tac clip-btn flex items-center gap-2 px-4 py-2 text-xs"
        >
          <ChevronLeft size={15} /> BACK
        </button>
        <h2 className="font-display text-xl tracking-[0.15em] text-white">LOADOUT</h2>
        <div className="ml-auto flex items-center gap-2 text-[10px] tracking-[0.2em] text-[#8fa8bf]">
          <Shield size={12} className="text-[#e8b545]" />
          {summary.owned}/{summary.total} UNLOCKED
        </div>
      </div>

      <div className="relative flex min-h-0 flex-1 flex-col lg:flex-row">
        {/* ── weapon rail ── */}
        <div className="flex shrink-0 gap-1 overflow-x-auto border-b border-[#1e2831] p-2 lg:w-40 lg:flex-col lg:overflow-y-auto lg:border-b-0 lg:border-r">
          {WEAPON_ORDER.map((id) => (
            <button
              key={id}
              type="button"
              onMouseDown={(e) => e.stopPropagation()}
              onClick={(e) => { e.stopPropagation(); click(); setWeapon(id); setGhost(null); }}
              onMouseEnter={hover}
              className={`clip-btn shrink-0 border px-3 py-2 text-left text-[10px] tracking-[0.12em] transition-all ${
                weapon === id
                  ? "border-[#e8b545] bg-[#2a2210] text-[#e8b545]"
                  : "border-[#2c3641] bg-[#0b1016] text-[#7c8ea1] hover:text-[#aebdcb]"
              }`}
            >
              <div className="font-bold">{WEAPONS[id].short}</div>
              <div className="hidden truncate text-[9px] opacity-70 lg:block">{WEAPONS[id].name}</div>
            </button>
          ))}
        </div>

        {/* ── 3D preview ── */}
        <div className="relative min-h-[220px] flex-1 lg:min-h-0">
          <div ref={mountRef} className="absolute inset-0" />
          <div className="pointer-events-none absolute left-0 top-0 p-4">
            <div className="font-display text-lg tracking-[0.1em] text-white">
              {tab === "character" ? "OPERATOR GEAR" : WEAPONS[weapon].name}
            </div>
            <div className="text-[10px] tracking-[0.25em] text-[#e8b545]">
              {tab === "character"
                ? (GLOVES.find((g) => g.id === lo.character.gloves) ?? GLOVES[0]).name.toUpperCase()
                : (SKINS.find((s) => s.id === wl.skin) ?? SKINS[0]).name.toUpperCase()}
            </div>
            {WEAPONS[weapon].blurb && (
              <div className="mt-1 max-w-[260px] text-[10px] leading-relaxed text-[#647489]">
                {WEAPONS[weapon].blurb}
              </div>
            )}
          </div>
          <div className="pointer-events-none absolute bottom-3 left-0 w-full text-center text-[9px] tracking-[0.28em] text-[#4b5a6b]">
            DRAG TO ROTATE · SCROLL TO ZOOM
          </div>
          <button
            type="button"
            onMouseDown={(e) => e.stopPropagation()}
            onClick={(e) => { e.stopPropagation(); click(); previewRef.current?.resetView(); }}
            className="clip-btn absolute right-3 top-3 border border-[#2c3641] bg-[#0b1016]/80 px-2.5 py-1.5 text-[9px] tracking-[0.15em] text-[#8fa8bf] hover:text-white"
          >
            RESET VIEW
          </button>
        </div>

        {/* ── options panel ── */}
        <div className="flex min-h-0 w-full shrink-0 flex-col border-t border-[#1e2831] lg:w-[380px] lg:border-l lg:border-t-0">
          {/* tabs */}
          <div className="flex shrink-0 border-b border-[#1e2831]">
            {([
              ["skins", "SKINS", <Palette key="p" size={13} />],
              ["attachments", "ATTACHMENTS", <Wrench key="w" size={13} />],
              ["character", "CHARACTER", <User key="u" size={13} />],
            ] as const).map(([id, label, icon]) => (
              <button
                key={id}
                type="button"
                onMouseDown={(e) => e.stopPropagation()}
                onClick={(e) => { e.stopPropagation(); click(); setTab(id as Tab); setGhost(null); }}
                onMouseEnter={hover}
                className={`flex flex-1 items-center justify-center gap-1.5 py-2.5 text-[10px] tracking-[0.15em] transition-all ${
                  tab === id
                    ? "border-b-2 border-[#e8b545] bg-[#141009] text-[#e8b545]"
                    : "text-[#647489] hover:text-[#9fb0c2]"
                }`}
              >
                {icon} {label}
              </button>
            ))}
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto p-3">
            {/* ══ SKINS ══ */}
            {tab === "skins" && (
              <div className="grid grid-cols-2 gap-2">
                {SKINS.map((s: SkinDef) => {
                  const unlocked = isUnlocked(s.unlock);
                  const equipped = wl.skin === s.id;
                  const r = RARITY[s.rarity];
                  return (
                    <button
                      key={s.id}
                      type="button"
                      disabled={!unlocked}
                      onMouseDown={(e) => e.stopPropagation()}
                      onClick={(e) => {
                        e.stopPropagation();
                        if (!unlocked) return;
                        click();
                        setWeaponSkin(weapon, s.id);
                      }}
                      onMouseEnter={hover}
                      className={`${cell} ${equipped ? "border-[#e8b545] bg-[#1d1708]" : `${r.ring} bg-[#0b1016] hover:bg-[#111820]`} p-2 text-left`}
                    >
                      <div
                        className="mb-1.5 h-10 w-full rounded-sm"
                        style={{ background: `linear-gradient(135deg, ${s.swatch[0]} 0%, ${s.swatch[1]} 100%)` }}
                      />
                      <div className="flex items-center gap-1">
                        <span className="truncate text-[10px] font-semibold tracking-wide text-white">{s.name}</span>
                        {equipped && <Check size={11} className="ml-auto shrink-0 text-[#e8b545]" />}
                      </div>
                      <div className={`text-[8px] tracking-[0.18em] ${r.text}`}>{r.label}</div>
                      {(s.fx || s.trail) && (
                        <div className="mt-0.5 text-[8px] tracking-[0.1em] text-[#5fd6b4]">◆ ANIMATED</div>
                      )}
                      {!unlocked && s.unlock && <LockBadge req={s.unlock} />}
                    </button>
                  );
                })}
              </div>
            )}

            {/* ══ ATTACHMENTS ══ */}
            {tab === "attachments" && (
              <div>
                <div className="mb-2 flex flex-wrap gap-1">
                  {SLOTS.map((sl) => (
                    <button
                      key={sl.id}
                      type="button"
                      onMouseDown={(e) => e.stopPropagation()}
                      onClick={(e) => { e.stopPropagation(); click(); setSlot(sl.id); setGhost(null); }}
                      onMouseEnter={hover}
                      className={`clip-btn border px-2 py-1 text-[9px] tracking-[0.12em] transition-all ${
                        slot === sl.id
                          ? "border-[#e8b545] bg-[#2a2210] text-[#e8b545]"
                          : "border-[#2c3641] bg-[#0b1016] text-[#647489] hover:text-[#9fb0c2]"
                      }`}
                    >
                      {sl.label}
                    </button>
                  ))}
                </div>
                <div className="mb-2 text-[9px] italic tracking-wide text-[#647489]">
                  {SLOTS.find((s) => s.id === slot)?.hint}
                </div>

                <div className="space-y-1.5" onMouseLeave={() => setGhost(null)}>
                  {attachmentsForSlot(slot).map((a: AttachmentDef) => {
                    const unlocked = isUnlocked(a.unlock);
                    const equipped = wl.attachments[slot] === a.id;
                    return (
                      <button
                        key={a.id}
                        type="button"
                        disabled={!unlocked}
                        onMouseDown={(e) => e.stopPropagation()}
                        onClick={(e) => {
                          e.stopPropagation();
                          if (!unlocked) return;
                          click();
                          setWeaponAttachment(weapon, slot, a.id);
                          setGhost(null);
                        }}
                        onMouseEnter={() => { hover(); if (unlocked) setGhost(a.id); }}
                        className={`${cell} w-full ${
                          equipped ? "border-[#e8b545] bg-[#1d1708]" : "border-[#2c3641] bg-[#0b1016] hover:bg-[#111820]"
                        } p-2 text-left`}
                      >
                        <div className="flex items-center gap-1.5">
                          <span className="text-[11px] font-semibold text-white">{a.name}</span>
                          {equipped && <Check size={11} className="ml-auto shrink-0 text-[#e8b545]" />}
                        </div>
                        <div className="mt-0.5 text-[9px] leading-snug text-[#8fa8bf]">{a.desc}</div>
                        {!unlocked && a.unlock && <LockBadge req={a.unlock} />}
                      </button>
                    );
                  })}
                </div>

                <button
                  type="button"
                  onMouseDown={(e) => e.stopPropagation()}
                  onClick={(e) => { e.stopPropagation(); click(); resetWeaponLoadout(weapon); setGhost(null); }}
                  onMouseEnter={hover}
                  className="btn-tac clip-btn mt-3 flex w-full items-center justify-center gap-2 py-2 text-[10px]"
                >
                  <RotateCcw size={12} /> RESET WEAPON
                </button>
              </div>
            )}

            {/* ══ CHARACTER ══ */}
            {tab === "character" && (
              <div className="space-y-4">
                {([
                  ["GLOVES", GLOVES, lo.character.gloves, (id: string) => setCharacter({ gloves: id })],
                  ["SLEEVES", SLEEVES, lo.character.sleeve, (id: string) => setCharacter({ sleeve: id })],
                  ["WRIST GEAR", WRISTS, lo.character.wrist, (id: string) => setCharacter({ wrist: id })],
                ] as const).map(([label, list, active, setter]) => (
                  <div key={label}>
                    <div className="mb-1.5 flex items-center justify-between">
                      <span className="text-[10px] tracking-[0.25em] text-[#e8b545]">{label}</span>
                      <span className="text-[9px] tracking-[0.15em] text-[#4b5a6b]">
                        {(list as readonly any[]).length} OPTIONS
                      </span>
                    </div>
                    {/* grouped by tier so the list reads as a wardrobe */}
                    {(["standard", "field", "specialist", "elite"] as GearTier[]).map((tier) => {
                      const group = (list as readonly any[]).filter((o) => (o.tier ?? "standard") === tier);
                      if (!group.length) return null;
                      return (
                        <div key={tier} className="mb-2">
                          <div className={`mb-1 text-[8px] tracking-[0.3em] ${TIER_TEXT[tier]}`}>
                            {tier.toUpperCase()}
                          </div>
                          <div className="grid grid-cols-2 gap-1.5">
                      {group.map((o) => {
                        const unlocked = isUnlocked(o.unlock);
                        const equipped = active === o.id;
                        return (
                          <button
                            key={o.id}
                            type="button"
                            disabled={!unlocked}
                            onMouseDown={(e) => e.stopPropagation()}
                            onClick={(e) => {
                              e.stopPropagation();
                              if (!unlocked) return;
                              click();
                              setter(o.id);
                            }}
                            onMouseEnter={hover}
                            className={`${cell} ${
                              equipped ? "border-[#e8b545] bg-[#1d1708]" : "border-[#2c3641] bg-[#0b1016] hover:bg-[#111820]"
                            } flex items-center gap-2 p-2 text-left`}
                          >
                            {o.swatch ? (
                              <span
                                className="h-6 w-6 shrink-0 rounded-sm border border-[#2c3641]"
                                style={{ background: `linear-gradient(135deg, ${o.swatch[0]}, ${o.swatch[1]})` }}
                              />
                            ) : "color" in o ? (
                              <span
                                className="h-6 w-6 shrink-0 rounded-sm border border-[#2c3641]"
                                style={{ background: `#${(o.color as number).toString(16).padStart(6, "0")}` }}
                              />
                            ) : null}
                            <span className="min-w-0 flex-1">
                              <span className="block truncate text-[10px] font-semibold text-white">{o.name}</span>
                              <span className="block truncate text-[8px] text-[#647489]">{o.desc}</span>
                              {/* material + construction, so the choice is legible */}
                              {o.weave && (
                                <span className="mt-0.5 flex flex-wrap gap-1">
                                  <span className="rounded-sm bg-[#141a21] px-1 text-[7px] tracking-wider text-[#8fa8bf]">
                                    {String(o.weave).toUpperCase()}
                                  </span>
                                  {o.coverage && o.coverage !== "full" && (
                                    <span className="rounded-sm bg-[#141a21] px-1 text-[7px] tracking-wider text-[#8fa8bf]">
                                      {String(o.coverage).toUpperCase()}
                                    </span>
                                  )}
                                  {o.plating && (
                                    <span className="rounded-sm bg-[#231c0c] px-1 text-[7px] tracking-wider text-[#e8b545]">
                                      ARMOURED
                                    </span>
                                  )}
                                </span>
                              )}
                            </span>
                            {equipped && <Check size={11} className="shrink-0 text-[#e8b545]" />}
                            {!unlocked && o.unlock && <LockBadge req={o.unlock} />}
                          </button>
                        );
                      })}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                ))}
                <div className="border-t border-[#1e2831] pt-2 text-[9px] leading-relaxed text-[#647489]">
                  Every glove is its own material — weave, stitching, wear and armour
                  are baked into a dedicated texture set. Drag the preview to inspect.
                </div>
              </div>
            )}
          </div>

          {/* ── stat readout ── */}
          <div className="shrink-0 border-t border-[#1e2831] bg-[#080c11] p-3">
            <div className="mb-1.5 flex items-center justify-between">
              <span className="text-[9px] tracking-[0.25em] text-[#8fa8bf]">WEAPON STATS</span>
              {ghost && <span className="text-[9px] tracking-[0.2em] text-[#e8b545]">PREVIEWING</span>}
            </div>
            <div className="grid grid-cols-3 gap-x-3 gap-y-1">
              {statRows.map(([label, cur, next, higherBetter]) => {
                const diff = next - cur;
                const changed = Math.abs(diff) > 1e-4;
                const good = higherBetter ? diff > 0 : diff < 0;
                return (
                  <div key={label} className="flex flex-col">
                    <span className="text-[8px] tracking-[0.12em] text-[#647489]">{label}</span>
                    <span className={`font-mono2 text-[11px] ${changed ? (good ? "text-[#7dd87d]" : "text-[#ff7a6a]") : "text-white"}`}>
                      {fmt(label, next)}
                      {changed && (
                        <span className="ml-1 text-[8px]">
                          {good ? "▲" : "▼"}
                        </span>
                      )}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
