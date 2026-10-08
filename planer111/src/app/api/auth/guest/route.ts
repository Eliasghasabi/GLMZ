import { cookies } from 'next/headers'
import { db } from '@/lib/db'
import { ApiError, getToday } from '@/lib/server/api'
import { seedForUser } from '@/lib/server/demo-seed'
import { hashPassword } from '@/lib/server/password'
import { createSession, publicRoute, SESSION_COOKIE, sessionCookieOptions } from '@/lib/server/session'
import { serializeSettings } from '@/lib/server/serialize'

export const dynamic = 'force-dynamic'

/**
 * Silent guest sign-in (login-free build).
 *
 * Ensures the shared account exists, then creates a normal session for it
 * and sets the usual httpOnly cookie. The response shape is identical to
 * /api/auth/login so the client treats both endpoints the same way.
 *
 * On a fresh deployment (first-time creation of the account) the full demo
 * dataset is seeded automatically so the app opens complete; existing
 * deployments keep their real data untouched.
 *
 * Everything else in the API (user isolation, CSRF, rate limiting, session
 * lifecycle) is unchanged — this endpoint only replaces the interactive
 * login step.
 */

const GUEST_EMAIL = 'demo@studyflow.ir'
const GUEST_NAME = 'الیاس'
const GUEST_PASSWORD = 'demo12345' // satisfies the NOT NULL schema column; never used for interactive login

type UserWithSettings = NonNullable<Awaited<ReturnType<typeof findGuest>>>

function findGuest() {
  return db.user.findUnique({
    where: { email: GUEST_EMAIL },
    include: { settings: true },
  })
}

export const POST = publicRoute(
  async ({ req }) => {
    // ── find-or-create the shared account (race-safe on unique email) ──
    let user: UserWithSettings | null = await findGuest()
    let freshlyCreated = false

    if (!user) {
      try {
        user = await db.user.create({
          data: {
            name: GUEST_NAME,
            email: GUEST_EMAIL,
            passwordHash: await hashPassword(GUEST_PASSWORD),
            avatarEmoji: '🦉',
            avatarColor: '#6366F1',
            settings: { create: {} },
          },
          include: { settings: true },
        })
        freshlyCreated = true
      } catch (e) {
        // lost a creation race against a concurrent first request → reuse the winner's row
        if ((e as { code?: string })?.code === 'P2002') {
          user = await findGuest()
        } else {
          throw e
        }
      }
    }

    if (!user) throw new ApiError(500, 'خطا در آماده‌سازی حساب کاربری.')

    // safety net for rows created before settings existed
    if (!user.settings) {
      user = await db.user.update({
        where: { id: user.id },
        data: { settings: { create: {} } },
        include: { settings: true },
      })
    }

    // ── first-time creation → load the demo dataset (never blocks sign-in) ──
    if (freshlyCreated) {
      try {
        await seedForUser(user.id, getToday(req))
      } catch (e) {
        console.error('[auth/guest] demo seed failed:', e)
      }
    }

    const { token, expiresAt } = await createSession(user.id)
    ;(await cookies()).set(SESSION_COOKIE, token, sessionCookieOptions(expiresAt))

    return {
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        avatarEmoji: user.avatarEmoji,
        avatarColor: user.avatarColor,
        createdAt: user.createdAt,
      },
      settings: user.settings ? serializeSettings(user.settings) : null,
    }
  },
  { limit: 10 }
)
