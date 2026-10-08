import { db } from '@/lib/db'
import { getToday } from '@/lib/server/api'
import { seedForUser } from '@/lib/server/demo-seed'
import { authRoute } from '@/lib/server/session'

export const dynamic = 'force-dynamic'

/**
 * Demo data: POST seeds a rich sample dataset for the current user (flagged isDemo),
 * DELETE removes all demo data. Demo account: demo@studyflow.ir / demo12345
 */

export const POST = authRoute(
  async ({ req, user }) => {
    const today = getToday(req)
    await seedForUser(user.id, today)
    return { ok: true, message: 'دادهٔ نمونه با موفقیت بارگذاری شد.' }
  },
  { limit: 5 }
)

export const DELETE = authRoute(
  async ({ user }) => {
    // remove demo records — user-created data is untouched
    await db.note.deleteMany({ where: { userId: user.id, isDemo: true } })
    await db.goal.deleteMany({ where: { userId: user.id, isDemo: true } })
    await db.exam.deleteMany({ where: { userId: user.id, isDemo: true } })
    await db.pomodoroSession.deleteMany({ where: { userId: user.id, isDemo: true } })
    await db.studySession.deleteMany({ where: { userId: user.id, isDemo: true } })
    await db.studyBlock.deleteMany({ where: { userId: user.id, isDemo: true } })
    await db.task.deleteMany({ where: { userId: user.id, isDemo: true } })
    await db.revision.deleteMany({ where: { userId: user.id, isDemo: true } })
    await db.topic.deleteMany({ where: { userId: user.id, isDemo: true } })
    await db.subject.deleteMany({ where: { userId: user.id, isDemo: true } })
    await db.notification.deleteMany({ where: { userId: user.id } })
    return { ok: true, message: 'دادهٔ نمونه حذف شد.' }
  },
  { limit: 5 }
)
