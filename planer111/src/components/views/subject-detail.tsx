"use client"

import { useState } from "react"
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { motion } from "framer-motion"
import { ArrowRight, CheckCircle2, Circle, Clock3, Loader2, Pencil, Plus, Timer, Trash2 } from "lucide-react"
import { api } from "@/lib/api"
import { navigate } from "@/lib/router"
import { formatDuration, DIFFICULTY_LABELS, STATUS_LABELS, toFa } from "@/lib/format"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Badge } from "@/components/ui/badge"
import { EmptyState } from "@/components/shared/empty-state"
import { ListSkeleton } from "@/components/shared/skeletons"
import { ProgressRing } from "@/components/charts/charts"
import { cn } from "@/lib/utils"
import { useToast } from "@/hooks/use-toast"

type Topic = {
  id: string
  title: string
  description: string | null
  status: "NOT_STARTED" | "IN_PROGRESS" | "COMPLETED"
  difficulty: "EASY" | "MEDIUM" | "HARD"
  estimatedMinutes: number | null
  actualMinutes: number
  chapterLabel: string | null
  notes: string | null
}

type SubjectDetailData = {
  subject: {
    id: string
    name: string
    icon: string
    color: string
    description: string | null
    teacher: string | null
    totalChapters: number
    studyMinutes: number
    topicCount: number
    completedTopics: number
    progressPercent: number
  }
}

const STATUS_STYLES: Record<string, string> = {
  NOT_STARTED: "bg-muted text-muted-foreground",
  IN_PROGRESS: "bg-amber-500/10 text-amber-600 dark:text-amber-400",
  COMPLETED: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
}

