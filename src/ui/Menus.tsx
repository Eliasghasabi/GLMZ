// ─────────────────────────────────────────────────────────────
//  Menus — main menu, settings, how-to-play, pause, game over.
// ─────────────────────────────────────────────────────────────

import { useEffect, useState } from "react";
import { bus, type ScreenName, type StatsData } from "../store";
import { getGame } from "../game/instance";
import { audio } from "../game/audio";
import {
  loadSettings,
  saveSettings,
  loadBest,
  type Settings,
  type Quality,
  type Difficulty,
} from "../game/settings";
import { isTouchDevice } from "./TouchControls";

/** ask the browser to go fullscreen (hides Android/iOS chrome and the
 *  Windows browser toolbar). Must run inside a real click/tap handler —
 *  browsers reject fullscreen requests that aren't tied to a user gesture.
 *
 *  Inside the Capacitor Android shell, document.requestFullscreen() is
 *  silently ignored — the WebView already fills the window, but the
 *  Android status + navigation bars still show. In that case we route
 *  through the native StatusBar plugin to actually hide them. */
async function requestGameFullscreen() {
  // Native path first — when running inside the APK, Capacitor handles it.
  try {
    const { isNativeApp, enterNativeFullscreen } = await import("../game/platform");
    if (isNativeApp()) {
      await enterNativeFullscreen();
      requestLandscapeLock();
      return;
    }
  } catch {
    /* module failed to load — fall through to web path */
  }

  try {
    const el = document.documentElement as HTMLElement & {
      webkitRequestFullscreen?: () => Promise<void> | void;
    };
    if (document.fullscreenElement) {
      requestLandscapeLock();
      return;
    }
    if (el.requestFullscreen) {
      el.requestFullscreen()
        .then(requestLandscapeLock)
        .catch(requestLandscapeLock);
    } else if (el.webkitRequestFullscreen) {
      el.webkitRequestFullscreen();
      requestLandscapeLock();
    } else {
      requestLandscapeLock();
    }
  } catch {
    /* fullscreen isn't available (e.g. inside an iframe) — game still works windowed */
    requestLandscapeLock();
  }
}

/** ask the OS to lock the screen to landscape on phones/tablets. Only
 *  Android Chrome actually honors this (iOS Safari has no orientation
 *  lock API at all) — everywhere else this just quietly no-ops, and
 *  the CSS "rotate your device" overlay in App.tsx covers the gap. */
function requestLandscapeLock() {
  try {
    const orientation = (screen as any).orientation;
    if (orientation?.lock) {
      orientation.lock("landscape").catch(() => {});
    }
  } catch {
    /* not supported on this browser — nothing more we can do */
  }
}
import Loadout from "./Loadout";
import LeaderboardScreen from "./Leaderboard";
import UsernamePrompt from "./UsernamePrompt";
import { getProfile, needsUsername, onProfileChange } from "../net/profile";
import { type SubmissionState } from "../net/scoreService";
import heroUrl from "../../public/tex/hero.jpg?inline";
import soldierUrl from "../../public/tex/soldier.jpg?inline";
import { getLang, setLang, onLangChange, LANGS, t as tr, type LangId } from "../game/i18n";
import {
  Play,
  Settings as SettingsIcon,
  BookOpen,
  ChevronLeft,
  RotateCcw,
  Home,
  MousePointer2,
  Keyboard,
  Skull,
  Crosshair,
  Trophy,
  Waves,
  Target,
  Zap,
  Shield,
  TrendingUp,
  Award,
  Flame,
  Boxes,
  Trophy as TrophyIcon,
  UserPlus,
} from "lucide-react";

function useScreen(): ScreenName {
  const [screen, setScreen] = useState<ScreenName>("menu");
  useEffect(() => bus.on("screen", (s: ScreenName) => setScreen(s)), []);
  return screen;
}

function click() {
  audio.init();
  audio.uiClick();
}
function hover() {
  audio.uiHover();
}

function TacButton({
  label,
  icon,
  onClick,
  danger,
}: {
  label: string;
  icon?: React.ReactNode;
  onClick: () => void;
  danger?: boolean;
}) {
  return (
    <button
      type="button"
      onMouseDown={(e) => e.stopPropagation()}
      onClick={(e) => {
        e.stopPropagation();
        click();
        onClick();
      }}
      onMouseEnter={hover}
      className={`btn-tac clip-btn group flex w-64 items-center gap-3 px-6 py-3 text-sm ${danger ? "danger" : ""}`}
    >
      <span className="text-[#e8b545] transition-colors group-hover:text-[#0b0e12]">{icon}</span>
      {label}
      <span className="ml-auto opacity-0 transition-opacity group-hover:opacity-100">▸</span>
    </button>
  );
}

// ── language picker ─────────────────────────────────────────
// small top-left pill with EN | FA buttons. Switches instantly and
// re-renders the whole React tree because every component reads tr()
// at render time.

function LanguagePicker() {
  const [lang, setLangState] = useState<LangId>(getLang());
  useEffect(() => onLangChange(setLangState), []);

  return (
    <div className="clip-btn absolute left-5 top-5 flex items-center gap-0 border border-[#2c3641] bg-[#0b1016]/80 text-[10px] tracking-[0.18em]">
      {(Object.keys(LANGS) as LangId[]).map((id, i) => (
        <button
          key={id}
          type="button"
          onMouseDown={(e) => e.stopPropagation()}
          onClick={(e) => {
            e.stopPropagation();
            click();
            setLang(id);
          }}
          onMouseEnter={hover}
          className={`px-3 py-1.5 transition-colors ${
            lang === id
              ? "bg-[#2a2210] text-[#e8b545]"
              : "text-[#647489] hover:text-[#9fb0c2]"
          } ${i > 0 ? "border-l border-[#2c3641]" : ""}`}
        >
          {LANGS[id].label}
        </button>
      ))}
    </div>
  );
}

