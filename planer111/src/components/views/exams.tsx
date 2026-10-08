"use client"

import { useState } from "react"
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { motion } from "framer-motion"
import { CalendarClock, Loader2, MapPin, Pencil, Plus, Trash2 } from "lucide-react"
import { api } from "@/lib/api"
import { formatJalaliDate, relativeDayLabel, toFa } from "@/lib/format"
import { todayIso } from "@/lib/jalali"
import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Slider } from "@/components/ui/slider"
import { EmptyState } from "@/components/shared/empty-state"
import { ListSkeleton } from "@/components/shared/skeletons"
import { JalaliDatePicker } from "@/components/shared/jalali-date-picker"
import { PageHeader } from "@/components/shared/page-header"
import { cn } from "@/lib/utils"
import { useToast } from "@/hooks/use-toast"

type Exam = {
  id: string
  title: string
  subjectId: string | null
  subject: { id: string; name: string; color: string; icon: string } | null
  date: string
  time: string | null
  location: string | null
  topics: string[]
  notes: string | null
  progressPercent: number
  daysLeft: number
}

export function Exams() {
  const queryClient = useQueryClient()
  const { toast } = useToast()
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editing, setEditing] = useState<Exam | null>(null)
  const today = todayIso()

  const { data, isLoading } = useQuery({
    queryKey: ["exams"],
    queryFn: () => api<{ exams: Exam[] }>("/api/exams"),
  })

  const remove = useMutation({
    mutationFn: (id: string) => api(`/api/exams/${id}`, { method: "DELETE" }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["exams"] })
      toast({ title: "امتحان حذف شد" })
    },
  })

  const updateProgress = useMutation({
    mutationFn: ({ id, progressPercent }: { id: string; progressPercent: number }) =>
      api(`/api/exams/${id}`, { method: "PATCH", body: { progressPercent } }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["exams"] }),
  })

  const exams = data?.exams ?? []
  const upcoming = exams.filter((e) => e.daysLeft >= 0)
  const past = exams.filter((e) => e.daysLeft < 0)

  return (
    <div>
      <PageHeader
        title="امتحان‌ها"
        subtitle="شمارش معکوس امتحان‌ها و پیشرفت آمادگی."
        actions={
          <Button onClick={() => { setEditing(null); setDialogOpen(true) }} className="gradient-primary text-white border-0 rounded-xl shadow-lift gap-1.5">
            <Plus className="w-4 h-4" aria-hidden /> امتحان جدید
          </Button>
        }
      />

      {isLoading ? (
        <ListSkeleton rows={4} />
      ) : upcoming.length === 0 ? (
        <Card className="glass border-0 shadow-soft rounded-3xl">
          <CardContent className="p-2">
            <EmptyState
              emoji="🧪"
              title="امتحانی ثبت نشده"
              description="امتحان بعدی‌ات را اضافه کن تا روز شمارش معکوس و آمادگی‌ات را ببینی."
              actionLabel="ثبت اولین امتحان"
              onAction={() => setDialogOpen(true)}
            />
          </CardContent>
        </Card>
      ) : (
        <div className="grid md:grid-cols-2 gap-4">
          {upcoming.map((e, i) => {
            const urgent = e.daysLeft <= 3
            const soon = e.daysLeft <= 7
            return (
              <motion.div key={e.id} initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.05 }}>
                <Card className="glass border-0 shadow-soft rounded-3xl group h-full">
                  <CardContent className="p-5">
                    <div className="flex items-start justify-between gap-3 mb-4">
                      <div className="flex items-center gap-3 min-w-0">
                        <span className="w-12 h-12 rounded-2xl flex items-center justify-center text-2xl shrink-0" style={{ backgroundColor: (e.subject?.color ?? "#6366F1") + "1c" }} aria-hidden>
                          {e.subject?.icon ?? "🧪"}
                        </span>
                        <div className="min-w-0">
                          <h3 className="font-bold truncate">{e.title}</h3>
                          <p className="text-xs text-muted-foreground">{e.subject?.name ?? "عمومی"}</p>
                        </div>
                      </div>
                      <span className={cn(
                        "text-xs font-bold px-3 py-1.5 rounded-xl shrink-0 ltr-num",
                        urgent ? "bg-destructive/10 text-destructive" : soon ? "bg-amber-500/10 text-amber-600 dark:text-amber-400" : "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
                      )}>
                        {e.daysLeft === 0 ? "امروز!" : `${toFa(e.daysLeft)} روز مانده`}
                      </span>
                    </div>

                    <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground mb-4">
                      <span className="flex items-center gap-1"><CalendarClock className="w-3.5 h-3.5" aria-hidden /> {formatJalaliDate(e.date)}{e.time ? ` — ${toFa(e.time)}` : ""}</span>
                      {e.location && <span className="flex items-center gap-1"><MapPin className="w-3.5 h-3.5" aria-hidden /> {e.location}</span>}
                    </div>

                    {e.topics.length > 0 && (
                      <div className="flex flex-wrap gap-1.5 mb-4">
                        {e.topics.map((t) => (
                          <Badge key={t} variant="secondary" className="text-[10px]">{t}</Badge>
                        ))}
                      </div>
                    )}

                    <div className="mb-1.5 flex items-center justify-between text-xs">
                      <span className="text-muted-foreground">آمادگی</span>
                      <span className="font-bold ltr-num">{toFa(e.progressPercent)}٪</span>
                    </div>
                    <input
                      type="range"
                      min={0}
                      max={100}
                      step={5}
                      value={e.progressPercent}
                      onChange={(ev) => updateProgress.mutate({ id: e.id, progressPercent: parseInt(ev.target.value) })}
                      className="w-full accent-[#6366F1]"
                      aria-label={`آمادگی امتحان ${e.title}`}
                    />

                    <div className="flex items-center gap-1 mt-4 pt-3 border-t opacity-60 group-hover:opacity-100 transition-opacity">
                      {e.notes && <p className="text-[11px] text-muted-foreground flex-1 truncate">{e.notes}</p>}
                      <div className="flex-1" />
                      <Button variant="ghost" size="icon" className="h-8 w-8" aria-label="ویرایش" onClick={() => { setEditing(e); setDialogOpen(true) }}>
                        <Pencil className="w-3.5 h-3.5" aria-hidden />
                      </Button>
                      <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive hover:text-destructive" aria-label="حذف" onClick={() => remove.mutate(e.id)}>
                        <Trash2 className="w-3.5 h-3.5" aria-hidden />
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              </motion.div>
            )
          })}
        </div>
      )}

      {/* Past exams */}
      {past.length > 0 && (
        <div className="mt-8">
          <h3 className="text-sm font-bold text-muted-foreground mb-3">برگزارشده</h3>
          <div className="flex flex-wrap gap-2">
            {past.map((e) => (
              <Badge key={e.id} variant="secondary" className="text-xs gap-1.5 opacity-70">
                {e.title} — {relativeDayLabel(e.date, today)}
              </Badge>
            ))}
          </div>
        </div>
      )}

      <ExamDialog open={dialogOpen} setOpen={setDialogOpen} editing={editing} />
    </div>
  )
}

