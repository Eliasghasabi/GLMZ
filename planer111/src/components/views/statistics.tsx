"use client"

import { useQuery } from "@tanstack/react-query"
import { motion } from "framer-motion"
import { CalendarRange, CheckCircle2, Flame, ListChecks, Timer, TrendingUp } from "lucide-react"
import { api } from "@/lib/api"
import { formatDuration, formatJalaliDate, toFa } from "@/lib/format"
import { persianDayIndexOfIso } from "@/lib/jalali"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { AreaChart, BarChart, DonutChart } from "@/components/charts/charts"
import { ListSkeleton } from "@/components/shared/skeletons"
import { EmptyState } from "@/components/shared/empty-state"
import { PageHeader } from "@/components/shared/page-header"

type StatsData = {
  today: string
  streak: { current: number; longest: number; totalDays: number }
  todayMinutes: number
  weekMinutes: number
  monthMinutes: number
  weekGoalMinutes: number
  last7Days: { date: string; minutes: number }[]
  last30Days: { date: string; minutes: number }[]
  distribution: { id: string; name: string; color: string; minutes: number }[]
  tasksCompleted: number
  topicsCompleted: number
  pomodoroToday: number
  totalSubjects: number
  bestDay: { date: string; minutes: number }
  avgPerActiveDay: number
}

const WEEKDAY_LABELS = ["ش", "ی", "د", "س", "چ", "پ", "ج"]

export function Statistics() {
  const { data, isLoading, error } = useQuery({
    queryKey: ["stats"],
    queryFn: () => api<StatsData>("/api/stats"),
  })

  if (isLoading) return <ListSkeleton rows={6} />
  if (error || !data) return <EmptyState emoji="⚠️" title="خطا در بارگذاری آمار" description="لطفاً دوباره تلاش کن." />

  const barData = data.last7Days.map((d, i) => ({
    label: WEEKDAY_LABELS[persianDayIndexOfIso(d.date)],
    value: d.minutes,
    highlight: i === data.last7Days.length - 1,
  }))

  const donutData = data.distribution.map((d) => ({ name: d.name, value: d.minutes, color: d.color }))
  const activeDays30 = data.last30Days.filter((d) => d.minutes > 0).length

  return (
    <div>
      <PageHeader title="آمار" subtitle="تصویر کلی پیشرفت و روند مطالعه‌ات." />

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-5">
        <KpiCard icon={<CalendarRange className="w-5 h-5" aria-hidden />} label="مطالعهٔ امروز" value={formatDuration(data.todayMinutes)} delay={0} />
        <KpiCard icon={<TrendingUp className="w-5 h-5" aria-hidden />} label="این هفته" value={formatDuration(data.weekMinutes)} sub={`میانگین روزانهٔ فعال: ${formatDuration(data.avgPerActiveDay)}`} delay={0.05} />
        <KpiCard icon={<Flame className="w-5 h-5" aria-hidden />} label="استریک" value={`${toFa(data.streak.current)} روز`} sub={`رکورد: ${toFa(data.streak.longest)} · کل: ${toFa(data.streak.totalDays)} روز`} delay={0.1} />
        <KpiCard icon={<Timer className="w-5 h-5" aria-hidden />} label="۳۰ روز اخیر" value={formatDuration(data.monthMinutes)} sub={`${toFa(activeDays30)} روز فعال از ۳۰`} delay={0.15} />
      </div>

      <div className="grid lg:grid-cols-2 gap-4 mb-5">
        <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}>
          <Card className="glass border-0 shadow-soft rounded-3xl h-full">
            <CardHeader className="pb-2">
              <CardTitle className="text-base">مطالعهٔ ۷ روز اخیر</CardTitle>
            </CardHeader>
            <CardContent>
              <BarChart data={barData} height={170} />
            </CardContent>
          </Card>
        </motion.div>

        <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.08 }}>
          <Card className="glass border-0 shadow-soft rounded-3xl h-full">
            <CardHeader className="pb-2">
              <CardTitle className="text-base">توزیع بین درس‌ها (۳۰ روز)</CardTitle>
            </CardHeader>
            <CardContent>
              <DonutChart data={donutData} />
            </CardContent>
          </Card>
        </motion.div>
      </div>

      <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.15 }} className="mb-5">
        <Card className="glass border-0 shadow-soft rounded-3xl">
          <CardHeader className="pb-2">
            <CardTitle className="text-base">روند ۳۰ روز اخیر</CardTitle>
          </CardHeader>
          <CardContent>
            <AreaChart points={data.last30Days} height={200} />
          </CardContent>
        </Card>
      </motion.div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <KpiCard icon={<ListChecks className="w-5 h-5" aria-hidden />} label="کارهای انجام‌شده" value={toFa(data.tasksCompleted)} delay={0.2} />
        <KpiCard icon={<CheckCircle2 className="w-5 h-5" aria-hidden />} label="مباحث تکمیل‌شده" value={toFa(data.topicsCompleted)} delay={0.25} />
        <KpiCard icon={<Timer className="w-5 h-5" aria-hidden />} label="پومودوروی امروز" value={toFa(data.pomodoroToday)} delay={0.3} />
        <KpiCard
          icon={<Flame className="w-5 h-5" aria-hidden />}
          label="بهترین روز"
          value={data.bestDay.minutes > 0 ? formatDuration(data.bestDay.minutes) : "—"}
          sub={data.bestDay.minutes > 0 ? formatJalaliDate(data.bestDay.date) : undefined}
          delay={0.35}
        />
      </div>
    </div>
  )
}

function KpiCard({ icon, label, value, sub, delay }: { icon: React.ReactNode; label: string; value: string; sub?: string; delay: number }) {
  return (
    <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay }}>
      <Card className="glass border-0 shadow-soft rounded-2xl h-full">
        <CardContent className="p-5">
          <div className="flex items-center gap-2.5 mb-2.5">
            <span className="w-9 h-9 rounded-xl bg-primary/10 text-primary flex items-center justify-center shrink-0">{icon}</span>
            <span className="text-xs text-muted-foreground">{label}</span>
          </div>
          <p className="text-lg font-extrabold">{value}</p>
          {sub && <p className="text-[11px] text-muted-foreground mt-1">{sub}</p>}
        </CardContent>
      </Card>
    </motion.div>
  )
}
