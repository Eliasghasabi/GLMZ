import { cookies } from 'next/headers'
import { SESSION_COOKIE, destroySession, publicRoute, sessionCookieOptions } from '@/lib/server/session'

export const dynamic = 'force-dynamic'

export const POST = publicRoute(async ({ req }) => {
  await destroySession(req)
  ;(await cookies()).set(SESSION_COOKIE, '', sessionCookieOptions(new Date(0)))
  return { ok: true }
})
