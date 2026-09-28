"use client"

import { useMemo, useState } from "react"
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { motion } from "framer-motion"
import { CalendarDays, ChevronLeft, ChevronRight, Clock, Loader2, Plus, Sparkles, Trash2 } from "lucide-react"
import { api } from "@/lib/api"
import { formatDuration, toFa, relativeDayLabel, addDaysIso } from "@/lib/format"
import { persianDayIndexOfIso, todayIso, isoToJalali } from "@/lib/jalali"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { EmptyState } from "@/components/shared/empty-state"
import { ListSkeleton } from "@/components/shared/skeletons"
import { PageHeader } from "@/components/shared/page-header"
import { cn } from "@/lib/utils"
import { useToast } from "@/hooks/use-toast"

const WEEKDAYS = ["شنبه", "یکشنبه", "دوشنبه", "سه‌شنبه", "چهارشنبه", "پنجشنبه", "جمعه"]
const WEEKDAYS_SHORT = ["ش", "ی", "د", "س", "چ", "پ", "ج"]

type Block = {
  id: string
  subjectId: string | null
  topicId: string | null
  title: string | null
  dayOfWeek: number
  startTime: string
  endTime: string
  status: string
  subject: { id: string; name: string; color: string; icon: string } | null
  topic: { id: string; title: string } | null
}

type Session = {
  id: string
  subjectId: string | null
  topicId: string | null
  date: string
  startTime: string
  endTime: string
  durationMinutes: number
  notes: string | null
  source: string
  completed: boolean
  subject: { id: string; name: string; color: string; icon: string } | null
  topic: { id: string; title: string } | null
}

type SubjectLite = { id: string; name: string; color: string; icon: string }

export function Planner() {
  const [tab, setTab] = useState<"weekly" | "daily">("weekly")
  const today = todayIso()

  return (
    <div>
      <PageHeader
        title="برنامه"
        subtitle="برنامهٔ هفتگی و جلسات روزانهٔ مطالعه."
        actions={
          <Tabs value={tab} onValueChange={(v) => setTab(v as "weekly" | "daily")}>
            <TabsList>
              <TabsTrigger value="weekly" className="gap-1.5"><CalendarDays className="w-3.5 h-3.5" aria-hidden /> هفتگی</TabsTrigger>
              <TabsTrigger value="daily" className="gap-1.5"><Clock className="w-3.5 h-3.5" aria-hidden /> روزانه</TabsTrigger>
            </TabsList>
          </Tabs>
        }
      />
      {tab === "weekly" ? <WeeklyPlanner today={today} /> : <DailyPlanner today={today} />}
    </div>
  )
}

// ─────────────────────────── Weekly ───────────────────────────

