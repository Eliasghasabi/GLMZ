import { db } from '@/lib/db'
import { authRoute } from '@/lib/server/session'
import { safeParse, serializeExam, serializeNote, serializeSettings, serializeTask } from '@/lib/server/serialize'

export const dynamic = 'force-dynamic'

/** Full data export (JSON) — every record belongs exclusively to the authenticated user. */
export const GET = authRoute(async ({ user }) => {
  const [subjects, topics, tasks, blocks, sessions, pomodoros, revisions, exams, goals, notes, settings] =
    await Promise.all([
      db.subject.findMany({ where: { userId: user.id }, orderBy: { createdAt: 'asc' } }),
      db.topic.findMany({ where: { userId: user.id }, orderBy: { createdAt: 'asc' } }),
      db.task.findMany({ where: { userId: user.id }, orderBy: { createdAt: 'asc' } }),
      db.studyBlock.findMany({ where: { userId: user.id }, orderBy: { createdAt: 'asc' } }),
      db.studySession.findMany({ where: { userId: user.id }, orderBy: { date: 'asc' } }),
      db.pomodoroSession.findMany({ where: { userId: user.id }, orderBy: { completedAt: 'asc' } }),
      db.revision.findMany({ where: { userId: user.id }, orderBy: { dueDate: 'asc' } }),
      db.exam.findMany({ where: { userId: user.id }, orderBy: { date: 'asc' } }),
      db.goal.findMany({ where: { userId: user.id }, orderBy: { createdAt: 'asc' } }),
      db.note.findMany({ where: { userId: user.id }, orderBy: { updatedAt: 'asc' } }),
      db.userSettings.findUnique({ where: { userId: user.id } }),
    ])

  return {
    exportedAt: new Date().toISOString(),
    app: 'StudyFlow',
    version: 1,
    profile: {
      name: user.name,
      email: user.email,
      avatarEmoji: user.avatarEmoji,
      avatarColor: user.avatarColor,
      createdAt: user.createdAt,
    },
    settings: settings ? serializeSettings(settings) : null,
    subjects,
    topics,
    tasks: tasks.map(serializeTask),
    studyBlocks: blocks,
    studySessions: sessions,
    pomodoroSessions: pomodoros,
    revisions,
    exams: exams.map(serializeExam),
    goals,
    notes: notes.map((n) => ({ ...serializeNote(n), tags: safeParse<string[]>(n.tags, []) })),
  }
})