function Panel({ title, children, wide }: { title: string; children: React.ReactNode; wide?: boolean }) {
  return (
    <div
      className={`clip-panel fade-in relative border border-[#1e2831] bg-[#080c11]/92 p-8 backdrop-blur-md ${
        wide ? "w-[min(680px,92vw)]" : "w-[min(480px,92vw)]"
      }`}
    >
      <div className="absolute left-0 top-0 h-full w-1 bg-gradient-to-b from-[#e8b545] to-transparent" />
      <h2 className="font-display mb-6 text-2xl tracking-[0.15em] text-white">{title}</h2>
      {children}
    </div>
  );
}

// ── settings panel (shared between menu & pause) ────────────

/**
 * Declared at module scope on purpose. When this lived inside
 * SettingsPanel it became a brand-new component type on every render,
 * so React unmounted and remounted the <input>, which cancelled any
 * in-progress slider drag.
 */
function Row({
  label, value, min, max, step, onChange, fmt,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  onChange: (v: number) => void;
  fmt: (v: number) => string;
}) {
  return (
    <div>
      <div className="mb-1.5 flex items-center justify-between text-xs tracking-[0.2em] text-[#9fb0c2]">
        <span>{label}</span>
        <span className="font-mono2 text-sm text-[#e8b545]">{fmt(value)}</span>
      </div>
      <input
        type="range"
        className="tac-range"
        min={min}
        max={max}
        step={step}
        value={value}
        onMouseDown={(e) => e.stopPropagation()}
        onChange={(e) => onChange(parseFloat(e.target.value))}
      />
    </div>
  );
}

function SettingsPanel({ onBack }: { onBack: () => void }) {
  const [s, setS] = useState<Settings>(() => loadSettings());

  const update = (patch: Partial<Settings>) => {
    const next = { ...s, ...patch };
    setS(next);
    saveSettings(next);
    getGame()?.applySettings(next);
  };

  return (
    <Panel title={tr("settingsTitle")}>
      <div className="space-y-5">
        <div>
          <div className="mb-2 flex items-center justify-between text-xs tracking-[0.2em] text-[#9fb0c2]">
            <span>{tr("difficulty")}</span>
            <span className="text-[10px] tracking-[0.15em] text-[#647489]">
              {s.difficulty === "easy" ? tr("difficultyEasyBlurb") : s.difficulty === "hard" ? tr("difficultyHardBlurb") : tr("difficultyNormalBlurb")}
            </span>
          </div>
          <div className="flex gap-2">
            {(["easy", "normal", "hard"] as Difficulty[]).map((d) => (
              <button
                key={d}
                type="button"
                onMouseDown={(e) => e.stopPropagation()}
                onClick={(e) => {
                  e.stopPropagation();
                  click();
                  update({ difficulty: d });
                }}
                onMouseEnter={hover}
                className={`clip-btn flex-1 border px-3 py-2 text-xs tracking-[0.2em] transition-all ${
                  s.difficulty === d
                    ? d === "hard"
                      ? "border-[#ff5546] bg-[#2a1210] text-[#ff8a7a]"
                      : "border-[#e8b545] bg-[#2a2210] text-[#e8b545]"
                    : "border-[#2c3641] bg-[#10161d] text-[#647489] hover:text-[#9fb0c2]"
                }`}
              >
                {d === "easy" ? tr("difficultyEasy") : d === "normal" ? tr("difficultyNormal") : tr("difficultyHard")}
              </button>
            ))}
          </div>
        </div>
        <Row
          label={tr("mouseSensitivity")}
          value={s.sensitivity}
          min={0.2}
          max={3}
          step={0.05}
          onChange={(v) => update({ sensitivity: v })}
          fmt={(v) => v.toFixed(2)}
        />
        <Row
          label={tr("fieldOfView")}
          value={s.fov}
          min={60}
          max={110}
          step={1}
          onChange={(v) => update({ fov: v })}
          fmt={(v) => `${Math.round(v)}°`}
        />
        <Row
          label={tr("masterVolume")}
          value={s.masterVolume}
          min={0}
          max={1}
          step={0.05}
          onChange={(v) => update({ masterVolume: v })}
          fmt={(v) => `${Math.round(v * 100)}%`}
        />
        <Row
          label={tr("sfxVolume")}
          value={s.sfxVolume}
          min={0}
          max={1}
          step={0.05}
          onChange={(v) => update({ sfxVolume: v })}
          fmt={(v) => `${Math.round(v * 100)}%`}
        />
        <div>
          <div className="mb-2 text-xs tracking-[0.2em] text-[#9fb0c2]">{tr("graphicsQuality")}</div>
          <div className="flex flex-wrap gap-2">
            {(["low", "medium", "high", "studio"] as Quality[]).map((q) => (
              <button
                key={q}
                type="button"
                onMouseEnter={hover}
                onMouseDown={(e) => e.stopPropagation()}
                onClick={(e) => {
                  e.stopPropagation();
                  click();
                  update({ quality: q });
                }}
                className={`clip-btn flex-1 border px-2.5 py-2 text-xs tracking-[0.15em] transition-all ${
                  s.quality === q
                    ? q === "studio"
                      ? "border-[#b48cff] bg-[#1a1024] text-[#b48cff]"
                      : "border-[#e8b545] bg-[#2a2210] text-[#e8b545]"
                    : "border-[#2c3641] bg-[#10161d] text-[#647489] hover:text-[#9fb0c2]"
                }`}
              >
                {q.toUpperCase()}
              </button>
            ))}
          </div>
          <div className="mt-1.5 text-[10px] italic leading-relaxed text-[#647489]">
            {s.quality === "studio" && "STUDIO: full post-processing + 4K shadows. Best on flagship phones."}
            {s.quality === "high" && "HIGH: bloom + soft PCF shadows + filmic tone map."}
            {s.quality === "medium" && "MEDIUM: basic shadows + filmic tone map."}
            {s.quality === "low" && "LOW: no shadows, no post-processing. For older devices."}
          </div>
        </div>
        {/* post-processing toggle — only meaningful on high/studio */}
        <button
          type="button"
          onMouseDown={(e) => e.stopPropagation()}
          onClick={(e) => { e.stopPropagation(); click(); update({ postProcessing: !s.postProcessing }); }}
          onMouseEnter={hover}
          disabled={s.quality === "low" || s.quality === "medium"}
          className={`clip-btn w-full border px-4 py-2 text-xs tracking-[0.18em] transition-all ${
            s.quality === "low" || s.quality === "medium"
              ? "border-[#2c3641] bg-[#10161d] text-[#3a4450] cursor-not-allowed"
              : s.postProcessing
                ? "border-[#e8b545] bg-[#2a2210] text-[#e8b545]"
                : "border-[#2c3641] bg-[#10161d] text-[#647489] hover:text-[#9fb0c2]"
          }`}
        >
          {tr("postProcessing")}: {s.postProcessing ? tr("on") : tr("off")}
        </button>
        {/* cinematic grain toggle — only meaningful on studio */}
        <button
          type="button"
          onMouseDown={(e) => e.stopPropagation()}
          onClick={(e) => { e.stopPropagation(); click(); update({ cinematicGrain: !s.cinematicGrain }); }}
          onMouseEnter={hover}
          disabled={s.quality !== "studio"}
          className={`clip-btn w-full border px-4 py-2 text-xs tracking-[0.18em] transition-all ${
            s.quality !== "studio"
              ? "border-[#2c3641] bg-[#10161d] text-[#3a4450] cursor-not-allowed"
              : s.cinematicGrain
                ? "border-[#b48cff] bg-[#1a1024] text-[#b48cff]"
                : "border-[#2c3641] bg-[#10161d] text-[#647489] hover:text-[#9fb0c2]"
          }`}
        >
          {tr("cinematicGrain")}: {s.cinematicGrain ? tr("on") : tr("off")}
        </button>
        {/* language selector */}
        <div>
          <div className="mb-2 text-xs tracking-[0.2em] text-[#9fb0c2]">{tr("language")}</div>
          <div className="flex gap-2">
            {(Object.keys(LANGS) as LangId[]).map((l) => (
              <button
                key={l}
                type="button"
                onMouseEnter={hover}
                onMouseDown={(e) => e.stopPropagation()}
                onClick={(e) => {
                  e.stopPropagation();
                  click();
                  setLang(l);
                }}
                className={`clip-btn flex-1 border px-3 py-2 text-xs tracking-[0.2em] transition-all ${
                  getLang() === l
                    ? "border-[#e8b545] bg-[#2a2210] text-[#e8b545]"
                    : "border-[#2c3641] bg-[#10161d] text-[#647489] hover:text-[#9fb0c2]"
                }`}
              >
                {LANGS[l].label}
              </button>
            ))}
          </div>
        </div>
        <button
          type="button"
          onMouseDown={(e) => e.stopPropagation()}
          onClick={(e) => {
            e.stopPropagation();
            click();
            onBack();
          }}
          onMouseEnter={hover}
          className="btn-tac clip-btn mt-2 flex items-center gap-2 px-5 py-2.5 text-xs"
        >
          <ChevronLeft size={15} /> {tr("back")}
        </button>
      </div>
    </Panel>
  );
}

