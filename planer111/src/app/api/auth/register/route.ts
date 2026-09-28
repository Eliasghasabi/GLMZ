import { z } from 'zod'
import { db } from '@/lib/db'
import { ApiError, parseBody } from '@/lib/server/api'
import { hashPassword } from '@/lib/server/password'
import { createSession, publicRoute, SESSION_COOKIE, sessionCookieOptions } from '@/lib/server/session'
import { serializeSettings } from '@/lib/server/serialize'
import { cookies } from 'next/headers'

export const dynamic = 'force-dynamic'

const registerSchema = z.object({
  name: z.string().trim().min(2, 'نام باید حداقل ۲ کاراکتر باشد.').max(60, 'نام طولانی‌تر از حد مجاز است.'),
  email: z.string().trim().toLowerCase().pipe(z.email('ایمیل معتبر نیست.')),
  password: z.string().min(8, 'رمز عبور باید حداقل ۸ کاراکتر باشد.').max(128, 'رمز عبور طولانی‌تر از حد مجاز است.'),
})

export const POST = publicRoute(
  async ({ req }) => {
    const { name, email, password } = await parseBody(req, registerSchema)

    const existing = await db.user.findUnique({ where: { email } })
    if (existing) throw new ApiError(409, 'با این ایمیل قبلاً حساب ساخته شده است.')

    let user
    try {
      user = await db.user.create({
        data: {
          name,
          email,
          passwordHash: await hashPassword(password),
          settings: { create: {} }, // defaults from schema
        },
        include: { settings: true },
      })
    } catch (e) {
      // two concurrent registrations for the same email → unique constraint
      if ((e as { code?: string })?.code === 'P2002') {
        throw new ApiError(409, 'با این ایمیل قبلاً حساب ساخته شده است.')
      }
      throw e
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
