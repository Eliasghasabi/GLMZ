import { z } from 'zod'
import { db } from '@/lib/db'
import { ApiError, parseBody } from '@/lib/server/api'
import { hashPassword, verifyPassword, sha256 } from '@/lib/server/password'
import { authRoute, SESSION_COOKIE } from '@/lib/server/session'

export const dynamic = 'force-dynamic'

const schema = z.object({
  currentPassword: z.string().min(1, 'رمز عبور فعلی را وارد کنید.'),
  newPassword: z.string().min(8, 'رمز جدید باید حداقل ۸ کاراکتر باشد.').max(128),
})

export const PATCH = authRoute(async ({ req, user }) => {
  const { currentPassword, newPassword } = await parseBody(req, schema)

  const full = await db.user.findUnique({ where: { id: user.id } })
  if (!full || !(await verifyPassword(currentPassword, full.passwordHash))) {
    throw new ApiError(400, 'رمز عبور فعلی اشتباه است.')
  }

  await db.user.update({ where: { id: user.id }, data: { passwordHash: await hashPassword(newPassword) } })

  // invalidate all other sessions (keep the current one)
  const currentToken = req.cookies.get(SESSION_COOKIE)?.value
  await db.session.deleteMany({
    where: {
      userId: user.id,
      ...(currentToken ? { tokenHash: { not: await sha256(currentToken) } } : {}),
    },
  })

  return { ok: true }
})
