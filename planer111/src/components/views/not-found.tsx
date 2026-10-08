"use client"

import { motion } from "framer-motion"
import { Compass } from "lucide-react"
import { Button } from "@/components/ui/button"
import { navigate } from "@/lib/router"

export function NotFound() {
  return (
    <div className="flex flex-col items-center justify-center py-24 text-center">
      <motion.div initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} transition={{ duration: 0.4 }}>
        <span className="text-7xl font-extrabold text-gradient block mb-4 ltr-num">۴۰۴</span>
      </motion.div>
      <h1 className="text-xl font-bold mb-2">این صفحه پیدا نشد</h1>
      <p className="text-sm text-muted-foreground mb-6 max-w-sm leading-6">
        آدرسی که وارد کردی وجود ندارد یا جابه‌جا شده است. بیا برگردیم به مسیر مطالعه!
      </p>
      <Button onClick={() => navigate("/dashboard")} className="gradient-primary text-white border-0 rounded-xl shadow-lift gap-2">
        <Compass className="w-4 h-4" aria-hidden /> بازگشت به خانه
      </Button>
    </div>
  )
}
