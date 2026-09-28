import { z } from 'zod'
import { cookies } from 'next/headers'
import { db } from '@/lib/db'
import { ApiError, parseBody } from '@/lib/server/api'
import { verifyPassword } from '@/lib/server/password'
import { createSession, publicRoute, SESSION_COOKIE, sessionCookieOptions } from '@/lib/server/session'
import { serializeSettings } from '@/lib/server/serialize'

export const dynamic = 'force-dynamic'

const loginSchema = z.object({
  email: z.string().trim().toLowerCase().pipe(z.email('ایمیل معتبر نیست.')),
  password: z.string().min(1, 'رمز عبور را وارد کنید.'),
})

export const POST = publicRoute(
  async ({ req }) => {
    const { email, password } = await parseBody(req, loginSchema)

    const user = await db.user.findUnique({
      where: { email },
      include: { settings: true },
    })
    if (!user || !(await verifyPassword(password, user.passwordHash))) {
      throw new ApiError(401, 'ایمیل یا رمز عبور اشتباه است.')
    }

    const { token, expiresAt } = await createSession(user.id)
    ;(await cookies()).set(SESSION_COOKIE, token, sessionCookieOptions(expiresAt))

    return {
      user: { id: user.id, name: user.name, email: user.email, avatarEmoji: user.avatarEmoji, avatarColor: user.avatarColor },
      settings: user.settings ? serializeSettings(user.settings) : null,
    }
  },
  { limit: 10 }
)
