import { db } from '@/lib/db'
import { addDays, persianDayIndex } from '@/lib/server/api'

/**
 * Shared demo dataset seeding.
 *
 * Used by:
 *  - POST /api/seed        (explicit "load sample data" action)
 *  - POST /api/auth/guest  (first-time creation of the shared guest account
 *                           on a fresh deployment, so the app opens complete)
 *
 * All records are flagged isDemo: true — DELETE /api/seed removes exactly
 * these records and leaves user-created data untouched.
 */

const COLORS = {
  indigo: '#6366F1',
  violet: '#8B5CF6',
  emerald: '#10B981',
  amber: '#F59E0B',
  rose: '#F43F5E',
  sky: '#0EA5E9',
}

export async function seedForUser(userId: string, today: string) {
  const existing = await db.subject.count({ where: { userId, isDemo: true } })
  if (existing > 0) throw new Error('دادهٔ نمونه از قبل بارگذاری شده است.')

  // ── Subjects ──
  const prog = await db.subject.create({ data: { userId, isDemo: true, name: 'برنامه‌سازی', icon: '💻', color: COLORS.indigo, description: 'جاوااسکریپت، الگوریتم و ساخت پروژه‌های واقعی', teacher: 'مهندس کریمی', totalChapters: 8 } })
  const net = await db.subject.create({ data: { userId, isDemo: true, name: 'شبکه', icon: '🌐', color: COLORS.sky, description: 'مفاهیم شبکه، TCP/IP و زیرساخت', teacher: 'مهندس موسوی', totalChapters: 6 } })
  const eng = await db.subject.create({ data: { userId, isDemo: true, name: 'انگلیسی', icon: '🇬🇧', color: COLORS.violet, description: 'گرامر، لغت و مکالمه — هدف: آیلتس ۷', teacher: 'استاد رضایی', totalChapters: 12 } })
  const math = await db.subject.create({ data: { userId, isDemo: true, name: 'ریاضی', icon: '📐', color: COLORS.amber, description: 'حساب دیفرانسیل و انتگرال', teacher: 'استاد احمدی', totalChapters: 10 } })
  const content = await db.subject.create({ data: { userId, isDemo: true, name: 'تولید محتوا', icon: '🎬', color: COLORS.rose, description: 'تدوین، سناریونویسی و استراتژی شبکه‌های اجتماعی', totalChapters: 5 } })

  // ── Topics (some completed → revisions, some in progress) ──
  const topicsData = [
    { subjectId: prog.id, title: 'متغیرها و انواع داده', chapterLabel: 'فصل ۱', status: 'COMPLETED', difficulty: 'EASY', estimatedMinutes: 60, actualMinutes: 75 },
    { subjectId: prog.id, title: 'شرط‌ها و حلقه‌ها', chapterLabel: 'فصل ۲', status: 'COMPLETED', difficulty: 'MEDIUM', estimatedMinutes: 90, actualMinutes: 110 },
    { subjectId: prog.id, title: 'توابع و آبجکت‌ها', chapterLabel: 'فصل ۳', status: 'IN_PROGRESS', difficulty: 'MEDIUM', estimatedMinutes: 120, actualMinutes: 40 },
    { subjectId: prog.id, title: 'آرایه‌ها و متدهای پیشرفته', chapterLabel: 'فصل ۴', status: 'NOT_STARTED', difficulty: 'HARD', estimatedMinutes: 150 },
    { subjectId: net.id, title: 'مدل OSI و TCP/IP', chapterLabel: 'فصل ۱', status: 'COMPLETED', difficulty: 'MEDIUM', estimatedMinutes: 80, actualMinutes: 95 },
    { subjectId: net.id, title: 'آدرس‌دهی IP و ساب‌نتینگ', chapterLabel: 'فصل ۲', status: 'IN_PROGRESS', difficulty: 'HARD', estimatedMinutes: 120, actualMinutes: 30 },
    { subjectId: net.id, title: 'پروتکل‌های مسیریابی', chapterLabel: 'فصل ۳', status: 'NOT_STARTED', difficulty: 'HARD', estimatedMinutes: 100 },
    { subjectId: eng.id, title: 'گرامر: زمان‌های حال', chapterLabel: 'Lesson 2', status: 'COMPLETED', difficulty: 'EASY', estimatedMinutes: 45, actualMinutes: 50 },
    { subjectId: eng.id, title: 'لغات اساسی — مجموعه ۳', chapterLabel: 'Lesson 3', status: 'COMPLETED', difficulty: 'EASY', estimatedMinutes: 40, actualMinutes: 45 },
    { subjectId: eng.id, title: 'Writing — Paragraph Structure', chapterLabel: 'Lesson 4', status: 'IN_PROGRESS', difficulty: 'MEDIUM', estimatedMinutes: 60, actualMinutes: 20 },
    { subjectId: math.id, title: 'حد و پیوستگی', chapterLabel: 'فصل ۲', status: 'COMPLETED', difficulty: 'MEDIUM', estimatedMinutes: 90, actualMinutes: 100 },
    { subjectId: math.id, title: 'مشتق و کاربردها', chapterLabel: 'فصل ۳', status: 'NOT_STARTED', difficulty: 'HARD', estimatedMinutes: 140 },
    { subjectId: content.id, title: 'اصول سناریونویسی', chapterLabel: 'فصل ۱', status: 'COMPLETED', difficulty: 'EASY', estimatedMinutes: 50, actualMinutes: 55 },
    { subjectId: content.id, title: 'تدوین با Premiere', chapterLabel: 'فصل ۲', status: 'IN_PROGRESS', difficulty: 'MEDIUM', estimatedMinutes: 90, actualMinutes: 25 },
  ]

  for (const t of topicsData) {
    await db.topic.create({
      data: {
        userId,
        isDemo: true,
        subjectId: t.subjectId,
        title: t.title,
        chapterLabel: t.chapterLabel,
        status: t.status,
        difficulty: t.difficulty,
        estimatedMinutes: t.estimatedMinutes ?? null,
        actualMinutes: t.actualMinutes ?? 0,
        completedAt: t.status === 'COMPLETED' ? new Date(addDays(today, -7) + 'T10:00:00Z') : null,
      },
    })
  }

  // ── Revisions for completed topics (some due today/overdue/upcoming) ──
  const completedTopics = await db.topic.findMany({ where: { userId, subjectId: { in: [prog.id, net.id, eng.id, math.id, content.id] }, status: 'COMPLETED' } })
  const intervals = [1, 3, 7, 14, 30]
  for (const topic of completedTopics) {
    const base = addDays(today, -7)
    for (let i = 0; i < intervals.length; i++) {
      const due = addDays(base, intervals[i])
      await db.revision.create({
        data: {
          userId, isDemo: true, topicId: topic.id, subjectId: topic.subjectId,
          revisionNumber: i + 1, dueDate: due,
          status: due < today ? 'COMPLETED' : 'PENDING',
          completedAt: due < today ? new Date(due + 'T12:00:00Z') : null,
        },
      })
    }
  }
  // one overdue + one due-today pending revision for realism
  const progTopic = await db.topic.findFirst({ where: { userId, title: 'متغیرها و انواع داده' } })
  if (progTopic) {
    await db.revision.create({ data: { userId, isDemo: true, topicId: progTopic.id, subjectId: prog.id, revisionNumber: 6, dueDate: addDays(today, -1), status: 'PENDING' } })
  }
  const netTopic = await db.topic.findFirst({ where: { userId, title: 'مدل OSI و TCP/IP' } })
  if (netTopic) {
    await db.revision.create({ data: { userId, isDemo: true, topicId: netTopic.id, subjectId: net.id, revisionNumber: 6, dueDate: today, status: 'PENDING' } })
  }

  // ── Tasks ──
  const tasksData = [
    { title: 'حل تمرین‌های فصل ۲ ریاضی', subjectId: math.id, dueDate: today, priority: 'HIGH', estimatedMinutes: 60, tags: ['تمرین'] },
    { title: 'تمرین مکالمه انگلیسی — ۲۰ دقیقه', subjectId: eng.id, dueDate: today, priority: 'MEDIUM', estimatedMinutes: 20, tags: ['مکالمه'] },
    { title: 'پایان پروژهٔ تمرینی جاوااسکریپت', subjectId: prog.id, dueDate: addDays(today, 3), priority: 'URGENT', estimatedMinutes: 180, tags: ['پروژه'] },
    { title: 'خلاصه‌نویسی فصل ساب‌نتینگ', subjectId: net.id, dueDate: addDays(today, 1), priority: 'HIGH', estimatedMinutes: 45, tags: ['خلاصه'] },
    { title: 'تهیهٔ سناریو برای ویدیوی جدید', subjectId: content.id, dueDate: addDays(today, 5), priority: 'LOW', estimatedMinutes: 90, tags: ['ویدیو'] },
    { title: 'مرور لغات روزهای قبل', subjectId: eng.id, dueDate: addDays(today, -1), priority: 'MEDIUM', estimatedMinutes: 15, tags: ['لغت'] },
    { title: 'یادآوری: ثبت‌نام در آزمون آزمایشی', subjectId: null, dueDate: addDays(today, 7), priority: 'MEDIUM', estimatedMinutes: 10, tags: ['اداری'], status: 'TODO' },
  ]
  for (const t of tasksData) {
    await db.task.create({
      data: { userId, isDemo: true, title: t.title, subjectId: t.subjectId, dueDate: t.dueDate, priority: t.priority, estimatedMinutes: t.estimatedMinutes ?? null, tags: JSON.stringify(t.tags), status: t.status ?? 'TODO' },
    })
  }
  // a couple of completed tasks for stats
  await db.task.create({ data: { userId, isDemo: true, title: 'تمرین‌های فصل ۱ برنامه‌سازی', subjectId: prog.id, priority: 'MEDIUM', dueDate: addDays(today, -3), status: 'COMPLETED', completedAt: new Date(addDays(today, -3) + 'T18:00:00Z'), tags: '["تمرین"]' } })
  await db.task.create({ data: { userId, isDemo: true, title: 'خواندن مقالهٔ شبکه', subjectId: net.id, priority: 'LOW', dueDate: addDays(today, -2), status: 'COMPLETED', completedAt: new Date(addDays(today, -2) + 'T20:00:00Z'), tags: '[]' } })

  // ── Weekly blocks (Sat..Wed evening study plan) ──
  const blocksData = [
    { subjectId: prog.id, dayOfWeek: 0, startTime: '16:00', endTime: '18:00', title: 'تمرین برنامه‌نویسی' },
    { subjectId: math.id, dayOfWeek: 0, startTime: '20:00', endTime: '21:30', title: 'ریاضی — تمرین' },
    { subjectId: eng.id, dayOfWeek: 1, startTime: '09:00', endTime: '10:30', title: 'انگلیسی — لغت و گرامر' },
    { subjectId: net.id, dayOfWeek: 1, startTime: '16:00', endTime: '17:30', title: 'شبکه — مطالعه' },
    { subjectId: prog.id, dayOfWeek: 2, startTime: '16:00', endTime: '18:30', title: 'پروژهٔ جاوااسکریپت' },
    { subjectId: eng.id, dayOfWeek: 3, startTime: '09:00', endTime: '10:00', title: 'لغات روزانه' },
    { subjectId: math.id, dayOfWeek: 3, startTime: '17:00', endTime: '18:30', title: 'ریاضی — مشتق' },
    { subjectId: net.id, dayOfWeek: 4, startTime: '16:00', endTime: '17:30', title: 'شبکه — تمرین ساب‌نتینگ' },
    { subjectId: content.id, dayOfWeek: 4, startTime: '20:00', endTime: '21:00', title: 'تدوین ویدیو' },
  ]
  for (const b of blocksData) {
    await db.studyBlock.create({
      data: { userId, isDemo: true, subjectId: b.subjectId, title: b.title, dayOfWeek: b.dayOfWeek, startTime: b.startTime, endTime: b.endTime, color: null },
    })
  }

  // ── Study sessions for the last 30 days (charts + streak) ──
  const pattern = [
    { subjectId: prog.id, s: '16:00', e: '17:40', m: 100 },
    { subjectId: eng.id, s: '09:00', e: '09:45', m: 45 },
    { subjectId: net.id, s: '17:00', e: '18:20', m: 80 },
    { subjectId: math.id, s: '20:00', e: '21:10', m: 70 },
    { subjectId: content.id, s: '15:00', e: '15:50', m: 50 },
  ]
  for (let d = 29; d >= 1; d--) {
    const date = addDays(today, -d)
    const dow = persianDayIndex(date)
    if (dow === 6) continue // Friday off
    // deterministic pseudo-random: skip ~20% of days
    if ((d * 7) % 9 === 0 && d > 5) continue
    const picks = [pattern[d % pattern.length], pattern[(d + 2) % pattern.length]]
    for (const p of picks) {
      await db.studySession.create({
        data: {
          userId, isDemo: true, subjectId: p.subjectId, date,
          startTime: p.s, endTime: p.e, durationMinutes: p.m,
          source: d % 3 === 0 ? 'POMODORO' : 'MANUAL', completed: true,
        },
      })
    }
  }
  // today's session
  await db.studySession.create({
    data: { userId, isDemo: true, subjectId: prog.id, date: today, startTime: '09:00', endTime: '10:15', durationMinutes: 75, source: 'POMODORO', completed: true },
  })

  // ── Pomodoro log ──
  await db.pomodoroSession.create({ data: { userId, isDemo: true, subjectId: prog.id, minutes: 75, type: 'FOCUS', completedAt: new Date(today + 'T10:15:00Z') } })

  // ── Exams ──
  await db.exam.create({ data: { userId, isDemo: true, title: 'امتحان میان‌ترم انگلیسی', subjectId: eng.id, date: addDays(today, 12), time: '10:00', location: 'سالن ۳', topics: JSON.stringify(['Lesson 1-4', 'Writing', 'لغات مجموعه ۱ تا ۳']), notes: 'تمرکز روی Writing', progressPercent: 40 } })
  await db.exam.create({ data: { userId, isDemo: true, title: 'آزمون شبکه — فصل ۱ و ۲', subjectId: net.id, date: addDays(today, 4), time: '14:00', location: 'آنلاین', topics: JSON.stringify(['OSI', 'TCP/IP', 'ساب‌نتینگ']), progressPercent: 65 } })
  await db.exam.create({ data: { userId, isDemo: true, title: 'کوییز ریاضی', subjectId: math.id, date: addDays(today, 1), time: '08:00', topics: JSON.stringify(['حد', 'پیوستگی']), progressPercent: 80 } })

  // ── Goals ──
  await db.goal.create({ data: { userId, isDemo: true, title: '۲۰ ساعت مطالعه در این هفته', targetValue: 20, currentValue: 12.5, unit: 'ساعت', deadline: addDays(today, 3) } })
  await db.goal.create({ data: { userId, isDemo: true, title: 'اتمام فصل ۴ برنامه‌سازی', targetValue: 4, currentValue: 3, unit: 'فصل', deadline: addDays(today, 10) } })
  await db.goal.create({ data: { userId, isDemo: true, title: 'اتمام ۵ درس انگلیسی', targetValue: 5, currentValue: 5, unit: 'درس', status: 'COMPLETED', deadline: addDays(today, -1) } })

  // ── Notes ──
  await db.note.create({ data: { userId, isDemo: true, title: 'نکات مهم ساب‌نتینگ', content: 'فرمول سریع:\n• تعداد زیرشبکه = ۲^n (n بیت قرض‌گرفته)\n• تعداد هاست = ۲^h − ۲\n• ماسک /26 یعنی 64 آدرس، 62 هاست\n\nحتماً ۱۰ تمرین حل شود.', subjectId: net.id, tags: JSON.stringify(['شبکه', 'خلاصه']), pinned: true } })
  await db.note.create({ data: { userId, isDemo: true, title: 'برنامهٔ آمادگی آیلتس', content: '۱. هر روز ۲۰ دقیقه لیسنینگ پادکست\n۲. هفته‌ای دو رایتینگ Task 2\n۳. لغات: روزی ۱۵ لغت جدید + مرور\n۴. اسپیکینگ با تایمر در پایان هفته', subjectId: eng.id, tags: JSON.stringify(['آیلتس', 'برنامه']), pinned: false } })
  await db.note.create({ data: { userId, isDemo: true, title: 'ایده‌های محتوایی هفته', content: '— ویدیو: ۵ اشتباه رایج جاوااسکریپت\n— ریلز: ترفند تدوین Transition\n— پست: چک‌لیست مطالعه امتحان', subjectId: content.id, tags: JSON.stringify(['ایده']), pinned: false } })
}
