"use client"

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react"
import { useQueryClient } from "@tanstack/react-query"
import { api, AUTH_EXPIRED } from "@/lib/api"

export type PublicUser = {
  id: string
  name: string
  email: string
  avatarEmoji: string
  avatarColor: string
  createdAt: string
}

export type Settings = {
  userId: string
  theme: "light" | "dark" | "system"
  language: "fa" | "en"
  pomodoroFocus: number
  pomodoroBreak: number
  pomodoroLongBreak: number
  pomodorosUntilLongBreak: number
  revisionIntervals: number[]
  dailyGoalMinutes: number
  preferredSessionMinutes: number
  notifyTasks: boolean
  notifyExams: boolean
  notifyRevisions: boolean
  notifyStudy: boolean
}

type AuthState = {
  ready: boolean
  user: PublicUser | null
  settings: Settings | null
  login: (email: string, password: string) => Promise<void>
  register: (name: string, email: string, password: string) => Promise<void>
  logout: () => Promise<void>
  refresh: () => Promise<void>
  updateUser: (u: Partial<PublicUser>) => void
  updateSettings: (s: Partial<Settings>) => void
}

const AuthContext = createContext<AuthState | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [ready, setReady] = useState(false)
  const [user, setUser] = useState<PublicUser | null>(null)
  const [settings, setSettings] = useState<Settings | null>(null)
  const queryClient = useQueryClient()

  const refresh = useCallback(async () => {
    try {
      const data = await api<{ user: PublicUser; settings: Settings | null }>("/api/auth/me")
      setUser(data.user)
      setSettings(data.settings)
    } catch {
      setUser(null)
      setSettings(null)
    } finally {
      setReady(true)
    }
  }, [])

  useEffect(() => {
    void refresh()
  }, [refresh])

  // global 401 handling
  useEffect(() => {
    const onExpired = () => {
      setUser(null)
      setSettings(null)
      queryClient.clear()
    }
    window.addEventListener(AUTH_EXPIRED, onExpired)
    return () => window.removeEventListener(AUTH_EXPIRED, onExpired)
  }, [queryClient])

  const login = useCallback(async (email: string, password: string) => {
    const data = await api<{ user: PublicUser; settings: Settings | null }>("/api/auth/login", {
      method: "POST",
      body: { email, password },
    })
    setUser(data.user)
    setSettings(data.settings)
  }, [])

  const register = useCallback(async (name: string, email: string, password: string) => {
    const data = await api<{ user: PublicUser; settings: Settings | null }>("/api/auth/register", {
      method: "POST",
      body: { name, email, password },
    })
    setUser(data.user)
    setSettings(data.settings)
  }, [])

  const logout = useCallback(async () => {
    await api("/api/auth/logout", { method: "POST" }).catch(() => {})
    setUser(null)
    setSettings(null)
    queryClient.clear()
  }, [queryClient])

  const updateUser = useCallback((patch: Partial<PublicUser>) => {
    setUser((prev) => (prev ? { ...prev, ...patch } : prev))
  }, [])

  const updateSettings = useCallback((patch: Partial<Settings>) => {
    setSettings((prev) => (prev ? { ...prev, ...patch } : prev))
  }, [])

  const value = useMemo(
    () => ({ ready, user, settings, login, register, logout, refresh, updateUser, updateSettings }),
    [ready, user, settings, login, register, logout, refresh, updateUser, updateSettings]
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error("useAuth must be used within AuthProvider")
  return ctx
}
