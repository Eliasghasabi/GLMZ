import { z } from 'zod'
import { db } from '@/lib/db'
import { ApiError, assertOwnedRefs, parseBody } from '@/lib/server/api'
import { authRoute } from '@/lib/server/session'

export const dynamic = 'force-dynamic'

/** Weekly planner blocks (repeating weekly schedule), grouped by day 0=Sat..6=Fri. */
export const GET = authRoute(async ({ user }) => {
  const blocks = await db.studyBlock.findMany({
    where: { userId: user.id },
    orderBy: [{ dayOfWeek: 'asc' }, { startTime: 'asc' }],
    include: {
      subject: { select: { id: true, name: true, color: true, icon: true } },
      topic: { select: { id: true, title: true } },
    },
  })
  return { blocks }
})

const timeRe = /^([01]\d|2[0-3]):[0-5]\d$/

const createSchema = z
  .object({
    subjectId: z.string().optional().nullable(),
    topicId: z.string().optional().nullable(),
    title: z.string().trim().max(120).optional().nullable(),
    dayOfWeek: z.number().int().min(0, 'روز نامعتبر').max(6),
    startTime: z.string().regex(timeRe, 'ساعت شروع نامعتبر است.'),
    endTime: z.string().regex(timeRe, 'ساعت پایان نامعتبر است.'),
    color: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional().nullable(),
  })
  .refine((v) => v.startTime < v.endTime, {
    message: 'ساعت پایان باید بعد از ساعت شروع باشد.',
    path: ['endTime'],
  })

export const POST = authRoute(async ({ req, user }) => {
  const data = await parseBody(req, createSchema)
  await assertOwnedRefs(user.id, data)
  const block = await db.studyBlock.create({
    data: { ...data, userId: user.id },
    include: {
      subject: { select: { id: true, name: true, color: true, icon: true } },
      topic: { select: { id: true, title: true } },
    },
  })
  return { block }
})
