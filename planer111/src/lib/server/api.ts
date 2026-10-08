import { NextRequest } from 'next/server'
import { ZodError, type ZodType } from 'zod'

// ─────────────────────────── Errors & responses ───────────────────────────

export class ApiError extends Error {
  status: number
  details?: unknown
  constructor(status: number, message: string, details?: unknown) {
    super(message)
    this.status = status
    this.details = details
  }
}

export function jsonOk(data: unknown = { ok: true }) {
  return Response.json(data)
}

export function errorResponse(err: unknown) {
  if (err instanceof ApiError) {
    return Response.json({ error: err.message, details: err.details }, { status: err.status })
  }
  if (err instanceof ZodError) {
    const first = err.issues[0]
    return Response.json(
      { error: first?.message || 'داده‌های ارسالی نامعتبر است.', details: err.issues },
      { status: 400 }
    )
  }
  console.error('[api]', err)
  return Response.json({ error: 'خطای غیرمنتظره در سرور رخ داد. لطفاً دوباره تلاش کنید.' }, { status: 500 })
}

// ─────────────────────────── Validation ───────────────────────────

export async function parseBody<T>(req: NextRequest, schema: ZodType<T>): Promise<T> {
  let raw: unknown
  try {
    raw = await req.json()
  } catch {
    throw new ApiError(400, 'بدنه درخواست باید JSON معتبر باشد.')
  }
  return schema.parse(raw)
}

export function parseQuery<T>(req: NextRequest, schema: ZodType<T>): T {
  const obj: Record<string, string> = {}
  req.nextUrl.searchParams.forEach((v, k) => {
    obj[k] = v
  })
  return schema.parse(obj)
}

// ─────────────────────────── CSRF (same-origin for mutations) ───────────────────────────

const MUTATION_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE'])

/**
 * Custom header set by the StudyFlow SPA on every request.
 *
 * A cross-site page cannot attach a custom request header without a successful
 * CORS preflight — and this API never returns permissive CORS headers — so its
 * presence is itself a solid CSRF signal (OWASP: verifying custom request
 * headers), layered on top of SameSite=Lax session cookies.
 */
export const CLIENT_HEADER = 'x-requested-with'
export const CLIENT_HEADER_VALUE = 'StudyFlow'

/**
 * Hosts this API legitimately serves for. Includes:
 * - the received Host header,
 * - X-Forwarded-Host (set by Cloudflare / gateways / reverse proxies that
 *   rewrite the public host — without this, same-origin checks behind a proxy
 *   wrongly reject the app's own frontend),
 * - an optional explicit allowlist via TRUSTED_ORIGINS env
 *   (comma-separated, e.g. "https://studyflow.example.com,https://preview-123.space-z.ai").
 */
function allowedHosts(req: NextRequest): Set<string> {
  const hosts = new Set<string>()
  const add = (v: string | undefined | null) => {
    if (!v) return
    const h = v.trim().toLowerCase()
    if (h) hosts.add(h)
  }
  add(req.headers.get('host'))
  for (const part of req.headers.get('x-forwarded-host')?.split(',') ?? []) add(part)
  for (const part of (process.env.TRUSTED_ORIGINS ?? '').split(',')) {
    // allow full origins ("https://x.com") or bare hosts ("x.com")
    add(part.trim().replace(/^https?:\/\//, '').replace(/\/+$/, ''))
  }
  return hosts
}

export function assertSameOrigin(req: NextRequest) {
  if (!MUTATION_METHODS.has(req.method)) return
  const origin = req.headers.get('origin')
  if (!origin) return // non-browser clients / same-origin fetches without Origin header

  let originHost: string
  try {
    originHost = new URL(origin).host.toLowerCase()
  } catch {
    throw new ApiError(403, 'مبدا درخواست نامعتبر است.')
  }

  // 1) Origin must match the host the server (or its proxy chain) received.
  if (originHost && allowedHosts(req).has(originHost)) return

  // 2) Fallback for proxies that strip/rewrite host headers: our own SPA always
  //    signs requests with the custom header above, which cross-site pages
  //    cannot forge (no CORS preflight is ever granted).
  if (req.headers.get(CLIENT_HEADER) === CLIENT_HEADER_VALUE) return

  throw new ApiError(403, 'درخواست بین‌دامنه‌ای مجاز نیست.')
}

// ─────────────────────────── Rate limiting (in-memory; use CF WAF rules in production) ───────────────────────────

type Bucket = { count: number; resetAt: number }
const buckets = new Map<string, Bucket>()

let lastSweep = Date.now()
function sweep(now: number) {
  if (now - lastSweep < 60_000) return
  lastSweep = now
  for (const [k, b] of buckets) if (b.resetAt < now) buckets.delete(k)
}

export function rateLimit(key: string, max: number, windowMs: number) {
  const now = Date.now()
  sweep(now)
  const b = buckets.get(key)
  if (!b || b.resetAt < now) {
    buckets.set(key, { count: 1, resetAt: now + windowMs })
    return
  }
  b.count += 1
  if (b.count > max) {
    const seconds = Math.max(1, Math.ceil((b.resetAt - now) / 1000))
    throw new ApiError(429, `تعداد درخواست‌ها زیاد است. لطفاً ${seconds} ثانیه دیگر تلاش کنید.`)
  }
}

export function clientIp(req: NextRequest): string {
  return (
    req.headers.get('cf-connecting-ip') ||
    req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
    'local'
  )
}

// ─────────────────────────── Dates ───────────────────────────

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/

/** Today in the user's timezone — the client sends its local date; fallback = server UTC date. */
export function getToday(req: NextRequest): string {
  const q = req.nextUrl.searchParams.get('today')
  const h = req.headers.get('x-today')
  const candidate = (q || h || '').trim()
  if (candidate && DATE_RE.test(candidate)) return candidate
  return new Date().toISOString().slice(0, 10)
}

export function todayUtc(): string {
  return new Date().toISOString().slice(0, 10)
}

export function addDays(date: string, days: number): string {
  const d = new Date(date + 'T00:00:00Z')
  d.setUTCDate(d.getUTCDate() + days)
  return d.toISOString().slice(0, 10)
}

export function diffDays(from: string, to: string): number {
  const a = new Date(from + 'T00:00:00Z').getTime()
  const b = new Date(to + 'T00:00:00Z').getTime()
  return Math.round((b - a) / 86_400_000)
}

/** Day-of-week index where 0 = Saturday … 6 = Friday (Persian week). */
export function persianDayIndex(date: string): number {
  const d = new Date(date + 'T00:00:00Z').getUTCDay() // 0=Sun..6=Sat
  return (d + 1) % 7
}

// ─────────────────────────── Cross-user write guard ───────────────────────────

import { db } from '@/lib/db'

/**
 * Ensures referenced subject/topic records belong to the authenticated user.
 * Applied on every write path that accepts subjectId/topicId — prevents
 * attaching another user's records (IDOR-write) even though reads are always
 * filtered by userId.
 */
export async function assertOwnedRefs(
  userId: string,
  refs: { subjectId?: string | null; topicId?: string | null }
): Promise<void> {
  if (refs.subjectId) {
    const subject = await db.subject.findFirst({ where: { id: refs.subjectId, userId } })
    if (!subject) throw new ApiError(404, 'درس انتخاب‌شده یافت نشد.')
  }
  if (refs.topicId) {
    const topic = await db.topic.findFirst({ where: { id: refs.topicId, userId } })
    if (!topic) throw new ApiError(404, 'مبحث انتخاب‌شده یافت نشد.')
  }
}
