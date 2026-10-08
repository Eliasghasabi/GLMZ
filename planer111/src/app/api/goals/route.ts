import { z } from 'zod'
import { db } from '@/lib/db'
import { parseBody } from '@/lib/server/api'
import { authRoute } from '@/lib/server/session'

export const dynamic = 'force-dynamic'

export const GET = authRoute(async ({ req, user }) => {
  const status = req.nextUrl.searchParams.get('status')
  const goals = await db.goal.findMany({
    where: { userId: user.id, ...(status ? { status } : {}) },
    orderBy: [{ status: 'asc' }, { createdAt: 'desc' }],
  })
  return { goals }
})

const createSchema = z.object({
  title: z.string().trim().min(1, 'عنوان هدف را وارد کنید.').max(120),
  targetValue: z.number().positive('مقدار هدف باید مثبت باشد.').max(1_000_000),
  unit: z.string().trim().min(1, 'واحد را وارد کنید (مثلاً ساعت، درس).').max(20),
  deadline: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().nullable(),
  currentValue: z.number().min(0).max(1_000_000).default(0),
})

export const POST = authRoute(async ({ req, user }) => {
  const data = await parseBody(req, createSchema)
  const goal = await db.goal.create({
    data: {
      userId: user.id,
      title: data.title,
      targetValue: data.targetValue,
      currentValue: Math.min(data.currentValue, data.targetValue),
      unit: data.unit,
      deadline: data.deadline || null,
    },
  })
  return { goal }
})
