"use client"

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { motion } from "framer-motion"
import { Clock, Flame, ListChecks, Plus, Repeat2, Target, GraduationCap, CheckCircle2, Circle, Timer, CalendarDays } from "lucide-react"
import { api } from "@/lib/api"
import { navigate } from "@/lib/router"
import { useAuth } from "@/lib/client/auth"
import { formatDuration, formatJalaliDate, greetingForHour, PRIORITY_LABELS, toFa } from "@/lib/format"
import { persianDayIndexOfIso, todayIso } from "@/lib/jalali"
import { ProgressRing, BarChart } from "@/components/charts/charts"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { EmptyState } from "@/components/shared/empty-state"
import { cn } from "@/lib/utils"
import { useToast } from "@/hooks/use-toast"

type DashboardData = {
  today: string
  greetingName: string
  todayMinutes: number
  dailyGoalMinutes: number
  progressPercent: number
  todayTasks: {
    id: string
    title: string
    priority: string
    dueDate: string | null
    subject: { id: string; name: string; color: string; icon: string } | null
  }[]
  upcomingExams: {
    id: string
    title: string
    date: string
    daysLeft: number
    subject: { id: string; name: string; color: string; icon: string } | null
  }[]
  todayRevisions: {
    id: string
    topic: { id: string; title: string }
    subject: { id: string; name: string; color: string; icon: string } | null
    revisionNumber: number
  }[]
  streak: { current: number; longest: number; totalDays: number }
  last7Days: { date: string; minutes: number }[]
  weekMinutes: number
  weekGoalMinutes: number
  activeGoals: { id: string; title: string; targetValue: number; currentValue: number; unit: string }[]
  pomodoroCount: number
}

const WEEKDAY_LABELS = ["ش", "ی", "د", "س", "چ", "پ", "ج"]

