import type { Exam, Goal, Note, Revision, Task, UserSettings } from '@prisma/client'

/** Deserialize JSON string columns before sending to the client. */
export function serializeTask<T extends Task>(t: T) {
  return { ...t, tags: safeParse<string[]>(t.tags, []) }
}

export function serializeExam<T extends Exam>(e: T) {
  return { ...e, topics: safeParse<string[]>(e.topics, []) }
}

export function serializeNote<T extends Note>(n: T) {
  return { ...n, tags: safeParse<string[]>(n.tags, []) }
}

export function serializeSettings<T extends UserSettings>(s: T) {
  return { ...s, revisionIntervals: safeParse<number[]>(s.revisionIntervals, [1, 3, 7, 14, 30]) }
}

export function serializeRevision<T extends Revision>(r: T) {
  return r
}

export function serializeGoal<T extends Goal>(g: T) {
  return g
}

export function safeParse<T>(value: string | null | undefined, fallback: T): T {
  if (!value) return fallback
  try {
    const parsed = JSON.parse(value)
    return (parsed ?? fallback) as T
  } catch {
    return fallback
  }
}
