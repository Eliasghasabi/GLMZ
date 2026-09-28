import { z } from 'zod'
import { db } from '@/lib/db'
import { parseBody } from '@/lib/server/api'
import { authRoute } from '@/lib/server/session'

export const dynamic = 'force-dynamic'

/** List subjects with computed progress (from topics) and study time. */
export const GET = authRoute(async ({ req, user }) => {
  const archived = req.nextUrl.searchParams.get('archived') ?? 'false'

  const whereArchived =
    archived === 'all' ? {} : archived === 'true' ? { archived: true } : { archived: false }

  const [subjects, minutesBySubject] = await Promise.all([
    db.subject.findMany({
      where: { userId: user.id, ...whereArchived },
      orderBy: { createdAt: 'asc' },
      include: {
        _count: { select: { topics: true } },
        topics: { select: { status: true } },
      },
    }),
    // aggregated study time per subject — avoids loading every session row
    db.studySession.groupBy({
      by: ['subjectId'],
      where: { userId: user.id, subjectId: { not: null }, completed: true },
      _sum: { durationMinutes: true },
    }),
  ])
  const minutesMap = new Map(
    minutesBySubject.filter((m) => m.subjectId).map((m) => [m.subjectId as string, m._sum.durationMinutes ?? 0])
  )

  return {
    subjects: subjects.map((s) => {
      const total = s._count.topics
      const completed = s.topics.filter((t) => t.status === 'COMPLETED').length
      const inProgress = s.topics.filter((t) => t.status === 'IN_PROGRESS').length
      return {
        id: s.id,
        name: s.name,
        icon: s.icon,
        color: s.color,
        description: s.description,
        teacher: s.teacher,
        totalChapters: s.totalChapters,
        archived: s.archived,
        createdAt: s.createdAt,
        updatedAt: s.updatedAt,
        topicCount: total,
        completedTopics: completed,
        inProgressTopics: inProgress,
        progressPercent: total > 0 ? Math.round((completed / total) * 100) : 0,
        studyMinutes: minutesMap.get(s.id) ?? 0,
      }
    }),
  }
})

const createSchema = z.object({
  name: z.string().trim().min(1, 'نام درس را وارد کنید.').max(80, 'نام درس طولانی است.'),
  icon: z.string().trim().max(16).default('📘'),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/, 'رنگ نامعتبر است.').default('#6366F1'),
  description: z.string().trim().max(500).optional().nullable(),
  teacher: z.string().trim().max(80).optional().nullable(),
  totalChapters: z.number().int().min(0).max(500).default(0),
})

export const POST = authRoute(async ({ req, user }) => {
  const data = await parseBody(req, createSchema)
  const subject = await db.subject.create({ data: { ...data, userId: user.id } })
  return { subject }
})
