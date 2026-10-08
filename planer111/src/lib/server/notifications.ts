import { db } from '@/lib/db'
import { diffDays } from './api'
import { safeParse } from './serialize'

/**
 * Idempotent notification generation.
 * Scans tasks / exams / revisions and stores any newly-due items.
 * Dedupe key format: `${type}:${entityId}:${dateKey}` — unique in DB.
 */
export async function ensureDailyNotifications(userId: string, today: string): Promise<void> {
  const settings = await db.userSettings.findUnique({ where: { userId } })
  const pending: {
    type: string
    title: string
    body?: string
    link?: string
    dedupeKey: string
  }[] = []

  // ── Tasks due today or overdue ──
  if (!settings || settings.notifyTasks) {
    const tasks = await db.task.findMany({
      where: {
        userId,
        status: { not: 'COMPLETED' },
        dueDate: { not: null, lte: today },
      },
      include: { subject: true },
      take: 30,
    })
    for (const t of tasks) {
      const overdue = t.dueDate! < today
      pending.push({
        type: 'TASK',
        title: overdue ? `کار عقب‌افتاده: ${t.title}` : `کار امروز: ${t.title}`,
        body: t.subject ? `درس ${t.subject.name}` : 'زمان انجام این کار رسیده است.',
        link: '#/tasks',
        dedupeKey: `TASK:${t.id}:${today}:${overdue ? 'over' : 'due'}`,
      })
    }
  }

  // ── Exams within 7 days ──
  if (!settings || settings.notifyExams) {
    const exams = await db.exam.findMany({
      where: { userId, date: { gte: today } },
      include: { subject: true },
    })
    for (const e of exams) {
      const days = diffDays(today, e.date)
      if (days <= 7) {
        pending.push({
          type: 'EXAM',
          title: days === 0 ? `امتحان «${e.title}» امروز است!` : `امتحان ${e.title} ${days === 1 ? 'فردا' : `${toFa(days)} روز`} دیگر است.`,
          body: e.subject ? `درس ${e.subject.name}` : undefined,
          link: '#/exams',
          dedupeKey: `EXAM:${e.id}:${today}`,
        })
      }
    }
  }

  // ── Revisions due today ──
  if (!settings || settings.notifyRevisions) {
    const revisions = await db.revision.findMany({
      where: { userId, status: 'PENDING', dueDate: { lte: today } },
      include: { topic: true, subject: true },
      take: 30,
    })
    for (const r of revisions) {
      pending.push({
        type: 'REVISION',
        title: `مرور «${r.topic.title}» ${r.dueDate < today ? 'عقب افتاده است' : 'امروز است'}.`,
        body: r.subject ? `درس ${r.subject.name} — دورهٔ مرور شمارهٔ ${toFa(r.revisionNumber)}` : undefined,
        link: '#/revisions',
        dedupeKey: `REVISION:${r.id}:${today}`,
      })
    }
  }

  if (pending.length === 0) return

  // dedupe against existing keys (skipDuplicates is unsupported on SQLite)
  const keys = pending.map((p) => p.dedupeKey)
  const existingKeys = new Set(
    (await db.notification.findMany({ where: { userId, dedupeKey: { in: keys } }, select: { dedupeKey: true } })).map(
      (n) => n.dedupeKey
    )
  )
  const fresh = pending.filter((p) => !existingKeys.has(p.dedupeKey))
  if (fresh.length === 0) return

  try {
    await db.notification.createMany({
      data: fresh.map((p) => ({
        userId,
        type: p.type,
        title: p.title,
        body: p.body ?? null,
        link: p.link ?? null,
        dedupeKey: p.dedupeKey,
      })),
    })
  } catch {
    // a parallel request may have inserted the same dedupeKeys — safe to ignore
  }
}

function toFa(n: number): string {
  return n.toString().replace(/\d/g, (d) => '۰۱۲۳۴۵۶۷۸۹'[parseInt(d)])
}
