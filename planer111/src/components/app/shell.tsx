"use client"

import { useEffect, useState, type ReactNode } from "react"
import Link from "next/link"
import { motion } from "framer-motion"
import {
  BookOpen, CalendarDays, ChartPie, CheckSquare, Clock, GraduationCap, House,
  ListChecks, NotebookPen, Search, Settings, Menu, X, LogOut, User, Target, Trophy,
} from "lucide-react"
import { useHashRoute, navigate, type Route } from "@/lib/router"
import { useAuth } from "@/lib/client/auth"
import { useI18n } from "@/lib/client/i18n"
import { CommandPalette, useCommandPalette } from "@/components/app/command-palette"
import { NotificationsBell } from "@/components/app/notifications-bell"
import { Button } from "@/components/ui/button"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { Sheet, SheetContent, SheetTitle, SheetTrigger } from "@/components/ui/sheet"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import { cn } from "@/lib/utils"
import { ThemeToggle } from "@/components/app/theme-toggle"

export type NavItem = { href: string; labelKey: string; icon: ReactNode }

const MAIN_NAV: NavItem[] = [
  { href: "/dashboard", labelKey: "nav.home", icon: <House className="w-[18px] h-[18px]" aria-hidden /> },
  { href: "/planner", labelKey: "nav.planner", icon: <CalendarDays className="w-[18px] h-[18px]" aria-hidden /> },
  { href: "/tasks", labelKey: "nav.tasks", icon: <ListChecks className="w-[18px] h-[18px]" aria-hidden /> },
  { href: "/subjects", labelKey: "nav.subjects", icon: <BookOpen className="w-[18px] h-[18px]" aria-hidden /> },
  { href: "/revisions", labelKey: "nav.revisions", icon: <CheckSquare className="w-[18px] h-[18px]" aria-hidden /> },
  { href: "/exams", labelKey: "nav.exams", icon: <GraduationCap className="w-[18px] h-[18px]" aria-hidden /> },
  { href: "/goals", labelKey: "nav.goals", icon: <Target className="w-[18px] h-[18px]" aria-hidden /> },
  { href: "/notes", labelKey: "nav.notes", icon: <NotebookPen className="w-[18px] h-[18px]" aria-hidden /> },
  { href: "/statistics", labelKey: "nav.statistics", icon: <ChartPie className="w-[18px] h-[18px]" aria-hidden /> },
  { href: "/pomodoro", labelKey: "nav.pomodoro", icon: <Clock className="w-[18px] h-[18px]" aria-hidden /> },
]

const MOBILE_NAV: NavItem[] = [
  MAIN_NAV[0], // خانه
  MAIN_NAV[1], // برنامه
  MAIN_NAV[2], // کارها
  MAIN_NAV[9], // تمرکز
]

const MORE_NAV: NavItem[] = [MAIN_NAV[3], MAIN_NAV[4], MAIN_NAV[5], MAIN_NAV[6], MAIN_NAV[7], MAIN_NAV[8]]

function isActive(route: Route, href: string): boolean {
  const name = href.slice(1)
  if (name === "dashboard") return route.name === "dashboard"
  if (name === "subjects") return route.name === "subjects" || route.name === "subject-detail"
  return route.name === name
}

