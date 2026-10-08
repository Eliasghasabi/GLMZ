import { z } from 'zod'
import { db } from '@/lib/db'
import { parseBody } from '@/lib/server/api'
import { authRoute } from '@/lib/server/session'
import { serializeSettings } from '@/lib/server/serialize'

export const dynamic = 'force-dynamic'

/** Get current user + settings (also used as session check). */
export const GET = authRoute(async ({ user }) => {
  return { user: publicUser(user), settings: user.settings ? serializeSettings(user.settings) : null }
})

const updateSchema = z.object({
  name: z.string().trim().min(2, 'نام باید حداقل ۲ کاراکتر باشد.').max(60).optional(),
  avatarEmoji: z.string().trim().max(16).optional(), // complex emoji (ZWJ) exceed 8 UTF-16 units
  avatarColor: z.string().regex(/^#[0-9a-fA-F]{6}$/, 'رنگ نامعتبر است.').optional(),
  dailyGoalMinutes: z.number().int().min(10, 'حداقل ۱۰ دقیقه').max(960, 'حداکثر ۱۶ ساعت').optional(),
  preferredSessionMinutes: z.number().int().min(15, 'حداقل ۱۵ دقیقه').max(240, 'حداکثر ۴ ساعت').optional(),
})

/** Update profile (name/avatar on User; study goals on UserSettings). */
export const PATCH = authRoute(async ({ req, user }) => {
  const data = await parseBody(req, updateSchema)
  const { dailyGoalMinutes, preferredSessionMinutes, ...userFields } = data

  const updated = await db.user.update({
    where: { id: user.id },
    data: {
      ...userFields,
      ...(dailyGoalMinutes !== undefined || preferredSessionMinutes !== undefined
        ? {
            settings: {
              update: {
                ...(dailyGoalMinutes !== undefined ? { dailyGoalMinutes } : {}),
                ...(preferredSessionMinutes !== undefined ? { preferredSessionMinutes } : {}),
              },
            },
          }
        : {}),
    },
    include: { settings: true },
  })
  return { user: publicUser(updated), settings: updated.settings ? serializeSettings(updated.settings) : null }
})

function publicUser(u: {
    id: string; name: string; email: string; avatarEmoji: string; avatarColor: string; createdAt: Date
  }) {
  return {
    id: u.id,
    name: u.name,
    email: u.email,
    avatarEmoji: u.avatarEmoji,
    avatarColor: u.avatarColor,
    createdAt: u.createdAt,
  }
}
