"use client"

import { useMemo, useState } from "react"
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { motion } from "framer-motion"
import { Calendar, Filter, Loader2, Pencil, Plus, Tag, Trash2 } from "lucide-react"
import { api } from "@/lib/api"
import { PRIORITY_LABELS, PRIORITY_STYLES, toFa, relativeDayLabel } from "@/lib/format"
import { todayIso } from "@/lib/jalali"
import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Checkbox } from "@/components/ui/checkbox"
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { DropdownMenu, DropdownMenuContent, DropdownMenuRadioGroup, DropdownMenuRadioItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import { EmptyState } from "@/components/shared/empty-state"
import { ListSkeleton } from "@/components/shared/skeletons"
import { JalaliDatePicker } from "@/components/shared/jalali-date-picker"
import { PageHeader } from "@/components/shared/page-header"
import { cn } from "@/lib/utils"
import { useToast } from "@/hooks/use-toast"

type Task = {
  id: string
  title: string
  description: string | null
  subjectId: string | null
  subject: { id: string; name: string; color: string; icon: string } | null
  dueDate: string | null
  priority: "LOW" | "MEDIUM" | "HIGH" | "URGENT"
  estimatedMinutes: number | null
  status: "TODO" | "IN_PROGRESS" | "COMPLETED"
  tags: string[]
}

type SubjectLite = { id: string; name: string }

export function Tasks() {
  const queryClient = useQueryClient()
  const { toast } = useToast()
  const [statusFilter, setStatusFilter] = useState<string>("all")
  const [priorityFilter, setPriorityFilter] = useState<string>("all")
  const [subjectFilter, setSubjectFilter] = useState<string>("all")
  const [sort, setSort] = useState<string>("dueDate")
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editing, setEditing] = useState<Task | null>(null)
  const today = todayIso()

  const { data, isLoading } = useQuery({
    queryKey: ["tasks"],
    queryFn: () => api<{ tasks: Task[] }>("/api/tasks"),
  })

  const { data: subjectsData } = useQuery({
    queryKey: ["subjects-lite"],
    queryFn: () => api<{ subjects: SubjectLite[] }>("/api/subjects"),
    staleTime: 5 * 60_000,
  })

  const updateTask = useMutation({
    mutationFn: ({ id, patch }: { id: string; patch: Record<string, unknown> }) =>
      api(`/api/tasks/${id}`, { method: "PATCH", body: patch }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["tasks"] })
      void queryClient.invalidateQueries({ queryKey: ["dashboard"] })
    },
  })

  const deleteTask = useMutation({
    mutationFn: (id: string) => api(`/api/tasks/${id}`, { method: "DELETE" }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["tasks"] })
      toast({ title: "کار حذف شد" })
    },
  })

  const tasks = useMemo(() => {
    let list = data?.tasks ?? []
    if (statusFilter !== "all") list = list.filter((t) => t.status === statusFilter)
    if (priorityFilter !== "all") list = list.filter((t) => t.priority === priorityFilter)
    if (subjectFilter !== "all") list = list.filter((t) => t.subjectId === subjectFilter)
    const order = { URGENT: 0, HIGH: 1, MEDIUM: 2, LOW: 3 }
    const sorted = [...list]
    if (sort === "priority") sorted.sort((a, b) => order[a.priority] - order[b.priority])
    else if (sort === "dueDate") sorted.sort((a, b) => (a.dueDate ?? "9999").localeCompare(b.dueDate ?? "9999"))
    else sorted.sort((a, b) => (a.id < b.id ? 1 : -1))
    // incomplete first
    sorted.sort((a, b) => (a.status === "COMPLETED" ? 1 : 0) - (b.status === "COMPLETED" ? 1 : 0))
    return sorted
  }, [data, statusFilter, priorityFilter, subjectFilter, sort])

  const activeFilters = [statusFilter, priorityFilter, subjectFilter].filter((f) => f !== "all").length

  return (
    <div>
      <PageHeader
        title="کارها"
        subtitle="همهٔ کارهایت را در یک نگاه مدیریت کن."
        actions={
          <Button onClick={() => { setEditing(null); setDialogOpen(true) }} className="gradient-primary text-white border-0 rounded-xl shadow-lift gap-1.5">
            <Plus className="w-4 h-4" aria-hidden /> کار جدید
          </Button>
        }
      />

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-2 mb-5">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" size="sm" className="rounded-xl gap-1.5 h-9">
              <Filter className="w-3.5 h-3.5" aria-hidden />
              فیلترها
              {activeFilters > 0 && <span className="w-4 h-4 rounded-full gradient-primary text-white text-[10px] flex items-center justify-center ltr-num">{toFa(activeFilters)}</span>}
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent className="w-44">
            <DropdownMenuRadioGroup value={statusFilter} onValueChange={setStatusFilter}>
              <DropdownMenuRadioItem value="all">همهٔ وضعیت‌ها</DropdownMenuRadioItem>
              <DropdownMenuRadioItem value="TODO">در انتظار</DropdownMenuRadioItem>
              <DropdownMenuRadioItem value="IN_PROGRESS">در حال انجام</DropdownMenuRadioItem>
              <DropdownMenuRadioItem value="COMPLETED">انجام‌شده</DropdownMenuRadioItem>
            </DropdownMenuRadioGroup>
            <DropdownMenuRadioGroup value={priorityFilter} onValueChange={setPriorityFilter}>
              <DropdownMenuRadioItem value="all">همهٔ اولویت‌ها</DropdownMenuRadioItem>
              <DropdownMenuRadioItem value="URGENT">فوری</DropdownMenuRadioItem>
              <DropdownMenuRadioItem value="HIGH">زیاد</DropdownMenuRadioItem>
              <DropdownMenuRadioItem value="MEDIUM">متوسط</DropdownMenuRadioItem>
              <DropdownMenuRadioItem value="LOW">کم</DropdownMenuRadioItem>
            </DropdownMenuRadioGroup>
            <DropdownMenuRadioGroup value={subjectFilter} onValueChange={setSubjectFilter}>
              <DropdownMenuRadioItem value="all">همهٔ درس‌ها</DropdownMenuRadioItem>
              {(subjectsData?.subjects ?? []).map((s) => (
                <DropdownMenuRadioItem key={s.id} value={s.id}>{s.name}</DropdownMenuRadioItem>
              ))}
            </DropdownMenuRadioGroup>
          </DropdownMenuContent>
        </DropdownMenu>

        <Select value={sort} onValueChange={setSort}>
          <SelectTrigger className="w-36 h-9 rounded-xl text-xs" aria-label="ترتیب">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="dueDate">تاریخ انجام</SelectItem>
            <SelectItem value="priority">اولویت</SelectItem>
            <SelectItem value="createdAt">جدیدترین</SelectItem>
          </SelectContent>
        </Select>

        <div className="flex-1" />
        <p className="text-xs text-muted-foreground ltr-num">{toFa(tasks.length)} کار</p>
      </div>

      {isLoading ? (
        <ListSkeleton rows={5} />
      ) : tasks.length === 0 ? (
        <Card className="glass border-0 shadow-soft rounded-3xl">
          <CardContent className="p-2">
            <EmptyState
              emoji="📝"
              title="کاری یافت نشد"
              description={activeFilters > 0 ? "با این فیلترها کاری پیدا نشد. فیلترها را عوض کن." : "اولین کار خودت را بساز و آن را مدیریت کن."}
              actionLabel={activeFilters > 0 ? undefined : "کار جدید"}
              onAction={activeFilters > 0 ? undefined : () => setDialogOpen(true)}
            />
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2.5">
          {tasks.map((t, i) => {
            const overdue = t.dueDate && t.dueDate < today && t.status !== "COMPLETED"
            return (
              <motion.div key={t.id} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: Math.min(i * 0.03, 0.3) }}>
                <Card className={cn("glass border-0 shadow-soft rounded-2xl group", t.status === "COMPLETED" && "opacity-60")}>
                  <CardContent className="p-4 flex items-start gap-3">
                    <Checkbox
                      checked={t.status === "COMPLETED"}
                      onCheckedChange={(checked) =>
                        updateTask.mutate({ id: t.id, patch: { status: checked ? "COMPLETED" : "TODO" } })
                      }
                      className="mt-0.5 w-5 h-5 rounded-lg"
                      aria-label={t.status === "COMPLETED" ? `لغو انجام ${t.title}` : `انجام ${t.title}`}
                    />
                    <div className="flex-1 min-w-0">
                      <p className={cn("font-semibold text-sm", t.status === "COMPLETED" && "line-through")}>{t.title}</p>
                      {t.description && <p className="text-xs text-muted-foreground mt-1 line-clamp-2 leading-5">{t.description}</p>}
                      <div className="flex flex-wrap items-center gap-1.5 mt-2">
                        {t.subject && (
                          <span className="inline-flex items-center gap-1 text-[11px] text-muted-foreground">
                            <span className="w-2 h-2 rounded-full" style={{ backgroundColor: t.subject.color }} aria-hidden />
                            {t.subject.name}
                          </span>
                        )}
                        <Badge className={cn("text-[10px] border-0", PRIORITY_STYLES[t.priority])}>{PRIORITY_LABELS[t.priority]}</Badge>
                        {t.dueDate && (
                          <span className={cn("inline-flex items-center gap-1 text-[11px]", overdue ? "text-destructive font-bold" : "text-muted-foreground")}>
                            <Calendar className="w-3 h-3" aria-hidden />
                            {overdue ? `عقب‌افتاده — ${relativeDayLabel(t.dueDate, today)}` : relativeDayLabel(t.dueDate, today)}
                          </span>
                        )}
                        {t.tags.map((tag) => (
                          <span key={tag} className="inline-flex items-center gap-0.5 text-[10px] bg-muted rounded-md px-1.5 py-0.5 text-muted-foreground">
                            <Tag className="w-2.5 h-2.5" aria-hidden />{tag}
                          </span>
                        ))}
                      </div>
                    </div>
                    <div className="flex items-center gap-1 shrink-0 opacity-60 group-hover:opacity-100 transition-opacity">
                      <Select value={t.status} onValueChange={(v) => updateTask.mutate({ id: t.id, patch: { status: v } })}>
                        <SelectTrigger className="h-7 w-24 text-[10px] rounded-lg" aria-label="تغییر وضعیت">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="TODO">در انتظار</SelectItem>
                          <SelectItem value="IN_PROGRESS">در حال انجام</SelectItem>
                          <SelectItem value="COMPLETED">انجام‌شده</SelectItem>
                        </SelectContent>
                      </Select>
                      <Button variant="ghost" size="icon" className="h-8 w-8" aria-label="ویرایش" onClick={() => { setEditing(t); setDialogOpen(true) }}>
                        <Pencil className="w-3.5 h-3.5" aria-hidden />
                      </Button>
                      <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive hover:text-destructive" aria-label="حذف" onClick={() => deleteTask.mutate(t.id)}>
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

      <TaskDialog open={dialogOpen} setOpen={setDialogOpen} editing={editing} />
    </div>
  )
}

function TaskDialog({ open, setOpen, editing }: { open: boolean; setOpen: (v: boolean) => void; editing: Task | null }) {
  const queryClient = useQueryClient()
  const { toast } = useToast()
  const [title, setTitle] = useState("")
  const [description, setDescription] = useState("")
  const [subjectId, setSubjectId] = useState<string>("none")
  const [dueDate, setDueDate] = useState<string | null>(null)
  const [priority, setPriority] = useState("MEDIUM")
  const [status, setStatus] = useState("TODO")
  const [estimatedMinutes, setEstimatedMinutes] = useState("")
  const [tagsInput, setTagsInput] = useState("")
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState("")

  const key = editing?.id ?? "new"
  const [lastKey, setLastKey] = useState(key)
  if (lastKey !== key) {
    setLastKey(key)
    setTitle(editing?.title ?? "")
    setDescription(editing?.description ?? "")
    setSubjectId(editing?.subjectId ?? "none")
    setDueDate(editing?.dueDate ?? null)
    setPriority(editing?.priority ?? "MEDIUM")
    setStatus(editing?.status ?? "TODO")
    setEstimatedMinutes(editing?.estimatedMinutes ? String(editing.estimatedMinutes) : "")
    setTagsInput(editing?.tags.join("، ") ?? "")
  }

  const { data: subjectsData } = useQuery({
    queryKey: ["subjects-lite"],
    queryFn: () => api<{ subjects: SubjectLite[] }>("/api/subjects"),
    enabled: open,
    staleTime: 5 * 60_000,
  })

  const save = async () => {
    setError("")
    if (!title.trim()) return setError("عنوان کار را وارد کنید.")
    setSaving(true)
    const tags = tagsInput.split(/[،,]/).map((t) => t.trim()).filter(Boolean).slice(0, 8)
    const body = {
      title: title.trim(),
      description: description.trim() || null,
      subjectId: subjectId === "none" ? null : subjectId,
      dueDate,
      priority,
      status,
      estimatedMinutes: parseInt(estimatedMinutes) || null,
      tags,
    }
    try {
      if (editing) {
        await api(`/api/tasks/${editing.id}`, { method: "PATCH", body })
        toast({ title: "کار به‌روزرسانی شد" })
      } else {
        await api("/api/tasks", { method: "POST", body })
        toast({ title: "کار اضافه شد ✓" })
      }
      void queryClient.invalidateQueries({ queryKey: ["tasks"] })
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
        <DialogHeader>
          <DialogTitle>{editing ? "ویرایش کار" : "کار جدید"}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-1">
          <div className="space-y-1.5">
            <Label htmlFor="task-title">عنوان *</Label>
            <Input id="task-title" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="مثلاً حل تمرین فصل ۲" className="h-10" />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="task-desc">توضیحات</Label>
            <Textarea id="task-desc" value={description} onChange={(e) => setDescription(e.target.value)} rows={2} placeholder="اختیاری" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>درس</Label>
              <Select value={subjectId} onValueChange={setSubjectId}>
                <SelectTrigger className="h-10"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">بدون درس</SelectItem>
                  {(subjectsData?.subjects ?? []).map((s) => (
                    <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>تاریخ انجام</Label>
              <JalaliDatePicker value={dueDate} onChange={setDueDate} />
            </div>
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div className="space-y-1.5">
              <Label>اولویت</Label>
              <Select value={priority} onValueChange={setPriority}>
                <SelectTrigger className="h-10"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="LOW">کم</SelectItem>
                  <SelectItem value="MEDIUM">متوسط</SelectItem>
                  <SelectItem value="HIGH">زیاد</SelectItem>
                  <SelectItem value="URGENT">فوری</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>وضعیت</Label>
              <Select value={status} onValueChange={setStatus}>
                <SelectTrigger className="h-10"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="TODO">در انتظار</SelectItem>
                  <SelectItem value="IN_PROGRESS">در حال انجام</SelectItem>
                  <SelectItem value="COMPLETED">انجام‌شده</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="task-est">زمان (دقیقه)</Label>
              <Input id="task-est" type="number" min={5} value={estimatedMinutes} onChange={(e) => setEstimatedMinutes(e.target.value)} className="h-10 ltr-num text-left" />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="task-tags">برچسب‌ها</Label>
            <Input id="task-tags" value={tagsInput} onChange={(e) => setTagsInput(e.target.value)} placeholder="با ویرگول جدا کن: تمرین، پروژه" className="h-10" />
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
