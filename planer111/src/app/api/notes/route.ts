import { z } from 'zod'
import { db } from '@/lib/db'
import { ApiError, assertOwnedRefs, parseBody } from '@/lib/server/api'
import { authRoute } from '@/lib/server/session'
import { serializeNote } from '@/lib/server/serialize'

export const dynamic = 'force-dynamic'

export const GET = authRoute(async ({ req, user }) => {
  const q = (req.nextUrl.searchParams.get('q') ?? '').trim()
  const subjectId = req.nextUrl.searchParams.get('subjectId')

  const notes = await db.note.findMany({
    where: {
      userId: user.id,
      ...(subjectId ? { subjectId } : {}),
      ...(q
        ? {
            OR: [{ title: { contains: q } }, { content: { contains: q } }],
          }
        : {}),
    },
    orderBy: [{ pinned: 'desc' }, { updatedAt: 'desc' }],
    include: { subject: { select: { id: true, name: true, color: true, icon: true } } },
  })
  return { notes: notes.map(serializeNote) }
})

const createSchema = z.object({
  title: z.string().trim().min(1, 'عنوان یادداشت را وارد کنید.').max(140),
  content: z.string().max(50_000, 'متن یادداشت طولانی‌تر از حد مجاز است.').default(''),
  subjectId: z.string().optional().nullable(),
  topicId: z.string().optional().nullable(),
  tags: z.array(z.string().trim().min(1).max(24)).max(8).default([]),
  pinned: z.boolean().default(false),
})

export const POST = authRoute(async ({ req, user }) => {
  const data = await parseBody(req, createSchema)
  await assertOwnedRefs(user.id, data)
  const note = await db.note.create({
    data: {
      userId: user.id,
      title: data.title,
      content: data.content,
      subjectId: data.subjectId || null,
      topicId: data.topicId || null,
      tags: JSON.stringify(data.tags),
      pinned: data.pinned,
    },
    include: { subject: { select: { id: true, name: true, color: true, icon: true } } },
  })
  return { note: serializeNote(note) }
})
