import { db } from '@/lib/db'
import { authRoute } from '@/lib/server/session'
import { getToday, addDays } from '@/lib/server/api'
import { computeStreaks, dailyMinutes, persianWeekRange, subjectDistribution } from '@/lib/server/stats'

export const dynamic = 'force-dynamic'

/** Statistics endpoint: KPIs, daily trend, subject distribution. */
export const GET = authRoute(async ({ req, user }) => {
  const today = getToday(req)
  const week = persianWeekRange(today)

  const [
    streak,
    last7,
    last30,
    distribution,
    tasksCompleted,
    topicsCompleted,
    pomodoroToday,
    totalSubjects,
  ] = await Promise.all([
    computeStreaks(user.id, today),
    dailyMinutes(user.id, addDays(today, -6), today),
    dailyMinutes(user.id, addDays(today, -29), today),
    subjectDistribution(user.id, addDays(today, -29), today),
    db.task.count({ where: { userId: user.id, status: 'COMPLETED' } }),
    db.topic.count({ where: { userId: user.id, status: 'COMPLETED' } }),
    db.studySession.count({
      where: { userId: user.id, source: 'POMODORO', completed: true, date: today },
    }),
    db.subject.count({ where: { userId: user.id, archived: false } }),
  ])

  const todayMinutes = last7[last7.length - 1]?.minutes ?? 0
  const weekMinutes = last7.reduce((a, d) => a + d.minutes, 0)
  const monthMinutes = last30.reduce((a, d) => a + d.minutes, 0)
  const bestDay = last30.reduce((best, d) => (d.minutes > best.minutes ? d : best), { date: today, minutes: 0 })

  return {
    today,
    streak,
    todayMinutes,
    weekMinutes,
    monthMinutes,
    weekGoalMinutes: (user.settings?.dailyGoalMinutes ?? 120) * 7,
    last7Days: last7,
    last30Days: last30,
    distribution,
    tasksCompleted,
    topicsCompleted,
    pomodoroToday,
    totalSubjects,
    bestDay,
    avgPerActiveDay:
      last30.filter((d) => d.minutes > 0).length > 0
        ? Math.round(monthMinutes / last30.filter((d) => d.minutes > 0).length)
        : 0,
  }
})

