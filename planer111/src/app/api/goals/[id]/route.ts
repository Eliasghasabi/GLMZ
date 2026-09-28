import { z } from 'zod'
import { db } from '@/lib/db'
import { ApiError, parseBody } from '@/lib/server/api'
import { authRoute } from '@/lib/server/session'

export const dynamic = 'force-dynamic'

type Ctx = { params: Promise<{ id: string }> }

async function getOwned(userId: string, id: string) {
  const goal = await db.goal.findFirst({ where: { id, userId } })
  if (!goal) throw new ApiError(404, 'هدف یافت نشد یا به شما تعلق ندارد.')
  return goal
}

const updateSchema = z.object({
  title: z.string().trim().min(1).max(120).optional(),
  targetValue: z.number().positive().max(1_000_000).optional(),
  currentValue: z.number().min(0).max(1_000_000).optional(),
  unit: z.string().trim().min(1).max(20).optional(),
  deadline: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
  status: z.enum(['ACTIVE', 'COMPLETED', 'ARCHIVED']).optional(),
  increment: z.number().optional(), // quick progress bump
})

export const PATCH = authRoute<{ id: string }>(async ({ req, user, params }) => {
  const existing = await getOwned(user.id, params.id)
  const data = await parseBody(req, updateSchema)
  const { increment, ...rest } = data

  let currentValue = rest.currentValue ?? existing.currentValue
  if (increment !== undefined) currentValue = Math.max(0, existing.currentValue + increment)

  const targetValue = rest.targetValue ?? existing.targetValue
  // auto-complete when current reaches target
  let status = rest.status ?? existing.status
  if (!rest.status && currentValue >= targetValue) status = 'COMPLETED'

  const goal = await db.goal.update({
    where: { id: params.id },
    data: { ...rest, currentValue, status, targetValue },
  })
  return { goal }
})

export const DELETE = authRoute<{ id: string }>(async ({ user, params }) => {
  await getOwned(user.id, params.id)
  await db.goal.delete({ where: { id: params.id } })
  return { ok: true }
})