export function AppShell({ route }: { route: Route }) {
  const { user, logout } = useAuth()
  const { t } = useI18n()
  const palette = useCommandPalette()

  // Ctrl+K / Cmd+K global shortcut
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
        e.preventDefault()
        palette.setOpen(true)
      }
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [palette])

  return (
    <div className="min-h-screen flex flex-col lg:flex-row">
      {/* Desktop sidebar (right side in RTL) */}
      <aside className="hidden lg:flex sticky top-0 h-screen w-64 shrink-0 flex-col glass border-l-0 border-r-0 border-y-0"
        style={{ borderInlineStart: "1px solid var(--glass-border)" }}
        aria-label="ناوبری اصلی">
        <SidebarContent route={route} />
      </aside>

      <div className="flex-1 min-w-0 flex flex-col min-h-screen">
        {/* Top bar */}
        <header className="sticky top-0 z-40 glass border-x-0 border-t-0">
          <div className="flex items-center gap-2 px-4 lg:px-8 h-14">
            {/* mobile logo */}
            <Link href="/dashboard" className="lg:hidden flex items-center gap-2" aria-label="استادی‌فلو">
              <span className="w-8 h-8 rounded-xl gradient-primary flex items-center justify-center">
                <BookOpen className="w-4.5 h-4.5 text-white" aria-hidden />
              </span>
              <span className="font-extrabold text-gradient">استادی‌فلو</span>
            </Link>

            <div className="flex-1" />

            <Button
              variant="outline"
              size="sm"
              onClick={() => palette.setOpen(true)}
              className="gap-2 text-muted-foreground h-9 rounded-full bg-card/50 hidden sm:inline-flex"
              aria-label="جست‌وجوی سراسری (Ctrl+K)"
            >
              <Search className="w-4 h-4" aria-hidden />
              <span className="text-xs">{t("action.search")}…</span>
              <kbd className="text-[10px] bg-muted px-1.5 py-0.5 rounded-md border ltr-num">Ctrl+K</kbd>
            </Button>
            <Button variant="ghost" size="icon" onClick={() => palette.setOpen(true)} className="sm:hidden" aria-label="جست‌وجو">
              <Search className="w-5 h-5" aria-hidden />
            </Button>

            <NotificationsBell />

            <ThemeToggle />

            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button
                  className="w-9 h-9 rounded-full flex items-center justify-center text-lg border shadow-sm hover:scale-105 transition-transform"
                  style={{ backgroundColor: (user?.avatarColor ?? "#6366F1") + "22", borderColor: (user?.avatarColor ?? "#6366F1") + "55" }}
                  aria-label="منوی کاربر"
                >
                  {user?.avatarEmoji ?? "🎓"}
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-52">
                <DropdownMenuLabel className="flex flex-col">
                  <span>{user?.name}</span>
                  <span className="text-xs text-muted-foreground font-normal ltr-num">{user?.email}</span>
                </DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={() => navigate("/profile")} className="gap-2">
                  <User className="w-4 h-4" aria-hidden /> {t("nav.profile")}
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => navigate("/settings")} className="gap-2">
                  <Settings className="w-4 h-4" aria-hidden /> {t("nav.settings")}
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={() => void logout()} className="gap-2 text-destructive focus:text-destructive">
                  <LogOut className="w-4 h-4" aria-hidden /> {t("action.logout")}
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </header>

        {/* Page content */}
        <main className="flex-1 px-4 lg:px-8 py-6 pb-28 lg:pb-10 w-full max-w-6xl mx-auto" id="main">
          <ShellOutlet route={route} />
        </main>
      </div>

      {/* Mobile bottom navigation */}
      <nav
        className="lg:hidden fixed bottom-0 inset-x-0 z-40 glass border-x-0 border-b-0 pb-[env(safe-area-inset-bottom)]"
        aria-label="ناوبری موبایل"
      >
        <div className="grid grid-cols-5 h-16">
          {MOBILE_NAV.map((item) => {
            const active = isActive(route, item.href)
            return (
              <button
                key={item.href}
                onClick={() => navigate(item.href)}
                className={cn(
                  "flex flex-col items-center justify-center gap-1 text-[11px] transition-colors",
                  active ? "text-primary" : "text-muted-foreground"
                )}
                aria-current={active ? "page" : undefined}
              >
                <span className={cn("relative rounded-full px-3 py-0.5", active && "bg-primary/10")}>
                  {item.icon}
                </span>
                {t(item.labelKey)}
              </button>
            )
          })}
          <MobileMoreSheet />
        </div>
      </nav>

      <CommandPalette open={palette.open} setOpen={palette.setOpen} />
    </div>
  )
}

