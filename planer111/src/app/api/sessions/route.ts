import { z } from 'zod'
import { db } from '@/lib/db'
import { ApiError, assertOwnedRefs, parseBody } from '@/lib/server/api'
import { authRoute } from '@/lib/server/session'

export const dynamic = 'force-dynamic'

/** Study sessions (daily planner timeline + pomodoro saves). */
export const GET = authRoute(async ({ req, user }) => {
  const from = req.nextUrl.searchParams.get('from')
  const to = req.nextUrl.searchParams.get('to')
  const date = req.nextUrl.searchParams.get('date')

  const sessions = await db.studySession.findMany({
    where: {
      userId: user.id,
      ...(date ? { date } : from || to ? { date: { ...(from ? { gte: from } : {}), ...(to ? { lte: to } : {}) } } : {}),
    },
    orderBy: [{ date: 'desc' }, { startTime: 'asc' }],
    include: {
      subject: { select: { id: true, name: true, color: true, icon: true } },
      topic: { select: { id: true, title: true } },
    },
  })
  return { sessions }
})

const timeRe = /^([01]\d|2[0-3]):[0-5]\d$/

function minutesBetween(start: string, end: string): number {
  const [sh, sm] = start.split(':').map(Number)
  const [eh, em] = end.split(':').map(Number)
  let diff = eh * 60 + em - (sh * 60 + sm)
  if (diff < 0) diff += 24 * 60 // crosses midnight
  return diff
}

const createSchema = z
  .object({
    subjectId: z.string().optional().nullable(),
    topicId: z.string().optional().nullable(),
    date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'تاریخ نامعتبر است.'),
    startTime: z.string().regex(timeRe, 'ساعت شروع نامعتبر است.'),
    endTime: z.string().regex(timeRe, 'ساعت پایان نامعتبر است.'),
    notes: z.string().trim().max(1000).optional().nullable(),
    completed: z.boolean().default(true),
    source: z.enum(['MANUAL', 'POMODORO']).default('MANUAL'),
  })
  .refine((v) => v.startTime !== v.endTime, {
    message: 'ساعت شروع و پایان نباید یکسان باشند.',
    path: ['endTime'],
  })

export const POST = authRoute(async ({ req, user }) => {
  const data = await parseBody(req, createSchema)
  await assertOwnedRefs(user.id, data)
  const session = await db.studySession.create({
    data: {
      ...data,
      userId: user.id,
      durationMinutes: minutesBetween(data.startTime, data.endTime),
    },
    include: {
      subject: { select: { id: true, name: true, color: true, icon: true } },
      topic: { select: { id: true, title: true } },
    },
  })
  return { session }
})
