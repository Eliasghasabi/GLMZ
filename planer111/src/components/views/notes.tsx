"use client"

import { useEffect, useRef, useState } from "react"
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { motion } from "framer-motion"
import { Loader2, Pin, PinOff, Plus, Search, Tag, Trash2 } from "lucide-react"
import { api } from "@/lib/api"
import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { EmptyState } from "@/components/shared/empty-state"
import { ListSkeleton } from "@/components/shared/skeletons"
import { PageHeader } from "@/components/shared/page-header"
import { cn } from "@/lib/utils"
import { useToast } from "@/hooks/use-toast"
import { useDebouncedValue } from "@/lib/client/use-debounced-value"

type Note = {
  id: string
  title: string
  content: string
  subjectId: string | null
  subject: { id: string; name: string; color: string; icon: string } | null
  tags: string[]
  pinned: boolean
  createdAt: string
  updatedAt: string
}

export function Notes() {
  const queryClient = useQueryClient()
  const { toast } = useToast()
  const [search, setSearch] = useState("")
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const debounced = useDebouncedValue(search, 300)

  const { data, isLoading } = useQuery({
    queryKey: ["notes", debounced],
    queryFn: () => api<{ notes: Note[] }>(`/api/notes?q=${encodeURIComponent(debounced)}`),
  })

  const notes = data?.notes ?? []

  const create = useMutation({
    mutationFn: () => api<{ note: Note }>("/api/notes", { method: "POST", body: { title: "یادداشت بدون عنوان", content: "" } }),
    onSuccess: (res) => {
      void queryClient.invalidateQueries({ queryKey: ["notes"] })
      setSelectedId(res.note.id)
    },
  })

  const remove = useMutation({
    mutationFn: (id: string) => api(`/api/notes/${id}`, { method: "DELETE" }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["notes"] })
      setSelectedId(null)
      toast({ title: "یادداشت حذف شد" })
    },
  })

  const selected = notes.find((n) => n.id === selectedId) ?? null

  return (
    <div>
      <PageHeader
        title="یادداشت‌ها"
        subtitle="نکات درسی‌ات را سریع یادداشت کن."
        actions={
          <Button onClick={() => create.mutate()} disabled={create.isPending} className="gradient-primary text-white border-0 rounded-xl shadow-lift gap-1.5">
            {create.isPending ? <Loader2 className="w-4 h-4 animate-spin" aria-hidden /> : <Plus className="w-4 h-4" aria-hidden />} یادداشت جدید
          </Button>
        }
      />

      <div className="relative mb-5 max-w-md">
        <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" aria-hidden />
        <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="جست‌وجو در یادداشت‌ها…" className="pr-9 h-10 rounded-xl" aria-label="جست‌وجوی یادداشت‌ها" />
      </div>

      {isLoading ? (
        <ListSkeleton rows={4} />
      ) : notes.length === 0 ? (
        <Card className="glass border-0 shadow-soft rounded-3xl">
          <CardContent className="p-2">
            <EmptyState
              emoji="🗒️"
              title={search ? "یادداشتی یافت نشد" : "هنوز یادداشتی نداری"}
              description={search ? "عبارت دیگری را امتحان کن." : "نکته‌ها، فرمول‌ها و ایده‌هایت را اینجا ذخیره کن."}
              actionLabel={search ? undefined : "ساخت اولین یادداشت"}
              onAction={search ? undefined : () => create.mutate()}
            />
          </CardContent>
        </Card>
      ) : (
        <div className="grid lg:grid-cols-5 gap-4">
          {/* list */}
          <div className={cn("space-y-2.5 lg:col-span-2 max-h-[70vh] overflow-y-auto pl-1")}>
            {notes.map((n, i) => (
              <motion.button
                key={n.id}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: Math.min(i * 0.03, 0.25) }}
                onClick={() => setSelectedId(n.id)}
                className={cn(
                  "w-full text-right p-4 rounded-2xl glass shadow-soft transition-all hover:shadow-lift",
                  selectedId === n.id && "ring-2 ring-primary/60"
                )}
                aria-label={`یادداشت ${n.title}`}
              >
                <div className="flex items-center gap-2 mb-1">
                  {n.pinned && <Pin className="w-3.5 h-3.5 text-primary shrink-0" aria-hidden />}
                  <p className="font-bold text-sm truncate flex-1">{n.title}</p>
                </div>
                <p className="text-xs text-muted-foreground line-clamp-2 leading-5 mb-2">{n.content || "خالی…"}</p>
                <div className="flex items-center gap-1.5 flex-wrap">
                  {n.subject && (
                    <span className="inline-flex items-center gap-1 text-[10px] text-muted-foreground">
                      <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: n.subject.color }} aria-hidden />
                      {n.subject.name}
                    </span>
                  )}
                  {n.tags.slice(0, 2).map((t) => (
                    <span key={t} className="text-[10px] bg-muted rounded px-1.5 py-0.5 text-muted-foreground">{t}</span>
                  ))}
                </div>
              </motion.button>
            ))}
          </div>

          {/* editor */}
          <div className="lg:col-span-3">
            {selected ? (
              <NoteEditor key={selected.id} note={selected} onDelete={() => remove.mutate(selected.id)} />
            ) : (
              <Card className="glass border-0 shadow-soft rounded-3xl h-full min-h-64">
                <CardContent className="h-full flex items-center justify-center p-2">
                  <p className="text-sm text-muted-foreground">یک یادداشت را انتخاب کن تا ویرایش شود.</p>
                </CardContent>
              </Card>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

function NoteEditor({ note, onDelete }: { note: Note; onDelete: () => void }) {
  const queryClient = useQueryClient()
  const { toast } = useToast()
  const [title, setTitle] = useState(note.title)
  const [content, setContent] = useState(note.content)
  const [subjectId, setSubjectId] = useState(note.subjectId ?? "none")
  const [tagsInput, setTagsInput] = useState(note.tags.join("، "))
  const [saving, setSaving] = useState(false)
  const [dirty, setDirty] = useState(false)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const { data: subjectsData } = useQuery({
    queryKey: ["subjects-lite"],
    queryFn: () => api<{ subjects: { id: string; name: string }[] }>("/api/subjects"),
    staleTime: 5 * 60_000,
  })

  const save = async (showToast: boolean) => {
    setSaving(true)
    try {
      const tags = tagsInput.split(/[،,]/).map((t) => t.trim()).filter(Boolean).slice(0, 8)
      await api(`/api/notes/${note.id}`, {
        method: "PATCH",
        body: { title: title.trim() || "یادداشت بدون عنوان", content, subjectId: subjectId === "none" ? null : subjectId, tags },
      })
      await queryClient.invalidateQueries({ queryKey: ["notes"] })
      setDirty(false)
      if (showToast) toast({ title: "ذخیره شد ✓" })
    } catch {
      if (showToast) toast({ title: "خطا در ذخیره", variant: "destructive" })
    } finally {
      setSaving(false)
    }
  }

  // debounced autosave
  useEffect(() => {
    if (!dirty) return
    if (timer.current) clearTimeout(timer.current)
    timer.current = setTimeout(() => void save(false), 1200)
    return () => {
      if (timer.current) clearTimeout(timer.current)
    }
  }, [title, content, subjectId, tagsInput, dirty])

  const togglePin = async () => {
    await api(`/api/notes/${note.id}`, { method: "PATCH", body: { pinned: !note.pinned } })
    void queryClient.invalidateQueries({ queryKey: ["notes"] })
  }

  return (
    <Card className="glass border-0 shadow-soft rounded-3xl">
      <CardContent className="p-5 space-y-4">
        <div className="flex items-center gap-2">
          <Input
            value={title}
            onChange={(e) => { setTitle(e.target.value); setDirty(true) }}
            className="h-11 text-base font-bold border-0 bg-transparent px-0 focus-visible:ring-0 shadow-none"
            placeholder="عنوان یادداشت"
            aria-label="عنوان یادداشت"
          />
          <Button variant="ghost" size="icon" className="h-8 w-8 shrink-0" onClick={togglePin} aria-label={note.pinned ? "برداشتن سنجاق" : "سنجاق کردن"}>
            {note.pinned ? <PinOff className="w-4 h-4" aria-hidden /> : <Pin className="w-4 h-4 text-muted-foreground" aria-hidden />}
          </Button>
          <Button variant="ghost" size="icon" className="h-8 w-8 shrink-0 text-destructive hover:text-destructive" onClick={onDelete} aria-label="حذف یادداشت">
            <Trash2 className="w-4 h-4" aria-hidden />
          </Button>
          <Button size="sm" className="shrink-0 h-8 rounded-lg gradient-primary text-white border-0" onClick={() => void save(true)} disabled={saving}>
            {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" aria-hidden /> : dirty ? "ذخیره*" : "ذخیره‌شده ✓"}
          </Button>
        </div>

        <Textarea
          value={content}
          onChange={(e) => { setContent(e.target.value); setDirty(true) }}
          placeholder="نوشته‌ات را اینجا بنویس… (به‌صورت خودکار ذخیره می‌شود)"
          className="min-h-72 border-0 bg-transparent px-0 focus-visible:ring-0 shadow-none text-sm leading-7 resize-y"
          aria-label="متن یادداشت"
        />

        <div className="grid sm:grid-cols-2 gap-3 pt-3 border-t">
          <div className="space-y-1.5">
            <Label className="text-xs">درس</Label>
            <Select value={subjectId} onValueChange={(v) => { setSubjectId(v); setDirty(true) }}>
              <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="none">بدون درس</SelectItem>
                {(subjectsData?.subjects ?? []).map((s) => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs flex items-center gap-1"><Tag className="w-3 h-3" aria-hidden /> برچسب‌ها</Label>
            <Input value={tagsInput} onChange={(e) => { setTagsInput(e.target.value); setDirty(true) }} className="h-9" placeholder="با ویرگول جدا کن" />
          </div>
        </div>
      </CardContent>
    </Card>
  )
}
