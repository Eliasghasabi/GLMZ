// ─────────────────────────────────────────────────────────────
//  HUD — crosshair, hitmarker, vitals, ammo, wave banner,
//  killfeed, damage vignette, sniper scope.
// ─────────────────────────────────────────────────────────────

import { useEffect, useState } from "react";
import { bus, type HudData, hud as initialHud, type BannerData, type KillConfirmData } from "../store";
import { WEAPONS, WEAPON_ORDER } from "../game/weapons";
import { Heart, Shield, Skull, Radar, Trophy } from "lucide-react";
import { isTouchDevice } from "./TouchControls";

function useBus<T>(event: string, initial: T): T {
  const [v, setV] = useState<T>(initial);
  useEffect(() => bus.on(event, (p: T) => setV(p)), [event]);
  return v;
}

interface FeedItem {
  id: number;
  text: string;
  tone: "kill" | "bonus" | "info";
}

let feedId = 0;

export default function Hud() {
  const hud = useBus<HudData>("hud", { ...initialHud });
  const scoped = useBus<boolean>("scope", false);
  const spread = useBus<number>("spread", 8);
  const banner = useBus<BannerData | null>("banner", null);

  // hitmarker
  const [hit, setHit] = useState<{ id: number; kill: boolean; headshot: boolean } | null>(null);
  useEffect(
    () =>
      bus.on("hit", (p: { kill: boolean; headshot: boolean }) => {
        setHit({ id: Date.now() + Math.random(), kill: p.kill, headshot: p.headshot });
      }),
    []
  );

  // sniper kill-confirm flash
  const [confirm, setConfirm] = useState<{ id: number; d: KillConfirmData } | null>(null);
  useEffect(
    () =>
      bus.on("killconfirm", (d: KillConfirmData) => {
        const id = Date.now() + Math.random();
        setConfirm({ id, d });
        window.setTimeout(
          () => setConfirm((c) => (c && c.id === id ? null : c)),
          Math.max(500, d.duration * 1000 + 260)
        );
      }),
    []
  );

  // unlock toasts — progression feedback mid-run
  const [unlocks, setUnlocks] = useState<{ id: number; name: string; kind: string }[]>([]);
  useEffect(
    () =>
      bus.on("unlocks", (list: { kind: string; name: string }[]) => {
        const items = list.map((u) => ({ id: Date.now() + Math.random(), name: u.name, kind: u.kind }));
        setUnlocks((prev) => [...prev, ...items].slice(-3));
        for (const it of items) {
          window.setTimeout(
            () => setUnlocks((prev) => prev.filter((x) => x.id !== it.id)),
            4200
          );
        }
      }),
    []
  );

  // damage vignette
  const [dmg, setDmg] = useState(0);
  useEffect(
    () =>
      bus.on("damage", () => {
        setDmg(1);
        requestAnimationFrame(() => requestAnimationFrame(() => setDmg(0)));
      }),
    []
  );
  const [heal, setHeal] = useState(0);
  useEffect(
    () =>
      bus.on("healflash", () => {
        setHeal(1);
        requestAnimationFrame(() => requestAnimationFrame(() => setHeal(0)));
      }),
    []
  );

  // killfeed
  const [feed, setFeed] = useState<FeedItem[]>([]);
  useEffect(
    () =>
      bus.on("killfeed", (p: { text: string; tone: FeedItem["tone"] }) => {
        const id = ++feedId;
        setFeed((f) => [...f.slice(-4), { id, text: p.text, tone: p.tone }]);
        window.setTimeout(() => setFeed((f) => f.filter((x) => x.id !== id)), 4200);
      }),
    []
  );

  // banner countdown
  const [countdown, setCountdown] = useState<number | null>(null);
  useEffect(() => {
    if (banner?.countdown) {
      setCountdown(banner.countdown);
      const iv = window.setInterval(() => {
        setCountdown((c) => {
          if (c === null || c <= 1) {
            window.clearInterval(iv);
            return null;
          }
          return c - 1;
        });
      }, 1000);
      return () => window.clearInterval(iv);
    }
    setCountdown(null);
  }, [banner]);

  const lowHp = hud.health <= 30 && hud.health > 0;
  const touch = isTouchDevice();
  const showHints = hud.wave === 1 && hud.kills < 3;

  return (
    <div className="pointer-events-none absolute inset-0 z-20 overflow-hidden">
      {/* static film layers */}
      <div className="fx-vignette-static absolute inset-0" />
      <div className="fx-scanlines absolute inset-0 opacity-60" />

      {/* damage / heal flashes */}
      <div className="fx-damage absolute inset-0" style={{ opacity: dmg }} />
      <div className="fx-heal absolute inset-0" style={{ opacity: heal }} />
      {lowHp && <div className="fx-damage lowhp absolute inset-0" />}

      {/* sniper scope */}
      {scoped && (
        <>
          <div className="scope-overlay" />
          <div className="scope-ring" />
          <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2">
            {[1, 2, 3].map((i) => (
              <div key={i}>
                <div className="absolute bg-[#0b0d10]" style={{ width: 1.5, height: 7, left: -0.75, top: i * 14 }} />
                <div className="absolute bg-[#0b0d10]" style={{ width: 1.5, height: 7, left: -0.75, top: -i * 14 - 7 }} />
                <div className="absolute bg-[#0b0d10]" style={{ width: 7, height: 1.5, top: -0.75, left: i * 14 }} />
                <div className="absolute bg-[#0b0d10]" style={{ width: 7, height: 1.5, top: -0.75, left: -i * 14 - 7 }} />
              </div>
            ))}
          </div>
        </>
      )}

      {/* crosshair */}
      {!scoped && (
        <div className="xh" style={{ ["--sp" as string]: `${Math.min(46, spread)}px` }}>
          <div className="tick t" />
          <div className="tick b" />
          <div className="tick l" />
          <div className="tick r" />
          <div className="dot" />
        </div>
      )}

      {/* ── sniper kill confirm ── */}
      {confirm && (
        <div
          key={confirm.id}
          className="kill-confirm absolute left-1/2 top-[calc(50%+58px)] -translate-x-1/2 text-center"
        >
          <div className="kill-confirm-bar mx-auto mb-1.5 h-px w-28 bg-gradient-to-r from-transparent via-[#e8b545] to-transparent" />
          <div className="font-display text-[15px] tracking-[0.3em] text-[#ffd77a]"
               style={{ textShadow: "0 0 18px rgba(232,181,69,0.65), 0 2px 4px rgba(0,0,0,0.9)" }}>
            {confirm.d.headshot ? "CONFIRMED · HEADSHOT" : "KILL CONFIRMED"}
          </div>
          <div className="mt-0.5 text-[9px] tracking-[0.34em] text-[#9fb0c2]">
            {confirm.d.name}
          </div>
        </div>
      )}

      {/* hitmarker */}
      {hit && (
        <div
          key={hit.id}
          className={`hitmarker show ${hit.kill ? "kill" : hit.headshot ? "head" : ""}`}
          onAnimationEnd={() => setHit(null)}
        >
          <span />
          <span />
          <span />
          <span />
        </div>
      )}

      {/* ── top center: wave + banner ── */}
      <div className="absolute left-1/2 top-5 -translate-x-1/2 text-center">
        <div className="flex items-center justify-center gap-2 text-[11px] tracking-[0.3em] text-[#8fa8bf]">
          <Radar size={13} className="text-[#e8b545]" />
          WAVE {String(hud.wave).padStart(2, "0")}
          <span className="text-[#5a6b7d]">·</span>
          <span className={hud.enemiesLeft > 0 ? "text-[#ff8a7a]" : "text-[#7dd87d]"}>
            {hud.enemiesLeft} HOSTILE{hud.enemiesLeft === 1 ? "" : "S"}
          </span>
        </div>
        {banner && (
          <div key={banner.title} className="banner-enter mt-4">
            <div
              className={`font-display text-4xl md:text-5xl ${
                banner.tone === "complete" ? "text-[#7dd87d]" : banner.tone === "danger" ? "text-[#ff5546]" : "text-[#e8b545]"
              }`}
              style={{ textShadow: "0 0 30px rgba(0,0,0,0.9), 0 2px 0 rgba(0,0,0,0.7)" }}
            >
              {banner.title}
            </div>
            {banner.sub && (
              <div className="mt-2 text-xs tracking-[0.35em] text-[#aebdcb]">{banner.sub}</div>
            )}
            {countdown !== null && (
              <div className="font-mono2 mt-3 text-2xl text-white">
                NEXT WAVE IN <span className="text-[#e8b545]">{countdown}</span>
              </div>
            )}
          </div>
        )}
      </div>

      {/* ── top right: score ── */}
      <div className="absolute right-5 top-4 text-right">
        <div className="flex items-center justify-end gap-2 text-[11px] tracking-[0.25em] text-[#8fa8bf]">
          <Trophy size={12} className="text-[#e8b545]" /> SCORE
        </div>
        <div className="font-mono2 text-3xl leading-none text-white" style={{ textShadow: "0 0 14px rgba(0,0,0,0.8)" }}>
          {hud.score.toLocaleString()}
        </div>
        <div className="mt-1.5 flex items-center justify-end gap-2 text-xs text-[#aebdcb]">
          <Skull size={12} className="text-[#ff6a5a]" />
          <span className="font-mono2 text-sm text-white">{hud.kills}</span> ELIMINATIONS
        </div>
      </div>

      {/* ── unlock toasts ── */}
      {unlocks.length > 0 && (
        <div className="absolute left-1/2 top-24 -translate-x-1/2 space-y-1.5">
          {unlocks.map((u) => (
            <div
              key={u.id}
              className="feed-item clip-btn border border-[#e8b545] bg-[#1c1607]/85 px-4 py-1.5 text-center"
            >
              <div className="text-[9px] tracking-[0.3em] text-[#e8b545]">UNLOCKED</div>
              <div className="text-[11px] font-semibold tracking-wide text-white">{u.name}</div>
              <div className="text-[8px] tracking-[0.2em] text-[#9fb0c2]">{u.kind.toUpperCase()}</div>
            </div>
          ))}
        </div>
      )}

      {/* ── killfeed (top left) ── */}
      <div className={`absolute left-5 space-y-1.5 ${touch ? "top-24" : "top-4"}`}>
        {feed.map((f) => (
          <div
            key={f.id}
            className={`feed-item clip-btn inline-flex border-l-2 px-3 py-1 text-[11px] tracking-[0.18em] ${
              f.tone === "kill"
                ? "border-[#ff5546] bg-[#200c0a]/90 text-[#ffb0a6]"
                : "border-[#e8b545] bg-[#1c1607]/90 text-[#f0d9a0]"
            }`}
          >
            {f.text}
          </div>
        ))}
      </div>

      {/* ── vitals: top-left on touch (always visible, out of the way of
             the on-screen controls), bottom-left on desktop ── */}
      <div
        className={`absolute w-48 md:w-72 ${
          touch ? "left-4 top-4" : "left-5 bottom-6 w-56"
        }`}
      >
        <div className={`flex items-center gap-2 ${touch ? "mb-1.5 rounded-full border border-[#4d9fff]/25 bg-[#0a0e13]/70 px-2.5 py-1.5" : "mb-1"}`}>
          <Shield size={touch ? 12 : 13} className="shrink-0 text-[#4d9fff]" />
          <div className={`h-1.5 flex-1 overflow-hidden rounded-full bg-[#131920]`}>
            <div
              className="h-full rounded-full bg-gradient-to-r from-[#2d6dbf] to-[#4d9fff] transition-all duration-300"
              style={{ width: `${hud.armor}%` }}
            />
          </div>
          <span className="font-mono2 w-6 shrink-0 text-right text-[11px] text-[#9fc4ff]">{hud.armor}</span>
        </div>
        <div className={`flex items-center gap-2 ${touch ? "rounded-full border border-white/10 bg-[#0a0e13]/70 px-2.5 py-1.5" : ""}`}>
          <Heart size={touch ? 14 : 15} className={`shrink-0 ${lowHp ? "text-[#ff4d4d]" : "text-[#7dd87d]"}`} />
          <div className={`h-3 flex-1 overflow-hidden rounded-full bg-[#131920] ${touch ? "" : "clip-btn h-3.5"}`}>
            <div
              className={`h-full transition-all duration-300 ${
                lowHp
                  ? "bg-gradient-to-r from-[#b3201b] to-[#ff4d4d]"
                  : "bg-gradient-to-r from-[#3f9150] to-[#7dd87d]"
              }`}
              style={{ width: `${Math.max(0, hud.health)}%` }}
            />
          </div>
          <span
            className={`font-mono2 shrink-0 text-right leading-none ${touch ? "w-6 text-base" : "w-9 text-2xl"} ${
              lowHp ? "text-[#ff4d4d]" : "text-white"
            }`}
            style={{ textShadow: "0 0 12px rgba(0,0,0,0.85)" }}
          >
            {hud.health}
          </span>
        </div>
      </div>

      {/* ── bottom right: weapon & ammo ── */}
      <div className={`absolute right-5 text-right ${touch ? "bottom-56" : "bottom-6"}`}>
        <div className="text-[11px] tracking-[0.3em] text-[#8fa8bf]">{hud.weaponName}</div>
        <div className="flex items-end justify-end gap-2">
          {hud.reloading && (
            <span className="mb-1 animate-pulse text-[11px] tracking-[0.25em] text-[#e8b545]">
              RELOADING
            </span>
          )}
          <span
            className={`font-mono2 text-5xl leading-none ${hud.ammo === 0 ? "ammo-empty text-white" : "text-white"}`}
            style={{ textShadow: "0 0 16px rgba(0,0,0,0.85)" }}
          >
            {hud.ammo}
          </span>
          <span className="font-mono2 mb-0.5 text-lg text-[#7c8ea1]">/ {hud.reserve}</span>
        </div>
        {/* weapon slots — hidden on touch, the rack button replaces them */}
        <div className={`mt-2 flex max-w-[340px] flex-wrap justify-end gap-1 ${touch ? "hidden" : ""}`}>
          {WEAPON_ORDER.map((id, i) => (
            <div
              key={id}
              className={`clip-btn border px-1.5 py-0.5 text-[9px] tracking-wider ${
                hud.weaponSlot === i
                  ? "border-[#e8b545] bg-[#2a2210] text-[#e8b545]"
                  : "border-[#2c3641] bg-[#10161d]/80 text-[#647489]"
              }`}
            >
              {i + 1} {WEAPONS[id].short}
            </div>
          ))}
        </div>
      </div>

      {/* ── first-wave control hints ── */}
      {showHints && (
        <div className={`absolute left-1/2 -translate-x-1/2 text-center ${touch ? "bottom-[19rem]" : "bottom-24"}`}>
          <div className="text-[10px] tracking-[0.28em] text-[#6d7f93]">
            {touch
              ? "LEFT STICK MOVE · DRAG RIGHT TO AIM · PUSH STICK FAR TO SPRINT"
              : "WASD MOVE · SHIFT SPRINT · RMB AIM · R RELOAD · 1-8 WEAPONS · SPACE JUMP"}
          </div>
        </div>
      )}
    </div>
  );
}
