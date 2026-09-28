"use client"

import { useMemo, useState } from "react"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { Button } from "@/components/ui/button"
import { CalendarDays, ChevronLeft, ChevronRight } from "lucide-react"
import { formatJalaliDate, toFa, addDaysIso, daysBetween } from "@/lib/format"
import { isoToJalali, jalaliToIso, jalaliMonthLength, MONTH_NAMES, WEEKDAY_SHORT, todayIso } from "@/lib/jalali"
import { cn } from "@/lib/utils"

/**
 * Jalali (Solar Hijri) date picker — grid of the selected month.
 * Value is stored/passed as gregorian ISO "YYYY-MM-DD" (DB format).
 */
export function JalaliDatePicker({
  value,
  onChange,
  placeholder = "انتخاب تاریخ",
  disabled,
}: {
  value: string | null | undefined
  onChange: (iso: string | null) => void
  placeholder?: string
  disabled?: boolean
}) {
  const [open, setOpen] = useState(false)
  const today = todayIso()
  const initial = value ?? today
  const [view, setView] = useState(() => {
    const { jy, jm } = isoToJalali(initial)
    return { jy, jm }
  })

  const grid = useMemo(() => {
    const len = jalaliMonthLength(view.jy, view.jm)
    const firstIso = jalaliToIso(view.jy, view.jm, 1)
    // weekday index of the 1st (0=شنبه)
    const { weekday } = weekdayOf(firstIso)
    return { len, offset: weekday, firstIso }
  }, [view])

  const moveMonth = (delta: number) => {
    setView((v) => {
      let jm = v.jm + delta
      let jy = v.jy
      if (jm > 12) {
        jm = 1
        jy += 1
      }
      if (jm < 1) {
        jm = 12
        jy -= 1
      }
      return { jy, jm }
    })
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          disabled={disabled}
          className={cn("w-full justify-start font-normal h-10", !value && "text-muted-foreground")}
        >
          <CalendarDays className="ml-2 w-4 h-4 text-primary" aria-hidden />
          {value ? formatJalaliDate(value, { withWeekday: false }) : placeholder}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-72 p-3">
        <div className="flex items-center justify-between mb-2">
          <Button type="button" variant="ghost" size="icon" className="h-7 w-7" onClick={() => moveMonth(-1)} aria-label="ماه قبل">
            <ChevronRight className="w-4 h-4" aria-hidden />
          </Button>
          <div className="text-sm font-bold">
            {MONTH_NAMES[view.jm - 1]} {toFa(view.jy)}
          </div>
          <Button type="button" variant="ghost" size="icon" className="h-7 w-7" onClick={() => moveMonth(1)} aria-label="ماه بعد">
            <ChevronLeft className="w-4 h-4" aria-hidden />
          </Button>
        </div>

        <div className="grid grid-cols-7 gap-1 mb-1" dir="rtl">
          {WEEKDAY_SHORT.map((d) => (
            <div key={d} className="text-[10px] text-muted-foreground text-center py-1">
              {d}
            </div>
          ))}
        </div>
        <div className="grid grid-cols-7 gap-1" dir="rtl">
          {Array.from({ length: grid.offset }).map((_, i) => (
            <div key={`pad-${i}`} />
          ))}
          {Array.from({ length: grid.len }).map((_, i) => {
            const day = i + 1
            const iso = jalaliToIso(view.jy, view.jm, day)
            const isToday = iso === today
            const isSelected = iso === value
            const isPast = daysBetween(today, iso) < 0
            return (
              <button
                key={day}
                type="button"
                onClick={() => {
                  onChange(iso)
                  setOpen(false)
                }}
                className={cn(
                  "h-8 rounded-lg text-xs transition-colors flex items-center justify-center",
                  isSelected && "gradient-primary text-white font-bold shadow-lift",
                  !isSelected && isToday && "bg-primary/10 text-primary font-bold",
                  !isSelected && !isToday && "hover:bg-accent",
                  isPast && !isSelected && "text-muted-foreground/60"
                )}
              >
                {toFa(day)}
              </button>
            )
          })}
        </div>

        <div className="flex items-center justify-between mt-3 pt-2 border-t">
          <Button type="button" variant="ghost" size="sm" className="h-7 text-xs" onClick={() => { onChange(today); setOpen(false) }}>
            امروز
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-7 text-xs text-muted-foreground"
            onClick={() => { onChange(null); setOpen(false) }}
          >
            پاک کردن
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  )
}

function weekdayOf(iso: string): { weekday: number } {
  const [y, m, d] = iso.split("-").map(Number)
  const js = new Date(y, m - 1, d).getDay()
  return { weekday: (js + 1) % 7 }
}

export { addDaysIso }