// ── crosshair customizer ────────────────────────────────────

import {
  getCrosshair, setCrosshair, resetCrosshair,
  CROSSHAIR_STYLES, CROSSHAIR_COLORS, CROSSHAIR_COLOR_HEX,
  DEFAULT_CROSSHAIR, type CrosshairConfig,
} from "../game/customize/crosshair";

function CrosshairPreview({ cfg }: { cfg: CrosshairConfig }) {
  const color = CROSSHAIR_COLOR_HEX[cfg.color];
  const shadow = `0 0 4px rgba(0,0,0,${cfg.outline}), 0 0 1px rgba(0,0,0,1)`;
  const t = cfg.thickness;
  const len = cfg.length;
  const g = cfg.gap;

  const Tick = ({ x, y, w, h, rot = 0, origin = "center" }: { x: number; y: number; w: number; h: number; rot?: number; origin?: string }) => (
    <span
      style={{
        position: "absolute",
        left: "50%",
        top: "50%",
        width: w,
        height: h,
        transform: `translate(${x - w / 2}px, ${y - h / 2}px) rotate(${rot}rad)`,
        transformOrigin: origin,
        background: color,
        boxShadow: shadow,
      }}
    />
  );

  switch (cfg.style) {
    case "dot":
      return (
        <span
          style={{
            position: "absolute", left: "50%", top: "50%",
            width: t + 2, height: t + 2,
            transform: "translate(-50%, -50%)",
            background: color, borderRadius: "9999px", boxShadow: shadow,
          }}
        />
      );
    case "cross":
      return (
        <>
          <span style={{ position: "absolute", left: "50%", top: "50%", width: 1, height: len * 2 + g * 2, transform: "translate(-50%, -50%)", background: color, boxShadow: shadow }} />
          <span style={{ position: "absolute", left: "50%", top: "50%", width: len * 2 + g * 2, height: 1, transform: "translate(-50%, -50%)", background: color, boxShadow: shadow }} />
        </>
      );
    case "t-cross":
      return (
        <>
          <Tick x={0} y={-(g + len)} w={t} h={len} />
          <Tick x={0} y={g} w={t} h={len} />
          <Tick x={-(g + len)} y={0} w={len} h={t} />
          {cfg.dot && <span style={{ position: "absolute", left: "50%", top: "50%", width: t + 1, height: t + 1, transform: "translate(-50%, -50%)", background: color, borderRadius: "9999px", boxShadow: shadow }} />}
        </>
      );
    case "circle":
      return (
        <>
          <span
            style={{
              position: "absolute", left: "50%", top: "50%",
              width: g * 2, height: g * 2,
              transform: "translate(-50%, -50%)",
              borderRadius: "9999px", border: `${t}px solid ${color}`, boxShadow: shadow,
            }}
          />
          {cfg.dot && <span style={{ position: "absolute", left: "50%", top: "50%", width: t + 1, height: t + 1, transform: "translate(-50%, -50%)", background: color, borderRadius: "9999px", boxShadow: shadow }} />}
        </>
      );
    case "triangle": {
      const arms: React.ReactNode[] = [];
      for (let i = 0; i < 3; i++) {
        const a = (i * Math.PI * 2) / 3 - Math.PI / 2;
        const cx = Math.cos(a) * (g + 4);
        const cy = Math.sin(a) * (g + 4);
        arms.push(<Tick key={i} x={cx} y={cy} w={len} h={t} rot={a} origin="right center" />);
      }
      return <>{arms}</>;
    }
    case "chevron":
      return (
        <>
          <span style={{ position: "absolute", left: "50%", top: "50%", width: len * 1.6, height: t, transform: `translate(-50%, ${g}px) rotate(-26deg)`, background: color, boxShadow: shadow, transformOrigin: "center right" }} />
          <span style={{ position: "absolute", left: "50%", top: "50%", width: len * 1.6, height: t, transform: `translate(-50%, ${g}px) rotate(26deg)`, background: color, boxShadow: shadow, transformOrigin: "center left" }} />
          {cfg.dot && <span style={{ position: "absolute", left: "50%", top: "50%", width: t + 1, height: t + 1, transform: "translate(-50%, -50%)", background: color, borderRadius: "9999px", boxShadow: shadow }} />}
        </>
      );
    case "dynamic":
    case "default":
    default:
      return (
        <>
          <Tick x={0} y={-(g + len)} w={t} h={len} />
          <Tick x={0} y={g} w={t} h={len} />
          <Tick x={-(g + len)} y={0} w={len} h={t} />
          <Tick x={g} y={0} w={len} h={t} />
          {cfg.dot && <span style={{ position: "absolute", left: "50%", top: "50%", width: t + 1, height: t + 1, transform: "translate(-50%, -50%)", background: color, borderRadius: "9999px", boxShadow: shadow }} />}
        </>
      );
  }
}

