import { z } from 'zod'
import { db } from '@/lib/db'
import { ApiError, getToday, parseBody } from '@/lib/server/api'
import { authRoute } from '@/lib/server/session'

export const dynamic = 'force-dynamic'

/** Today's pomodoro count for the authenticated user. */
export const GET = authRoute(async ({ req, user }) => {
  // count from the user-local StudySession rows (date strings) — timezone-correct
  const today = getToday(req)
  const agg = await db.studySession.aggregate({
    where: { userId: user.id, source: 'POMODORO', completed: true, date: today },
    _count: { id: true },
    _sum: { durationMinutes: true },
  })
  const focusCount = agg._count.id
  const focusMinutes = agg._sum.durationMinutes ?? 0
  return { focusCount, focusMinutes }
})

/** Called when a pomodoro focus session completes — logs the pomodoro AND creates a study session. */
export const POST = authRoute(async ({ req, user }) => {
  const schema = z.object({
    minutes: z.number().int().min(1).max(240),
    type: z.enum(['FOCUS', 'BREAK']).default('FOCUS'),
    subjectId: z.string().optional().nullable(),
    date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    startTime: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/),
    endTime: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/),
  })
  const data = await parseBody(req, schema)

  if (data.subjectId) {
    const subject = await db.subject.findFirst({ where: { id: data.subjectId, userId: user.id } })
    if (!subject) throw new ApiError(404, 'درس انتخاب‌شده یافت نشد.')
  }

  // atomic: pomodoro log + study session are written together
  const result = await db.$transaction(async (tx) => {
    const pomodoro = await tx.pomodoroSession.create({
      data: {
        userId: user.id,
        subjectId: data.subjectId || null,
        minutes: data.minutes,
        type: data.type,
      },
    })
    // focus sessions count as real study time
    let session: { id: string } | null = null
    if (data.type === 'FOCUS') {
      session = await tx.studySession.create({
        data: {
          userId: user.id,
          subjectId: data.subjectId || null,
          date: data.date,
          startTime: data.startTime,
          endTime: data.endTime,
          durationMinutes: data.minutes,
          source: 'POMODORO',
          completed: true,
          notes: 'جلسهٔ تمرکز پومودورو',
        },
      })
    }
    return { pomodoro, session }
  })

  return result
})
