"use client"

import { create } from "zustand"
import { api } from "@/lib/api"
import { todayIso } from "@/lib/jalali"

export type PomodoroPhase = "focus" | "break" | "long-break"

type PomodoroState = {
  phase: PomodoroPhase
  running: boolean
  remaining: number // seconds
  completedToday: number
  focusMinutesToday: number
  subjectId: string | null
  // config (synced from settings)
  focusMin: number
  breakMin: number
  longBreakMin: number
  untilLongBreak: number
  intervalId: ReturnType<typeof setInterval> | null
  sessionStartedAt: string | null // "HH:MM"
  // actions
  configure: (c: { focusMin: number; breakMin: number; longBreakMin: number; untilLongBreak: number }) => void
  start: () => void
  pause: () => void
  resume: () => void
  reset: () => void
  skip: () => void
  setSubject: (subjectId: string | null) => void
  refreshToday: () => Promise<void>
  _tick: () => void
  _completePhase: (skipped: boolean) => void
}

function phaseMinutes(s: Pick<PomodoroState, "phase" | "focusMin" | "breakMin" | "longBreakMin">): number {
  if (s.phase === "focus") return s.focusMin
  if (s.phase === "break") return s.breakMin
  return s.longBreakMin
}

export const usePomodoro = create<PomodoroState>((set, get) => ({
  phase: "focus",
  running: false,
  remaining: 25 * 60,
  completedToday: 0,
  focusMinutesToday: 0,
  subjectId: null,
  focusMin: 25,
  breakMin: 5,
  longBreakMin: 15,
  untilLongBreak: 4,
  intervalId: null,
  sessionStartedAt: null,

  configure: (c) =>
    set((s) => {
      const isIdle = !s.running && s.remaining === phaseMinutes(s) * 60
      return {
        focusMin: c.focusMin,
        breakMin: c.breakMin,
        longBreakMin: c.longBreakMin,
        untilLongBreak: c.untilLongBreak,
        ...(isIdle
          ? { remaining: (s.phase === "focus" ? c.focusMin : s.phase === "break" ? c.breakMin : c.longBreakMin) * 60 }
          : {}),
      }
    }),

  start: () =>
    set((s) => {
      if (s.running) return s
      const id = setInterval(() => get()._tick(), 1000)
      return {
        running: true,
        intervalId: id,
        remaining: s.remaining === phaseMinutes(s) * 60 ? phaseMinutes(s) * 60 : s.remaining,
        sessionStartedAt: s.sessionStartedAt ?? nowHHMM(),
      }
    }),

  pause: () =>
    set((s) => {
      if (s.intervalId) clearInterval(s.intervalId)
      return { running: false, intervalId: null }
    }),

  resume: () => get().start(),

  reset: () =>
    set((s) => {
      if (s.intervalId) clearInterval(s.intervalId)
      return { running: false, intervalId: null, remaining: phaseMinutes(s) * 60, sessionStartedAt: null }
    }),

  skip: () => get()._completePhase(true),

  setSubject: (subjectId) => set({ subjectId }),

  refreshToday: async () => {
    try {
      const data = await api<{ focusCount: number; focusMinutes: number }>("/api/pomodoro")
      set({ completedToday: data.focusCount, focusMinutesToday: data.focusMinutes })
    } catch {
      // non-critical
    }
  },

  _tick: () => {
    const s = get()
    if (!s.running) return
    if (s.remaining <= 1) {
      s._completePhase(false)
    } else {
      set({ remaining: s.remaining - 1 })
    }
  },

  _completePhase: (skipped) => {
    const s = get()
    if (s.intervalId) clearInterval(s.intervalId)
    const wasFocus = s.phase === "focus"
    const elapsedFull = !skipped

    // save completed focus sessions to the database
    if (wasFocus && elapsedFull && s.sessionStartedAt) {
      const endTime = nowHHMM()
      void api("/api/pomodoro", {
        method: "POST",
        body: {
          minutes: s.focusMin,
          type: "FOCUS",
          subjectId: s.subjectId || null,
          date: todayIso(),
          startTime: s.sessionStartedAt,
          endTime,
        },
      })
        .then(() => set({ completedToday: s.completedToday + 1, focusMinutesToday: s.focusMinutesToday + s.focusMin }))
        .catch(() => {})
    }

    if (wasFocus) playChime()

    const nextPhase: PomodoroPhase = wasFocus
      ? (s.completedToday + (elapsedFull ? 1 : 0)) % s.untilLongBreak === 0
        ? "long-break"
        : "break"
      : "focus"
    const nextMinutes = nextPhase === "focus" ? s.focusMin : nextPhase === "break" ? s.breakMin : s.longBreakMin

    set({
      phase: nextPhase,
      running: false,
      intervalId: null,
      remaining: nextMinutes * 60,
      sessionStartedAt: null,
    })
  },
}))

function nowHHMM(): string {
  const d = new Date()
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`
}

/** Soft two-tone chime via WebAudio (no audio assets needed). */
function playChime() {
  try {
    const Ctx = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
    if (!Ctx) return
    const ctx = new Ctx()
    const notes = [523.25, 783.99]
    notes.forEach((freq, i) => {
      const osc = ctx.createOscillator()
      const gain = ctx.createGain()
      osc.type = "sine"
      osc.frequency.value = freq
      gain.gain.setValueAtTime(0.0001, ctx.currentTime + i * 0.25)
      gain.gain.exponentialRampToValueAtTime(0.18, ctx.currentTime + i * 0.25 + 0.03)
      gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + i * 0.25 + 0.6)
      osc.connect(gain).connect(ctx.destination)
      osc.start(ctx.currentTime + i * 0.25)
      osc.stop(ctx.currentTime + i * 0.25 + 0.7)
    })
    setTimeout(() => void ctx.close(), 2000)
  } catch {
    // audio not available
  }
}