function CrosshairPanel({ onBack }: { onBack: () => void }) {
  const [cfg, setCfg] = useState<CrosshairConfig>(() => getCrosshair());
  const [, forceLang] = useState<LangId>(getLang());
  useEffect(() => onLangChange(forceLang), []);

  const update = (patch: Partial<CrosshairConfig>) => {
    setCrosshair(patch);
    setCfg(getCrosshair());
  };

  return (
    <Panel title={tr("crosshairTitle")} wide>
      <div className="space-y-5">
        {/* live preview */}
        <div className="clip-btn relative h-32 overflow-hidden border border-[#1e2831] bg-gradient-to-br from-[#0a0e13] via-[#10161d] to-[#0a0e13]">
          <div className="menu-grid absolute inset-0 opacity-30" />
          {/* fake far wall texture for color contrast testing */}
          <div className="absolute inset-0 opacity-20"
               style={{ background: "radial-gradient(circle at 30% 40%, #e8b545, transparent 40%), radial-gradient(circle at 70% 60%, #ff5546, transparent 35%)" }} />
          <div className="absolute left-1/2 top-1/2 h-0 w-0">
            <CrosshairPreview cfg={cfg} />
          </div>
          <div className="absolute left-2 top-2 font-mono2 text-[9px] tracking-wider text-[#647489]">{tr("livePreview")}</div>
        </div>

        {/* style selector */}
        <div>
          <div className="mb-2 text-xs tracking-[0.2em] text-[#9fb0c2]">{tr("reticleStyle")}</div>
          <div className="grid grid-cols-4 gap-1.5">
            {CROSSHAIR_STYLES.map((st) => (
              <button
                key={st.id}
                type="button"
                onMouseDown={(e) => e.stopPropagation()}
                onClick={(e) => { e.stopPropagation(); click(); update({ style: st.id }); }}
                onMouseEnter={hover}
                title={st.desc}
                className={`clip-btn border px-2 py-2.5 text-[9px] tracking-[0.12em] transition-all ${
                  cfg.style === st.id
                    ? "border-[#e8b545] bg-[#2a2210] text-[#e8b545]"
                    : "border-[#2c3641] bg-[#10161d] text-[#647489] hover:text-[#9fb0c2]"
                }`}
              >
                {st.name.toUpperCase()}
              </button>
            ))}
          </div>
          <div className="mt-1.5 text-[10px] italic tracking-wide text-[#647489]">
            {CROSSHAIR_STYLES.find((s) => s.id === cfg.style)?.desc}
          </div>
        </div>

        {/* color selector */}
        <div>
          <div className="mb-2 text-xs tracking-[0.2em] text-[#9fb0c2]">{tr("colour")}</div>
          <div className="flex flex-wrap gap-2">
            {CROSSHAIR_COLORS.map((c) => (
              <button
                key={c.id}
                type="button"
                onMouseDown={(e) => e.stopPropagation()}
                onClick={(e) => { e.stopPropagation(); click(); update({ color: c.id }); }}
                onMouseEnter={hover}
                title={c.name}
                className={`h-7 w-7 rounded-sm border-2 transition-transform ${
                  cfg.color === c.id
                    ? "scale-110 border-[#e8b545]"
                    : "border-[#2c3641] hover:border-[#4d5a6b]"
                }`}
                style={{ background: c.hex }}
              />
            ))}
          </div>
        </div>

        {/* sliders */}
        <Row label={tr("gap")} value={cfg.gap} min={2} max={28} step={1}
             onChange={(v) => update({ gap: v })} fmt={(v) => `${Math.round(v)}px`} />
        <Row label={tr("thickness")} value={cfg.thickness} min={1} max={4} step={0.5}
             onChange={(v) => update({ thickness: v })} fmt={(v) => `${v.toFixed(1)}px`} />
        <Row label={tr("length")} value={cfg.length} min={4} max={18} step={1}
             onChange={(v) => update({ length: v })} fmt={(v) => `${Math.round(v)}px`} />
        <Row label={tr("outline")} value={cfg.outline} min={0} max={1} step={0.1}
             onChange={(v) => update({ outline: v })} fmt={(v) => `${Math.round(v * 100)}%`} />

        {/* dot toggle */}
        <button
          type="button"
          onMouseDown={(e) => e.stopPropagation()}
          onClick={(e) => { e.stopPropagation(); click(); update({ dot: !cfg.dot }); }}
          onMouseEnter={hover}
          className={`clip-btn w-full border px-4 py-2 text-xs tracking-[0.2em] transition-all ${
            cfg.dot
              ? "border-[#e8b545] bg-[#2a2210] text-[#e8b545]"
              : "border-[#2c3641] bg-[#10161d] text-[#647489] hover:text-[#9fb0c2]"
          }`}
        >
          {tr("centreDot")}: {cfg.dot ? tr("on") : tr("off")}
        </button>

        <div className="flex gap-2">
          <button
            type="button"
            onMouseDown={(e) => e.stopPropagation()}
            onClick={(e) => { e.stopPropagation(); click(); resetCrosshair(); setCfg({ ...DEFAULT_CROSSHAIR }); }}
            onMouseEnter={hover}
            className="btn-tac clip-btn flex flex-1 items-center justify-center gap-2 py-2.5 text-xs"
          >
            <RotateCcw size={14} /> {tr("reset")}
          </button>
          <button
            type="button"
            onMouseDown={(e) => e.stopPropagation()}
            onClick={(e) => { e.stopPropagation(); click(); onBack(); }}
            onMouseEnter={hover}
            className="btn-tac clip-btn flex flex-1 items-center justify-center gap-2 py-2.5 text-xs"
          >
            <ChevronLeft size={15} /> {tr("back")}
          </button>
        </div>
      </div>
    </Panel>
  );
}

