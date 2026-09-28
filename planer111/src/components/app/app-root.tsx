"use client"

import { useEffect } from "react"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { AuthProvider, useAuth } from "@/lib/client/auth"
import { I18nProvider } from "@/lib/client/i18n"
import { useHashRoute } from "@/lib/router"
import { AppShell } from "@/components/app/shell"
import { AuthScreen } from "@/components/views/auth"
import { SplashScreen } from "@/components/app/splash"
import { OfflineBanner } from "@/components/app/offline-banner"

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      retry: 1,
      refetchOnWindowFocus: false,
    },
  },
})

export function AppRoot() {
  useEffect(() => {
    // PWA service worker
    if ("serviceWorker" in navigator && process.env.NODE_ENV === "production") {
      navigator.serviceWorker.register("/sw.js").catch(() => {})
    }
  }, [])

  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <I18nProvider>
          <AppInner />
        </I18nProvider>
      </AuthProvider>
    </QueryClientProvider>
  )
}

function AppInner() {
  const { ready, user } = useAuth()
  const route = useHashRoute()

  if (!ready) return <SplashScreen />

  const isAuthRoute = route.name === "login" || route.name === "register"
  if (!user) {
    // any route while logged-out → auth screen (login/register)
    return <AuthScreen initialMode={route.name === "register" ? "register" : "login"} />
  }

  return (
    <>
      <OfflineBanner />
      <AppShell route={route} />
    </>
  )
}
