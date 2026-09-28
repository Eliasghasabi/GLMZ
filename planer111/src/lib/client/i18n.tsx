"use client"

import { createContext, useContext, type ReactNode } from "react"
import { useAuth } from "@/lib/client/auth"

/**
 * i18n scaffold — Persian is the primary language; the shell (navigation, common
 * actions) is translated through `t()`. To add English: fill the `en` dictionary
 * and switch language in Settings. Views contain Persian-first copy by design.
 */

export type Dict = Record<string, string>

export const dictionaries: Record<"fa" | "en", Dict> = {
  fa: {
    "nav.home": "خانه",
    "nav.planner": "برنامه",
    "nav.tasks": "کارها",
    "nav.subjects": "درس‌ها",
    "nav.revisions": "مرورها",
    "nav.exams": "امتحان‌ها",
    "nav.goals": "اهداف",
    "nav.notes": "یادداشت‌ها",
    "nav.statistics": "آمار",
    "nav.pomodoro": "تمرکز",
    "nav.profile": "پروفایل",
    "nav.settings": "تنظیمات",
    "nav.more": "بیشتر",
    "action.save": "ذخیره",
    "action.cancel": "انصراف",
    "action.delete": "حذف",
    "action.edit": "ویرایش",
    "action.create": "ایجاد",
    "action.close": "بستن",
    "action.search": "جست‌وجو",
    "action.logout": "خروج",
    "action.retry": "تلاش دوباره",
  },
  en: {
    "nav.home": "Home",
    "nav.planner": "Planner",
    "nav.tasks": "Tasks",
    "nav.subjects": "Subjects",
    "nav.revisions": "Reviews",
    "nav.exams": "Exams",
    "nav.goals": "Goals",
    "nav.notes": "Notes",
    "nav.statistics": "Statistics",
    "nav.pomodoro": "Focus",
    "nav.profile": "Profile",
    "nav.settings": "Settings",
    "nav.more": "More",
    "action.save": "Save",
    "action.cancel": "Cancel",
    "action.delete": "Delete",
    "action.edit": "Edit",
    "action.create": "Create",
    "action.close": "Close",
    "action.search": "Search",
    "action.logout": "Log out",
    "action.retry": "Retry",
  },
}

type I18nState = { lang: "fa" | "en"; dir: "rtl" | "ltr"; t: (key: string) => string }

const I18nContext = createContext<I18nState>({ lang: "fa", dir: "rtl", t: (k) => dictionaries.fa[k] ?? k })

export function I18nProvider({ children }: { children: ReactNode }) {
  const { settings } = useAuth()
  const lang = settings?.language ?? "fa"
  const dir = lang === "fa" ? "rtl" : "ltr"
  const t = (key: string) => dictionaries[lang]?.[key] ?? dictionaries.fa[key] ?? key
  return <I18nContext.Provider value={{ lang, dir, t }}>{children}</I18nContext.Provider>
}

export function useI18n(): I18nState {
  return useContext(I18nContext)
}
