import { z } from 'zod'
import { db } from '@/lib/db'
import { ApiError, assertOwnedRefs, parseBody } from '@/lib/server/api'
import { authRoute } from '@/lib/server/session'
import { serializeTask } from '@/lib/server/serialize'

export const dynamic = 'force-dynamic'

type Ctx = { params: Promise<{ id: string }> }

async function getOwned(userId: string, id: string) {
  const task = await db.task.findFirst({ where: { id, userId } })
  if (!task) throw new ApiError(404, 'کار یافت نشد یا به شما تعلق ندارد.')
  return task
}

const updateSchema = z.object({
  title: z.string().trim().min(1).max(160).optional(),
  description: z.string().trim().max(2000).nullable().optional(),
  subjectId: z.string().nullable().optional(),
  dueDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
  priority: z.enum(['LOW', 'MEDIUM', 'HIGH', 'URGENT']).optional(),
  estimatedMinutes: z.number().int().min(5).max(1440).nullable().optional(),
  tags: z.array(z.string().trim().min(1).max(24)).max(8).optional(),
  status: z.enum(['TODO', 'IN_PROGRESS', 'COMPLETED']).optional(),
})

export const PATCH = authRoute<{ id: string }>(async ({ req, user, params }) => {
  await getOwned(user.id, params.id)
  const data = await parseBody(req, updateSchema)
  await assertOwnedRefs(user.id, data)
  const { tags, ...rest } = data

  const task = await db.task.update({
    where: { id: params.id },
    data: {
      ...rest,
      ...(tags ? { tags: JSON.stringify(tags) } : {}),
      ...(data.status === 'COMPLETED' ? { completedAt: new Date() } : {}),
      ...(data.status && data.status !== 'COMPLETED' ? { completedAt: null } : {}),
      ...(data.subjectId !== undefined ? { subjectId: data.subjectId || null } : {}),
    },
    include: { subject: { select: { id: true, name: true, color: true, icon: true } } },
  })
  return { task: serializeTask(task) }
})

export const DELETE = authRoute<{ id: string }>(async ({ user, params }) => {
  await getOwned(user.id, params.id)
  await db.task.delete({ where: { id: params.id } })
  return { ok: true }
})
