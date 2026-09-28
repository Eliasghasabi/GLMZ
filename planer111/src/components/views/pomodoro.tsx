"use client"

import { useEffect, useRef } from "react"
import { useQuery } from "@tanstack/react-query"
import { BookOpen, Pause, Play, RotateCcw, SkipForward } from "lucide-react"
import { api } from "@/lib/api"
import { usePomodoro, type PomodoroPhase } from "@/lib/client/pomodoro-store"
import { useAuth } from "@/lib/client/auth"
import { toFa } from "@/lib/format"
import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { PageHeader } from "@/components/shared/page-header"
import { cn } from "@/lib/utils"

type SubjectLite = { id: string; name: string; icon: string; color: string }

const PHASE_LABELS: Record<PomodoroPhase, string> = {
  focus: "زمان تمرکز",
  break: "استراحت کوتاه",
  "long-break": "استراحت بلند",
}

export function Pomodoro() {
  const store = usePomodoro()
  const { settings } = useAuth()
  const configuredRef = useRef(false)

  // sync config from settings once
  useEffect(() => {
    if (settings && !configuredRef.current) {
      configuredRef.current = true
      store.configure({
        focusMin: settings.pomodoroFocus,
        breakMin: settings.pomodoroBreak,
        longBreakMin: settings.pomodoroLongBreak,
        untilLongBreak: settings.pomodorosUntilLongBreak,
      })
      void store.refreshToday()
    }
  }, [settings, store])

  // browser tab title shows remaining time while running
  useEffect(() => {
    if (store.running) {
      const mm = String(Math.floor(store.remaining / 60)).padStart(2, "0")
      const ss = String(store.remaining % 60).padStart(2, "0")
      document.title = `${mm}:${ss} — ${PHASE_LABELS[store.phase]} | استادی‌فلو`
    } else {
      document.title = "استادی‌فلو | برنامه‌ریز هوشمند مطالعه"
    }
    return () => {
      document.title = "استادی‌فلو | برنامه‌ریز هوشمند مطالعه"
    }
  }, [store.running, store.remaining, store.phase])

  // request Notification permission lazily when the page is used
  useEffect(() => {
    if ("Notification" in window && Notification.permission === "default") {
      // do not prompt immediately — only on explicit settings toggle
    }
  }, [])

  const { data: subjectsData } = useQuery({
    queryKey: ["subjects-lite-full"],
    queryFn: () => api<{ subjects: SubjectLite[] }>("/api/subjects"),
    staleTime: 5 * 60_000,
  })

  const totalSeconds = (() => {
    if (store.phase === "focus") return store.focusMin * 60
    if (store.phase === "break") return store.breakMin * 60
    return store.longBreakMin * 60
  })()
  const progress = 1 - store.remaining / totalSeconds

  const mm = String(Math.floor(store.remaining / 60)).padStart(2, "0")
  const ss = String(store.remaining % 60).padStart(2, "0")

  const cycleDots = Array.from({ length: store.untilLongBreak })
  const isFocus = store.phase === "focus"

  return (
    <div className="max-w-xl mx-auto">
      <PageHeader title="تمرکز" subtitle="پومودورو — هر جلسهٔ تکمیل‌شده به‌صورت خودکار در آمار ثبت می‌شود." />

      <Card className="glass border-0 shadow-soft rounded-3xl">
        <CardContent className="p-8 flex flex-col items-center gap-6">
          {/* phase label */}
          <span
            className={cn(
              "text-sm font-bold px-4 py-1.5 rounded-full",
              isFocus ? "bg-primary/10 text-primary" : "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
            )}
          >
            {PHASE_LABELS[store.phase]}
          </span>

          {/* Timer ring */}
          <div className="relative">
            <svg width="260" height="260" className="-rotate-90" role="img" aria-label={`تایمر ${mm}:${ss}`}>
              <defs>
                <linearGradient id="pomo-grad" x1="0%" y1="0%" x2="100%" y2="100%">
                  <stop offset="0%" stopColor={isFocus ? "#6366F1" : "#10B981"} />
                  <stop offset="100%" stopColor={isFocus ? "#8B5CF6" : "#34D399"} />
                </linearGradient>
              </defs>
              <circle cx="130" cy="130" r="118" fill="none" stroke="currentColor" className="text-muted" strokeWidth="12" />
              <circle
                cx="130"
                cy="130"
                r="118"
                fill="none"
                stroke="url(#pomo-grad)"
                strokeWidth="12"
                strokeLinecap="round"
                strokeDasharray={2 * Math.PI * 118}
                strokeDashoffset={2 * Math.PI * 118 * (1 - progress)}
                style={{ transition: "stroke-dashoffset 0.5s linear" }}
              />
            </svg>
            <div className="absolute inset-0 flex flex-col items-center justify-center">
              <span className="text-5xl font-extrabold tabular-nums ltr-num" dir="ltr">
                {toFa(mm)}:{toFa(ss)}
              </span>
              <span className="text-xs text-muted-foreground mt-2">امروز: {toFa(store.completedToday)} پومودورو · {toFa(store.focusMinutesToday)} دقیقه</span>
            </div>
          </div>

          {/* Controls */}
          <div className="flex items-center gap-3">
            {!store.running ? (
              <Button
                size="lg"
                onClick={() => (store.remaining === totalSeconds || !store.sessionStartedAt ? store.start() : store.resume())}
                className="w-32 h-12 rounded-2xl gradient-primary text-white border-0 shadow-lift gap-2 text-base"
              >
                <Play className="w-5 h-5" aria-hidden />
                {store.remaining === totalSeconds ? "شروع" : "ادامه"}
              </Button>
            ) : (
              <Button size="lg" onClick={store.pause} variant="outline" className="w-32 h-12 rounded-2xl gap-2 text-base">
                <Pause className="w-5 h-5" aria-hidden /> توقف
              </Button>
            )}
            <Button variant="outline" size="icon" className="h-12 w-12 rounded-2xl" onClick={store.reset} aria-label="بازنشانی">
              <RotateCcw className="w-5 h-5" aria-hidden />
            </Button>
            <Button variant="outline" size="icon" className="h-12 w-12 rounded-2xl" onClick={store.skip} aria-label="رد کردن فاز">
              <SkipForward className="w-5 h-5" aria-hidden />
            </Button>
          </div>

          {/* cycle dots */}
          <div className="flex items-center gap-2" aria-label={`دوره: ${toFa(store.completedToday % store.untilLongBreak)} از ${toFa(store.untilLongBreak)}`}>
            {cycleDots.map((_, i) => (
              <span
                key={i}
                className={cn("w-2.5 h-2.5 rounded-full transition-colors", i < store.completedToday % store.untilLongBreak ? "gradient-primary" : "bg-muted")}
                aria-hidden
              />
            ))}
            <span className="text-[10px] text-muted-foreground mr-1">تا استراحت بلند</span>
          </div>

          {/* subject picker */}
          <div className="w-full max-w-60">
            <Select value={store.subjectId ?? "none"} onValueChange={(v) => store.setSubject(v === "none" ? null : v)}>
              <SelectTrigger className="h-10 rounded-xl" aria-label="درس این جلسه">
                <BookOpen className="w-4 h-4 ml-1 text-primary" aria-hidden />
                <SelectValue placeholder="درس این جلسه…" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">بدون درس</SelectItem>
                {(subjectsData?.subjects ?? []).map((s) => (
                  <SelectItem key={s.id} value={s.id}>{s.icon} {s.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
