"use client"

import { Moon, Sun } from "lucide-react"
import { useTheme } from "next-themes"
import { Button } from "@/components/ui/button"

export function ThemeToggle() {
  const { resolvedTheme, setTheme } = useTheme()

  const toggle = () => setTheme(resolvedTheme === "dark" ? "light" : "dark")

  return (
    <Button variant="ghost" size="icon" aria-label="تغییر حالت روشن و تیره" onClick={toggle}>
      {/* CSS-driven icons avoid hydration mismatch without a mounted flag */}
      <Moon className="w-5 h-5 dark:hidden" aria-hidden />
      <Sun className="w-5 h-5 hidden dark:block" aria-hidden />
    </Button>
  )
}
