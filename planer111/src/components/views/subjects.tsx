"use client"

import { useState } from "react"
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { motion } from "framer-motion"
import { Archive, ArchiveRestore, BookOpen, Loader2, Pencil, Plus, Trash2 } from "lucide-react"
import { api } from "@/lib/api"
import { navigate } from "@/lib/router"
import { formatDuration, toFa } from "@/lib/format"
import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { EmptyState } from "@/components/shared/empty-state"
import { ListSkeleton } from "@/components/shared/skeletons"
import { PageHeader } from "@/components/shared/page-header"
import { useToast } from "@/hooks/use-toast"
import { cn } from "@/lib/utils"

export type SubjectCard = {
  id: string
  name: string
  icon: string
  color: string
  description: string | null
  teacher: string | null
  totalChapters: number
  archived: boolean
  topicCount: number
  completedTopics: number
  inProgressTopics: number
  progressPercent: number
  studyMinutes: number
}

export const SUBJECT_ICONS = ["📘", "💻", "🌐", "🇬🇧", "📐", "🎬", "🧪", "🧬", "📚", "🖋️", "🎼", "🌍", "⚖️", "🩺", "🧠", "📊"]
export const SUBJECT_COLORS = ["#6366F1", "#8B5CF6", "#10B981", "#F59E0B", "#F43F5E", "#0EA5E9", "#EC4899", "#14B8A6"]

export function Subjects() {
  const [tab, setTab] = useState<"active" | "archived">("active")
  const [dialogOpen, setDialogOpen] = useState(false)

  const { data, isLoading } = useQuery({
    queryKey: ["subjects", tab],
    queryFn: () => api<{ subjects: SubjectCard[] }>(`/api/subjects?archived=${tab === "archived"}`),
  })

  const subjects = data?.subjects ?? []

  return (
    <div>
      <PageHeader
        title="درس‌ها"
        subtitle="درس‌هایت را بساز، پیشرفتت را دنبال کن."
        actions={
          <Button onClick={() => setDialogOpen(true)} className="gradient-primary text-white border-0 rounded-xl shadow-lift gap-1.5">
            <Plus className="w-4 h-4" aria-hidden /> درس جدید
          </Button>
        }
      />

      <Tabs value={tab} onValueChange={(v) => setTab(v as "active" | "archived")} className="mb-5">
        <TabsList>
          <TabsTrigger value="active">فعال</TabsTrigger>
          <TabsTrigger value="archived">بایگانی</TabsTrigger>
        </TabsList>
      </Tabs>

      {isLoading ? (
        <ListSkeleton rows={4} />
      ) : subjects.length === 0 ? (
        <Card className="glass border-0 shadow-soft rounded-3xl">
          <CardContent className="p-2">
            <EmptyState
              emoji="📚"
              title={tab === "active" ? "هنوز درسی نساخته‌ای" : "بایگانی خالی است"}
              description="اولین درس خودت را بساز: نام، آیکون، رنگ و دبیر را انتخاب کن."
              actionLabel={tab === "active" ? "ساخت اولین درس" : undefined}
              onAction={tab === "active" ? () => setDialogOpen(true) : undefined}
            />
          </CardContent>
        </Card>
      ) : (
        <div className="grid sm:grid-cols-2 xl:grid-cols-3 gap-4">
          {subjects.map((s, i) => (
            <SubjectCardView key={s.id} subject={s} index={i} />
          ))}
        </div>
      )}

      <SubjectDialog open={dialogOpen} setOpen={setDialogOpen} />
    </div>
  )
}

