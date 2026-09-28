"use client"

import { useState } from "react"
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { Bell, Check, Trash2 } from "lucide-react"
import { api } from "@/lib/api"
import { navigate } from "@/lib/router"
import { Button } from "@/components/ui/button"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Skeleton } from "@/components/ui/skeleton"
import { cn } from "@/lib/utils"

type Notification = {
  id: string
  type: "TASK" | "EXAM" | "REVISION" | "STUDY" | "SYSTEM"
  title: string
  body: string | null
  link: string | null
  read: boolean
  createdAt: string
}

const TYPE_EMOJI: Record<Notification["type"], string> = {
  TASK: "📋",
  EXAM: "🧪",
  REVISION: "🔁",
  STUDY: "📚",
  SYSTEM: "💡",
}

export function NotificationsBell() {
  const [open, setOpen] = useState(false)
  const queryClient = useQueryClient()

  const { data, isLoading } = useQuery({
    queryKey: ["notifications"],
    queryFn: () => api<{ notifications: Notification[]; unread: number }>("/api/notifications"),
    staleTime: 60_000,
  })

  const markAll = useMutation({
    mutationFn: () => api("/api/notifications", { method: "PATCH" }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["notifications"] }),
  })

  const remove = useMutation({
    mutationFn: (id: string) => api(`/api/notifications?id=${id}`, { method: "DELETE" }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["notifications"] }),
  })

  const unread = data?.unread ?? 0
  const items = data?.notifications ?? []

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="icon" className="relative" aria-label={`اعلان‌ها${unread ? ` (${unread} خوانده‌نشده)` : ""}`}>
          <Bell className="w-5 h-5" aria-hidden />
          {unread > 0 && (
            <span className="absolute -top-0.5 -left-0.5 min-w-4 h-4 px-1 rounded-full bg-destructive text-white text-[10px] font-bold flex items-center justify-center ltr-num">
              {unread > 9 ? "۹+" : unread.toLocaleString("fa-IR")}
            </span>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-80 sm:w-96 p-0">
        <div className="flex items-center justify-between px-4 py-3 border-b">
          <span className="font-bold text-sm">اعلان‌ها</span>
          {unread > 0 && (
            <Button variant="ghost" size="sm" className="h-7 text-xs gap-1" onClick={() => markAll.mutate()}>
              <Check className="w-3.5 h-3.5" aria-hidden /> خواندن همه
            </Button>
          )}
        </div>

        {isLoading ? (
          <div className="p-4 space-y-3">
            <Skeleton className="h-12 w-full" />
            <Skeleton className="h-12 w-full" />
            <Skeleton className="h-12 w-full" />
          </div>
        ) : items.length === 0 ? (
          <div className="py-10 text-center text-sm text-muted-foreground">
            <div className="text-3xl mb-2">🔕</div>
            فعلاً اعلانی ندارید.
          </div>
        ) : (
          <ScrollArea className="h-96">
            <div className="divide-y">
              {items.map((n) => (
                <div
                  key={n.id}
                  className={cn(
                    "group flex items-start gap-3 px-4 py-3 hover:bg-accent/50 transition-colors cursor-pointer",
                    !n.read && "bg-primary/5"
                  )}
                  onClick={() => {
                    if (n.link) navigate(n.link.replace(/^#/, ""))
                    setOpen(false)
                  }}
                  role="button"
                  tabIndex={0}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && n.link) navigate(n.link.replace(/^#/, ""))
                  }}
                >
                  <span className="text-lg leading-none mt-0.5" aria-hidden>{TYPE_EMOJI[n.type]}</span>
                  <div className="flex-1 min-w-0">
                    <p className={cn("text-sm leading-5", !n.read && "font-semibold")}>{n.title}</p>
                    {n.body && <p className="text-xs text-muted-foreground mt-0.5">{n.body}</p>}
                  </div>
                  <button
                    className="opacity-0 group-hover:opacity-100 transition-opacity p-1 rounded hover:bg-destructive/10"
                    onClick={(e) => {
                      e.stopPropagation()
                      remove.mutate(n.id)
                    }}
                    aria-label="حذف اعلان"
                  >
                    <Trash2 className="w-3.5 h-3.5 text-destructive" aria-hidden />
                  </button>
                </div>
              ))}
            </div>
          </ScrollArea>
        )}
      </PopoverContent>
    </Popover>
  )
}
