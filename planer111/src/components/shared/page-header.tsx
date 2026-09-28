"use client"

import { formatJalaliDate } from "@/lib/format"

export function PageHeader({
  title,
  subtitle,
  actions,
}: {
  title: string
  subtitle?: string
  actions?: React.ReactNode
}) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-3 mb-6">
      <div>
        <h1 className="text-2xl lg:text-3xl font-extrabold tracking-tight">{title}</h1>
        {subtitle && <p className="text-sm text-muted-foreground mt-1">{subtitle}</p>}
      </div>
      {actions && <div className="flex items-center gap-2">{actions}</div>}
    </div>
  )
}

export function JalaliDateText({ iso, withWeekday }: { iso: string | null | undefined; withWeekday?: boolean }) {
  return <span>{formatJalaliDate(iso, { withWeekday })}</span>
}