function SidebarContent({ route }: { route: Route }) {
  const { t } = useI18n()
  const { user } = useAuth()
  return (
    <>
      <div className="h-16 flex items-center gap-2.5 px-5">
        <span className="w-9 h-9 rounded-xl gradient-primary flex items-center justify-center shadow-lift">
          <BookOpen className="w-5 h-5 text-white" aria-hidden />
        </span>
        <div className="flex flex-col">
          <span className="font-extrabold text-gradient leading-none">استادی‌فلو</span>
          <span className="text-[10px] text-muted-foreground mt-1">برنامه‌ریز هوشمند مطالعه</span>
        </div>
      </div>

      <nav className="flex-1 overflow-y-auto px-3 py-4 space-y-1" aria-label="منوی اصلی">
        {MAIN_NAV.map((item) => {
          const active = isActive(route, item.href)
          return (
            <button
              key={item.href}
              onClick={() => navigate(item.href)}
              className={cn(
                "w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm transition-all relative",
                active
                  ? "text-sidebar-accent-foreground font-semibold"
                  : "text-muted-foreground hover:text-foreground hover:bg-accent/60"
              )}
              aria-current={active ? "page" : undefined}
            >
              {active && (
                <motion.span
                  layoutId="sidebar-active"
                  className="absolute inset-0 rounded-xl"
                  style={{ background: "var(--sidebar-accent)" }}
                  transition={{ type: "spring", stiffness: 400, damping: 32 }}
                />
              )}
              <span className="relative">{item.icon}</span>
              <span className="relative">{t(item.labelKey)}</span>
            </button>
          )
        })}
      </nav>

      <div className="px-3 pb-4">
        <button
          onClick={() => navigate("/settings")}
          className={cn(
            "w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm transition-colors",
            route.name === "settings"
              ? "text-sidebar-accent-foreground font-semibold bg-sidebar-accent"
              : "text-muted-foreground hover:text-foreground hover:bg-accent/60"
          )}
        >
          <Settings className="w-[18px] h-[18px]" aria-hidden />
          {t("nav.settings")}
        </button>
        <div className="mt-3 flex items-center gap-3 px-3 py-2 rounded-xl bg-accent/40">
          <Avatar className="w-8 h-8">
            <AvatarFallback
              className="text-base"
              style={{ backgroundColor: (user?.avatarColor ?? "#6366F1") + "26" }}
            >
              {user?.avatarEmoji ?? "🎓"}
            </AvatarFallback>
          </Avatar>
          <div className="min-w-0">
            <div className="text-sm font-semibold truncate">{user?.name}</div>
            <div className="text-[10px] text-muted-foreground truncate ltr-num">{user?.email}</div>
          </div>
        </div>
      </div>
    </>
  )
}

function MobileMoreSheet() {
  const { t } = useI18n()
  const route = useHashRoute()
  const [open, setOpen] = useState(false)
  const items = [...MORE_NAV, { href: "/profile", labelKey: "nav.profile", icon: <User className="w-[18px] h-[18px]" aria-hidden /> }, { href: "/settings", labelKey: "nav.settings", icon: <Settings className="w-[18px] h-[18px]" aria-hidden /> }]
  const someActive = MORE_NAV.some((i) => isActive(route, i.href)) || route.name === "profile" || route.name === "settings"

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <button
          className={cn(
            "flex flex-col items-center justify-center gap-1 text-[11px] transition-colors",
            someActive ? "text-primary" : "text-muted-foreground"
          )}
          aria-label={t("nav.more")}
        >
          <span className={cn("relative rounded-full px-3 py-0.5", someActive && "bg-primary/10")}>
            {someActive ? <Trophy className="w-[18px] h-[18px]" aria-hidden /> : <Menu className="w-[18px] h-[18px]" aria-hidden />}
          </span>
          {t("nav.more")}
        </button>
      </SheetTrigger>
      <SheetContent side="bottom" className="rounded-t-3xl px-4 pb-8">
        <SheetTitle className="sr-only">بخش‌های بیشتر</SheetTitle>
        <div className="flex items-center justify-between mb-2">
          <span className="font-bold">{t("nav.more")}</span>
          <Button variant="ghost" size="icon" onClick={() => setOpen(false)} aria-label={t("action.close")}>
            <X className="w-4 h-4" aria-hidden />
          </Button>
        </div>
        <div className="grid grid-cols-3 gap-3">
          {items.map((item) => (
            <button
              key={item.href}
              onClick={() => {
                setOpen(false)
                navigate(item.href)
              }}
              className="flex flex-col items-center gap-2 py-4 rounded-2xl bg-accent/50 hover:bg-accent transition-colors text-sm"
            >
              <span className="text-primary">{item.icon}</span>
              {t(item.labelKey)}
            </button>
          ))}
        </div>
      </SheetContent>
    </Sheet>
  )
}

