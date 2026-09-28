import { z } from 'zod'
import { db } from '@/lib/db'
import { ApiError, assertOwnedRefs, parseBody, getToday, diffDays } from '@/lib/server/api'
import { authRoute } from '@/lib/server/session'
import { serializeExam } from '@/lib/server/serialize'

export const dynamic = 'force-dynamic'

export const GET = authRoute(async ({ req, user }) => {
  const today = getToday(req)
  const exams = await db.exam.findMany({
    where: { userId: user.id },
    orderBy: { date: 'asc' },
    include: { subject: { select: { id: true, name: true, color: true, icon: true } } },
  })
  return {
    today,
    exams: exams.map((e) => ({ ...serializeExam(e), daysLeft: diffDays(today, e.date) })),
  }
})

const createSchema = z.object({
  title: z.string().trim().min(1, 'عنوان امتحان را وارد کنید.').max(120),
  subjectId: z.string().optional().nullable(),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'تاریخ نامعتبر است.'),
  time: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/).optional().nullable(),
  location: z.string().trim().max(120).optional().nullable(),
  topics: z.array(z.string().trim().min(1).max(60)).max(20).default([]),
  notes: z.string().trim().max(2000).optional().nullable(),
  progressPercent: z.number().int().min(0).max(100).default(0),
})

export const POST = authRoute(async ({ req, user }) => {
  const data = await parseBody(req, createSchema)
  await assertOwnedRefs(user.id, data)
  const exam = await db.exam.create({
    data: {
      userId: user.id,
      title: data.title,
      subjectId: data.subjectId || null,
      date: data.date,
      time: data.time || null,
      location: data.location || null,
      topics: JSON.stringify(data.topics),
      notes: data.notes || null,
      progressPercent: data.progressPercent,
    },
  })
  return { exam: serializeExam(exam) }
})
