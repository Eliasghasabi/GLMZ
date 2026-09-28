"use client"

import { BookOpen } from "lucide-react"

export function SplashScreen() {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center gap-4" role="status" aria-label="در حال بارگذاری">
      <div className="w-16 h-16 rounded-2xl gradient-primary flex items-center justify-center shadow-lift animate-pulse">
        <BookOpen className="w-8 h-8 text-white" aria-hidden />
      </div>
      <div className="text-lg font-bold text-gradient">استادی‌فلو</div>
      <div className="text-sm text-muted-foreground">در حال آماده‌سازی…</div>
    </div>
  )
}
