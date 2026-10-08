import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { ApiError } from './api'
import { newSessionToken, sha256 } from './password'
import type { Session, User, UserSettings } from '@prisma/client'

export const SESSION_COOKIE = 'studyflow_session'
const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000 // 30 days
const RENEW_THRESHOLD_MS = 20 * 24 * 60 * 60 * 1000 // renew when < 20 days left

export type AuthUser = User & { settings: UserSettings | null }

export function sessionCookieOptions(expires: Date) {
  return {
    httpOnly: true,
    sameSite: 'lax' as const,
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    expires,
  }
}

export async function createSession(userId: string): Promise<{ token: string; expiresAt: Date }> {
  const token = newSessionToken()
  const expiresAt = new Date(Date.now() + SESSION_TTL_MS)
  await db.session.create({
    data: { tokenHash: await sha256(token), userId, expiresAt },
  })
  return { token, expiresAt }
}

export function readSessionToken(req: NextRequest): string | null {
  return req.cookies.get(SESSION_COOKIE)?.value ?? null
}

/** Resolve the authenticated user from the session cookie (with sliding renewal). */
export async function getAuthUser(req: NextRequest): Promise<AuthUser | null> {
  const token = readSessionToken(req)
  if (!token) return null
  const tokenHash = await sha256(token)
  const session: Session | null = await db.session.findUnique({ where: { tokenHash } })
  if (!session || session.expiresAt.getTime() < Date.now()) return null

  // sliding renewal
  if (session.expiresAt.getTime() - Date.now() < RENEW_THRESHOLD_MS) {
    const newExpiry = new Date(Date.now() + SESSION_TTL_MS)
    await db.session.update({ where: { id: session.id }, data: { expiresAt: newExpiry } })
  }

  const user = await db.user.findUnique({
    where: { id: session.userId },
    include: { settings: true },
  })
  return user
}

export async function destroySession(req: NextRequest): Promise<void> {
  const token = readSessionToken(req)
  if (!token) return
  await db.session.deleteMany({ where: { tokenHash: await sha256(token) } })
}

/** Throwing variant used inside protected routes. */
export async function requireAuth(req: NextRequest): Promise<AuthUser> {
  const user = await getAuthUser(req)
  if (!user) throw new ApiError(401, 'برای ادامه باید وارد حساب خود شوید.')
  return user
}

// ─────────────────────────── Route wrappers ───────────────────────────

export type RouteContext<P = Record<string, string>> = {
  req: NextRequest
  user: AuthUser
  params: P
}

/** Wraps a protected route handler: auth + CSRF origin check + rate limit + error mapping. */
export function authRoute<P = Record<string, string>>(
  handler: (ctx: RouteContext<P>) => Promise<unknown>,
  opts: { limit?: number } = {}
) {
  return async (req: NextRequest, ctx: { params: Promise<P> }): Promise<Response> => {
    try {
      const { assertSameOrigin, rateLimit, clientIp } = await import('./api')
      assertSameOrigin(req)
      rateLimit(`api:${clientIp(req)}`, opts.limit ?? 300, 60_000)
      const user = await requireAuth(req)
      const params = (await ctx?.params) ?? ({} as P)
      const data = await handler({ req, user, params })
      return Response.json(data ?? { ok: true })
    } catch (err) {
      const { errorResponse } = await import('./api')
      return errorResponse(err)
    }
  }
}

/** Public route wrapper (no auth): CSRF + rate limit + error mapping. */
export function publicRoute(
  handler: (ctx: { req: NextRequest; params: Record<string, string> }) => Promise<unknown>,
  opts: { limit?: number } = {}
) {
  return async (req: NextRequest, ctx?: { params: Promise<Record<string, string>> }): Promise<Response> => {
    try {
      const { assertSameOrigin, rateLimit, clientIp } = await import('./api')
      assertSameOrigin(req)
      rateLimit(`api:${clientIp(req)}`, opts.limit ?? 120, 60_000)
      const params = (await ctx?.params) ?? {}
      const data = await handler({ req, params })
      return Response.json(data ?? { ok: true })
    } catch (err) {
      const { errorResponse } = await import('./api')
      return errorResponse(err)
    }
  }
}
