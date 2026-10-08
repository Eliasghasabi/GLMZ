import { db } from '@/lib/db'
import { ApiError, addDays } from './api'
import { safeParse } from './serialize'

/**
 * Smart revision system:
 * when a topic is completed, spaced-repetition review items are generated
 * at the user's configured intervals (default: 1, 3, 7, 14, 30 days).
 */
export async function generateRevisionsForTopic(userId: string, topicId: string, baseDate: string) {
  const settings = await db.userSettings.findUnique({ where: { userId } })
  const intervals = safeParse<number[]>(settings?.revisionIntervals, [1, 3, 7, 14, 30])

  const existing = await db.revision.findMany({ where: { userId, topicId } })
  if (existing.length > 0) return 0 // already generated

  const topic = await db.topic.findFirst({ where: { id: topicId, userId } })
  if (!topic) throw new ApiError(404, 'مبحث یافت نشد.')

  try {
    await db.revision.createMany({
      data: intervals.map((days, i) => ({
        userId,
        topicId,
        subjectId: topic.subjectId,
        revisionNumber: i + 1,
        dueDate: addDays(baseDate, days),
        status: 'PENDING',
      })),
    })
  } catch (e) {
    // unique(topicId, revisionNumber) hit → another request generated them already
    if ((e as { code?: string })?.code === 'P2002') return 0
    throw e
  }
  return intervals.length
}

/** When intervals change, extend/schedule future (pending) revisions of topics already completed. */
export async function reschedulePendingRevisions(userId: string) {
  const settings = await db.userSettings.findUnique({ where: { userId } })
  const intervals = safeParse<number[]>(settings?.revisionIntervals, [1, 3, 7, 14, 30])

  const pending = await db.revision.findMany({
    where: { userId, status: 'PENDING' },
    include: { topic: true },
  })

  const updates = pending
    .map((rev) => {
      const base = rev.topic.completedAt
        ? rev.topic.completedAt.toISOString().slice(0, 10)
        : rev.createdAt.toISOString().slice(0, 10)
      const idx = Math.min(Math.max(rev.revisionNumber - 1, 0), intervals.length - 1)
      const due = addDays(base, intervals[idx] ?? 30)
      return due !== rev.dueDate ? { id: rev.id, dueDate: due } : null
    })
    .filter((u): u is { id: string; dueDate: string } => u !== null)

  if (updates.length > 0) {
    await db.$transaction(
      updates.map((u) => db.revision.update({ where: { id: u.id }, data: { dueDate: u.dueDate } }))
    )
  }
}
