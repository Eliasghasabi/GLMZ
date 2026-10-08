"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import { CommandDialog, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList, CommandSeparator } from "@/components/ui/command"
import { api } from "@/lib/api"
import { navigate } from "@/lib/router"
import { useQuery } from "@tanstack/react-query"
import { BookOpen, CalendarDays, ChartPie, Clock, FileText, GraduationCap, House, ListChecks, NotebookPen, Plus, Repeat2, Target, User, Settings, LogOut } from "lucide-react"
import { useAuth } from "@/lib/client/auth"
import { useToast } from "@/hooks/use-toast"

type SearchResult = { type: string; id: string; title: string; meta?: string; href: string }

const QUICK_ACTIONS = [
  { label: "ثبت جلسهٔ مطالعه", icon: CalendarDays, href: "/planner" },
  { label: "کار جدید", icon: Plus, href: "/tasks" },
  { label: "شروع تمرکز (پومودورو)", icon: Clock, href: "/pomodoro" },
  { label: "درس جدید", icon: BookOpen, href: "/subjects" },
  { label: "هدف جدید", icon: Target, href: "/goals" },
  { label: "یادداشت جدید", icon: NotebookPen, href: "/notes" },
]

const NAV_ITEMS = [
  { label: "خانه", icon: House, href: "/dashboard" },
  { label: "برنامهٔ هفتگی", icon: CalendarDays, href: "/planner" },
  { label: "کارها", icon: ListChecks, href: "/tasks" },
  { label: "درس‌ها", icon: BookOpen, href: "/subjects" },
  { label: "مرورها", icon: Repeat2, href: "/revisions" },
  { label: "امتحان‌ها", icon: GraduationCap, href: "/exams" },
  { label: "اهداف", icon: Target, href: "/goals" },
  { label: "یادداشت‌ها", icon: NotebookPen, href: "/notes" },
  { label: "آمار", icon: ChartPie, href: "/statistics" },
  { label: "تمرکز", icon: Clock, href: "/pomodoro" },
  { label: "پروفایل", icon: User, href: "/profile" },
  { label: "تنظیمات", icon: Settings, href: "/settings" },
]

export function useCommandPalette() {
  const [open, setOpen] = useState(false)
  return { open, setOpen }
}

const TYPE_LABELS: Record<string, string> = {
  subject: "درس",
  topic: "مبحث",
  task: "کار",
  note: "یادداشت",
  exam: "امتحان",
}

export function CommandPalette({ open, setOpen }: { open: boolean; setOpen: (v: boolean) => void }) {
  const [query, setQuery] = useState("")
  const { logout } = useAuth()
  const { toast } = useToast()
  const debounced = useDebounce(query, 250)

  const handleOpenChange = (next: boolean) => {
    setOpen(next)
    if (!next) setQuery("") // clear on close
  }

  const { data, isFetching } = useQuery({
    queryKey: ["search", debounced],
    queryFn: () => api<{ results: SearchResult[] }>(`/api/search?q=${encodeURIComponent(debounced)}`),
    enabled: open && debounced.trim().length >= 2,
  })

  const go = (href: string) => {
    handleOpenChange(false)
    navigate(href)
  }

  const results = data?.results ?? []

  return (
    <CommandDialog open={open} onOpenChange={handleOpenChange} className="max-w-xl">
      <CommandInput
        placeholder="جست‌وجو در درس‌ها، مباحث، کارها، یادداشت‌ها و امتحان‌ها…"
        value={query}
        onValueChange={setQuery}
      />
      <CommandList className="min-h-72">
        <CommandEmpty>
          {isFetching ? "در حال جست‌وجو…" : debounced.trim().length >= 2 ? "نتیجه‌ای یافت نشد." : "بنویسید تا جست‌وجو کنیم…"}
        </CommandEmpty>

        {results.length > 0 && (
          <CommandGroup heading="نتایج">
            {results.map((r) => (
              <CommandItem key={`${r.type}-${r.id}`} value={`${r.title} ${r.meta ?? ""}`} onSelect={() => go(r.href)}>
                <TypeIcon type={r.type} />
                <span className="flex-1 truncate">{r.title}</span>
                <span className="text-xs text-muted-foreground">{TYPE_LABELS[r.type] ?? ""}{r.meta ? ` · ${r.meta}` : ""}</span>
              </CommandItem>
            ))}
          </CommandGroup>
        )}
        {results.length > 0 && <CommandSeparator />}

        <CommandGroup heading="دسترسی سریع">
          {QUICK_ACTIONS.map((a) => (
            <CommandItem key={a.label} value={a.label} onSelect={() => go(a.href)}>
              <a.icon className="mr-2 h-4 w-4" aria-hidden />
              {a.label}
            </CommandItem>
          ))}
        </CommandGroup>

        <CommandSeparator />
        <CommandGroup heading="پیمایش">
          {NAV_ITEMS.map((n) => (
            <CommandItem key={n.href} value={n.label} onSelect={() => go(n.href)}>
              <n.icon className="mr-2 h-4 w-4" aria-hidden />
              {n.label}
            </CommandItem>
          ))}
        </CommandGroup>

        <CommandSeparator />
        <CommandGroup>
          <CommandItem
            value="خروج از حساب"
            onSelect={() => {
              setOpen(false)
              void logout()
              toast({ title: "از حساب خارج شدید" })
            }}
          >
            <LogOut className="mr-2 h-4 w-4 text-destructive" aria-hidden />
            <span className="text-destructive">خروج از حساب</span>
          </CommandItem>
        </CommandGroup>
      </CommandList>
    </CommandDialog>
  )
}

function TypeIcon({ type }: { type: string }) {
  const cls = "mr-2 h-4 w-4 text-muted-foreground"
  if (type === "subject") return <BookOpen className={cls} aria-hidden />
  if (type === "topic") return <FileText className={cls} aria-hidden />
  if (type === "task") return <ListChecks className={cls} aria-hidden />
  if (type === "note") return <NotebookPen className={cls} aria-hidden />
  if (type === "exam") return <GraduationCap className={cls} aria-hidden />
  return null
}

function useDebounce<T>(value: T, ms: number): T {
  const [debounced, setDebounced] = useState(value)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  useEffect(() => {
    if (timer.current) clearTimeout(timer.current)
    timer.current = setTimeout(() => setDebounced(value), ms)
    return () => {
      if (timer.current) clearTimeout(timer.current)
    }
  }, [value, ms])
  return useMemo(() => debounced, [debounced])
}
