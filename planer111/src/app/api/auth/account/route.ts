import { cookies } from 'next/headers'
import { db } from '@/lib/db'
import { authRoute, SESSION_COOKIE, sessionCookieOptions } from '@/lib/server/session'

export const dynamic = 'force-dynamic'

/** Delete account and ALL user data (cascading). */
export const DELETE = authRoute(async ({ req, user }) => {
  await db.user.delete({ where: { id: user.id } })
  ;(await cookies()).set(SESSION_COOKIE, '', sessionCookieOptions(new Date(0)))
  void req
  return { ok: true }
})