function SubjectCardView({ subject, index }: { subject: SubjectCard; index: number }) {
  const queryClient = useQueryClient()
  const { toast } = useToast()
  const [editOpen, setEditOpen] = useState(false)
  const [deleteOpen, setDeleteOpen] = useState(false)

  const archive = useMutation({
    mutationFn: () => api(`/api/subjects/${subject.id}`, { method: "PATCH", body: { archived: !subject.archived } }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["subjects"] })
      toast({ title: subject.archived ? "از بایگانی خارج شد" : "بایگانی شد" })
    },
  })

  const remove = useMutation({
    mutationFn: () => api(`/api/subjects/${subject.id}`, { method: "DELETE" }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["subjects"] })
      toast({ title: "درس حذف شد" })
    },
  })

  return (
    <>
      <motion.div initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: index * 0.05 }}>
        <Card className="glass border-0 shadow-soft rounded-3xl group hover:shadow-lift hover:-translate-y-0.5 transition-all h-full">
          <CardContent className="p-5">
            <button onClick={() => navigate(`/subjects/${subject.id}`)} className="w-full text-right" aria-label={`مشاهدهٔ درس ${subject.name}`}>
              <div className="flex items-start justify-between mb-4">
                <div className="flex items-center gap-3 min-w-0">
                  <span
                    className="w-12 h-12 rounded-2xl flex items-center justify-center text-2xl shrink-0"
                    style={{ backgroundColor: subject.color + "1c" }}
                    aria-hidden
                  >
                    {subject.icon}
                  </span>
                  <div className="min-w-0 text-right">
                    <h3 className="font-bold truncate group-hover:text-primary transition-colors">{subject.name}</h3>
                    {subject.teacher && <p className="text-xs text-muted-foreground truncate mt-0.5">{subject.teacher}</p>}
                  </div>
                </div>
                <span className="text-xs font-bold px-2 py-1 rounded-lg bg-muted ltr-num shrink-0">{toFa(subject.progressPercent)}٪</span>
              </div>

              {subject.description && <p className="text-xs text-muted-foreground line-clamp-2 mb-4 text-right">{subject.description}</p>}

              <div className="h-2 rounded-full bg-muted overflow-hidden mb-1.5">
                <div
                  className="h-full rounded-full transition-all duration-700"
                  style={{ width: `${subject.progressPercent}%`, backgroundColor: subject.color }}
                />
              </div>
              <div className="flex items-center justify-between text-[11px] text-muted-foreground">
                <span className="ltr-num">
                  {toFa(subject.completedTopics)} از {toFa(subject.topicCount)} مبحث
                </span>
                <span className="ltr-num">{formatDuration(subject.studyMinutes)}</span>
              </div>
            </button>

            <div className="flex items-center gap-1 mt-4 pt-3 border-t opacity-60 group-hover:opacity-100 transition-opacity">
              <Button variant="ghost" size="sm" className="h-8 gap-1 text-xs" onClick={() => navigate(`/subjects/${subject.id}`)}>
                <BookOpen className="w-3.5 h-3.5" aria-hidden /> مباحث
              </Button>
              <div className="flex-1" />
              <Button variant="ghost" size="icon" className="h-8 w-8" aria-label="ویرایش" onClick={() => setEditOpen(true)}>
                <Pencil className="w-3.5 h-3.5" aria-hidden />
              </Button>
              <Button variant="ghost" size="icon" className="h-8 w-8" aria-label={subject.archived ? "خروج از بایگانی" : "بایگانی"} onClick={() => archive.mutate()}>
                {subject.archived ? <ArchiveRestore className="w-3.5 h-3.5" aria-hidden /> : <Archive className="w-3.5 h-3.5" aria-hidden />}
              </Button>
              <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive hover:text-destructive" aria-label="حذف" onClick={() => setDeleteOpen(true)}>
                <Trash2 className="w-3.5 h-3.5" aria-hidden />
              </Button>
            </div>
          </CardContent>
        </Card>
      </motion.div>

      <SubjectDialog open={editOpen} setOpen={setEditOpen} editing={subject} />
      <Dialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>حذف درس «{subject.name}»؟</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground leading-6">
            همهٔ مباحث، مرورها و آمار این درس حذف خواهد شد. این عمل قابل بازگشت نیست.
          </p>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setDeleteOpen(false)}>انصراف</Button>
            <Button variant="destructive" onClick={() => { remove.mutate(); setDeleteOpen(false) }} disabled={remove.isPending}>
              {remove.isPending ? <Loader2 className="w-4 h-4 animate-spin" aria-hidden /> : "حذف کن"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}