export function Dashboard() {
  const { user } = useAuth()
  const queryClient = useQueryClient()
  const { toast } = useToast()

  const { data, isLoading, error } = useQuery({
    queryKey: ["dashboard"],
    queryFn: () => api<DashboardData>("/api/dashboard"),
    refetchInterval: 5 * 60_000,
  })

  const completeTask = useMutation({
    mutationFn: (id: string) => api(`/api/tasks/${id}`, { method: "PATCH", body: { status: "COMPLETED" } }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["dashboard"] })
      void queryClient.invalidateQueries({ queryKey: ["tasks"] })
      toast({ title: "انجام شد! ✓" })
    },
  })

  const completeRevision = useMutation({
    mutationFn: (id: string) => api("/api/revisions", { method: "PATCH", body: { id, status: "COMPLETED" } }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["dashboard"] })
      void queryClient.invalidateQueries({ queryKey: ["revisions"] })
      toast({ title: "مرور انجام شد! 🧠" })
    },
  })

  const hour = new Date().getHours()
  const today = todayIso()
  const weekdayIdx = persianDayIndexOfIso(today)

  if (error) {
    return <EmptyState emoji="⚠️" title="خطا در بارگذاری داشبورد" description="اتصال خود را بررسی کنید." actionLabel="تلاش دوباره" onAction={() => window.location.reload()} />
  }

  if (isLoading || !data) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-16 w-72" />
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-28 rounded-2xl" />)}
        </div>
        <div className="grid lg:grid-cols-3 gap-4">
          <Skeleton className="h-64 rounded-2xl lg:col-span-2" />
          <Skeleton className="h-64 rounded-2xl" />
        </div>
      </div>
    )
  }

  const weekPct = Math.min(100, Math.round((data.weekMinutes / Math.max(1, data.weekGoalMinutes)) * 100))
  const barData = data.last7Days.map((d, i) => ({
    label: WEEKDAY_LABELS[persianDayIndexOfIso(d.date)],
    value: d.minutes,
    highlight: i === data.last7Days.length - 1,
  }))

  return (
    <div className="space-y-6">
      {/* Greeting */}
      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl lg:text-3xl font-extrabold">
            {greetingForHour(hour)} {data.greetingName} 👋
          </h1>
          <p className="text-sm text-muted-foreground mt-1.5 flex items-center gap-1.5">
            <CalendarDays className="w-4 h-4" aria-hidden />
            امروز: {formatJalaliDate(data.today, { withWeekday: true })}
          </p>
        </div>
        <div className="flex gap-2">
          <Button size="sm" onClick={() => navigate("/pomodoro")} className="gradient-primary text-white border-0 rounded-xl shadow-lift gap-1.5">
            <Timer className="w-4 h-4" aria-hidden /> شروع تمرکز
          </Button>
          <Button size="sm" variant="outline" onClick={() => navigate("/tasks")} className="rounded-xl gap-1.5">
            <Plus className="w-4 h-4" aria-hidden /> کار جدید
          </Button>
        </div>
      </motion.div>

      {/* KPI cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.05 }}>
          <Card className="glass border-0 shadow-soft rounded-2xl h-full">
            <CardContent className="p-5 flex items-center justify-between">
              <div>
                <p className="text-xs text-muted-foreground mb-1">مطالعهٔ امروز</p>
                <p className="text-xl font-extrabold ltr-num">{toFa(Math.floor(data.todayMinutes / 60))}س {toFa(data.todayMinutes % 60)}د</p>
                <p className="text-[11px] text-muted-foreground mt-1 ltr-num">پومودوروها: {toFa(data.pomodoroCount)}</p>
              </div>
              <span className="w-11 h-11 rounded-2xl bg-primary/10 text-primary flex items-center justify-center shrink-0">
                <Clock className="w-5 h-5" aria-hidden />
              </span>
            </CardContent>
          </Card>
        </motion.div>

        <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}>
          <Card className="glass border-0 shadow-soft rounded-2xl h-full">
            <CardContent className="p-5 flex items-center justify-between">
              <div>
                <p className="text-xs text-muted-foreground mb-1">استریک فعلی</p>
                <p className="text-xl font-extrabold ltr-num">🔥 {toFa(data.streak.current)} روز</p>
                <p className="text-[11px] text-muted-foreground mt-1 ltr-num">رکورد: {toFa(data.streak.longest)} روز</p>
              </div>
              <span className="w-11 h-11 rounded-2xl bg-amber-500/10 text-amber-500 flex items-center justify-center shrink-0">
                <Flame className="w-5 h-5" aria-hidden />
              </span>
            </CardContent>
          </Card>
        </motion.div>

        <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.15 }}>
          <Card className="glass border-0 shadow-soft rounded-2xl h-full">
            <CardContent className="p-5 flex items-center justify-between">
              <div>
                <p className="text-xs text-muted-foreground mb-1">کارهای امروز</p>
                <p className="text-xl font-extrabold ltr-num">{toFa(data.todayTasks.length)}</p>
                <p className="text-[11px] text-muted-foreground mt-1">در انتظار انجام</p>
              </div>
              <span className="w-11 h-11 rounded-2xl bg-violet-500/10 text-violet-500 flex items-center justify-center shrink-0">
                <ListChecks className="w-5 h-5" aria-hidden />
              </span>
            </CardContent>
          </Card>
        </motion.div>

        <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }}>
          <Card className="glass border-0 shadow-soft rounded-2xl h-full">
            <CardContent className="p-5 flex items-center justify-between">
              <div>
                <p className="text-xs text-muted-foreground mb-1">مرورهای امروز</p>
                <p className="text-xl font-extrabold ltr-num">{toFa(data.todayRevisions.length)}</p>
                <p className="text-[11px] text-muted-foreground mt-1">سیستم مرور فاصله‌دار</p>
              </div>
              <span className="w-11 h-11 rounded-2xl bg-emerald-500/10 text-emerald-500 flex items-center justify-center shrink-0">
                <Repeat2 className="w-5 h-5" aria-hidden />
              </span>
            </CardContent>
          </Card>
        </motion.div>
      </div>

      {/* Progress + chart */}
      <div className="grid lg:grid-cols-3 gap-4">
        <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.25 }} className="lg:col-span-2">
          <Card className="glass border-0 shadow-soft rounded-2xl h-full">
            <CardHeader className="pb-2">
              <CardTitle className="text-base flex items-center gap-2">
                <Clock className="w-4 h-4 text-primary" aria-hidden /> روند ۷ روز اخیر
              </CardTitle>
            </CardHeader>
            <CardContent>
              <BarChart data={barData} height={150} />
              <div className="mt-4 pt-3 border-t flex items-center justify-between text-sm">
                <span className="text-muted-foreground">پیشرفت هفته:</span>
                <div className="flex items-center gap-3 flex-1 max-w-56">
                  <div className="h-2 flex-1 rounded-full bg-muted overflow-hidden">
                    <div className="h-full gradient-primary rounded-full transition-all duration-700" style={{ width: `${weekPct}%` }} />
                  </div>
                  <span className="text-xs font-bold ltr-num">{toFa(weekPct)}٪</span>
                </div>
                <span className="text-xs text-muted-foreground ltr-num">{toFa(Math.round(data.weekMinutes / 60))} از {toFa(Math.round(data.weekGoalMinutes / 60))} ساعت</span>
              </div>
            </CardContent>
          </Card>
        </motion.div>

        <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.3 }}>
          <Card className="glass border-0 shadow-soft rounded-2xl h-full">
            <CardContent className="p-6 flex flex-col items-center justify-center h-full gap-3">
              <ProgressRing percent={data.progressPercent} size={140} strokeWidth={12}>
                <span className="text-2xl font-extrabold ltr-num">{toFa(data.progressPercent)}٪</span>
                <span className="text-[10px] text-muted-foreground mt-0.5">از هدف روزانه</span>
              </ProgressRing>
              <p className="text-sm text-center text-muted-foreground">
                {data.todayMinutes >= data.dailyGoalMinutes
                  ? "هدف امروز دست یافت! 🎉"
                  : `${formatDuration(Math.max(0, data.dailyGoalMinutes - data.todayMinutes))} تا هدف امروز`}
              </p>
            </CardContent>
          </Card>
        </motion.div>
      </div>

      {/* Tasks + Exams */}
      <div className="grid lg:grid-cols-2 gap-4">
        <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.35 }}>
          <Card className="glass border-0 shadow-soft rounded-2xl h-full">
            <CardHeader className="pb-2 flex-row items-center justify-between">
              <CardTitle className="text-base">کارهای امروز</CardTitle>
              <Button variant="ghost" size="sm" className="text-xs text-primary" onClick={() => navigate("/tasks")}>
                همه
              </Button>
            </CardHeader>
            <CardContent>
              {data.todayTasks.length === 0 ? (
                <EmptyState emoji="🌱" title="همه چیز انجام شده!" description="برای امروز کاری ثبت نشده. از بخش کارها یک کار جدید بساز." actionLabel="کار جدید" onAction={() => navigate("/tasks")} />
              ) : (
                <ul className="space-y-2.5">
                  {data.todayTasks.slice(0, 5).map((t) => (
                    <li key={t.id} className="flex items-center gap-3 group">
                      <button
                        onClick={() => completeTask.mutate(t.id)}
                        aria-label={`انجام کار ${t.title}`}
                        className="shrink-0 text-muted-foreground hover:text-primary transition-colors"
                      >
                        <Circle className="w-5 h-5" aria-hidden />
                      </button>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium truncate">{t.title}</p>
                        {t.subject && (
                          <p className="text-xs text-muted-foreground flex items-center gap-1 mt-0.5">
                            <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: t.subject.color }} aria-hidden />
                            {t.subject.name}
                          </p>
                        )}
                      </div>
                      <span className={cn("text-[10px] px-2 py-1 rounded-lg shrink-0", "bg-muted text-muted-foreground")}>
                        {PRIORITY_LABELS[t.priority]}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
        </motion.div>

        <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.4 }}>
          <Card className="glass border-0 shadow-soft rounded-2xl h-full">
            <CardHeader className="pb-2 flex-row items-center justify-between">
              <CardTitle className="text-base">امتحان‌های پیش‌رو</CardTitle>
              <Button variant="ghost" size="sm" className="text-xs text-primary" onClick={() => navigate("/exams")}>
                همه
              </Button>
            </CardHeader>
            <CardContent>
              {data.upcomingExams.length === 0 ? (
                <EmptyState emoji="🗓️" title="امتحانی ثبت نشده" description="امتحان بعدی‌ات را اضافه کن تا شمارش معکوس را ببینی." actionLabel="ثبت امتحان" onAction={() => navigate("/exams")} />
              ) : (
                <ul className="space-y-2.5">
                  {data.upcomingExams.map((e) => (
                    <li key={e.id} className="flex items-center gap-3">
                      <span className="w-11 h-11 rounded-xl flex items-center justify-center text-lg shrink-0" style={{ backgroundColor: (e.subject?.color ?? "#6366F1") + "18" }} aria-hidden>
                        {e.subject?.icon ?? "🧪"}
                      </span>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium truncate">{e.title}</p>
                        <p className="text-xs text-muted-foreground">{e.subject?.name ?? "عمومی"} · {formatJalaliDate(e.date)}</p>
                      </div>
                      <span className={cn("text-xs font-bold px-2.5 py-1.5 rounded-xl shrink-0 ltr-num", e.daysLeft <= 3 ? "bg-destructive/10 text-destructive" : e.daysLeft <= 7 ? "bg-amber-500/10 text-amber-600 dark:text-amber-400" : "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400")}>
                        {e.daysLeft === 0 ? "امروز!" : e.daysLeft === 1 ? "فردا" : `${toFa(e.daysLeft)} روز`}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
        </motion.div>
      </div>

      {/* Revisions + Goals */}
      <div className="grid lg:grid-cols-2 gap-4">
        <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.45 }}>
          <Card className="glass border-0 shadow-soft rounded-2xl h-full">
            <CardHeader className="pb-2 flex-row items-center justify-between">
              <CardTitle className="text-base">مرورهای امروز</CardTitle>
              <Button variant="ghost" size="sm" className="text-xs text-primary" onClick={() => navigate("/revisions")}>
                همه
              </Button>
            </CardHeader>
            <CardContent>
              {data.todayRevisions.length === 0 ? (
                <EmptyState emoji="🧠" title="مروری برای امروز نیست" description="با تکمیل مباحث، مرورهای فاصله‌دار به‌صورت خودکار ساخته می‌شوند." />
              ) : (
                <ul className="space-y-2.5">
                  {data.todayRevisions.slice(0, 5).map((r) => (
                    <li key={r.id} className="flex items-center gap-3">
                      <button
                        onClick={() => completeRevision.mutate(r.id)}
                        aria-label={`انجام مرور ${r.topic.title}`}
                        className="shrink-0 text-muted-foreground hover:text-primary transition-colors"
                      >
                        <CheckCircle2 className="w-5 h-5" aria-hidden />
                      </button>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium truncate">{r.topic.title}</p>
                        <p className="text-xs text-muted-foreground">{r.subject?.name ?? ""} · دورهٔ {toFa(r.revisionNumber)}</p>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
        </motion.div>

        <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.5 }}>
          <Card className="glass border-0 shadow-soft rounded-2xl h-full">
            <CardHeader className="pb-2 flex-row items-center justify-between">
              <CardTitle className="text-base">اهداف فعال</CardTitle>
              <Button variant="ghost" size="sm" className="text-xs text-primary" onClick={() => navigate("/goals")}>
                همه
              </Button>
            </CardHeader>
            <CardContent>
              {data.activeGoals.length === 0 ? (
                <EmptyState emoji="🎯" title="هدفی تعریف نشده" description="یک هدف هفتگی بساز تا انگیزه‌ات دوچندان شود." actionLabel="هدف جدید" onAction={() => navigate("/goals")} />
              ) : (
                <ul className="space-y-4">
                  {data.activeGoals.map((g) => {
                    const pct = Math.min(100, Math.round((g.currentValue / Math.max(0.01, g.targetValue)) * 100))
                    return (
                      <li key={g.id}>
                        <div className="flex items-center justify-between text-sm mb-1.5">
                          <span className="font-medium truncate">{g.title}</span>
                          <span className="text-xs text-muted-foreground ltr-num shrink-0 mr-2">
                            {toFa(g.currentValue.toLocaleString("fa-IR"))}/{toFa(g.targetValue.toLocaleString("fa-IR"))} {g.unit}
                          </span>
                        </div>
                        <div className="h-2 rounded-full bg-muted overflow-hidden">
                          <div className="h-full gradient-primary rounded-full transition-all duration-700" style={{ width: `${pct}%` }} />
                        </div>
                      </li>
                    )
                  })}
                </ul>
              )}
            </CardContent>
          </Card>
        </motion.div>
      </div>

      {/* Quick actions */}
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.55 }} className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { icon: Timer, label: "پومودورو", href: "/pomodoro" },
          { icon: CalendarDays, label: "برنامهٔ هفته", href: "/planner" },
          { icon: Target, label: "اهداف", href: "/goals" },
          { icon: GraduationCap, label: "درس‌ها", href: "/subjects" },
        ].map((a) => (
          <button
            key={a.href}
            onClick={() => navigate(a.href)}
            className="flex items-center gap-3 p-4 rounded-2xl glass shadow-soft hover:shadow-lift hover:-translate-y-0.5 transition-all text-sm font-semibold"
          >
            <span className="w-9 h-9 rounded-xl bg-primary/10 text-primary flex items-center justify-center">
              <a.icon className="w-4.5 h-4.5" aria-hidden />
            </span>
            {a.label}
          </button>
        ))}
      </motion.div>
    </div>
  )
}
