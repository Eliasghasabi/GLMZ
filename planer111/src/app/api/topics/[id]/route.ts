import { z } from 'zod'
import { db } from '@/lib/db'
import { ApiError, parseBody, getToday } from '@/lib/server/api'
import { authRoute } from '@/lib/server/session'
import { generateRevisionsForTopic } from '@/lib/server/revisions'

export const dynamic = 'force-dynamic'

type Ctx = { params: Promise<{ id: string }> }

async function getOwnedTopic(userId: string, id: string) {
  const topic = await db.topic.findFirst({ where: { id, userId } })
  if (!topic) throw new ApiError(404, 'مبحث یافت نشد یا به شما تعلق ندارد.')
  return topic
}

const updateSchema = z.object({
  title: z.string().trim().min(1).max(120).optional(),
  description: z.string().trim().max(1000).nullable().optional(),
  status: z.enum(['NOT_STARTED', 'IN_PROGRESS', 'COMPLETED']).optional(),
  difficulty: z.enum(['EASY', 'MEDIUM', 'HARD']).optional(),
  estimatedMinutes: z.number().int().min(5).max(1440).nullable().optional(),
  actualMinutes: z.number().int().min(0).max(100000).optional(),
  chapterLabel: z.string().trim().max(60).nullable().optional(),
  notes: z.string().trim().max(2000).nullable().optional(),
})

export const PATCH = authRoute<{ id: string }>(async ({ req, user, params }) => {
  const existing = await getOwnedTopic(user.id, params.id)
  const data = await parseBody(req, updateSchema)

  // completing a topic stamps completedAt
  const completedNow = data.status === 'COMPLETED' && existing.status !== 'COMPLETED'
  const uncompleted = data.status && data.status !== 'COMPLETED' && existing.status === 'COMPLETED'

  const topic = await db.topic.update({
    where: { id: params.id },
    data: {
      ...data,
      ...(completedNow ? { completedAt: new Date() } : {}),
      ...(uncompleted ? { completedAt: null } : {}),
    },
  })

  // ── Smart revision: auto-generate spaced-repetition plan on completion ──
  let revisionsCreated = 0
  if (completedNow) {
    const today = getToday(req)
    revisionsCreated = await generateRevisionsForTopic(user.id, params.id, today)
  }

  return { topic, revisionsCreated }
})

export const DELETE = authRoute<{ id: string }>(async ({ user, params }) => {
  await getOwnedTopic(user.id, params.id)
  await db.topic.delete({ where: { id: params.id } })
  return { ok: true }
})
