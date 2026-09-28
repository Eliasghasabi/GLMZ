import { db } from '@/lib/db'
import { addDays, diffDays, persianDayIndex } from './api'

export type StreakInfo = {
  current: number
  longest: number
  totalDays: number
}

/** A study day = any day with at least one logged study session (manual or pomodoro). */
export async function computeStreaks(userId: string, today: string): Promise<StreakInfo> {
  const sessions = await db.studySession.findMany({
    where: { userId, completed: true },
    select: { date: true },
    distinct: ['date'],
  })
  const days = Array.from(new Set(sessions.map((s) => s.date))).sort()

  if (days.length === 0) return { current: 0, longest: 0, totalDays: 0 }

  // current streak: consecutive days ending today (or yesterday, so the streak survives until midnight)
  let current = 0
  const todayIdx = days.includes(today) ? days.length - 1 : -1
  if (todayIdx >= 0 || days[days.length - 1] === addDays(today, -1)) {
    let cursor = days.includes(today) ? today : addDays(today, -1)
    for (let i = days.length - 1; i >= 0; i--) {
      if (days[i] === cursor) {
        current++
        cursor = addDays(cursor, -1)
      } else if (days[i] < cursor) {
        break
      }
    }
  }

  // longest streak
  let longest = 1
  let run = 1
  for (let i = 1; i < days.length; i++) {
    if (diffDays(days[i - 1], days[i]) === 1) {
      run++
      longest = Math.max(longest, run)
    } else {
      run = 1
    }
  }

  return { current, longest, totalDays: days.length }
}

export type DailyMinutes = { date: string; minutes: number }

export async function dailyMinutes(userId: string, fromDate: string, toDate: string): Promise<DailyMinutes[]> {
  const sessions = await db.studySession.findMany({
    where: { userId, completed: true, date: { gte: fromDate, lte: toDate } },
    select: { date: true, durationMinutes: true },
  })
  const map = new Map<string, number>()
  for (const s of sessions) map.set(s.date, (map.get(s.date) ?? 0) + s.durationMinutes)
  const out: DailyMinutes[] = []
  let cursor = fromDate
  while (cursor <= toDate) {
    out.push({ date: cursor, minutes: map.get(cursor) ?? 0 })
    cursor = addDays(cursor, 1)
  }
  return out
}

/** Monday-free Persian week range: from Saturday to Friday containing `date`. */
export function persianWeekRange(date: string): { start: string; end: string } {
  const idx = persianDayIndex(date) // 0=Sat..6=Fri
  const start = addDays(date, -idx)
  const end = addDays(start, 6)
  return { start, end }
}

export async function subjectDistribution(userId: string, fromDate: string, toDate: string) {
  const sessions = await db.studySession.findMany({
    where: { userId, completed: true, date: { gte: fromDate, lte: toDate }, subjectId: { not: null } },
    select: { subjectId: true, durationMinutes: true, subject: { select: { name: true, color: true } } },
  })
  const map = new Map<string, { name: string; color: string; minutes: number }>()
  for (const s of sessions) {
    if (!s.subjectId || !s.subject) continue
    const entry = map.get(s.subjectId) ?? { name: s.subject.name, color: s.subject.color, minutes: 0 }
    entry.minutes += s.durationMinutes
    map.set(s.subjectId, entry)
  }
  return Array.from(map.entries())
    .map(([id, v]) => ({ id, ...v }))
    .sort((a, b) => b.minutes - a.minutes)
}
