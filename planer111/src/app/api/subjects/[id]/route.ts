import { z } from 'zod'
import { db } from '@/lib/db'
import { ApiError, parseBody } from '@/lib/server/api'
import { authRoute } from '@/lib/server/session'

export const dynamic = 'force-dynamic'

type Ctx = { params: Promise<{ id: string }> }

async function getOwnedSubject(userId: string, id: string) {
  const subject = await db.subject.findFirst({ where: { id, userId } })
  if (!subject) throw new ApiError(404, 'درس یافت نشد یا به شما تعلق ندارد.')
  return subject
}

/** Subject detail with topics + study minutes. */
export const GET = authRoute<{ id: string }>(async ({ user, params }) => {
  const subject = await db.subject.findFirst({
    where: { id: params.id, userId: user.id },
    include: {
      topics: { orderBy: [{ chapterLabel: 'asc' }, { createdAt: 'asc' }] },
      studySessions: { select: { durationMinutes: true } },
      exams: { orderBy: { date: 'asc' } },
    },
  })
  if (!subject) throw new ApiError(404, 'درس یافت نشد یا به شما تعلق ندارد.')

  const total = subject.topics.length
  const completed = subject.topics.filter((t) => t.status === 'COMPLETED').length
  return {
    subject: {
      ...subject,
      topicCount: total,
      completedTopics: completed,
      progressPercent: total > 0 ? Math.round((completed / total) * 100) : 0,
      studyMinutes: subject.studySessions.reduce((acc, s) => acc + s.durationMinutes, 0),
    },
  }
})

const updateSchema = z.object({
  name: z.string().trim().min(1).max(80).optional(),
  icon: z.string().trim().max(8).optional(),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional(),
  description: z.string().trim().max(500).nullable().optional(),
  teacher: z.string().trim().max(80).nullable().optional(),
  totalChapters: z.number().int().min(0).max(500).optional(),
  archived: z.boolean().optional(),
})

export const PATCH = authRoute<{ id: string }>(async ({ req, user, params }) => {
  await getOwnedSubject(user.id, params.id)
  const data = await parseBody(req, updateSchema)
  const subject = await db.subject.update({ where: { id: params.id }, data })
  return { subject }
})

export const DELETE = authRoute<{ id: string }>(async ({ user, params }) => {
  await getOwnedSubject(user.id, params.id)
  await db.subject.delete({ where: { id: params.id } })
  return { ok: true }
})
