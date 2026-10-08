import { z } from 'zod'
import { db } from '@/lib/db'
import { ApiError, assertOwnedRefs, parseBody } from '@/lib/server/api'
import { authRoute } from '@/lib/server/session'
import { serializeNote } from '@/lib/server/serialize'

export const dynamic = 'force-dynamic'

type Ctx = { params: Promise<{ id: string }> }

async function getOwned(userId: string, id: string) {
  const note = await db.note.findFirst({ where: { id, userId } })
  if (!note) throw new ApiError(404, 'یادداشت یافت نشد یا به شما تعلق ندارد.')
  return note
}

const updateSchema = z.object({
  title: z.string().trim().min(1).max(140).optional(),
  content: z.string().max(50_000).optional(),
  subjectId: z.string().nullable().optional(),
  topicId: z.string().nullable().optional(),
  tags: z.array(z.string().trim().min(1).max(24)).max(8).optional(),
  pinned: z.boolean().optional(),
})

export const PATCH = authRoute<{ id: string }>(async ({ req, user, params }) => {
  await getOwned(user.id, params.id)
  const data = await parseBody(req, updateSchema)
  await assertOwnedRefs(user.id, data)
  const { tags, ...rest } = data
  const note = await db.note.update({
    where: { id: params.id },
    data: {
      ...rest,
      ...(tags ? { tags: JSON.stringify(tags) } : {}),
      ...(data.subjectId !== undefined ? { subjectId: data.subjectId || null } : {}),
    },
    include: { subject: { select: { id: true, name: true, color: true, icon: true } } },
  })
  return { note: serializeNote(note) }
})

export const DELETE = authRoute<{ id: string }>(async ({ user, params }) => {
  await getOwned(user.id, params.id)
  await db.note.delete({ where: { id: params.id } })
  return { ok: true }
})
