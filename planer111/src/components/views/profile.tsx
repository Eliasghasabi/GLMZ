"use client"

import { useState } from "react"
import { useMutation } from "@tanstack/react-query"
import { Loader2, LockKeyhole, LogOut, Save, Trash2, UserRound } from "lucide-react"
import { api, ApiClientError } from "@/lib/api"
import { useAuth } from "@/lib/client/auth"
import { navigate } from "@/lib/router"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { PageHeader } from "@/components/shared/page-header"
import { useToast } from "@/hooks/use-toast"
import { cn } from "@/lib/utils"

const AVATAR_EMOJIS = ["🎓", "🦉", "🚀", "🌟", "🧠", "🐱", "🦊", "🌸", "📚", "⚡"]
const AVATAR_COLORS = ["#6366F1", "#8B5CF6", "#10B981", "#F59E0B", "#F43F5E", "#0EA5E9"]

export function Profile() {
  const { user, settings, updateUser, updateSettings, refresh, logout } = useAuth()
  const { toast } = useToast()
  const [name, setName] = useState(user?.name ?? "")
  const [emoji, setEmoji] = useState(user?.avatarEmoji ?? "🎓")
  const [color, setColor] = useState(user?.avatarColor ?? "#6366F1")
  const [dailyGoal, setDailyGoal] = useState(String(settings?.dailyGoalMinutes ?? 120))
  const [prefSession, setPrefSession] = useState(String(settings?.preferredSessionMinutes ?? 45))
  const [saving, setSaving] = useState(false)

  const [pwOpen, setPwOpen] = useState(false)
  const [currentPw, setCurrentPw] = useState("")
  const [newPw, setNewPw] = useState("")
  const [pwError, setPwError] = useState("")
  const [deleteOpen, setDeleteOpen] = useState(false)
  const [deleteConfirm, setDeleteConfirm] = useState("")

  const save = async () => {
    setSaving(true)
    try {
      await api("/api/auth/me", {
        method: "PATCH",
        body: {
          name: name.trim(),
          avatarEmoji: emoji,
          avatarColor: color,
          dailyGoalMinutes: parseInt(dailyGoal) || 120,
          preferredSessionMinutes: parseInt(prefSession) || 45,
        },
      })
      updateUser({ name: name.trim(), avatarEmoji: emoji, avatarColor: color })
      updateSettings({ dailyGoalMinutes: parseInt(dailyGoal) || 120, preferredSessionMinutes: parseInt(prefSession) || 45 })
      toast({ title: "پروفایل ذخیره شد ✓" })
      void refresh()
    } catch (e) {
      toast({ title: e instanceof ApiClientError ? e.message : "خطا در ذخیره", variant: "destructive" })
    } finally {
      setSaving(false)
    }
  }

  const changePassword = async () => {
    setPwError("")
    if (newPw.length < 8) return setPwError("رمز جدید باید حداقل ۸ کاراکتر باشد.")
    try {
      await api("/api/auth/password", { method: "PATCH", body: { currentPassword: currentPw, newPassword: newPw } })
      toast({ title: "رمز عبور تغییر کرد ✓" })
      setPwOpen(false)
      setCurrentPw("")
      setNewPw("")
    } catch (e) {
      setPwError(e instanceof ApiClientError ? e.message : "خطا در تغییر رمز")
    }
  }

  const deleteAccount = async () => {
    if (deleteConfirm !== "حذف") return
    try {
      await api("/api/auth/account", { method: "DELETE" })
      await logout()
      toast({ title: "حساب شما و همهٔ داده‌هایتان حذف شد." })
      navigate("/login")
    } catch (e) {
      toast({ title: e instanceof ApiClientError ? e.message : "خطا در حذف حساب", variant: "destructive" })
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

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <PageHeader title="پروفایل" subtitle="اطلاعات حساب و تنظیمات فردی." />

      {/* Avatar & identity */}
      <Card className="glass border-0 shadow-soft rounded-3xl">
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2"><UserRound className="w-4 h-4 text-primary" aria-hidden /> هویت</CardTitle>
        </CardHeader>
        <CardContent className="space-y-5">
          <div className="flex items-center gap-4">
            <span
              className="w-20 h-20 rounded-3xl flex items-center justify-center text-4xl border shadow-soft shrink-0"
              style={{ backgroundColor: color + "22", borderColor: color + "55" }}
              aria-hidden
            >
              {emoji}
            </span>
            <div className="min-w-0 flex-1">
              <Label htmlFor="p-name">نام</Label>
              <Input id="p-name" value={name} onChange={(e) => setName(e.target.value)} className="h-10 mt-1.5" />
              <p className="text-xs text-muted-foreground mt-2 ltr-num" dir="ltr">{user?.email}</p>
            </div>
          </div>

          <div className="space-y-1.5">
            <Label>آواتار</Label>
            <div className="flex flex-wrap gap-1.5">
              {AVATAR_EMOJIS.map((em) => (
                <button
                  key={em}
                  type="button"
                  onClick={() => setEmoji(em)}
                  aria-label={`آواتار ${em}`}
                  aria-pressed={emoji === em}
                  className={cn("w-9 h-9 rounded-xl text-lg flex items-center justify-center transition-all", emoji === em ? "gradient-primary shadow-lift scale-110" : "bg-muted hover:bg-accent")}
                >
                  {em}
                </button>
              ))}
            </div>
          </div>

          <div className="space-y-1.5">
            <Label>رنگ آواتار</Label>
            <div className="flex gap-2">
              {AVATAR_COLORS.map((c) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => setColor(c)}
                  aria-label={`رنگ ${c}`}
                  aria-pressed={color === c}
                  className={cn("w-8 h-8 rounded-full transition-all ring-offset-2 ring-offset-background", color === c ? "ring-2 ring-primary scale-110" : "hover:scale-105")}
                  style={{ backgroundColor: c }}
                />
              ))}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Study preferences */}
      <Card className="glass border-0 shadow-soft rounded-3xl">
        <CardHeader>
          <CardTitle className="text-base">ترجیحات مطالعه</CardTitle>
        </CardHeader>
        <CardContent className="grid sm:grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <Label htmlFor="p-goal">هدف مطالعهٔ روزانه (دقیقه)</Label>
            <Input id="p-goal" type="number" min={10} max={960} value={dailyGoal} onChange={(e) => setDailyGoal(e.target.value)} className="h-10 ltr-num text-left" />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="p-session">مدت جلسهٔ ترجیحی (دقیقه)</Label>
            <Input id="p-session" type="number" min={15} max={240} value={prefSession} onChange={(e) => setPrefSession(e.target.value)} className="h-10 ltr-num text-left" />
          </div>
        </CardContent>
      </Card>

      <Button onClick={save} disabled={saving} className="w-full h-11 gradient-primary text-white border-0 rounded-xl shadow-lift gap-2">
        {saving ? <Loader2 className="w-4 h-4 animate-spin" aria-hidden /> : <Save className="w-4 h-4" aria-hidden />} ذخیرهٔ تغییرات
      </Button>

      {/* Security & data */}
      <Card className="glass border-0 shadow-soft rounded-3xl">
        <CardHeader>
          <CardTitle className="text-base">امنیت و داده‌ها</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <Button variant="outline" className="w-full justify-start gap-2 rounded-xl" onClick={() => setPwOpen(true)}>
            <LockKeyhole className="w-4 h-4" aria-hidden /> تغییر رمز عبور
          </Button>
          <Button variant="outline" className="w-full justify-start gap-2 rounded-xl" onClick={exportData}>
            <Save className="w-4 h-4" aria-hidden /> دانلود خروجی داده‌ها (JSON)
          </Button>
          <Button variant="outline" className="w-full justify-start gap-2 rounded-xl" onClick={() => void logout()}>
            <LogOut className="w-4 h-4" aria-hidden /> خروج از حساب
          </Button>

          <div className="pt-3 border-t">
            <p className="text-xs text-muted-foreground mb-2 leading-5">
              منطقهٔ خطر — حذف حساب همهٔ داده‌های شما را برای همیشه پاک می‌کند و قابل بازگشت نیست.
            </p>
            <Button variant="destructive" className="gap-2 rounded-xl" onClick={() => setDeleteOpen(true)}>
              <Trash2 className="w-4 h-4" aria-hidden /> حذف کامل حساب و داده‌ها
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Change password dialog */}
      <Dialog open={pwOpen} onOpenChange={setPwOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>تغییر رمز عبور</DialogTitle></DialogHeader>
          <div className="space-y-4 py-1">
            <div className="space-y-1.5">
              <Label htmlFor="cur-pw">رمز فعلی</Label>
              <Input id="cur-pw" type="password" dir="ltr" className="text-left h-10" value={currentPw} onChange={(e) => setCurrentPw(e.target.value)} autoComplete="current-password" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="new-pw">رمز جدید (حداقل ۸ کاراکتر)</Label>
              <Input id="new-pw" type="password" dir="ltr" className="text-left h-10" value={newPw} onChange={(e) => setNewPw(e.target.value)} autoComplete="new-password" />
            </div>
            {pwError && <p className="text-sm text-destructive" role="alert">{pwError}</p>}
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setPwOpen(false)}>انصراف</Button>
            <Button onClick={changePassword} className="gradient-primary text-white border-0 rounded-xl">تغییر رمز</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete account dialog */}
      <Dialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle className="text-destructive">حذف کامل حساب</DialogTitle></DialogHeader>
          <p className="text-sm text-muted-foreground leading-6">
            این عمل همهٔ درس‌ها، کارها، آمار و داده‌های شما را برای همیشه حذف می‌کند. برای تأیید، کلمهٔ «حذف» را بنویس:
          </p>
          <Input value={deleteConfirm} onChange={(e) => setDeleteConfirm(e.target.value)} placeholder="حذف" className="h-10" aria-label="تأیید حذف" />
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setDeleteOpen(false)}>انصراف</Button>
            <Button variant="destructive" disabled={deleteConfirm !== "حذف"} onClick={deleteAccount}>
              حذف همیشگی
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