export function SubjectDialog({
  open,
  setOpen,
  editing,
}: {
  open: boolean
  setOpen: (v: boolean) => void
  editing?: SubjectCard
}) {
  const queryClient = useQueryClient()
  const { toast } = useToast()
  const [name, setName] = useState(editing?.name ?? "")
  const [icon, setIcon] = useState(editing?.icon ?? "📘")
  const [color, setColor] = useState(editing?.color ?? "#6366F1")
  const [description, setDescription] = useState(editing?.description ?? "")
  const [teacher, setTeacher] = useState(editing?.teacher ?? "")
  const [totalChapters, setTotalChapters] = useState(String(editing?.totalChapters ?? ""))
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState("")

  // reset when editing target changes
  const key = editing?.id ?? "new"
  const [lastKey, setLastKey] = useState(key)
  if (lastKey !== key) {
    setLastKey(key)
    setName(editing?.name ?? "")
    setIcon(editing?.icon ?? "📘")
    setColor(editing?.color ?? "#6366F1")
    setDescription(editing?.description ?? "")
    setTeacher(editing?.teacher ?? "")
    setTotalChapters(String(editing?.totalChapters ?? ""))
  }

  const save = async () => {
    setError("")
    if (name.trim().length < 1) return setError("نام درس را وارد کنید.")
    setSaving(true)
    try {
      const body = {
        name: name.trim(),
        icon,
        color,
        description: description.trim() || null,
        teacher: teacher.trim() || null,
        totalChapters: parseInt(totalChapters) || 0,
      }
      if (editing) {
        await api(`/api/subjects/${editing.id}`, { method: "PATCH", body })
        toast({ title: "درس به‌روزرسانی شد" })
      } else {
        await api("/api/subjects", { method: "POST", body })
        toast({ title: "درس ساخته شد ✓" })
      }
      void queryClient.invalidateQueries({ queryKey: ["subjects"] })
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
          <DialogTitle>{editing ? "ویرایش درس" : "درس جدید"}</DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-1">
          <div className="space-y-1.5">
            <Label htmlFor="s-name">نام درس *</Label>
            <Input id="s-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="مثلاً ریاضی" className="h-10" />
          </div>

          <div className="space-y-1.5">
            <Label>آیکون</Label>
            <div className="flex flex-wrap gap-1.5" role="radiogroup" aria-label="انتخاب آیکون">
              {SUBJECT_ICONS.map((ic) => (
                <button
                  key={ic}
                  type="button"
                  role="radio"
                  aria-checked={icon === ic}
                  onClick={() => setIcon(ic)}
                  className={cn(
                    "w-9 h-9 rounded-xl text-lg flex items-center justify-center transition-all",
                    icon === ic ? "gradient-primary shadow-lift scale-110" : "bg-muted hover:bg-accent"
                  )}
                >
                  {ic}
                </button>
              ))}
            </div>
          </div>

          <div className="space-y-1.5">
            <Label>رنگ</Label>
            <div className="flex gap-2" role="radiogroup" aria-label="انتخاب رنگ">
              {SUBJECT_COLORS.map((c) => (
                <button
                  key={c}
                  type="button"
                  role="radio"
                  aria-checked={color === c}
                  aria-label={`رنگ ${c}`}
                  onClick={() => setColor(c)}
                  className={cn(
                    "w-8 h-8 rounded-full transition-all ring-offset-2 ring-offset-background",
                    color === c ? "ring-2 ring-primary scale-110" : "hover:scale-105"
                  )}
                  style={{ backgroundColor: c }}
                />
              ))}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="s-teacher">دبیر / استاد</Label>
              <Input id="s-teacher" value={teacher} onChange={(e) => setTeacher(e.target.value)} placeholder="اختیاری" className="h-10" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="s-chapters">تعداد فصل‌ها</Label>
              <Input
                id="s-chapters"
                type="number"
                min={0}
                value={totalChapters}
                onChange={(e) => setTotalChapters(e.target.value)}
                placeholder="مثلاً ۱۲"
                className="h-10 ltr-num text-left"
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="s-desc">توضیحات</Label>
            <Textarea id="s-desc" value={description} onChange={(e) => setDescription(e.target.value)} placeholder="اختیاری — مثلاً منابع، نکات…" rows={2} />
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
