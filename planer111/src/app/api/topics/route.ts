import { z } from 'zod'
import { db } from '@/lib/db'
import { ApiError, parseBody } from '@/lib/server/api'
import { generateRevisionsForTopic } from '@/lib/server/revisions'
import { getToday } from '@/lib/server/api'
import { authRoute } from '@/lib/server/session'

export const dynamic = 'force-dynamic'

const createSchema = z.object({
  subjectId: z.string().min(1, 'درس را انتخاب کنید.'),
  title: z.string().trim().min(1, 'عنوان مبحث را وارد کنید.').max(120),
  description: z.string().trim().max(1000).optional().nullable(),
  status: z.enum(['NOT_STARTED', 'IN_PROGRESS', 'COMPLETED']).default('NOT_STARTED'),
  difficulty: z.enum(['EASY', 'MEDIUM', 'HARD']).default('MEDIUM'),
  estimatedMinutes: z.number().int().min(5).max(1440).optional().nullable(),
  chapterLabel: z.string().trim().max(60).optional().nullable(),
  notes: z.string().trim().max(2000).optional().nullable(),
})

export const POST = authRoute(async ({ req, user }) => {
  const data = await parseBody(req, createSchema)
  const subject = await db.subject.findFirst({ where: { id: data.subjectId, userId: user.id } })
  if (!subject) throw new ApiError(404, 'درس یافت نشد یا به شما تعلق ندارد.')

  const topic = await db.topic.create({
    data: {
      ...data,
      userId: user.id,
      completedAt: data.status === 'COMPLETED' ? new Date() : null,
    },
  })

  // a topic created as already-completed also gets its revision plan
  let revisionsCreated = 0
  if (data.status === 'COMPLETED') {
    revisionsCreated = await generateRevisionsForTopic(user.id, topic.id, getToday(req))
  }
  return { topic, revisionsCreated }
})

const listSchema = z.object({
  subjectId: z.string().optional(),
  status: z.enum(['NOT_STARTED', 'IN_PROGRESS', 'COMPLETED']).optional(),
})

export const GET = authRoute(async ({ req, user }) => {
  const params = req.nextUrl.searchParams
  const parsed = listSchema.parse({
    subjectId: params.get('subjectId') ?? undefined,
    status: params.get('status') ?? undefined,
  })
  const topics = await db.topic.findMany({
    where: {
      userId: user.id,
      ...(parsed.subjectId ? { subjectId: parsed.subjectId } : {}),
      ...(parsed.status ? { status: parsed.status } : {}),
    },
    orderBy: { createdAt: 'asc' },
    include: { subject: { select: { name: true, color: true, icon: true } } },
  })
  return { topics }
})
