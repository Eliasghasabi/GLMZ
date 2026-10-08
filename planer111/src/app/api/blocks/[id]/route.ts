import { z } from 'zod'
import { db } from '@/lib/db'
import { ApiError, assertOwnedRefs, parseBody } from '@/lib/server/api'
import { authRoute } from '@/lib/server/session'

export const dynamic = 'force-dynamic'

type Ctx = { params: Promise<{ id: string }> }

async function getOwned(userId: string, id: string) {
  const block = await db.studyBlock.findFirst({ where: { id, userId } })
  if (!block) throw new ApiError(404, 'بلوک برنامه یافت نشد.')
  return block
}

const timeRe = /^([01]\d|2[0-3]):[0-5]\d$/

const updateSchema = z
  .object({
    subjectId: z.string().nullable().optional(),
    topicId: z.string().nullable().optional(),
    title: z.string().trim().max(120).nullable().optional(),
    dayOfWeek: z.number().int().min(0).max(6).optional(),
    startTime: z.string().regex(timeRe).optional(),
    endTime: z.string().regex(timeRe).optional(),
    color: z.string().regex(/^#[0-9a-fA-F]{6}$/).nullable().optional(),
    status: z.enum(['PLANNED', 'DONE', 'SKIPPED']).optional(),
  })
  .refine((v) => !v.startTime || !v.endTime || v.startTime < v.endTime, {
    message: 'ساعت پایان باید بعد از ساعت شروع باشد.',
    path: ['endTime'],
  })

export const PATCH = authRoute<{ id: string }>(async ({ req, user, params }) => {
  await getOwned(user.id, params.id)
  const data = await parseBody(req, updateSchema)
  await assertOwnedRefs(user.id, data)
  const block = await db.studyBlock.update({
    where: { id: params.id },
    data,
    include: {
      subject: { select: { id: true, name: true, color: true, icon: true } },
      topic: { select: { id: true, title: true } },
    },
  })
  return { block }
})

export const DELETE = authRoute<{ id: string }>(async ({ user, params }) => {
  await getOwned(user.id, params.id)
  await db.studyBlock.delete({ where: { id: params.id } })
  return { ok: true }
})
