"use client"

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { motion } from "framer-motion"
import { AlarmClock, CheckCircle2, Repeat2, Trash2 } from "lucide-react"
import { api } from "@/lib/api"
import { formatJalaliDate, relativeDayLabel, toFa } from "@/lib/format"
import { todayIso } from "@/lib/jalali"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { EmptyState } from "@/components/shared/empty-state"
import { ListSkeleton } from "@/components/shared/skeletons"
import { PageHeader } from "@/components/shared/page-header"
import { cn } from "@/lib/utils"
import { useToast } from "@/hooks/use-toast"

type Revision = {
  id: string
  topicId: string
  revisionNumber: number
  dueDate: string
  status: string
  topic: { id: string; title: string }
  subject: { id: string; name: string; color: string; icon: string } | null
}

type RevisionsData = {
  today: string
  overdue: Revision[]
  dueToday: Revision[]
  upcoming: { date: string; daysLeft: number; items: Revision[] }[]
  completedRecent: Revision[]
}

export function Revisions() {
  const queryClient = useQueryClient()
  const { toast } = useToast()
  const today = todayIso()

  const { data, isLoading } = useQuery({
    queryKey: ["revisions"],
    queryFn: () => api<RevisionsData>("/api/revisions"),
  })

  const complete = useMutation({
    mutationFn: (id: string) => api("/api/revisions", { method: "PATCH", body: { id, status: "COMPLETED" } }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["revisions"] })
      void queryClient.invalidateQueries({ queryKey: ["dashboard"] })
      toast({ title: "مرور انجام شد! حافظه‌ات قوی‌تر شد 🧠" })
    },
  })

  const remove = useMutation({
    mutationFn: (id: string) => api(`/api/revisions?id=${id}`, { method: "DELETE" }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["revisions"] }),
  })

  if (isLoading) return <ListSkeleton rows={6} />

  const overdue = data?.overdue ?? []
  const dueToday = data?.dueToday ?? []
  const upcoming = data?.upcoming ?? []
  const completedRecent = data?.completedRecent ?? []
  const totalPending = overdue.length + dueToday.length + upcoming.reduce((a, u) => a + u.items.length, 0)

  return (
    <div>
      <PageHeader
        title="مرور فاصله‌دار"
        subtitle="سیستم مرور هوشمند — مباحث تکمیل‌شده به‌صورت خودکار برای مرور در ۱، ۳، ۷، ۱۴ و ۳۰ روز برنامه‌ریزی می‌شوند."
      />

      {totalPending === 0 ? (
        <Card className="glass border-0 shadow-soft rounded-3xl">
          <CardContent className="p-2">
            <EmptyState
              emoji="🧠"
              title="همهٔ مرورها انجام شده!"
              description="مبحثی برای مرور نیست. با تکمیل مباحث جدید در درس‌ها، مرورهای فاصله‌دار به‌طور خودکار ساخته می‌شوند."
              actionLabel="مشاهدهٔ درس‌ها"
              onAction={() => window.location.assign("#/subjects")}
            />
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-5">
          {/* Overdue */}
          {overdue.length > 0 && (
            <RevisionSection
              title={`عقب‌افتاده (${toFa(overdue.length)})`}
              icon={<AlarmClock className="w-4 h-4 text-destructive" aria-hidden />}
              items={overdue}
              today={today}
              onComplete={(id) => complete.mutate(id)}
              onDelete={(id) => remove.mutate(id)}
              tone="danger"
            />
          )}

          {/* Today */}
          {dueToday.length > 0 && (
            <RevisionSection
              title={`مرورهای امروز (${toFa(dueToday.length)})`}
              icon={<Repeat2 className="w-4 h-4 text-primary" aria-hidden />}
              items={dueToday}
              today={today}
              onComplete={(id) => complete.mutate(id)}
              onDelete={(id) => remove.mutate(id)}
              tone="primary"
            />
          )}

          {/* Upcoming */}
          {upcoming.map((group) => (
            <RevisionSection
              key={group.date}
              title={`${relativeDayLabel(group.date, today)} — ${formatJalaliDate(group.date)} (${toFa(group.items.length)})`}
              items={group.items}
              today={today}
              onComplete={(id) => complete.mutate(id)}
              onDelete={(id) => remove.mutate(id)}
            />
          ))}
        </div>
      )}

      {/* Recently completed */}
      {completedRecent.length > 0 && (
        <Card className="glass border-0 shadow-soft rounded-3xl mt-6">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-muted-foreground">آخرین مرورهای انجام‌شده</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap gap-2">
              {completedRecent.slice(0, 8).map((r) => (
                <Badge key={r.id} variant="secondary" className="gap-1 text-xs">
                  <CheckCircle2 className="w-3 h-3 text-emerald-500" aria-hidden />
                  {r.topic.title}
                </Badge>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  )
}

function RevisionSection({
  title,
  icon,
  items,
  today,
  onComplete,
  onDelete,
  tone = "default",
}: {
  title: string
  icon?: React.ReactNode
  items: Revision[]
  today: string
  onComplete: (id: string) => void
  onDelete: (id: string) => void
  tone?: "default" | "primary" | "danger"
}) {
  return (
    <Card className="glass border-0 shadow-soft rounded-3xl">
      <CardHeader className="pb-2">
        <CardTitle className={cn("text-base flex items-center gap-2", tone === "danger" && "text-destructive", tone === "primary" && "text-primary")}>
          {icon} {title}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-2.5">
        {items.map((r, i) => (
          <motion.div
            key={r.id}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: Math.min(i * 0.04, 0.3) }}
            className="flex items-center gap-3 p-3 rounded-2xl bg-card/50 group"
          >
            <button
              onClick={() => onComplete(r.id)}
              aria-label={`انجام مرور ${r.topic.title}`}
              className="shrink-0 text-muted-foreground hover:text-primary transition-colors"
            >
              <CheckCircle2 className="w-5.5 h-5.5" aria-hidden />
            </button>
            <span
              className="w-10 h-10 rounded-xl flex items-center justify-center text-lg shrink-0"
              style={{ backgroundColor: (r.subject?.color ?? "#6366F1") + "1c" }}
              aria-hidden
            >
              {r.subject?.icon ?? "🔁"}
            </span>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold truncate">{r.topic.title}</p>
              <p className="text-xs text-muted-foreground">
                {r.subject?.name ?? ""} · دورهٔ {toFa(r.revisionNumber)}
              </p>
            </div>
            <span className="text-[11px] text-muted-foreground shrink-0 ltr-num">{formatJalaliDate(r.dueDate)}</span>
            <button
              onClick={() => onDelete(r.id)}
              className="opacity-0 group-hover:opacity-100 text-destructive p-1 transition-opacity shrink-0"
              aria-label="حذف مرور"
            >
              <Trash2 className="w-3.5 h-3.5" aria-hidden />
            </button>
          </motion.div>
        ))}
      </CardContent>
    </Card>
  )
}
