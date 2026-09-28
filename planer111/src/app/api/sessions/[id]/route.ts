import { z } from 'zod'
import { db } from '@/lib/db'
import { ApiError, assertOwnedRefs, parseBody } from '@/lib/server/api'
import { authRoute } from '@/lib/server/session'

export const dynamic = 'force-dynamic'

type Ctx = { params: Promise<{ id: string }> }

async function getOwned(userId: string, id: string) {
  const session = await db.studySession.findFirst({ where: { id, userId } })
  if (!session) throw new ApiError(404, 'جلسهٔ مطالعه یافت نشد.')
  return session
}

const updateSchema = z.object({
  subjectId: z.string().nullable().optional(),
  topicId: z.string().nullable().optional(),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  startTime: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/).optional(),
  endTime: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/).optional(),
  notes: z.string().trim().max(1000).nullable().optional(),
  completed: z.boolean().optional(),
})

export const PATCH = authRoute<{ id: string }>(async ({ req, user, params }) => {
  const existing = await getOwned(user.id, params.id)
  const data = await parseBody(req, updateSchema)
  await assertOwnedRefs(user.id, data)

  let durationMinutes = existing.durationMinutes
  const startTime = data.startTime ?? existing.startTime
  const endTime = data.endTime ?? existing.endTime
  if (data.startTime || data.endTime) {
    const [sh, sm] = startTime.split(':').map(Number)
    const [eh, em] = endTime.split(':').map(Number)
    let diff = eh * 60 + em - (sh * 60 + sm)
    if (diff < 0) diff += 24 * 60
    if (diff === 0) throw new ApiError(400, 'ساعت شروع و پایان نباید یکسان باشند.')
    durationMinutes = diff
  }

  const session = await db.studySession.update({
    where: { id: params.id },
    data: {
      ...data,
      durationMinutes,
      ...(data.subjectId !== undefined ? { subjectId: data.subjectId || null } : {}),
    },
    include: {
      subject: { select: { id: true, name: true, color: true, icon: true } },
      topic: { select: { id: true, title: true } },
    },
  })
  return { session }
})

export const DELETE = authRoute<{ id: string }>(async ({ user, params }) => {
  await getOwned(user.id, params.id)
  await db.studySession.delete({ where: { id: params.id } })
  return { ok: true }
})
