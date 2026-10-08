import { z } from 'zod'
import { db } from '@/lib/db'
import { parseBody } from '@/lib/server/api'
import { authRoute } from '@/lib/server/session'
import { reschedulePendingRevisions } from '@/lib/server/revisions'
import { serializeSettings } from '@/lib/server/serialize'

export const dynamic = 'force-dynamic'

export const GET = authRoute(async ({ user }) => {
  return { settings: user.settings ? serializeSettings(user.settings) : null }
})

const schema = z.object({
  theme: z.enum(['light', 'dark', 'system']).optional(),
  language: z.enum(['fa', 'en']).optional(),
  pomodoroFocus: z.number().int().min(5, 'حداقل ۵ دقیقه').max(120).optional(),
  pomodoroBreak: z.number().int().min(1).max(60).optional(),
  pomodoroLongBreak: z.number().int().min(5).max(90).optional(),
  pomodorosUntilLongBreak: z.number().int().min(2).max(10).optional(),
  revisionIntervals: z
    .array(z.number().int().min(1, 'فاصله‌ها باید حداقل ۱ روز باشند.').max(365))
    .min(1, 'حداقل یک فاصله لازم است.')
    .max(8, 'حداکثر ۸ فاصله مجاز است.')
    .optional(),
  dailyGoalMinutes: z.number().int().min(10).max(960).optional(),
  preferredSessionMinutes: z.number().int().min(15).max(240).optional(),
  notifyTasks: z.boolean().optional(),
  notifyExams: z.boolean().optional(),
  notifyRevisions: z.boolean().optional(),
  notifyStudy: z.boolean().optional(),
})

export const PATCH = authRoute(async ({ req, user }) => {
  const data = await parseBody(req, schema)
  const { revisionIntervals, ...rest } = data
  const intervalsJson = revisionIntervals
    ? JSON.stringify(Array.from(new Set(revisionIntervals)).sort((a, b) => a - b))
    : undefined

  const updated = await db.userSettings.upsert({
    where: { userId: user.id },
    update: { ...rest, ...(intervalsJson ? { revisionIntervals: intervalsJson } : {}) },
    create: { userId: user.id, ...rest, ...(intervalsJson ? { revisionIntervals: intervalsJson } : {}) },
  })

  // keep future revision dates in sync when intervals change
  if (revisionIntervals) await reschedulePendingRevisions(user.id)

  return { settings: serializeSettings(updated) }
})
