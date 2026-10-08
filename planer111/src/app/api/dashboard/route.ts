import { db } from '@/lib/db'
import { authRoute } from '@/lib/server/session'
import { getToday, addDays, diffDays } from '@/lib/server/api'
import { computeStreaks, dailyMinutes, persianWeekRange } from '@/lib/server/stats'
import { ensureDailyNotifications } from '@/lib/server/notifications'
import type { Revision, Task, Exam } from '@prisma/client'

export const dynamic = 'force-dynamic'

/** Aggregated dashboard payload — one round-trip for the home screen. */
export const GET = authRoute(async ({ req, user }) => {
  const today = getToday(req)
  await ensureDailyNotifications(user.id, today)

  const week = persianWeekRange(today)
  const monthAgo = addDays(today, -29)

  const [
    todaySessions,
    todayTasksRaw,
    upcomingExamsRaw,
    todayRevisionsRaw,
    streak,
    last7,
    weekSessions,
    unreadNotifications,
    activeGoals,
  ] = await Promise.all([
    db.studySession.findMany({
      where: { userId: user.id, date: today, completed: true },
      select: { durationMinutes: true, subject: { select: { name: true, color: true, icon: true } }, source: true },
    }),
    db.task.findMany({
      where: { userId: user.id, status: { not: 'COMPLETED' }, dueDate: { not: null, lte: today } },
      orderBy: [{ priority: 'asc' }, { dueDate: 'asc' }],
      include: { subject: { select: { id: true, name: true, color: true, icon: true } } },
    }),
    db.exam.findMany({
      where: { userId: user.id, date: { gte: today } },
      orderBy: { date: 'asc' },
      take: 4,
      include: { subject: { select: { id: true, name: true, color: true, icon: true } } },
    }),
    db.revision.findMany({
      where: { userId: user.id, status: 'PENDING', dueDate: { lte: today } },
      orderBy: { dueDate: 'asc' },
      include: {
        topic: { select: { id: true, title: true } },
        subject: { select: { id: true, name: true, color: true, icon: true } },
      },
    }),
    computeStreaks(user.id, today),
    dailyMinutes(user.id, addDays(today, -6), today),
    db.studySession.findMany({
      where: { userId: user.id, date: { gte: week.start, lte: week.end }, completed: true },
      select: { durationMinutes: true, date: true },
    }),
    db.notification.count({ where: { userId: user.id, read: false } }),
    db.goal.findMany({
      where: { userId: user.id, status: 'ACTIVE' },
      orderBy: { createdAt: 'desc' },
      take: 3,
    }),
  ])

  const todayMinutes = todaySessions.reduce((a, s) => a + s.durationMinutes, 0)
  const weekMinutes = weekSessions.reduce((a, s) => a + s.durationMinutes, 0)
  const dailyGoal = user.settings?.dailyGoalMinutes ?? 120

  const PRIO_RANK: Record<string, number> = { URGENT: 0, HIGH: 1, MEDIUM: 2, LOW: 3 }
  const todayTasks: Task[] = todayTasksRaw.sort(
    (a, b) => (PRIO_RANK[a.priority] ?? 9) - (PRIO_RANK[b.priority] ?? 9)
  )
  const upcomingExams = upcomingExamsRaw.map((e: Exam) => ({
    ...e,
    daysLeft: diffDays(today, e.date),
  }))
  const todayRevisions: Revision[] = todayRevisionsRaw

  return {
    today,
    greetingName: user.name,
    todayMinutes,
    dailyGoalMinutes: dailyGoal,
    progressPercent: Math.min(100, Math.round((todayMinutes / Math.max(dailyGoal, 1)) * 100)),
    todayTasks,
    upcomingExams,
    todayRevisions,
    streak,
    last7Days: last7,
    weekMinutes,
    weekGoalMinutes: dailyGoal * 7,
    unreadNotifications,
    activeGoals,
    pomodoroCount: todaySessions.filter((s) => s.source === 'POMODORO').length,
    monthAgo,
    todaySubjects: todaySessions.map((s) => s.subject).filter(Boolean),
  }
})

