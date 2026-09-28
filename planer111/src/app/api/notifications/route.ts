import { db } from '@/lib/db'
import { ApiError, getToday } from '@/lib/server/api'
import { authRoute } from '@/lib/server/session'
import { ensureDailyNotifications } from '@/lib/server/notifications'

export const dynamic = 'force-dynamic'

/** List notifications (generates any newly-due ones first). */
export const GET = authRoute(async ({ req, user }) => {
  const today = getToday(req)
  await ensureDailyNotifications(user.id, today)

  const notifications = await db.notification.findMany({
    where: { userId: user.id },
    orderBy: { createdAt: 'desc' },
    take: 50,
  })
  const unread = notifications.filter((n) => !n.read).length
  return { notifications, unread }
})

/** Mark all as read. */
export const PATCH = authRoute(async ({ user }) => {
  await db.notification.updateMany({ where: { userId: user.id, read: false }, data: { read: true } })
  return { ok: true }
})

export const DELETE = authRoute(async ({ req, user }) => {
  const id = req.nextUrl.searchParams.get('id')
  if (!id) throw new ApiError(400, 'شناسه اعلان الزامی است.')
  const existing = await db.notification.findFirst({ where: { id, userId: user.id } })
  if (!existing) throw new ApiError(404, 'اعلان یافت نشد.')
  await db.notification.delete({ where: { id } })
  return { ok: true }
})
