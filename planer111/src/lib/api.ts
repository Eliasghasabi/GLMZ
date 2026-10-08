"use client"

import { todayIso } from "@/lib/jalali"

export class ApiClientError extends Error {
  status: number
  constructor(status: number, message: string) {
    super(message)
    this.status = status
  }
}

type Options = {
  method?: "GET" | "POST" | "PATCH" | "PUT" | "DELETE"
  body?: unknown
  /** skip the automatic ?today= parameter */
  noToday?: boolean
  signal?: AbortSignal
}

const AUTH_EXPIRED_EVENT = "studyflow:auth-expired"

/**
 * Thin fetch wrapper for the StudyFlow API.
 * - relative paths only
 * - attaches the browser-local date (?today=) so the server works in the user's timezone
 * - raises ApiClientError with the Persian server message
 * - dispatches auth-expired so the app can react to 401
 */
export async function api<T = unknown>(path: string, opts: Options = {}): Promise<T> {
  const url = new URL(path, "http://local.studyflow")
  if (!opts.noToday && !url.searchParams.has("today")) {
    url.searchParams.set("today", todayIso())
  }
  const finalPath = url.pathname + url.search

  let res: Response
  try {
    res = await fetch(finalPath, {
      method: opts.method ?? "GET",
      // CSRF signature: cross-site pages cannot set a custom header (no CORS
      // preflight is granted by our API), so the server accepts this as proof
      // the call comes from our own SPA — even behind host-rewriting proxies.
      headers: {
        "X-Requested-With": "StudyFlow",
        ...(opts.body !== undefined ? { "Content-Type": "application/json" } : {}),
      },
      body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
      credentials: "same-origin",
      cache: "no-store",
      signal: opts.signal,
    })
  } catch (e) {
    if ((e as Error)?.name === "AbortError") throw e
    throw new ApiClientError(0, "ارتباط با سرور برقرار نشد. اتصال اینترنت خود را بررسی کنید.")
  }

  if (res.status === 401) {
    window.dispatchEvent(new CustomEvent(AUTH_EXPIRED_EVENT))
    throw new ApiClientError(401, "نشست شما منقضی شده است. دوباره وارد شوید.")
  }

  let data: unknown = null
  try {
    data = await res.json()
  } catch {
    // empty body
  }

  if (!res.ok) {
    const message =
      (data as { error?: string })?.error ?? "خطایی رخ داد. لطفاً دوباره تلاش کنید."
    throw new ApiClientError(res.status, message)
  }

  return data as T
}

export const AUTH_EXPIRED = AUTH_EXPIRED_EVENT