// ── how to play ─────────────────────────────────────────────

const CONTROLS: [string, string][] = [
  ["W A S D", "Move"],
  ["MOUSE", "Look / Aim"],
  ["LMB", "Fire"],
  ["RMB", "Aim Down Sights / Scope"],
  ["R", "Reload"],
  ["1 … 8", "Weapons (AR · SG · Cinderfang · SMG · Revolver · LBW · DMR · VSS)"],
  ["SHIFT", "Sprint"],
  ["SPACE", "Jump"],
  ["ESC", "Pause"],
];

function HowToPanel({ onBack }: { onBack: () => void }) {
  return (
    <Panel title="FIELD MANUAL" wide>
      {/* hostile dossier */}
      <div className="clip-btn mb-6 flex items-center gap-4 border border-[#1e2831] bg-[#0b1016]/80 p-3">
        <img
          src={soldierUrl}
          alt="Hostile combatant reference"
          className="h-24 w-40 object-cover opacity-90"
          style={{ objectPosition: "center 30%" }}
        />
        <div>
          <div className="text-[10px] tracking-[0.3em] text-[#e8b545]">HOSTILE DOSSIER</div>
          <div className="mt-1 text-xs leading-relaxed text-[#aebdcb]">
            Enemy combatants wear plate carriers and NVG-mounted helmets. Armor plating
            absorbs body shots — <b className="text-white">aim for the head</b>.
          </div>
        </div>
      </div>
      <div className="grid gap-6 md:grid-cols-2">
        <div>
          <div className="mb-3 flex items-center gap-2 text-xs tracking-[0.25em] text-[#e8b545]">
            <Keyboard size={14} /> CONTROLS
          </div>
          <div className="space-y-1.5">
            {CONTROLS.map(([k, v]) => (
              <div key={k} className="flex items-center justify-between gap-4 border-b border-[#17202a] py-1.5 text-xs">
                <span className="font-mono2 text-[#e8b545]">{k}</span>
                <span className="text-[#aebdcb]">{v}</span>
              </div>
            ))}
          </div>
        </div>
        <div>
          <div className="mb-3 flex items-center gap-2 text-xs tracking-[0.25em] text-[#e8b545]">
            <MousePointer2 size={14} /> INTEL
          </div>
          <ul className="space-y-2.5 text-xs leading-relaxed text-[#aebdcb]">
            <li className="flex gap-2"><Crosshair size={13} className="mt-0.5 shrink-0 text-[#e8b545]" /> Headshots deal massive bonus damage. CINDERFANG one-taps most hostiles.</li>
            <li className="flex gap-2"><Zap size={13} className="mt-0.5 shrink-0 text-[#ff8a5a]" /> <span><b className="text-[#ff8a5a]">RUNNERS</b> are fast and strike in melee — keep your distance.</span></li>
            <li className="flex gap-2"><Shield size={13} className="mt-0.5 shrink-0 text-[#9fc4ff]" /> <span><b className="text-[#9fc4ff]">HEAVIES</b> soak damage. Aim for the head or keep moving.</span></li>
            <li className="flex gap-2"><TrendingUp size={13} className="mt-0.5 shrink-0 text-[#7dd87d]" /> Eliminated hostiles drop ammo, health and armor supplies.</li>
            <li className="flex gap-2"><Award size={13} className="mt-0.5 shrink-0 text-[#e8b545]" /> Clearing a wave restores health and fully resupplies your reserve ammo.</li>
            <li className="flex gap-2"><Target size={13} className="mt-0.5 shrink-0 text-[#aebdcb]" /> Watch damage falloff — the shotgun devours anything up close and nothing far away.</li>
            <li className="flex gap-2"><Zap size={13} className="mt-0.5 shrink-0 text-[#7fd6e0]" /> <span><b className="text-[#7fd6e0]">WRAITH-9</b> SMG shreds at close range; <b className="text-[#ffc46a]">MAGNUS .44</b> is a one-shot hand cannon.</span></li>
            <li className="flex gap-2"><Flame size={13} className="mt-0.5 shrink-0 text-[#ff7a1e]" /> <span><b className="text-[#ff7a1e]">CINDERFANG</b> — dragon-forged. Its molten veins glow hotter as the chamber heats.</span></li>
            <li className="flex gap-2"><Crosshair size={13} className="mt-0.5 shrink-0 text-[#dfe9f5]" /> <span><b className="text-[#dfe9f5]">LONGBOW MK VII</b> (6) — anti-materiel bolt-action. 6× scope, brutal recoil, one shot one kill.</span></li>
            <li className="flex gap-2"><Crosshair size={13} className="mt-0.5 shrink-0 text-[#6effc4]" /> <span><b className="text-[#6effc4]">VECTOR-7 DMR</b> (7) — semi-auto marksman. 3.2× prism, no scope blackout, fast follow-ups.</span></li>
            <li className="flex gap-2"><Crosshair size={13} className="mt-0.5 shrink-0 text-[#9fd4ff]" /> <span><b className="text-[#9fd4ff]">OBSIDIAN VSS</b> (8) — suppressed precision. 8.5× glass, quietest report in the arsenal.</span></li>
            <li className="flex gap-2"><Award size={13} className="mt-0.5 shrink-0 text-[#e8b545]" /> Sniper kills trigger a weapon-specific <b className="text-white">kill-confirm</b> flourish — it never blocks your next shot.</li>
          </ul>
        </div>
      </div>
      <button
        type="button"
        onMouseDown={(e) => e.stopPropagation()}
        onClick={(e) => {
          e.stopPropagation();
          click();
          onBack();
        }}
        onMouseEnter={hover}
        className="btn-tac clip-btn mt-6 flex items-center gap-2 px-5 py-2.5 text-xs"
      >
        <ChevronLeft size={15} /> BACK
      </button>
    </Panel>
  );
}

