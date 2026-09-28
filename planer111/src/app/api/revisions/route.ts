import { z } from 'zod'
import { db } from '@/lib/db'
import { ApiError, getToday, parseBody, diffDays } from '@/lib/server/api'
import { authRoute } from '@/lib/server/session'
import { ensureDailyNotifications } from '@/lib/server/notifications'

export const dynamic = 'force-dynamic'

/** Revisions grouped: overdue / today / upcoming. */
export const GET = authRoute(async ({ req, user }) => {
  const today = getToday(req)
  await ensureDailyNotifications(user.id, today)

  const revisions = await db.revision.findMany({
    where: { userId: user.id, status: 'PENDING' },
    orderBy: { dueDate: 'asc' },
    include: {
      topic: { select: { id: true, title: true } },
      subject: { select: { id: true, name: true, color: true, icon: true } },
    },
  })

  const overdue = revisions.filter((r) => r.dueDate < today)
  const dueToday = revisions.filter((r) => r.dueDate === today)
  const upcomingMap = new Map<string, typeof revisions>()
  for (const r of revisions) {
    if (r.dueDate <= today) continue
    const list = upcomingMap.get(r.dueDate) ?? []
    list.push(r)
    upcomingMap.set(r.dueDate, list)
  }
  const upcoming = Array.from(upcomingMap.entries()).map(([date, items]) => ({
    date,
    daysLeft: diffDays(today, date),
    items,
  }))

  const completedRecent = await db.revision.findMany({
    where: { userId: user.id, status: 'COMPLETED' },
    orderBy: { completedAt: 'desc' },
    take: 10,
    include: {
      topic: { select: { id: true, title: true } },
      subject: { select: { id: true, name: true, color: true, icon: true } },
    },
  })

  return { today, overdue, dueToday, upcoming, completedRecent }
})

const createSchema = z.object({
  topicId: z.string().min(1, 'مبحث را انتخاب کنید.'),
  dueDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'تاریخ نامعتبر است.'),
})

/** Manually add an extra review round for a topic. */
export const POST = authRoute(async ({ req, user }) => {
  const data = await parseBody(req, createSchema)
  const topic = await db.topic.findFirst({ where: { id: data.topicId, userId: user.id } })
  if (!topic) throw new ApiError(404, 'مبحث یافت نشد.')

  const maxNumber = await db.revision.aggregate({
    where: { userId: user.id, topicId: data.topicId },
    _max: { revisionNumber: true },
  })

  let revision
  try {
    revision = await db.revision.create({
      data: {
        userId: user.id,
        topicId: data.topicId,
        subjectId: topic.subjectId,
        revisionNumber: (maxNumber._max.revisionNumber ?? 0) + 1,
        dueDate: data.dueDate,
      },
      include: { topic: true, subject: true },
    })
  } catch (e) {
    if ((e as { code?: string })?.code === 'P2002') {
      throw new ApiError(409, 'این دورهٔ مرور قبلاً ثبت شده است.')
    }
    throw e
  }
  return { revision }
})

const patchSchema = z.object({
  status: z.enum(['PENDING', 'COMPLETED']).optional(),
  dueDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
})

/** Complete / reschedule (snooze) a revision. */
export const PATCH = authRoute(async ({ req, user }) => {
  const body = await parseBody(req, patchSchema.extend({ id: z.string().min(1) }))
  const existing = await db.revision.findFirst({ where: { id: body.id, userId: user.id } })
  if (!existing) throw new ApiError(404, 'مرور یافت نشد.')

  const revision = await db.revision.update({
    where: { id: body.id },
    data: {
      ...(body.status ? { status: body.status, completedAt: body.status === 'COMPLETED' ? new Date() : null } : {}),
      ...(body.dueDate ? { dueDate: body.dueDate } : {}),
    },
  })

  // finishing today's last review may lift notifications — re-check silently
  if (body.status === 'COMPLETED') await ensureDailyNotifications(user.id, getToday(req)).catch(() => {})

  return { revision }
})

export const DELETE = authRoute(async ({ req, user }) => {
  const id = req.nextUrl.searchParams.get('id')
  if (!id) throw new ApiError(400, 'شناسه مرور الزامی است.')
  const existing = await db.revision.findFirst({ where: { id, userId: user.id } })
  if (!existing) throw new ApiError(404, 'مرور یافت نشد.')
  await db.revision.delete({ where: { id } })
  return { ok: true }
})