function ExamDialog({ open, setOpen, editing }: { open: boolean; setOpen: (v: boolean) => void; editing: Exam | null }) {
  const queryClient = useQueryClient()
  const { toast } = useToast()
  const [title, setTitle] = useState("")
  const [subjectId, setSubjectId] = useState("none")
  const [date, setDate] = useState<string | null>(null)
  const [time, setTime] = useState("")
  const [location, setLocation] = useState("")
  const [topicsInput, setTopicsInput] = useState("")
  const [notes, setNotes] = useState("")
  const [progress, setProgress] = useState(0)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState("")

  const key = editing?.id ?? "new"
  const [lastKey, setLastKey] = useState(key)
  if (lastKey !== key) {
    setLastKey(key)
    setTitle(editing?.title ?? "")
    setSubjectId(editing?.subjectId ?? "none")
    setDate(editing?.date ?? null)
    setTime(editing?.time ?? "")
    setLocation(editing?.location ?? "")
    setTopicsInput(editing?.topics.join("، ") ?? "")
    setNotes(editing?.notes ?? "")
    setProgress(editing?.progressPercent ?? 0)
  }

  const { data: subjectsData } = useQuery({
    queryKey: ["subjects-lite"],
    queryFn: () => api<{ subjects: { id: string; name: string }[] }>("/api/subjects"),
    enabled: open,
    staleTime: 5 * 60_000,
  })

  const save = async () => {
    setError("")
    if (!title.trim()) return setError("عنوان امتحان را وارد کنید.")
    if (!date) return setError("تاریخ امتحان را انتخاب کنید.")
    setSaving(true)
    const topics = topicsInput.split(/[،,]/).map((t) => t.trim()).filter(Boolean).slice(0, 20)
    const body = {
      title: title.trim(),
      subjectId: subjectId === "none" ? null : subjectId,
      date,
      time: time || null,
      location: location.trim() || null,
      topics,
      notes: notes.trim() || null,
      progressPercent: progress,
    }
    try {
      if (editing) {
        await api(`/api/exams/${editing.id}`, { method: "PATCH", body })
        toast({ title: "امتحان به‌روزرسانی شد" })
      } else {
        await api("/api/exams", { method: "POST", body })
        toast({ title: "امتحان ثبت شد ✓" })
      }
      void queryClient.invalidateQueries({ queryKey: ["exams"] })
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
      <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
        <DialogHeader><DialogTitle>{editing ? "ویرایش امتحان" : "امتحان جدید"}</DialogTitle></DialogHeader>
        <div className="space-y-4 py-1">
          <div className="space-y-1.5">
            <Label htmlFor="e-title">عنوان *</Label>
            <Input id="e-title" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="مثلاً امتحان میان‌ترم فیزیک" className="h-10" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>درس</Label>
              <Select value={subjectId} onValueChange={setSubjectId}>
                <SelectTrigger className="h-10"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">عمومی</SelectItem>
                  {(subjectsData?.subjects ?? []).map((s) => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>تاریخ *</Label>
              <JalaliDatePicker value={date} onChange={setDate} placeholder="تاریخ برگزاری" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="e-time">ساعت</Label>
              <Input id="e-time" type="time" value={time} onChange={(e) => setTime(e.target.value)} className="h-10" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="e-loc">محل</Label>
              <Input id="e-loc" value={location} onChange={(e) => setLocation(e.target.value)} placeholder="مثلاً سالن ۳" className="h-10" />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="e-topics">مباحث</Label>
            <Input id="e-topics" value={topicsInput} onChange={(e) => setTopicsInput(e.target.value)} placeholder="با ویرگول جدا کن: فصل ۱، فصل ۲" className="h-10" />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="e-notes">یادداشت</Label>
            <Textarea id="e-notes" value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} placeholder="اختیاری" />
          </div>
          <div className="space-y-1.5">
            <Label>پیشرفت آمادگی: {toFa(progress)}٪</Label>
            <Slider value={[progress]} onValueChange={(v) => setProgress(v[0])} max={100} step={5} />
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
