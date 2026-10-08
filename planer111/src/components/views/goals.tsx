"use client"

import { useState } from "react"
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { motion } from "framer-motion"
import { CheckCircle2, Loader2, Minus, Pencil, Plus, Target, Trash2 } from "lucide-react"
import { api } from "@/lib/api"
import { formatJalaliDate, relativeDayLabel, toFa } from "@/lib/format"
import { todayIso } from "@/lib/jalali"
import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { EmptyState } from "@/components/shared/empty-state"
import { ListSkeleton } from "@/components/shared/skeletons"
import { JalaliDatePicker } from "@/components/shared/jalali-date-picker"
import { PageHeader } from "@/components/shared/page-header"
import { cn } from "@/lib/utils"
import { useToast } from "@/hooks/use-toast"

type Goal = {
  id: string
  title: string
  targetValue: number
  currentValue: number
  unit: string
  deadline: string | null
  status: "ACTIVE" | "COMPLETED" | "ARCHIVED"
}

export function Goals() {
  const queryClient = useQueryClient()
  const { toast } = useToast()
  const [statusFilter, setStatusFilter] = useState("ACTIVE")
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editing, setEditing] = useState<Goal | null>(null)
  const today = todayIso()

  const { data, isLoading } = useQuery({
    queryKey: ["goals", statusFilter],
    queryFn: () => api<{ goals: Goal[] }>(`/api/goals?status=${statusFilter}`),
  })

  const update = useMutation({
    mutationFn: ({ id, patch }: { id: string; patch: Record<string, unknown> }) => api(`/api/goals/${id}`, { method: "PATCH", body: patch }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["goals"] })
      void queryClient.invalidateQueries({ queryKey: ["dashboard"] })
    },
  })

  const remove = useMutation({
    mutationFn: (id: string) => api(`/api/goals/${id}`, { method: "DELETE" }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["goals"] })
      toast({ title: "هدف حذف شد" })
    },
  })

  const goals = data?.goals ?? []

  return (
    <div>
      <PageHeader
        title="اهداف"
        subtitle="اهداف هفتگی و ماهانه‌ات را دنبال کن."
        actions={
          <Button onClick={() => { setEditing(null); setDialogOpen(true) }} className="gradient-primary text-white border-0 rounded-xl shadow-lift gap-1.5">
            <Plus className="w-4 h-4" aria-hidden /> هدف جدید
          </Button>
        }
      />

      <div className="flex gap-2 mb-5">
        {[
          { value: "ACTIVE", label: "فعال" },
          { value: "COMPLETED", label: "تحقق‌یافته" },
          { value: "ARCHIVED", label: "بایگانی" },
        ].map((s) => (
          <button
            key={s.value}
            onClick={() => setStatusFilter(s.value)}
            className={cn(
              "px-4 py-1.5 rounded-xl text-sm transition-all",
              statusFilter === s.value ? "gradient-primary text-white shadow-lift" : "bg-muted text-muted-foreground hover:text-foreground"
            )}
          >
            {s.label}
          </button>
        ))}
      </div>

      {isLoading ? (
        <ListSkeleton rows={3} />
      ) : goals.length === 0 ? (
        <Card className="glass border-0 shadow-soft rounded-3xl">
          <CardContent className="p-2">
            <EmptyState
              emoji="🎯"
              title="هدفی در این بخش نیست"
              description="مثلاً «۲۰ ساعت مطالعه در این هفته» یا «اتمام فصل ۴» — هدف بگذار و پیش برو!"
              actionLabel="هدف جدید"
              onAction={() => setDialogOpen(true)}
            />
          </CardContent>
        </Card>
      ) : (
        <div className="grid md:grid-cols-2 gap-4">
          {goals.map((g, i) => {
            const pct = Math.min(100, Math.round((g.currentValue / Math.max(0.01, g.targetValue)) * 100))
            const done = g.status === "COMPLETED"
            return (
              <motion.div key={g.id} initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.05 }}>
                <Card className={cn("glass border-0 shadow-soft rounded-3xl group h-full", done && "opacity-80")}>
                  <CardContent className="p-5">
                    <div className="flex items-start justify-between gap-3 mb-4">
                      <div className="flex items-center gap-3 min-w-0">
                        <span className={cn("w-11 h-11 rounded-2xl flex items-center justify-center shrink-0", done ? "bg-emerald-500/10 text-emerald-500" : "bg-primary/10 text-primary")} aria-hidden>
                          {done ? <CheckCircle2 className="w-5 h-5" aria-hidden /> : <Target className="w-5 h-5" aria-hidden />}
                        </span>
                        <div className="min-w-0">
                          <h3 className="font-bold text-sm truncate">{g.title}</h3>
                          {g.deadline && (
                            <p className="text-[11px] text-muted-foreground mt-0.5">
                              مهلت: {formatJalaliDate(g.deadline)} · {relativeDayLabel(g.deadline, today)}
                            </p>
                          )}
                        </div>
                      </div>
                      <Badge variant="secondary" className="shrink-0 ltr-num">{toFa(pct)}٪</Badge>
                    </div>

                    <div className="h-2.5 rounded-full bg-muted overflow-hidden mb-2">
                      <div
                        className={cn("h-full rounded-full transition-all duration-700", done ? "bg-emerald-500" : "gradient-primary")}
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                    <p className="text-xs text-muted-foreground mb-4 ltr-num">
                      {toFa(g.currentValue.toLocaleString("fa-IR"))} از {toFa(g.targetValue.toLocaleString("fa-IR"))} {g.unit}
                    </p>

                    {!done && (
                      <div className="flex items-center gap-2 mb-4">
                        <Button variant="outline" size="sm" className="h-8 gap-1 rounded-lg" onClick={() => update.mutate({ id: g.id, patch: { increment: -1 } })} aria-label="کاهش پیشرفت">
                          <Minus className="w-3.5 h-3.5" aria-hidden /> یک واحد
                        </Button>
                        <Button variant="outline" size="sm" className="h-8 gap-1 rounded-lg" onClick={() => update.mutate({ id: g.id, patch: { increment: 1 } })} aria-label="افزایش پیشرفت">
                          <Plus className="w-3.5 h-3.5" aria-hidden /> یک واحد
                        </Button>
                        <Button size="sm" className="h-8 gap-1 rounded-lg gradient-primary text-white border-0" onClick={() => update.mutate({ id: g.id, patch: { currentValue: g.targetValue } })}>
                          تکمیل
                        </Button>
                      </div>
                    )}

                    <div className="flex items-center justify-end gap-1 opacity-60 group-hover:opacity-100 transition-opacity">
                      <Button variant="ghost" size="icon" className="h-8 w-8" aria-label="ویرایش" onClick={() => { setEditing(g); setDialogOpen(true) }}>
                        <Pencil className="w-3.5 h-3.5" aria-hidden />
                      </Button>
                      <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive hover:text-destructive" aria-label="حذف" onClick={() => remove.mutate(g.id)}>
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

      <GoalDialog open={dialogOpen} setOpen={setDialogOpen} editing={editing} />
    </div>
  )
}

function GoalDialog({ open, setOpen, editing }: { open: boolean; setOpen: (v: boolean) => void; editing: Goal | null }) {
  const queryClient = useQueryClient()
  const { toast } = useToast()
  const [title, setTitle] = useState("")
  const [target, setTarget] = useState("")
  const [unit, setUnit] = useState("ساعت")
  const [deadline, setDeadline] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState("")

  const key = editing?.id ?? "new"
  const [lastKey, setLastKey] = useState(key)
  if (lastKey !== key) {
    setLastKey(key)
    setTitle(editing?.title ?? "")
    setTarget(editing ? String(editing.targetValue) : "")
    setUnit(editing?.unit ?? "ساعت")
    setDeadline(editing?.deadline ?? null)
  }

  const save = async () => {
    setError("")
    if (!title.trim()) return setError("عنوان هدف را وارد کنید.")
    const targetValue = parseFloat(target)
    if (!Number.isFinite(targetValue) || targetValue <= 0) return setError("مقدار هدف باید عددی مثبت باشد.")
    setSaving(true)
    try {
      const body = { title: title.trim(), targetValue, unit: unit.trim() || "واحد", deadline }
      if (editing) {
        await api(`/api/goals/${editing.id}`, { method: "PATCH", body })
        toast({ title: "هدف به‌روزرسانی شد" })
      } else {
        await api("/api/goals", { method: "POST", body })
        toast({ title: "هدف ساخته شد 🎯" })
      }
      void queryClient.invalidateQueries({ queryKey: ["goals"] })
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
        <DialogHeader><DialogTitle>{editing ? "ویرایش هدف" : "هدف جدید"}</DialogTitle></DialogHeader>
        <div className="space-y-4 py-1">
          <div className="space-y-1.5">
            <Label htmlFor="g-title">عنوان *</Label>
            <Input id="g-title" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="مثلاً ۲۰ ساعت مطالعه در این هفته" className="h-10" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="g-target">مقدار هدف *</Label>
              <Input id="g-target" type="number" min={1} step="any" value={target} onChange={(e) => setTarget(e.target.value)} className="h-10 ltr-num text-left" />
            </div>
            <div className="space-y-1.5">
              <Label>واحد</Label>
              <Select value={unit} onValueChange={setUnit}>
                <SelectTrigger className="h-10"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="ساعت">ساعت</SelectItem>
                  <SelectItem value="فصل">فصل</SelectItem>
                  <SelectItem value="درس">درس</SelectItem>
                  <SelectItem value="مبحث">مبحث</SelectItem>
                  <SelectItem value="دقیقه">دقیقه</SelectItem>
                  <SelectItem value="برگه">برگه</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="space-y-1.5">
            <Label>مهلت</Label>
            <JalaliDatePicker value={deadline} onChange={setDeadline} placeholder="اختیاری" />
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
