"use client"

import { useCallback, useEffect, useState, type MouseEvent } from "react"

/**
 * Lightweight hash router.
 * Routes: #/login  #/register  #/dashboard  #/planner  #/tasks  #/subjects  #/subjects/:id
 *         #/revisions #/exams #/goals #/notes #/statistics #/pomodoro #/profile #/settings
 * SPA-only (works on any static host incl. Cloudflare Pages/Workers assets, great for PWA offline).
 */

export type Route =
  | { name: "login" | "register" | "dashboard" | "planner" | "tasks" | "subjects" | "revisions" | "exams" | "goals" | "notes" | "statistics" | "pomodoro" | "profile" | "settings" | "not-found" }
  | { name: "subject-detail"; id: string }

function parseHash(hash: string): Route {
  const clean = hash.replace(/^#\/?/, "").split("?")[0].replace(/\/+$/, "")
  const segments = clean ? clean.split("/") : []
  const [first, second] = segments

  const known = new Set([
    "login", "register", "dashboard", "planner", "tasks", "subjects", "revisions",
    "exams", "goals", "notes", "statistics", "pomodoro", "profile", "settings",
  ])

  if (!first) return { name: "dashboard" }
  if (first === "subjects" && second) return { name: "subject-detail", id: decodeURIComponent(second) }
  if (known.has(first)) return { name: first } as Route
  return { name: "not-found" }
}

export function useHashRoute(): Route {
  const [route, setRoute] = useState<Route>(() =>
    typeof window === "undefined" ? { name: "dashboard" } : parseHash(window.location.hash)
  )

  useEffect(() => {
    const onChange = () => setRoute(parseHash(window.location.hash))
    window.addEventListener("hashchange", onChange)
    return () => window.removeEventListener("hashchange", onChange)
  }, [])

  return route
}

export function navigate(to: string, opts: { replace?: boolean } = {}) {
  const target = to.startsWith("#") ? to : `#${to.startsWith("/") ? to : `/${to}`}`
  if (opts.replace) {
    window.history.replaceState(null, "", target)
    window.dispatchEvent(new HashChangeEvent("hashchange"))
  } else if (window.location.hash !== target) {
    window.location.hash = target
  } else {
    // re-render same route
    window.dispatchEvent(new HashChangeEvent("hashchange"))
  }
}

export function useNavLink(href: string) {
  return useCallback(
    (e: MouseEvent) => {
      e.preventDefault()
      navigate(href)
    },
    [href]
  )
}
