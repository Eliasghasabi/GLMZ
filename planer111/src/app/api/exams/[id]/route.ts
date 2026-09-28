import { z } from 'zod'
import { db } from '@/lib/db'
import { ApiError, assertOwnedRefs, parseBody } from '@/lib/server/api'
import { authRoute } from '@/lib/server/session'
import { serializeExam } from '@/lib/server/serialize'

export const dynamic = 'force-dynamic'

type Ctx = { params: Promise<{ id: string }> }

async function getOwned(userId: string, id: string) {
  const exam = await db.exam.findFirst({ where: { id, userId } })
  if (!exam) throw new ApiError(404, 'امتحان یافت نشد یا به شما تعلق ندارد.')
  return exam
}

const updateSchema = z.object({
  title: z.string().trim().min(1).max(120).optional(),
  subjectId: z.string().nullable().optional(),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  time: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/).nullable().optional(),
  location: z.string().trim().max(120).nullable().optional(),
  topics: z.array(z.string().trim().min(1).max(60)).max(20).optional(),
  notes: z.string().trim().max(2000).nullable().optional(),
  progressPercent: z.number().int().min(0).max(100).optional(),
})

export const PATCH = authRoute<{ id: string }>(async ({ req, user, params }) => {
  await getOwned(user.id, params.id)
  const data = await parseBody(req, updateSchema)
  await assertOwnedRefs(user.id, data)
  const { topics, ...rest } = data
  const exam = await db.exam.update({
    where: { id: params.id },
    data: {
      ...rest,
      ...(topics ? { topics: JSON.stringify(topics) } : {}),
      ...(data.subjectId !== undefined ? { subjectId: data.subjectId || null } : {}),
    },
  })
  return { exam: serializeExam(exam) }
})

export const DELETE = authRoute<{ id: string }>(async ({ user, params }) => {
  await getOwned(user.id, params.id)
  await db.exam.delete({ where: { id: params.id } })
  return { ok: true }
})
