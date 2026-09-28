import { isoToJalali, MONTH_NAMES, WEEKDAY_NAMES, persianDayIndexOfIso } from "./jalali"

const FA_DIGITS = "۰۱۲۳۴۵۶۷۸۹"

/** Convert latin digits to Persian digits. */
export function toFa(value: string | number): string {
  return String(value).replace(/\d/g, (d) => FA_DIGITS[Number(d)])
}

/** Format a duration in minutes as "۲ ساعت و ۳۵ دقیقه" / "۴۵ دقیقه". */
export function formatDuration(minutes: number): string {
  if (minutes <= 0) return "۰ دقیقه"
  const h = Math.floor(minutes / 60)
  const m = minutes % 60
  if (h === 0) return `${toFa(m)} دقیقه`
  if (m === 0) return `${toFa(h)} ساعت`
  return `${toFa(h)} ساعت و ${toFa(m)} دقیقه`
}

/** Compact clock form: 155 → "۲:۳۵" */
export function minutesToClock(minutes: number): string {
  const h = Math.floor(minutes / 60)
  const m = minutes % 60
  return `${toFa(h)}:${toFa(String(m).padStart(2, "0"))}`
}

/** "۲۵ آبان ۱۴۰۴" */
export function formatJalaliDate(iso: string | null | undefined, opts: { withWeekday?: boolean } = {}): string {
  if (!iso) return "—"
  const { jy, jm, jd } = isoToJalali(iso)
  const base = `${toFa(jd)} ${MONTH_NAMES[jm - 1]} ${toFa(jy)}`
  return opts.withWeekday ? `${WEEKDAY_NAMES[persianDayIndexOfIso(iso)]}، ${base}` : base
}

/** "۲۵ آبان" (no year) */
export function formatJalaliShort(iso: string): string {
  const { jm, jd } = isoToJalali(iso)
  return `${toFa(jd)} ${MONTH_NAMES[jm - 1]}`
}

/** Relative day label vs today: امروز / فردا / دیروز / ۱۲ روز دیگر / ۳ روز پیش */
export function relativeDayLabel(iso: string, today: string): string {
  const diff = daysBetween(today, iso)
  if (diff === 0) return "امروز"
  if (diff === 1) return "فردا"
  if (diff === -1) return "دیروز"
  if (diff > 1) return `${toFa(diff)} روز دیگر`
  return `${toFa(-diff)} روز پیش`
}

/** countdown for exams: "۱۲ روز مانده" */
export function daysRemainingLabel(iso: string, today: string): string {
  const diff = daysBetween(today, iso)
  if (diff === 0) return "امروز برگزار می‌شود"
  if (diff === 1) return "فردا برگزار می‌شود"
  if (diff < 0) return "برگزار شده"
  return `${toFa(diff)} روز مانده`
}

export function daysBetween(fromIso: string, toIso: string): number {
  const a = new Date(fromIso + "T00:00:00").getTime()
  const b = new Date(toIso + "T00:00:00").getTime()
  return Math.round((b - a) / 86_400_000)
}

export function addDaysIso(iso: string, days: number): string {
  const d = new Date(iso + "T00:00:00")
  d.setDate(d.getDate() + days)
  const p = (n: number) => String(n).padStart(2, "0")
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`
}

export function greetingForHour(hour: number): string {
  if (hour < 5) return "شب بخیر"
  if (hour < 12) return "صبح بخیر"
  if (hour < 17) return "ظهر بخیر"
  if (hour < 21) return "عصر بخیر"
  return "شب بخیر"
}

export const PRIORITY_LABELS: Record<string, string> = {
  LOW: "کم",
  MEDIUM: "متوسط",
  HIGH: "زیاد",
  URGENT: "فوری",
}

export const PRIORITY_STYLES: Record<string, string> = {
  LOW: "bg-slate-100 text-slate-600 dark:bg-slate-800/80 dark:text-slate-300",
  MEDIUM: "bg-sky-100 text-sky-700 dark:bg-sky-950/60 dark:text-sky-300",
  HIGH: "bg-amber-100 text-amber-700 dark:bg-amber-950/60 dark:text-amber-300",
  URGENT: "bg-rose-100 text-rose-700 dark:bg-rose-950/60 dark:text-rose-300",
}

export const STATUS_LABELS: Record<string, string> = {
  TODO: "در انتظار",
  IN_PROGRESS: "در حال انجام",
  COMPLETED: "انجام شد",
  NOT_STARTED: "شروع نشده",
  PLANNED: "برنامه‌ریزی‌شده",
  DONE: "انجام شد",
  SKIPPED: "رد شده",
  PENDING: "در انتظار",
  ACTIVE: "فعال",
  ARCHIVED: "بایگانی",
}

export const DIFFICULTY_LABELS: Record<string, string> = {
  EASY: "آسان",
  MEDIUM: "متوسط",
  HARD: "دشوار",
}