// ── main component ──────────────────────────────────────────

export default function Menus() {
  const screen = useScreen();
  const [settingsFrom, setSettingsFrom] = useState<ScreenName>("menu");
  const [stats, setStats] = useState<StatsData | null>(null);
  const [newUnlocks, setNewUnlocks] = useState<{ kind: string; name: string }[]>([]);
  const [profile, setProfileState] = useState(getProfile());
  // "firstRun" gates PLAY behind picking a name; "edit" is a later change
  const [prompt, setPrompt] = useState<null | "firstRun" | "edit">(null);
  const [pendingPlay, setPendingPlay] = useState(false);
  useEffect(() => onProfileChange((p) => setProfileState({ ...p })), []);
  const [submission, setSubmission] = useState<SubmissionState | null>(null);
  useEffect(() => bus.on("submission", (s: SubmissionState) => setSubmission(s)), []);
  useEffect(() => bus.on("unlocks", (l: { kind: string; name: string }[]) =>
    setNewUnlocks((p) => [...p, ...l])), []);
  const [best] = useState(() => loadBest());
  // re-render when the active language changes so tr() calls re-read
  const [, forceLang] = useState<LangId>(getLang());
  useEffect(() => onLangChange(forceLang), []);

  useEffect(
    () =>
      bus.on("stats", (s: StatsData) => {
        setStats(s);
      }),
    []
  );

  if (screen === "playing") return null;

  // Resolved lazily inside each handler — never captured at render time.
  const cmd = (fn: (g: NonNullable<ReturnType<typeof getGame>>) => void) => () => {
    const g = getGame();
    if (g) {
      fn(g);
      return;
    }
    // The engine boots in an effect, so a very early click can land before
    // the instance exists. Rather than silently doing nothing, poll briefly
    // and then run the command.
    console.warn("[menu] game not ready yet — retrying");
    let tries = 0;
    const timer = window.setInterval(() => {
      const late = getGame();
      if (late) {
        window.clearInterval(timer);
        fn(late);
      } else if (++tries > 40) {
        window.clearInterval(timer);
        console.error("[menu] game failed to initialise");
      }
    }, 50);
  };

  const overlay = (children: React.ReactNode, dim = true) => (
    <div className={`absolute inset-0 z-30 flex items-center justify-center ${dim ? "bg-black/55" : ""}`}>
      {children}
    </div>
  );

  // Rendered ONCE at the end, outside every screen branch. Previously each
  // branch had to remember to include it and the main menu did not, which
  // left first-time players stuck on the menu after pressing PLAY.
  /** single entry point for starting a run from the menu */
  const startGame = () => {
    void requestGameFullscreen();
    const g = getGame();
    if (g) {
      g.start();
      return;
    }
    console.warn("[menu] game not ready yet — retrying");
    let tries = 0;
    const timer = window.setInterval(() => {
      const late = getGame();
      if (late) {
        window.clearInterval(timer);
        late.start();
      } else if (++tries > 40) {
        window.clearInterval(timer);
        console.error("[menu] game failed to initialise");
      }
    }, 50);
  };

  // Rendered ONCE at the end, outside every screen branch. Previously each
  // branch had to remember to include it and the main menu did not, which
  // left first-time players stuck on the menu after pressing PLAY.
  const promptEl = prompt ? (
    <UsernamePrompt
      title={prompt === "firstRun" ? "CHOOSE YOUR CALLSIGN" : "CHANGE CALLSIGN"}
      blurb={
        prompt === "firstRun"
          ? "This is the name shown on the global monthly leaderboard."
          : "Future runs will be submitted under this name."
      }
      onDone={() => {
        setPrompt(null);
        if (pendingPlay) {
          setPendingPlay(false);
          startGame();
        }
      }}
      onCancel={() => {
        setPrompt(null);
        // they declined before a first run — let them play anonymously
        if (pendingPlay) {
          setPendingPlay(false);
          startGame();
        }
      }}
    />
  ) : null;

  // Every screen is produced here and returned through a single exit below,
  // so the username prompt is always mounted alongside whatever is showing.
  const screenEl = (() => {
  // ── MAIN MENU ──
  if (screen === "menu") {
    return (
      <div className="menu-bg absolute inset-0 z-30 flex flex-col overflow-hidden">
        <div
          className="absolute inset-0 opacity-50"
          style={{
            backgroundImage: `url(${heroUrl})`,
            backgroundSize: "cover",
            backgroundPosition: "center",
          }}
        />
        <div className="absolute inset-0 bg-gradient-to-b from-[#05070b]/70 via-[#05070b]/55 to-[#05070b]" />
        <div className="menu-grid" />
        <div className="menu-sweep" />
        <div className="fx-scanlines absolute inset-0" />
        {/* Studio Edition: drifting embers floating upward */}
        <div className="fx-embers" />
        {/* Studio Edition: animated radial pulse behind the title */}
        <div
          className="absolute left-1/2 top-1/2 h-[80vmin] w-[80vmin] -translate-x-1/2 -translate-y-1/2 opacity-40"
          style={{
            background: "radial-gradient(circle at center, rgba(232,181,69,0.12) 0%, transparent 55%)",
            animation: "menuBreathe 5.5s ease-in-out infinite",
          }}
        />
        <div className="relative flex h-full flex-col items-center justify-center gap-10 px-6">
          <div className="rise-in text-center">
            <div className="mb-3 flex items-center justify-center gap-3 text-[11px] tracking-[0.5em] text-[#8fa8bf]">
              <span className="h-px w-14 bg-[#8fa8bf]/40" />
              {tr("tagline")}
              <span className="h-px w-14 bg-[#8fa8bf]/40" />
            </div>
            <h1 className="font-display title-glitch text-6xl text-white md:text-8xl">
              <span className="fx-holographic">SHADOW</span><span className="text-[#e8b545]">STRIKE</span>
            </h1>
            <p className="mt-3 text-xs tracking-[0.3em] text-[#7c8ea1]">
              {tr("subtagline")}
            </p>
          </div>
          <div className="rise-in flex flex-col gap-3" style={{ animationDelay: "0.12s" }}>
            <TacButton
              label={tr("play")}
              icon={<Play size={16} />}
              onClick={() => {
                if (needsUsername()) {
                  setPendingPlay(true);
                  setPrompt("firstRun");
                  return;
                }
                startGame();
              }}
            />
            <TacButton
              label={tr("settings")}
              icon={<SettingsIcon size={16} />}
              onClick={() => {
                setSettingsFrom("menu");
                bus.emit("screen", "settings");
              }}
            />
            <TacButton
              label={tr("leaderboard")}
              icon={<TrophyIcon size={16} />}
              onClick={() => bus.emit("screen", "leaderboard")}
            />
            <TacButton
              label={tr("loadout")}
              icon={<Boxes size={16} />}
              onClick={() => bus.emit("screen", "loadout")}
            />
            <TacButton
              label={tr("crosshair")}
              icon={<Crosshair size={16} />}
              onClick={() => bus.emit("screen", "crosshair")}
            />
            <TacButton label={tr("howToPlay")} icon={<BookOpen size={16} />} onClick={() => bus.emit("screen", "howto")} />
          </div>
          {best.score > 0 && (
            <div className="rise-in flex items-center gap-6 border border-[#1e2831] bg-[#080c11]/80 px-6 py-3 text-xs tracking-[0.2em] text-[#8fa8bf]" style={{ animationDelay: "0.2s" }}>
              <span className="flex items-center gap-2"><Trophy size={13} className="text-[#e8b545]" /> BEST {best.score.toLocaleString()}</span>
              <span className="flex items-center gap-2"><Waves size={13} className="text-[#8fa8bf]" /> WAVE {best.wave}</span>
              <span className="flex items-center gap-2"><Skull size={13} className="text-[#ff6a5a]" /> {best.kills} KILLS</span>
            </div>
          )}
          <button
            type="button"
            onMouseDown={(e) => e.stopPropagation()}
            onClick={(e) => { e.stopPropagation(); click(); setPrompt("edit"); }}
            onMouseEnter={hover}
            className="clip-btn absolute right-5 top-5 flex items-center gap-2 border border-[#2c3641] bg-[#0b1016]/80 px-3 py-1.5 text-[10px] tracking-[0.18em] text-[#8fa8bf] transition-colors hover:text-[#e8b545]"
          >
            <UserPlus size={12} />
            {profile.username ? profile.username : tr("setCallsign")}
          </button>
          <div className="absolute bottom-5 flex flex-col items-center gap-1.5 text-[10px] tracking-[0.25em] text-[#4b5a6b]">
            <span>
              {isTouchDevice()
                ? "HEADPHONES RECOMMENDED · ON-SCREEN CONTROLS ENABLED"
                : "HEADPHONES RECOMMENDED · CLICK PLAY TO ENGAGE POINTER LOCK"}
            </span>
            <a
              href="https://g4elias.netlify.app/"
              target="_blank"
              rel="noopener noreferrer"
              className="pointer-events-auto tracking-[0.2em] text-[#e8b545]/70 underline underline-offset-2 hover:text-[#e8b545]"
            >
              CREATED BY ELIAS
            </a>
          </div>
          {/* language picker — top-left, only visible when the player has a callsign set
              (so first-time onboarding stays uncluttered) */}
          <LanguagePicker />
        </div>
      </div>
    );
  }

  // ── LEADERBOARD ──
  if (screen === "leaderboard") {
    return (
      <>
        <LeaderboardScreen
          onBack={() => bus.emit("screen", "menu")}
          onSetName={() => setPrompt("edit")}
        />
      </>
    );
  }

  // ── LOADOUT ──
  if (screen === "loadout") {
    return <Loadout onBack={() => bus.emit("screen", "menu")} />;
  }

  // ── HOW TO PLAY ──
  if (screen === "howto") {
    return overlay(<HowToPanel onBack={() => bus.emit("screen", "menu")} />);
  }

  // ── SETTINGS ──
  if (screen === "settings") {
    return overlay(
      <SettingsPanel
        onBack={() => bus.emit("screen", settingsFrom === "paused" ? "paused" : "menu")}
      />
    );
  }

  // ── CROSSHAIR ──
  if (screen === "crosshair") {
    return overlay(
      <CrosshairPanel onBack={() => bus.emit("screen", settingsFrom === "paused" ? "paused" : "menu")} />
    );
  }

  // ── PAUSE ──
  if (screen === "paused") {
    return overlay(
      <div className="fade-in flex flex-col items-center gap-8">
        <div className="text-center">
          <h2 className="font-display text-5xl tracking-[0.1em] text-white" style={{ textShadow: "0 0 30px rgba(0,0,0,0.9)" }}>
            {tr("paused")}
          </h2>
          <p className="mt-2 text-[11px] tracking-[0.4em] text-[#8fa8bf]">{tr("operationOnHold")}</p>
        </div>
        <div className="flex flex-col gap-3">
          <TacButton label={tr("resume")} icon={<Play size={16} />} onClick={() => { void requestGameFullscreen(); cmd((g) => g.resume())(); }} />
          <TacButton
            label={tr("settings")}
            icon={<SettingsIcon size={16} />}
            onClick={() => {
              setSettingsFrom("paused");
              bus.emit("screen", "settings");
            }}
          />
          <TacButton
            label={tr("crosshair")}
            icon={<Crosshair size={16} />}
            onClick={() => {
              setSettingsFrom("paused");
              bus.emit("screen", "crosshair");
            }}
          />
          <TacButton label={tr("restart")} icon={<RotateCcw size={16} />} onClick={() => { void requestGameFullscreen(); cmd((g) => g.restart())(); }} />
          <TacButton label={tr("mainMenu")} icon={<Home size={16} />} onClick={cmd((g) => g.quitToMenu())} danger />
        </div>
      </div>,
      true
    );
  }

  // ── GAME OVER ──
  if (screen === "gameover") {
    const s = stats ?? { score: 0, kills: 0, wave: 1, accuracy: 0, best: false };
    return (
      <div className="absolute inset-0 z-30 flex items-center justify-center bg-[#120404]/70 backdrop-blur-sm">
        <div className="fade-in flex flex-col items-center gap-7">
          <div className="text-center">
            <h2 className="font-display text-6xl text-[#ff5546] md:text-7xl" style={{ textShadow: "0 0 40px rgba(255,60,40,0.4)" }}>
              K.I.A.
            </h2>
            <p className="mt-2 text-[11px] tracking-[0.45em] text-[#c79a94]">OPERATOR DOWN — SECTOR LOST</p>
            {s.best && (
              <div className="clip-btn mx-auto mt-3 inline-block border border-[#e8b545] bg-[#2a2210] px-4 py-1 text-[11px] tracking-[0.3em] text-[#e8b545]">
                NEW RECORD
              </div>
            )}
          </div>
          {/* ── leaderboard submission status ── */}
          {submission && submission.status !== "idle" && (
            <div className="clip-btn border border-[#2c3641] bg-[#0b1016]/85 px-5 py-2 text-center">
              {submission.status === "sending" ? (
                <span className="text-[11px] tracking-[0.2em] text-[#8fa8bf]">
                  SUBMITTING SCORE…
                </span>
              ) : submission.status === "done" ? (
                <span className="text-[11px] tracking-[0.18em] text-[#7dd87d]">
                  {submission.local ? "SCORE SAVED LOCALLY" : "SCORE SUBMITTED"}
                  {submission.rank ? (
                    <span className="ml-2 text-[#e8b545]">
                      MONTHLY RANK #{submission.rank}
                    </span>
                  ) : null}
                </span>
              ) : submission.status === "skipped" ? (
                <button
                  type="button"
                  onMouseDown={(e) => e.stopPropagation()}
                  onClick={(e) => { e.stopPropagation(); click(); setPrompt("edit"); }}
                  className="text-[11px] tracking-[0.15em] text-[#e8b545] underline-offset-2 hover:underline"
                >
                  SET A CALLSIGN TO JOIN THE LEADERBOARD
                </button>
              ) : (
                <span className="text-[11px] tracking-[0.15em] text-[#ffb0a6]">
                  {submission.queued
                    ? "SAVED — WILL UPLOAD WHEN ONLINE"
                    : submission.error ?? "SUBMISSION FAILED"}
                </span>
              )}
            </div>
          )}

          {newUnlocks.length > 0 && (
            <div className="clip-panel border border-[#e8b545] bg-[#1c1607]/80 px-5 py-3 text-center">
              <div className="text-[10px] tracking-[0.3em] text-[#e8b545]">NEW UNLOCKS</div>
              <div className="mt-1 flex flex-wrap justify-center gap-x-3 gap-y-1">
                {newUnlocks.map((u, i) => (
                  <span key={i} className="text-[11px] text-white">
                    {u.name}
                    <span className="ml-1 text-[9px] text-[#9fb0c2]">{u.kind}</span>
                  </span>
                ))}
              </div>
            </div>
          )}
          <div className="grid grid-cols-2 gap-px border border-[#3a1512] bg-[#3a1512] md:grid-cols-4">
            {[
              ["SCORE", s.score.toLocaleString()],
              ["ELIMINATIONS", String(s.kills)],
              ["WAVE REACHED", String(s.wave)],
              ["ACCURACY", `${s.accuracy}%`],
            ].map(([label, value]) => (
              <div key={label} className="bg-[#0d0706]/95 px-8 py-4 text-center">
                <div className="font-mono2 text-3xl text-white">{value}</div>
                <div className="mt-1 text-[10px] tracking-[0.3em] text-[#8f6c66]">{label}</div>
              </div>
            ))}
          </div>
          <div className="flex flex-col gap-3">
            <TacButton label="RESTART" icon={<RotateCcw size={16} />} onClick={() => { void requestGameFullscreen(); cmd((g) => { setNewUnlocks([]); g.restart(); })(); }} />
            <TacButton label="LEADERBOARD" icon={<TrophyIcon size={16} />} onClick={() => bus.emit("screen", "leaderboard")} />
            <TacButton label="MAIN MENU" icon={<Home size={16} />} onClick={cmd((g) => { setNewUnlocks([]); g.quitToMenu(); })} danger />
          </div>
        </div>
      </div>
    );
  }

    return null;
  })();

  return (
    <>
      {screenEl}
      {promptEl}
    </>
  );
}