// lazy view registry — keeps each page a separate chunk (code splitting)
import dynamic from "next/dynamic"
import { DashboardSkeleton } from "@/components/shared/skeletons"

const Dashboard = dynamic(() => import("@/components/views/dashboard").then((m) => m.Dashboard), { loading: () => <DashboardSkeleton /> })
const Planner = dynamic(() => import("@/components/views/planner").then((m) => m.Planner), { loading: () => <DashboardSkeleton /> })
const Tasks = dynamic(() => import("@/components/views/tasks").then((m) => m.Tasks), { loading: () => <DashboardSkeleton /> })
const Subjects = dynamic(() => import("@/components/views/subjects").then((m) => m.Subjects), { loading: () => <DashboardSkeleton /> })
const SubjectDetail = dynamic(() => import("@/components/views/subject-detail").then((m) => m.SubjectDetail), { loading: () => <DashboardSkeleton /> })
const Revisions = dynamic(() => import("@/components/views/revisions").then((m) => m.Revisions), { loading: () => <DashboardSkeleton /> })
const Exams = dynamic(() => import("@/components/views/exams").then((m) => m.Exams), { loading: () => <DashboardSkeleton /> })
const Goals = dynamic(() => import("@/components/views/goals").then((m) => m.Goals), { loading: () => <DashboardSkeleton /> })
const Notes = dynamic(() => import("@/components/views/notes").then((m) => m.Notes), { loading: () => <DashboardSkeleton /> })
const Statistics = dynamic(() => import("@/components/views/statistics").then((m) => m.Statistics), { loading: () => <DashboardSkeleton /> })
const Pomodoro = dynamic(() => import("@/components/views/pomodoro").then((m) => m.Pomodoro), { loading: () => <DashboardSkeleton /> })
const Profile = dynamic(() => import("@/components/views/profile").then((m) => m.Profile), { loading: () => <DashboardSkeleton /> })
const SettingsView = dynamic(() => import("@/components/views/settings").then((m) => m.SettingsView), { loading: () => <DashboardSkeleton /> })
const NotFound = dynamic(() => import("@/components/views/not-found").then((m) => m.NotFound), { loading: () => <DashboardSkeleton /> })

function ShellOutlet({ route }: { route: Route }) {
  switch (route.name) {
    case "dashboard":
      return <Dashboard />
    case "planner":
      return <Planner />
    case "tasks":
      return <Tasks />
    case "subjects":
      return <Subjects />
    case "subject-detail":
      return <SubjectDetail id={route.id} />
    case "revisions":
      return <Revisions />
    case "exams":
      return <Exams />
    case "goals":
      return <Goals />
    case "notes":
      return <Notes />
    case "statistics":
      return <Statistics />
    case "pomodoro":
      return <Pomodoro />
    case "profile":
      return <Profile />
    case "settings":
      return <SettingsView />
    default:
      return <NotFound />
  }
}
