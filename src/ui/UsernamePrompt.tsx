// ─────────────────────────────────────────────────────────────
//  USERNAME PROMPT
//
//  Shown before the first game and reachable later from the menu
//  to change the name. Validates live against the same rules the
//  server enforces.
// ─────────────────────────────────────────────────────────────

import { useEffect, useMemo, useRef, useState } from "react";
import { audio } from "../game/audio";
import { checkUsername, checkUsernameAvailable, setUsername, getProfile, suggestUsername } from "../net/profile";
import { USERNAME_MAX } from "../net/scoreRules";
import { User, Check, Dice5, X, Loader2 } from "lucide-react";

export default function UsernamePrompt({
  onDone,
  onCancel,
  title = "CHOOSE YOUR CALLSIGN",
  blurb = "This is the name shown on the global monthly leaderboard.",
}: {
  onDone: (name: string) => void;
  onCancel?: () => void;
  title?: string;
  blurb?: string;
}) {
  const existing = getProfile().username;
  const [name, setName] = useState(existing || "");
  const [touched, setTouched] = useState(false);
  const [checking, setChecking] = useState(false);
  const [taken, setTaken] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const checkSeq = useRef(0);

  useEffect(() => {
    inputRef.current?.focus();
    inputRef.current?.select();
  }, []);

  const format = useMemo(() => checkUsername(name), [name]);

  useEffect(() => {
    setTaken(null);
    if (!format.ok) return;
    const mySeq = ++checkSeq.current;
    setChecking(true);
    const t = setTimeout(async () => {
      const res = await checkUsernameAvailable(name);
      if (checkSeq.current !== mySeq) return;
      setChecking(false);
      setTaken(res.ok ? null : res.reason ?? "That name is taken");
    }, 400);
    return () => clearTimeout(t);
  }, [name, format.ok]);

  const showFormatError = touched && name.length > 0 && !format.ok;
  const canSave = format.ok && !taken && !checking && !saving;

  const commit = async () => {
    if (!format.ok) {
      setTouched(true);
      return;
    }
    if (taken || checking) return;
    audio.init();
    audio.uiClick();
    setSaving(true);
    setSaveError(null);
    const res = await setUsername(name);
    setSaving(false);
    if (res.ok) {
      onDone(name.trim());
    } else {
      setSaveError(res.reason ?? "Couldn't save that name");
    }
  };

  return (
    <div className="absolute inset-0 z-40 flex items-center justify-center bg-black/70 backdrop-blur-sm">
      <div className="clip-panel fade-in relative w-[min(460px,92vw)] border border-[#1e2831] bg-[#080c11]/95 p-7">
        <div className="absolute left-0 top-0 h-full w-1 bg-gradient-to-b from-[#e8b545] to-transparent" />

        <div className="mb-1 flex items-center gap-2 text-[10px] tracking-[0.3em] text-[#e8b545]">
          <User size={13} /> OPERATOR PROFILE
        </div>
        <h2 className="font-display mb-2 text-xl tracking-[0.12em] text-white">{title}</h2>
        <p className="mb-5 text-[11px] leading-relaxed text-[#8fa8bf]">{blurb}</p>

        <div className="relative">
          <input
            ref={inputRef}
            value={name}
            maxLength={USERNAME_MAX}
            spellCheck={false}
            autoComplete="off"
            onChange={(e) => { setName(e.target.value); setTouched(true); }}
            onKeyDown={(e) => {
              e.stopPropagation();
              if (e.key === "Enter") commit();
              if (e.key === "Escape" && onCancel) onCancel();
            }}
            onMouseDown={(e) => e.stopPropagation()}
            placeholder="Enter callsign…"
            className={`font-mono2 w-full border bg-[#0b1016] px-3 py-3 pr-20 text-sm tracking-wide text-white outline-none transition-colors ${
              showFormatError || taken ? "border-[#ff5546]" : canSave ? "border-[#e8b545]" : "border-[#2c3641]"
            }`}
          />
          <div className="absolute right-2 top-1/2 flex -translate-y-1/2 items-center gap-1.5">
            <span className="font-mono2 text-[10px] text-[#647489]">
              {name.trim().length}/{USERNAME_MAX}
            </span>
            <button
              type="button"
              title="Suggest a name"
              onMouseDown={(e) => e.stopPropagation()}
              onClick={(e) => {
                e.stopPropagation();
                audio.uiClick();
                setName(suggestUsername());
                setTouched(true);
              }}
              className="clip-btn border border-[#2c3641] bg-[#10161d] p-1.5 text-[#8fa8bf] transition-colors hover:text-[#e8b545]"
            >
              <Dice5 size={13} />
            </button>
          </div>
        </div>

        <div className="mt-2 min-h-[16px] text-[10px] tracking-wide">
          {showFormatError ? (
            <span className="text-[#ff7a6a]">{format.reason}</span>
          ) : taken ? (
            <span className="text-[#ff7a6a]">{taken}</span>
          ) : checking ? (
            <span className="flex items-center gap-1 text-[#8fa8bf]">
              <Loader2 size={11} className="animate-spin" /> Checking availability…
            </span>
          ) : canSave ? (
            <span className="flex items-center gap-1 text-[#7dd87d]">
              <Check size={11} /> Available
            </span>
          ) : (
            <span className="text-[#647489]">
              3–16 characters · letters, numbers, spaces, _ - .
            </span>
          )}
          {saveError && <div className="mt-1 text-[#ff7a6a]">{saveError}</div>}
        </div>

        <div className="mt-5 flex gap-2">
          <button
            type="button"
            disabled={!canSave}
            onMouseDown={(e) => e.stopPropagation()}
            onClick={(e) => { e.stopPropagation(); commit(); }}
            onMouseEnter={() => audio.uiHover()}
            className={`btn-tac clip-btn flex flex-1 items-center justify-center gap-2 py-2.5 text-xs ${
              canSave ? "" : "cursor-not-allowed opacity-40"
            }`}
          >
            {saving ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />}
            {saving ? "SAVING…" : "CONFIRM"}
          </button>
          {onCancel && (
            <button
              type="button"
              onMouseDown={(e) => e.stopPropagation()}
              onClick={(e) => { e.stopPropagation(); audio.uiClick(); onCancel(); }}
              onMouseEnter={() => audio.uiHover()}
              className="btn-tac clip-btn flex items-center justify-center gap-2 px-4 py-2.5 text-xs"
            >
              <X size={14} /> CANCEL
            </button>
          )}
        </div>

        <p className="mt-4 text-[9px] leading-relaxed text-[#4b5a6b]">
          Saved on this device only. You can change it any time from the main menu.
        </p>
      </div>
    </div>
  );
}
