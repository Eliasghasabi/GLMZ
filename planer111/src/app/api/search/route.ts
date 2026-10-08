import { db } from '@/lib/db'
import { authRoute } from '@/lib/server/session'

export const dynamic = 'force-dynamic'

/** Global search across subjects, topics, tasks, notes and exams (command palette). */
export const GET = authRoute(async ({ req, user }) => {
  const q = (req.nextUrl.searchParams.get('q') ?? '').trim()
  if (q.length < 2) return { results: [] }
  const query = q

  const [subjects, topics, tasks, notes, exams] = await Promise.all([
    db.subject.findMany({
      where: { userId: user.id, OR: [{ name: { contains: query } }, { description: { contains: query } }] },
      take: 5,
      select: { id: true, name: true, icon: true, color: true },
    }),
    db.topic.findMany({
      where: { userId: user.id, title: { contains: query } },
      take: 6,
      select: { id: true, title: true, subjectId: true, subject: { select: { name: true, icon: true } } },
    }),
    db.task.findMany({
      where: { userId: user.id, title: { contains: query } },
      take: 6,
      select: { id: true, title: true, status: true, priority: true },
    }),
    db.note.findMany({
      where: { userId: user.id, OR: [{ title: { contains: query } }, { content: { contains: query } }] },
      take: 6,
      select: { id: true, title: true, pinned: true },
    }),
    db.exam.findMany({
      where: { userId: user.id, title: { contains: query } },
      take: 5,
      select: { id: true, title: true, date: true },
    }),
  ])

  return {
    results: [
      ...subjects.map((s) => ({ type: 'subject' as const, id: s.id, title: s.name, meta: s.icon, href: `#/subjects/${s.id}` })),
      ...topics.map((t) => ({ type: 'topic' as const, id: t.id, title: t.title, meta: t.subject?.name, href: `#/subjects/${t.subjectId}` })),
      ...tasks.map((t) => ({ type: 'task' as const, id: t.id, title: t.title, meta: t.status === 'COMPLETED' ? 'انجام شده' : 'کار', href: '#/tasks' })),
      ...notes.map((n) => ({ type: 'note' as const, id: n.id, title: n.title, meta: 'یادداشت', href: `#/notes?note=${n.id}` })),
      ...exams.map((e) => ({ type: 'exam' as const, id: e.id, title: e.title, meta: `امتحان — ${e.date}`, href: '#/exams' })),
    ],
  }
})
