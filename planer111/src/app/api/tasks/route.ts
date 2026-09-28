import { z } from 'zod'
import { db } from '@/lib/db'
import { ApiError, assertOwnedRefs, parseBody } from '@/lib/server/api'
import { authRoute } from '@/lib/server/session'
import { serializeTask } from '@/lib/server/serialize'

export const dynamic = 'force-dynamic'

const listSchema = z.object({
  status: z.enum(['TODO', 'IN_PROGRESS', 'COMPLETED']).optional(),
  priority: z.enum(['LOW', 'MEDIUM', 'HIGH', 'URGENT']).optional(),
  subjectId: z.string().optional(),
  sort: z.enum(['dueDate', 'priority', 'createdAt']).default('createdAt'),
  dir: z.enum(['asc', 'desc']).default('desc'),
})

export const GET = authRoute(async ({ req, user }) => {
  const p = req.nextUrl.searchParams
  const q = listSchema.parse({
    status: p.get('status') ?? undefined,
    priority: p.get('priority') ?? undefined,
    subjectId: p.get('subjectId') ?? undefined,
    sort: (p.get('sort') as 'dueDate' | 'priority' | 'createdAt' | null) ?? 'createdAt',
    dir: (p.get('dir') as 'asc' | 'desc' | null) ?? 'desc',
  })

  const tasks = await db.task.findMany({
    where: {
      userId: user.id,
      ...(q.status ? { status: q.status } : {}),
      ...(q.priority ? { priority: q.priority } : {}),
      ...(q.subjectId ? { subjectId: q.subjectId } : {}),
    },
    include: { subject: { select: { id: true, name: true, color: true, icon: true } } },
    orderBy: [{ [q.sort]: q.dir }],
  })

  if (q.sort === 'priority') {
    // string columns sort alphabetically — apply the real severity rank instead
    const rank = { URGENT: 0, HIGH: 1, MEDIUM: 2, LOW: 3 } as const
    const m = q.dir === 'asc' ? 1 : -1
    tasks.sort((a, b) => m * (rank[a.priority as keyof typeof rank] - rank[b.priority as keyof typeof rank]))
  }

  return { tasks: tasks.map(serializeTask) }
})

const createSchema = z.object({
  title: z.string().trim().min(1, 'عنوان کار را وارد کنید.').max(160),
  description: z.string().trim().max(2000).optional().nullable(),
  subjectId: z.string().optional().nullable(),
  dueDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'تاریخ نامعتبر است.').optional().nullable(),
  priority: z.enum(['LOW', 'MEDIUM', 'HIGH', 'URGENT']).default('MEDIUM'),
  estimatedMinutes: z.number().int().min(5).max(1440).optional().nullable(),
  tags: z.array(z.string().trim().min(1).max(24)).max(8, 'حداکثر ۸ برچسب').default([]),
  status: z.enum(['TODO', 'IN_PROGRESS', 'COMPLETED']).default('TODO'),
})

export const POST = authRoute(async ({ req, user }) => {
  const data = await parseBody(req, createSchema)
  await assertOwnedRefs(user.id, data)
  const task = await db.task.create({
    data: {
      userId: user.id,
      title: data.title,
      description: data.description ?? null,
      subjectId: data.subjectId || null,
      dueDate: data.dueDate || null,
      priority: data.priority,
      estimatedMinutes: data.estimatedMinutes ?? null,
      tags: JSON.stringify(data.tags),
      status: data.status,
      completedAt: data.status === 'COMPLETED' ? new Date() : null,
    },
    include: { subject: { select: { id: true, name: true, color: true, icon: true } } },
  })
  return { task: serializeTask(task) }
})