export function SubjectDetail({ id }: { id: string }) {
  const queryClient = useQueryClient()
  const { toast } = useToast()
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editingTopic, setEditingTopic] = useState<Topic | null>(null)

  const { data, isLoading } = useQuery({
    queryKey: ["subject", id],
    queryFn: () => api<SubjectDetailData>(`/api/subjects/${id}`),
  })

  const updateTopic = useMutation({
    mutationFn: ({ topicId, patch }: { topicId: string; patch: Record<string, unknown> }) =>
      api(`/api/topics/${topicId}`, { method: "PATCH", body: patch }),
    onSuccess: (_d, vars) => {
      void queryClient.invalidateQueries({ queryKey: ["subject", id] })
      void queryClient.invalidateQueries({ queryKey: ["revisions"] })
      void queryClient.invalidateQueries({ queryKey: ["dashboard"] })
      if ((vars.patch as { status?: string }).status === "COMPLETED") {
        const created = (_d as { revisionsCreated?: number })?.revisionsCreated ?? 0
        toast({ title: "مبحث تکمیل شد! 🎉", description: created > 0 ? `${created.toLocaleString("fa-IR")} مرور فاصله‌دار ساخته شد.` : undefined })
      }
    },
  })

  const deleteTopic = useMutation({
    mutationFn: (topicId: string) => api(`/api/topics/${topicId}`, { method: "DELETE" }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["subject", id] })
      toast({ title: "مبحث حذف شد" })
    },
  })

  if (isLoading) return <ListSkeleton rows={6} />
  if (!data)
    return (
      <EmptyState
        emoji="🔍"
        title="درس پیدا نشد"
        description="ممکن است حذف شده باشد یا به شما تعلق نداشته باشد."
        actionLabel="بازگشت به درس‌ها"
        onAction={() => navigate("/subjects")}
      />
    )

  const s = data.subject
  const topics = (data.subject as unknown as { topics?: Topic[] }).topics ?? []
  const chapters = new Map<string, Topic[]>()
  for (const t of topics) {
    const key = t.chapterLabel || "بدون فصل"
    chapters.set(key, [...(chapters.get(key) ?? []), t])
  }

  return (
    <div>
      <Button variant="ghost" size="sm" className="mb-4 -ml-2 gap-1.5" onClick={() => navigate("/subjects")}>
        <ArrowRight className="w-4 h-4" aria-hidden /> بازگشت
      </Button>

      {/* Header */}
      <Card className="glass border-0 shadow-soft rounded-3xl mb-6 overflow-hidden">
        <CardContent className="p-6">
          <div className="flex flex-wrap items-center gap-5">
            <span className="w-16 h-16 rounded-3xl flex items-center justify-center text-3xl shrink-0" style={{ backgroundColor: s.color + "1c" }} aria-hidden>
              {s.icon}
            </span>
            <div className="flex-1 min-w-52">
              <h1 className="text-2xl font-extrabold">{s.name}</h1>
              <p className="text-sm text-muted-foreground mt-1">
                {s.teacher && <>{s.teacher} · </>}
                {formatDuration(s.studyMinutes)} مطالعه · {toFa(s.totalChapters)} فصل
              </p>
              {s.description && <p className="text-sm text-muted-foreground mt-2 leading-6">{s.description}</p>}
            </div>
            <div className="flex items-center gap-4">
              <ProgressRing percent={s.progressPercent} size={90} strokeWidth={9} gradient={false}>
                <span className="text-lg font-extrabold ltr-num">{toFa(s.progressPercent)}٪</span>
              </ProgressRing>
              <Button size="sm" onClick={() => { setEditingTopic(null); setDialogOpen(true) }} className="gradient-primary text-white border-0 rounded-xl gap-1.5">
                <Plus className="w-4 h-4" aria-hidden /> مبحث
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Topics grouped by chapter */}
      {topics.length === 0 ? (
        <Card className="glass border-0 shadow-soft rounded-3xl">
          <CardContent className="p-2">
            <EmptyState
              emoji="🗂️"
              title="هنوز مبحثی نداری"
              description="مباحث و فصل‌های این درس را اضافه کن تا پیشرفتت را ببینی و مرور خودکار فعال شود."
              actionLabel="افزودن اولین مبحث"
              onAction={() => { setEditingTopic(null); setDialogOpen(true) }}
            />
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-5">
          {Array.from(chapters.entries()).map(([chapter, items]) => (
            <div key={chapter}>
              <h3 className="text-sm font-bold text-muted-foreground mb-2.5 px-1">{chapter}</h3>
              <div className="space-y-2.5">
                {items.map((t, i) => (
                  <motion.div key={t.id} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.03 }}>
                    <Card className="glass border-0 shadow-soft rounded-2xl">
                      <CardContent className="p-4 flex items-center gap-3">
                        <button
                          onClick={() =>
                            updateTopic.mutate({
                              topicId: t.id,
                              patch: { status: t.status === "COMPLETED" ? "IN_PROGRESS" : "COMPLETED" },
                            })
                          }
                          aria-label={t.status === "COMPLETED" ? `لغو تکمیل ${t.title}` : `تکمیل ${t.title}`}
                          className={cn("shrink-0 transition-colors", t.status === "COMPLETED" ? "text-emerald-500" : "text-muted-foreground hover:text-primary")}
                        >
                          {t.status === "COMPLETED" ? <CheckCircle2 className="w-6 h-6" aria-hidden /> : <Circle className="w-6 h-6" aria-hidden />}
                        </button>

                        <div className="flex-1 min-w-0">
                          <p className={cn("font-semibold text-sm truncate", t.status === "COMPLETED" && "line-through text-muted-foreground")}>
                            {t.title}
                          </p>
                          <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                            <Badge variant="secondary" className={cn("text-[10px] px-2", STATUS_STYLES[t.status])}>
                              {STATUS_LABELS[t.status]}
                            </Badge>
                            <Badge variant="secondary" className="text-[10px] px-2">
                              {DIFFICULTY_LABELS[t.difficulty]}
                            </Badge>
                            {t.estimatedMinutes && (
                              <span className="text-[10px] text-muted-foreground flex items-center gap-1 ltr-num">
                                <Clock3 className="w-3 h-3" aria-hidden /> {toFa(t.estimatedMinutes)} دقیقه
                              </span>
                            )}
                            {t.actualMinutes > 0 && (
                              <span className="text-[10px] text-muted-foreground flex items-center gap-1 ltr-num">
                                <Timer className="w-3 h-3" aria-hidden /> ثبت‌شده: {toFa(t.actualMinutes)}
                              </span>
                            )}
                          </div>
                        </div>

                        <div className="flex items-center gap-1 shrink-0">
                          <Button variant="ghost" size="icon" className="h-8 w-8" aria-label="ویرایش مبحث" onClick={() => { setEditingTopic(t); setDialogOpen(true) }}>
                            <Pencil className="w-3.5 h-3.5" aria-hidden />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8 text-destructive hover:text-destructive"
                            aria-label="حذف مبحث"
                            onClick={() => deleteTopic.mutate(t.id)}
                          >
                            <Trash2 className="w-3.5 h-3.5" aria-hidden />
                          </Button>
                        </div>
                      </CardContent>
                    </Card>
                  </motion.div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      <TopicDialog
        open={dialogOpen}
        setOpen={setDialogOpen}
        subjectId={id}
        editing={editingTopic}
        onCompleted={(_topicId, revisionsCreated) => {
          toast({
            title: "مبحث تکمیل شد! 🎉",
            description: revisionsCreated > 0 ? `${revisionsCreated.toLocaleString("fa-IR")} مرور فاصله‌دار ساخته شد.` : undefined,
          })
        }}
      />
    </div>
  )
}

export function TopicDialog({
  open,
  setOpen,
  subjectId,
  editing,
  onCompleted,
}: {
  open: boolean
  setOpen: (v: boolean) => void
  subjectId: string
  editing: Topic | null
  onCompleted?: (topicId: string, revisionsCreated: number) => void
}) {
  const queryClient = useQueryClient()
  const { toast } = useToast()
  const [title, setTitle] = useState(editing?.title ?? "")
  const [chapterLabel, setChapterLabel] = useState(editing?.chapterLabel ?? "")
  const [status, setStatus] = useState<string>(editing?.status ?? "NOT_STARTED")
  const [difficulty, setDifficulty] = useState<string>(editing?.difficulty ?? "MEDIUM")
  const [estimatedMinutes, setEstimatedMinutes] = useState(editing?.estimatedMinutes ? String(editing.estimatedMinutes) : "")
  const [description, setDescription] = useState(editing?.description ?? "")
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState("")

  const key = editing?.id ?? "new"
  const [lastKey, setLastKey] = useState(key)
  if (lastKey !== key) {
    setLastKey(key)
    setTitle(editing?.title ?? "")
    setChapterLabel(editing?.chapterLabel ?? "")
    setStatus(editing?.status ?? "NOT_STARTED")
    setDifficulty(editing?.difficulty ?? "MEDIUM")
    setEstimatedMinutes(editing?.estimatedMinutes ? String(editing.estimatedMinutes) : "")
    setDescription(editing?.description ?? "")
  }

  const save = async () => {
    setError("")
    if (!title.trim()) return setError("عنوان مبحث را وارد کنید.")
    setSaving(true)
    try {
      if (editing) {
        const res = await api<{ topic: Topic; revisionsCreated: number }>(`/api/topics/${editing.id}`, {
          method: "PATCH",
          body: {
            title: title.trim(),
            chapterLabel: chapterLabel.trim() || null,
            status,
            difficulty,
            estimatedMinutes: parseInt(estimatedMinutes) || null,
            description: description.trim() || null,
          },
        })
        if (editing.status !== "COMPLETED" && status === "COMPLETED") {
          onCompleted?.(editing.id, res.revisionsCreated)
        } else {
          void toast({ title: "مبحث به‌روزرسانی شد" })
        }
      } else {
        const res = await api<{ topic: Topic; revisionsCreated: number }>("/api/topics", {
          method: "POST",
          body: {
            subjectId,
            title: title.trim(),
            chapterLabel: chapterLabel.trim() || null,
            status,
            difficulty,
            estimatedMinutes: parseInt(estimatedMinutes) || null,
            description: description.trim() || null,
          },
        })
        if (status === "COMPLETED") onCompleted?.(res.topic.id, res.revisionsCreated)
        else toast({ title: "مبحث اضافه شد ✓" })
      }
      void queryClient.invalidateQueries({ queryKey: ["subject", subjectId] })
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
        <DialogHeader>
          <DialogTitle>{editing ? "ویرایش مبحث" : "مبحث جدید"}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-1">
          <div className="space-y-1.5">
            <Label htmlFor="t-title">عنوان *</Label>
            <Input id="t-title" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="مثلاً مشتق و کاربردها" className="h-10" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="t-chapter">فصل / بخش</Label>
              <Input id="t-chapter" value={chapterLabel} onChange={(e) => setChapterLabel(e.target.value)} placeholder="مثلاً فصل ۲" className="h-10" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="t-est">زمان تخمینی (دقیقه)</Label>
              <Input id="t-est" type="number" min={5} value={estimatedMinutes} onChange={(e) => setEstimatedMinutes(e.target.value)} className="h-10 ltr-num text-left" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>وضعیت</Label>
              <Select value={status} onValueChange={setStatus}>
                <SelectTrigger className="h-10"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="NOT_STARTED">شروع نشده</SelectItem>
                  <SelectItem value="IN_PROGRESS">در حال انجام</SelectItem>
                  <SelectItem value="COMPLETED">تکمیل‌شده</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>سطح دشواری</Label>
              <Select value={difficulty} onValueChange={setDifficulty}>
                <SelectTrigger className="h-10"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="EASY">آسان</SelectItem>
                  <SelectItem value="MEDIUM">متوسط</SelectItem>
                  <SelectItem value="HARD">دشوار</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="t-desc">توضیحات</Label>
            <Textarea id="t-desc" value={description} onChange={(e) => setDescription(e.target.value)} rows={2} placeholder="اختیاری" />
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