function WeeklyPlanner({ today }: { today: string }) {
  const queryClient = useQueryClient()
  const { toast } = useToast()
  const [dialogOpen, setDialogOpen] = useState(false)
  const [draggedBlock, setDraggedBlock] = useState<Block | null>(null)

  const { data, isLoading } = useQuery({
    queryKey: ["blocks"],
    queryFn: () => api<{ blocks: Block[] }>("/api/blocks"),
  })

  const { data: subjectsData } = useQuery({
    queryKey: ["subjects-lite-full"],
    queryFn: () => api<{ subjects: SubjectLite[] }>("/api/subjects"),
    staleTime: 5 * 60_000,
  })

  const moveBlock = useMutation({
    mutationFn: ({ id, dayOfWeek }: { id: string; dayOfWeek: number }) =>
      api(`/api/blocks/${id}`, { method: "PATCH", body: { dayOfWeek } }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["blocks"] })
      toast({ title: "بلوک جابه‌جا شد" })
    },
  })

  const deleteBlock = useMutation({
    mutationFn: (id: string) => api(`/api/blocks/${id}`, { method: "DELETE" }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["blocks"] })
      toast({ title: "بلوک حذف شد" })
    },
  })

  const blocks = data?.blocks ?? []
  const todayIdx = persianDayIndexOfIso(today)

  // dates of this week (Sat..Fri) for day headers
  const weekDates = useMemo(() => {
    const sat = addDaysIso(today, -todayIdx)
    return WEEKDAYS.map((_, i) => addDaysIso(sat, i))
  }, [today, todayIdx])

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <p className="text-sm text-muted-foreground">
          بلوک‌های مطالعهٔ تکرارشوندهٔ هفته — می‌توانی آن‌ها را با کشیدن بین روزها جابه‌جا کنی.
        </p>
        <Button size="sm" onClick={() => setDialogOpen(true)} className="gradient-primary text-white border-0 rounded-xl gap-1.5">
          <Plus className="w-4 h-4" aria-hidden /> بلوک جدید
        </Button>
      </div>

      {isLoading ? (
        <ListSkeleton rows={4} />
      ) : blocks.length === 0 ? (
        <Card className="glass border-0 shadow-soft rounded-3xl">
          <CardContent className="p-2">
            <EmptyState
              emoji="🗓️"
              title="برنامهٔ هفتگی خالی است"
              description="اولین بلوک مطالعهٔ خودت را بساز — مثلاً ریاضی هر شنبه ساعت ۱۶."
              actionLabel="ساخت بلوک مطالعه"
              onAction={() => setDialogOpen(true)}
            />
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-4 xl:grid-cols-7 gap-3">
          {WEEKDAYS.map((dayName, dayIdx) => {
            const dayBlocks = blocks.filter((b) => b.dayOfWeek === dayIdx).sort((a, b) => a.startTime.localeCompare(b.startTime))
            const isToday = dayIdx === todayIdx
            return (
              <div
                key={dayName}
                onDragOver={(e) => { if (draggedBlock) e.preventDefault() }}
                onDrop={() => {
                  if (draggedBlock && draggedBlock.dayOfWeek !== dayIdx) {
                    moveBlock.mutate({ id: draggedBlock.id, dayOfWeek: dayIdx })
                  }
                  setDraggedBlock(null)
                }}
                className={cn(
                  "rounded-2xl border p-2.5 min-h-40 transition-colors",
                  isToday ? "border-primary/40 bg-primary/5" : "border-border/70 bg-card/40"
                )}
                aria-label={`روز ${dayName}`}
              >
                <div className="flex items-center justify-between mb-2 px-1">
                  <span className={cn("text-xs font-bold", isToday && "text-primary")}>{dayName}</span>
                  <span className="text-[10px] text-muted-foreground ltr-num">
                    {(() => { const { jd, jm } = isoToJalali(weekDates[dayIdx]); return `${toFa(jd)} ${["فروردین","اردیبهشت","خرداد","تیر","مرداد","شهریور","مهر","آبان","آذر","دی","بهمن","اسفند"][jm - 1]}` })()}
                  </span>
                </div>
                <div className="space-y-2">
                  {dayBlocks.map((b) => (
                    <motion.div
                      key={b.id}
                      layout
                      draggable
                      onDragStart={() => setDraggedBlock(b)}
                      onDragEnd={() => setDraggedBlock(null)}
                      className="group rounded-xl p-2.5 cursor-grab active:cursor-grabbing hover:shadow-lift transition-all"
                      style={{ backgroundColor: (b.subject?.color ?? "#6366F1") + "16", borderInlineStart: `3px solid ${b.subject?.color ?? "#6366F1"}` }}
                      aria-label={`بلوک ${b.subject?.name ?? b.title ?? "مطالعه"} از ${b.startTime} تا ${b.endTime}`}
                    >
                      <div className="flex items-start justify-between gap-1">
                        <div className="min-w-0">
                          <p className="text-xs font-bold truncate">{b.subject?.name ?? b.title ?? "مطالعه"}</p>
                          {b.topic && <p className="text-[10px] text-muted-foreground truncate">{b.topic.title}</p>}
                          <p className="text-[10px] mt-1 ltr-num text-muted-foreground" dir="ltr">{b.startTime} - {b.endTime}</p>
                        </div>
                        <button
                          onClick={() => deleteBlock.mutate(b.id)}
                          className="opacity-0 group-hover:opacity-100 transition-opacity text-destructive p-0.5"
                          aria-label="حذف بلوک"
                        >
                          <Trash2 className="w-3 h-3" aria-hidden />
                        </button>
                      </div>
                    </motion.div>
                  ))}
                  {dayBlocks.length === 0 && (
                    <button
                      onClick={() => setDialogOpen(true)}
                      className="w-full py-3 rounded-xl border border-dashed text-[11px] text-muted-foreground hover:text-primary hover:border-primary/40 transition-colors"
                    >
                      + بلوک
                    </button>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      )}

      <BlockDialog open={dialogOpen} setOpen={setDialogOpen} subjects={subjectsData?.subjects ?? []} defaultDay={todayIdx} />
    </div>
  )
}

function BlockDialog({
  open,
  setOpen,
  subjects,
  defaultDay,
}: {
  open: boolean
  setOpen: (v: boolean) => void
  subjects: SubjectLite[]
  defaultDay: number
}) {
  const queryClient = useQueryClient()
  const { toast } = useToast()
  const [subjectId, setSubjectId] = useState("none")
  const [title, setTitle] = useState("")
  const [day, setDay] = useState(String(defaultDay))
  const [start, setStart] = useState("16:00")
  const [end, setEnd] = useState("18:00")
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState("")

  const save = async () => {
    setError("")
    if (start >= end) return setError("ساعت پایان باید بعد از ساعت شروع باشد.")
    setSaving(true)
    try {
      await api("/api/blocks", {
        method: "POST",
        body: {
          subjectId: subjectId === "none" ? null : subjectId,
          title: title.trim() || null,
          dayOfWeek: parseInt(day),
          startTime: start,
          endTime: end,
        },
      })
      toast({ title: "بلوک اضافه شد ✓" })
      void queryClient.invalidateQueries({ queryKey: ["blocks"] })
      setOpen(false)
    } catch (e) {
      setError(e instanceof Error ? e.message : "خطا در ذخیره")
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="max-w-md">
        <DialogHeader><DialogTitle>بلوک مطالعهٔ هفتگی</DialogTitle></DialogHeader>
        <div className="space-y-4 py-1">
          <div className="space-y-1.5">
            <Label>درس</Label>
            <Select value={subjectId} onValueChange={setSubjectId}>
              <SelectTrigger className="h-10"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="none">عمومی</SelectItem>
                {subjects.map((s) => <SelectItem key={s.id} value={s.id}>{s.icon} {s.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="b-title">عنوان (اختیاری)</Label>
            <Input id="b-title" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="مثلاً مرور تمرین‌ها" className="h-10" />
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div className="space-y-1.5">
              <Label>روز</Label>
              <Select value={day} onValueChange={setDay}>
                <SelectTrigger className="h-10"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {WEEKDAYS.map((d, i) => <SelectItem key={i} value={String(i)}>{d}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="b-start">شروع</Label>
              <Input id="b-start" type="time" value={start} onChange={(e) => setStart(e.target.value)} className="h-10" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="b-end">پایان</Label>
              <Input id="b-end" type="time" value={end} onChange={(e) => setEnd(e.target.value)} className="h-10" />
            </div>
          </div>
          {error && <p className="text-sm text-destructive" role="alert">{error}</p>}
        </div>
        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={() => setOpen(false)}>انصراف</Button>
          <Button onClick={save} disabled={saving} className="gradient-primary text-white border-0 rounded-xl">
            {saving ? <Loader2 className="w-4 h-4 animate-spin" aria-hidden /> : "ذخیره"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// ─────────────────────────── Daily ───────────────────────────

function DailyPlanner({ today: initialToday }: { today: string }) {
  const queryClient = useQueryClient()
  const { toast } = useToast()
  const [date, setDate] = useState(initialToday)
  const [dialogOpen, setDialogOpen] = useState(false)

  const { data, isLoading } = useQuery({
    queryKey: ["sessions", date],
    queryFn: () => api<{ sessions: Session[] }>(`/api/sessions?date=${date}`),
  })

  const { data: subjectsData } = useQuery({
    queryKey: ["subjects-lite-full"],
    queryFn: () => api<{ subjects: SubjectLite[] }>("/api/subjects"),
    staleTime: 5 * 60_000,
  })

  const deleteSession = useMutation({
    mutationFn: (id: string) => api(`/api/sessions/${id}`, { method: "DELETE" }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["sessions", date] })
      void queryClient.invalidateQueries({ queryKey: ["dashboard"] })
      toast({ title: "جلسه حذف شد" })
    },
  })

  const sessions = (data?.sessions ?? []).sort((a, b) => a.startTime.localeCompare(b.startTime))
  const totalMinutes = sessions.reduce((a, s) => a + s.durationMinutes, 0)

  // timeline from 06:00 to 24:00
  const hours = Array.from({ length: 19 }, (_, i) => i + 6)

  const position = (time: string): number => {
    const [h, m] = time.split(":").map(Number)
    return (h * 60 + m - 360) / (18 * 60) // percent of timeline
  }

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
        <div className="flex items-center gap-2">
          <Button variant="outline" size="icon" className="h-9 w-9" aria-label="روز قبل" onClick={() => setDate(addDaysIso(date, -1))}>
            <ChevronRight className="w-4 h-4" aria-hidden />
          </Button>
          <div className="text-center min-w-40">
            <p className="text-sm font-bold">{relativeDayLabel(date, initialToday)}</p>
            <p className="text-[11px] text-muted-foreground">{new Intl.DateTimeFormat("fa-IR", { dateStyle: "full" }).format(new Date(date + "T00:00:00"))}</p>
          </div>
          <Button variant="outline" size="icon" className="h-9 w-9" aria-label="روز بعد" onClick={() => setDate(addDaysIso(date, 1))}>
            <ChevronLeft className="w-4 h-4" aria-hidden />
          </Button>
          {date !== initialToday && (
            <Button variant="ghost" size="sm" className="text-xs text-primary" onClick={() => setDate(initialToday)}>
              امروز
            </Button>
          )}
        </div>
        <div className="flex items-center gap-3">
          <span className="text-xs text-muted-foreground ltr-num">مجموع: {formatDuration(totalMinutes)}</span>
          <Button size="sm" onClick={() => setDialogOpen(true)} className="gradient-primary text-white border-0 rounded-xl gap-1.5">
            <Plus className="w-4 h-4" aria-hidden /> جلسهٔ مطالعه
          </Button>
        </div>
      </div>

      {isLoading ? (
        <ListSkeleton rows={4} />
      ) : sessions.length === 0 ? (
        <Card className="glass border-0 shadow-soft rounded-3xl">
          <CardContent className="p-2">
            <EmptyState
              emoji="⏱️"
              title="هنوز جلسه‌ای ثبت نشده"
              description="اولین جلسه مطالعه خودت رو بساز."
              actionLabel="ثبت جلسهٔ مطالعه"
              onAction={() => setDialogOpen(true)}
            />
          </CardContent>
        </Card>
      ) : (
        <>
          {/* Timeline (desktop) */}
          <Card className="glass border-0 shadow-soft rounded-3xl mb-4 hidden md:block">
            <CardContent className="p-5">
              <div className="relative" style={{ height: `${19 * 44}px` }}>
                {hours.map((h) => (
                  <div key={h} className="absolute inset-x-0 flex items-start gap-3" style={{ top: `${((h * 60 - 360) / (18 * 60)) * 100}%` }}>
                    <span className="text-[10px] text-muted-foreground w-10 shrink-0 ltr-num" dir="ltr">{String(h).padStart(2, "0")}:00</span>
                    <div className="flex-1 border-t border-dashed border-border/70" />
                  </div>
                ))}
                {sessions.map((s, i) => {
                  const top = position(s.startTime) * 100
                  const bottom = position(s.endTime) * 100
                  const heightPct = bottom - top
                  return (
                    <motion.div
                      key={s.id}
                      initial={{ opacity: 0, x: 10 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: i * 0.04 }}
                      className="absolute inset-x-12 rounded-xl p-2.5 group"
                      style={{
                        top: `${top}%`,
                        height: `${Math.max(heightPct, 5)}%`,
                        minHeight: 48,
                        backgroundColor: (s.subject?.color ?? "#6366F1") + "1c",
                        borderInlineStart: `3px solid ${s.subject?.color ?? "#6366F1"}`,
                      }}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <p className="text-xs font-bold truncate">{s.subject?.name ?? "مطالعه"}{s.topic ? ` — ${s.topic.title}` : ""}</p>
                          <p className="text-[10px] text-muted-foreground ltr-num" dir="ltr">{s.startTime} - {s.endTime} · {toFa(s.durationMinutes)}د</p>
                          {s.notes && <p className="text-[10px] text-muted-foreground mt-0.5 truncate">{s.notes}</p>}
                        </div>
                        <div className="flex items-center gap-1 shrink-0">
                          {s.source === "POMODORO" && <span className="text-[9px] bg-primary/10 text-primary px-1.5 py-0.5 rounded-md">🍅</span>}
                          <button onClick={() => deleteSession.mutate(s.id)} className="opacity-0 group-hover:opacity-100 text-destructive p-0.5 transition-opacity" aria-label="حذف جلسه">
                            <Trash2 className="w-3 h-3" aria-hidden />
                          </button>
                        </div>
                      </div>
                    </motion.div>
                  )
                })}
              </div>
            </CardContent>
          </Card>

          {/* Mobile list */}
          <div className="md:hidden space-y-2.5">
            {sessions.map((s) => (
              <Card key={s.id} className="glass border-0 shadow-soft rounded-2xl">
                <CardContent className="p-4 flex items-center gap-3">
                  <span className="w-10 h-10 rounded-xl flex items-center justify-center text-lg shrink-0" style={{ backgroundColor: (s.subject?.color ?? "#6366F1") + "1c" }} aria-hidden>
                    {s.subject?.icon ?? "📚"}
                  </span>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-bold truncate">{s.subject?.name ?? "مطالعه"}</p>
                    <p className="text-xs text-muted-foreground ltr-num" dir="ltr">{s.startTime} - {s.endTime} · {toFa(s.durationMinutes)} دقیقه</p>
                  </div>
                  <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive" aria-label="حذف" onClick={() => deleteSession.mutate(s.id)}>
                    <Trash2 className="w-3.5 h-3.5" aria-hidden />
                  </Button>
                </CardContent>
              </Card>
            ))}
          </div>
        </>
      )}

      <SessionDialog open={dialogOpen} setOpen={setDialogOpen} date={date} subjects={subjectsData?.subjects ?? []} />
    </div>
  )
}

function SessionDialog({
  open,
  setOpen,
  date,
  subjects,
}: {
  open: boolean
  setOpen: (v: boolean) => void
  date: string
  subjects: SubjectLite[]
}) {
  const queryClient = useQueryClient()
  const { toast } = useToast()
  const [subjectId, setSubjectId] = useState("none")
  const [start, setStart] = useState("16:00")
  const [end, setEnd] = useState("17:30")
  const [notes, setNotes] = useState("")
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState("")

  const save = async () => {
    setError("")
    if (start >= end) return setError("ساعت پایان باید بعد از ساعت شروع باشد.")
    setSaving(true)
    try {
      await api("/api/sessions", {
        method: "POST",
        body: { subjectId: subjectId === "none" ? null : subjectId, date, startTime: start, endTime: end, notes: notes.trim() || null },
      })
      toast({ title: "جلسهٔ مطالعه ثبت شد ✓", description: "زمان مطالعهٔ امروز به‌روزرسانی شد." })
      void queryClient.invalidateQueries({ queryKey: ["sessions", date] })
      void queryClient.invalidateQueries({ queryKey: ["dashboard"] })
      setOpen(false)
    } catch (e) {
      setError(e instanceof Error ? e.message : "خطا در ذخیره")
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="max-w-md">
        <DialogHeader><DialogTitle>جلسهٔ مطالعهٔ جدید</DialogTitle></DialogHeader>
        <div className="space-y-4 py-1">
          <div className="space-y-1.5">
            <Label>درس</Label>
            <Select value={subjectId} onValueChange={setSubjectId}>
              <SelectTrigger className="h-10"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="none">عمومی</SelectItem>
                {subjects.map((s) => <SelectItem key={s.id} value={s.id}>{s.icon} {s.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="ss-start">شروع</Label>
              <Input id="ss-start" type="time" value={start} onChange={(e) => setStart(e.target.value)} className="h-10" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="ss-end">پایان</Label>
              <Input id="ss-end" type="time" value={end} onChange={(e) => setEnd(e.target.value)} className="h-10" />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="ss-notes">یادداشت</Label>
            <Textarea id="ss-notes" value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} placeholder="اختیاری" />
          </div>
          {error && <p className="text-sm text-destructive" role="alert">{error}</p>}
        </div>
        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={() => setOpen(false)}>انصراف</Button>
          <Button onClick={save} disabled={saving} className="gradient-primary text-white border-0 rounded-xl">
            {saving ? <Loader2 className="w-4 h-4 animate-spin" aria-hidden /> : (
              <><Sparkles className="w-4 h-4" aria-hidden /> ثبت</>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
