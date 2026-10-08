"use client"

import { useEffect, useState } from "react"
import { useMutation } from "@tanstack/react-query"
import { Bell, Download, Loader2, Monitor, Moon, RefreshCw, Repeat2, Sun, Timer, Trash2, Globe } from "lucide-react"
import { useTheme } from "next-themes"
import { api, ApiClientError } from "@/lib/api"
import { useAuth, type Settings } from "@/lib/client/auth"
import { usePomodoro } from "@/lib/client/pomodoro-store"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { PageHeader } from "@/components/shared/page-header"
import { toFa } from "@/lib/format"
import { useToast } from "@/hooks/use-toast"
import { cn } from "@/lib/utils"

export function SettingsView() {
  const { settings, updateSettings } = useAuth()
  const { theme, setTheme } = useTheme()
  const { toast } = useToast()
  const pomodoro = usePomodoro()

  const [focus, setFocus] = useState(String(settings?.pomodoroFocus ?? 25))
  const [breakMin, setBreakMin] = useState(String(settings?.pomodoroBreak ?? 5))
  const [longBreak, setLongBreak] = useState(String(settings?.pomodoroLongBreak ?? 15))
  const [untilLong, setUntilLong] = useState(String(settings?.pomodorosUntilLongBreak ?? 4))
  const [intervals, setIntervals] = useState((settings?.revisionIntervals ?? [1, 3, 7, 14, 30]).join(", "))
  const [saving, setSaving] = useState(false)
  const [seedOpen, setSeedOpen] = useState(false)

  const seed = useMutation({
    mutationFn: (load: boolean) => (load ? api("/api/seed", { method: "POST" }) : api("/api/seed", { method: "DELETE" })),
    onSuccess: (_d, load) => {
      toast({ title: load ? "دادهٔ نمونه بارگذاری شد ✓" : "دادهٔ نمونه حذف شد ✓" })
      setSeedOpen(false)
      setTimeout(() => window.location.reload(), 600)
    },
    onError: () => toast({ title: "خطا در عملیات دادهٔ نمونه", variant: "destructive" }),
  })


  // keep theme in sync with DB setting
  useEffect(() => {
    if (settings?.theme && settings.theme !== theme) setTheme(settings.theme)
  }, [settings?.theme])

  if (!settings) return null

  const saveAll = async () => {
    setSaving(true)
    try {
      const parsedIntervals = intervals
        .split(/[،,]/)
        .map((s) => parseInt(s.trim()))
        .filter((n) => Number.isFinite(n) && n >= 1)
        .slice(0, 8)
      if (parsedIntervals.length === 0) throw new ApiClientError(400, "حداقل یک فاصلهٔ مرور معتبر وارد کن.")

      const body = {
        pomodoroFocus: parseInt(focus) || 25,
        pomodoroBreak: parseInt(breakMin) || 5,
        pomodoroLongBreak: parseInt(longBreak) || 15,
        pomodorosUntilLongBreak: parseInt(untilLong) || 4,
        revisionIntervals: parsedIntervals,
      }
      const res = await api<{ settings: Settings }>("/api/settings", { method: "PATCH", body })
      updateSettings(res.settings)
      pomodoro.configure({
        focusMin: res.settings.pomodoroFocus,
        breakMin: res.settings.pomodoroBreak,
        longBreakMin: res.settings.pomodoroLongBreak,
        untilLongBreak: res.settings.pomodorosUntilLongBreak,
      })
      toast({ title: "تنظیمات ذخیره شد ✓" })
    } catch (e) {
      toast({ title: e instanceof ApiClientError ? e.message : "خطا در ذخیره", variant: "destructive" })
    } finally {
      setSaving(false)
    }
  }

  const patch = async (partial: Partial<Settings>) => {
    updateSettings(partial)
    try {
      const res = await api<{ settings: Settings }>("/api/settings", { method: "PATCH", body: partial })
      updateSettings(res.settings)
    } catch {
      toast({ title: "خطا در ذخیرهٔ تنظیمات", variant: "destructive" })
    }
  }

  const exportData = async () => {
    try {
      const data = await api<Record<string, unknown>>("/api/export")
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" })
      const url = URL.createObjectURL(blob)
      const a = document.createElement("a")
      a.href = url
      a.download = `studyflow-export-${new Date().toISOString().slice(0, 10)}.json`
      a.click()
      URL.revokeObjectURL(url)
      toast({ title: "خروجی داده‌ها دانلود شد ✓" })
    } catch {
      toast({ title: "خطا در دریافت داده‌ها", variant: "destructive" })
    }
  }

  const requestNotificationPermission = async () => {
    if (!("Notification" in window)) {
      toast({ title: "مرورگر شما از اعلان پشتیبانی نمی‌کند." })
      return
    }
    const perm = await Notification.requestPermission()
    if (perm === "granted") {
      toast({ title: "اجازهٔ اعلان داده شد ✓" })
      new Notification("استادی‌فلو", { body: "اعلان‌ها فعال شد! موفق باشی 🎯" })
    } else {
      toast({ title: "اجازهٔ اعلان داده نشد." })
    }
  }

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <PageHeader title="تنظیمات" subtitle="ظاهر، زبان، اعلان‌ها و تنظیمات مطالعه." />

      {/* Appearance */}
      <Card className="glass border-0 shadow-soft rounded-3xl">
        <CardHeader><CardTitle className="text-base">ظاهر</CardTitle></CardHeader>
        <CardContent>
          <Label className="text-xs text-muted-foreground mb-2 block">حالت نمایش</Label>
          <div className="grid grid-cols-3 gap-2 max-w-sm" role="radiogroup" aria-label="حالت نمایش">
            {[
              { value: "light", label: "روشن", icon: <Sun className="w-4 h-4" aria-hidden /> },
              { value: "dark", label: "تیره", icon: <Moon className="w-4 h-4" aria-hidden /> },
              { value: "system", label: "سیستم", icon: <Monitor className="w-4 h-4" aria-hidden /> },
            ].map((opt) => (
              <button
                key={opt.value}
                onClick={() => { setTheme(opt.value); void patch({ theme: opt.value as Settings["theme"] }) }}
                role="radio"
                aria-checked={theme === opt.value}
                className={cn(
                  "flex flex-col items-center gap-1.5 py-3 rounded-2xl text-sm transition-all",
                  theme === opt.value ? "gradient-primary text-white shadow-lift" : "bg-muted hover:bg-accent"
                )}
              >
                {opt.icon}
                {opt.label}
              </button>
            ))}
          </div>

          <div className="mt-5">
            <Label htmlFor="lang" className="text-xs text-muted-foreground mb-2 flex items-center gap-1"><Globe className="w-3.5 h-3.5" aria-hidden /> زبان</Label>
            <Select
              value={settings.language}
              onValueChange={(v) => {
                void patch({ language: v as Settings["language"] })
                document.documentElement.lang = v
                document.documentElement.dir = v === "fa" ? "rtl" : "ltr"
              }}
            >
              <SelectTrigger id="lang" className="h-10 max-w-48"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="fa">فارسی (RTL)</SelectItem>
                <SelectItem value="en" disabled>English (به‌زودی — معماری آماده است)</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {/* Notifications */}
      <Card className="glass border-0 shadow-soft rounded-3xl">
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2"><Bell className="w-4 h-4 text-primary" aria-hidden /> اعلان‌ها</CardTitle>
        </CardHeader>
        <CardContent className="space-y-1">
          {[
            { key: "notifyTasks" as const, label: "یادآوری کارها" },
            { key: "notifyExams" as const, label: "یادآوری امتحان‌ها" },
            { key: "notifyRevisions" as const, label: "یادآوری مرورها" },
            { key: "notifyStudy" as const, label: "یادآوری زمان مطالعه" },
          ].map((n) => (
            <div key={n.key} className="flex items-center justify-between py-2.5">
              <span className="text-sm">{n.label}</span>
              <Switch
                checked={settings[n.key]}
                onCheckedChange={(v) => void patch({ [n.key]: v } as Partial<Settings>)}
                aria-label={n.label}
              />
            </div>
          ))}
          <Button variant="outline" size="sm" className="mt-3 gap-2 rounded-xl" onClick={requestNotificationPermission}>
            <Bell className="w-3.5 h-3.5" aria-hidden /> فعال‌سازی اعلان مرورگر
          </Button>
        </CardContent>
      </Card>

      {/* Study */}
      <Card className="glass border-0 shadow-soft rounded-3xl">
        <CardHeader><CardTitle className="text-base flex items-center gap-2"><Timer className="w-4 h-4 text-primary" aria-hidden /> مطالعه و پومودورو</CardTitle></CardHeader>
        <CardContent className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <div className="space-y-1.5">
            <Label htmlFor="st-focus" className="text-xs">تمرکز (دقیقه)</Label>
            <Input id="st-focus" type="number" min={5} max={120} value={focus} onChange={(e) => setFocus(e.target.value)} className="h-10 ltr-num text-left" />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="st-break" className="text-xs">استراحت کوتاه</Label>
            <Input id="st-break" type="number" min={1} max={60} value={breakMin} onChange={(e) => setBreakMin(e.target.value)} className="h-10 ltr-num text-left" />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="st-long" className="text-xs">استراحت بلند</Label>
            <Input id="st-long" type="number" min={5} max={90} value={longBreak} onChange={(e) => setLongBreak(e.target.value)} className="h-10 ltr-num text-left" />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="st-until" className="text-xs">پومودورو تا استراحت بلند</Label>
            <Input id="st-until" type="number" min={2} max={10} value={untilLong} onChange={(e) => setUntilLong(e.target.value)} className="h-10 ltr-num text-left" />
          </div>
          <div className="col-span-2 sm:col-span-4 space-y-1.5">
            <Label htmlFor="st-intervals" className="text-xs flex items-center gap-1">
              <Repeat2 className="w-3.5 h-3.5" aria-hidden /> فاصله‌های مرور فاصله‌دار (روز — با ویرگول)
            </Label>
            <Input id="st-intervals" value={intervals} onChange={(e) => setIntervals(e.target.value)} className="h-10 ltr-num text-left" placeholder="1, 3, 7, 14, 30" />
            <p className="text-[11px] text-muted-foreground">تغییر این مقادیر، تاریخ مرورهای آیندهٔ مباحث تکمیل‌شده را نیز به‌روزرسانی می‌کند.</p>
          </div>
        </CardContent>
      </Card>

      <Button onClick={saveAll} disabled={saving} className="w-full h-11 gradient-primary text-white border-0 rounded-xl shadow-lift gap-2">
        {saving ? <Loader2 className="w-4 h-4 animate-spin" aria-hidden /> : null} ذخیرهٔ تنظیمات
      </Button>

      {/* Data */}
      <Card className="glass border-0 shadow-soft rounded-3xl">
        <CardHeader><CardTitle className="text-base flex items-center gap-2"><Download className="w-4 h-4 text-primary" aria-hidden /> داده‌ها</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" size="sm" className="gap-2 rounded-xl" onClick={exportData}>
              <Download className="w-3.5 h-3.5" aria-hidden /> خروجی JSON
            </Button>
            <Button variant="outline" size="sm" className="gap-2 rounded-xl" onClick={() => setSeedOpen(true)}>
              <RefreshCw className="w-3.5 h-3.5" aria-hidden /> دادهٔ نمونه (دمو)
            </Button>
          </div>
          <p className="text-[11px] text-muted-foreground leading-5">
            دادهٔ نمونه شامل ۵ درس نمونه (برنامه‌سازی، شبکه، انگلیسی، ریاضی، تولید محتوا) با کارها، امتحان‌ها، مرورها و آمار ۳۰ روزه است — و هر زمان می‌توانی فقط دادهٔ نمونه را حذف کنی.
          </p>
        </CardContent>
      </Card>

      {/* Seed confirm dialog */}
      <Dialog open={seedOpen} onOpenChange={setSeedOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>دادهٔ نمونه</DialogTitle></DialogHeader>
          <p className="text-sm text-muted-foreground leading-6">
            اگر دادهٔ نمونه نداری، بارگذاری کن؛ اگر داری، حذفش کن (فقط رکوردهای نمونه پاک می‌شوند، داده‌های خودت دست‌نخورده می‌ماند).
          </p>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setSeedOpen(false)}>انصراف</Button>
            <Button variant="destructive" onClick={() => seed.mutate(false)} disabled={seed.isPending} className="gap-1.5">
              <Trash2 className="w-4 h-4" aria-hidden /> حذف دادهٔ نمونه
            </Button>
            <Button onClick={() => seed.mutate(true)} disabled={seed.isPending} className="gradient-primary text-white border-0 rounded-xl gap-1.5">
              <RefreshCw className="w-4 h-4" aria-hidden /> بارگذاری
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <p className="text-center text-[11px] text-muted-foreground ltr-num">
        استادی‌فلو نسخهٔ ۱٫۰ — ساخته‌شده با Next.js و آمادهٔ استقرار روی Cloudflare
      </p>
      <p className="text-center text-[10px] text-muted-foreground">{toFa(2025)} ©</p>
    </div>
  )
}
