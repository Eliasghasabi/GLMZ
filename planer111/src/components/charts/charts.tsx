"use client"

/**
 * Lightweight custom SVG charts — no chart library, tiny bundle,
 * RTL-aware labels with Persian numerals.
 */
import { useId } from "react"
import { toFa } from "@/lib/format"
import { formatJalaliShort } from "@/lib/format"
import { cn } from "@/lib/utils"

// ───────────────────── Progress Ring ─────────────────────

export function ProgressRing({
  percent,
  size = 120,
  strokeWidth = 10,
  children,
  gradient = true,
}: {
  percent: number
  size?: number
  strokeWidth?: number
  children?: React.ReactNode
  gradient?: boolean
}) {
  const id = useId()
  const clamped = Math.max(0, Math.min(100, percent))
  const r = (size - strokeWidth) / 2
  const c = 2 * Math.PI * r
  const offset = c * (1 - clamped / 100)
  return (
    <div className="relative inline-flex items-center justify-center" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90" role="img" aria-label={`پیشرفت ${toFa(Math.round(clamped))} درصد`}>
        {gradient && (
          <defs>
            <linearGradient id={id} x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor="#6366F1" />
              <stop offset="100%" stopColor="#8B5CF6" />
            </linearGradient>
          </defs>
        )}
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="currentColor" className="text-muted" strokeWidth={strokeWidth} />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke={gradient ? `url(#${id})` : "var(--primary)"}
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={offset}
          style={{ transition: "stroke-dashoffset 0.8s cubic-bezier(0.22, 1, 0.36, 1)" }}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">{children}</div>
    </div>
  )
}

// ───────────────────── Bar Chart (weekly minutes) ─────────────────────

export type BarDatum = { label: string; value: number; highlight?: boolean }

export function BarChart({ data, height = 160, className }: { data: BarDatum[]; height?: number; className?: string }) {
  const max = Math.max(1, ...data.map((d) => d.value))
  return (
    <div className={cn("w-full", className)} role="img" aria-label="نمودار میله‌ای مطالعه روزانه">
      <div className="flex items-end justify-between gap-2" style={{ height }} dir="ltr">
        {data.map((d, i) => {
          const pct = (d.value / max) * 100
          return (
            <div key={i} className="flex-1 flex flex-col items-center justify-end h-full gap-1.5 min-w-0">
              <span className="text-[10px] text-muted-foreground tabular-nums ltr-num">
                {d.value > 0 ? toFa(Math.round(d.value / 6) / 10) + "س" : ""}
              </span>
              <div
                className={cn(
                  "w-full max-w-9 rounded-lg transition-all duration-700 ease-out",
                  d.highlight ? "gradient-primary" : "bg-primary/25 dark:bg-primary/30"
                )}
                style={{ height: `${Math.max(pct, d.value > 0 ? 6 : 2)}%`, minHeight: 3 }}
              />
            </div>
          )
        })}
      </div>
      <div className="flex justify-between gap-2 mt-2" dir="ltr">
        {data.map((d, i) => (
          <div key={i} className={cn("flex-1 text-center text-[10px] truncate min-w-0", d.highlight ? "text-primary font-bold" : "text-muted-foreground")}>
            {d.label}
          </div>
        ))}
      </div>
    </div>
  )
}

// ───────────────────── Area Chart (30-day trend) ─────────────────────

export function AreaChart({
  points,
  height = 180,
  ariaLabel = "روند مطالعه",
}: {
  points: { date: string; minutes: number }[]
  height?: number
  ariaLabel?: string
}) {
  const id = useId()
  const w = 600
  const h = height
  const pad = { top: 10, right: 4, bottom: 22, left: 4 }
  const max = Math.max(60, ...points.map((p) => p.minutes))
  const innerW = w - pad.left - pad.right
  const innerH = h - pad.top - pad.bottom

  const xy = points.map((p, i) => {
    const x = pad.left + (i / Math.max(1, points.length - 1)) * innerW
    const y = pad.top + innerH - (p.minutes / max) * innerH
    return [x, y] as const
  })

  const line = xy.map(([x, y], i) => `${i === 0 ? "M" : "L"}${x.toFixed(1)},${y.toFixed(1)}`).join(" ")
  const area = `${line} L${pad.left + innerW},${pad.top + innerH} L${pad.left},${pad.top + innerH} Z`

  return (
    <div className="w-full" role="img" aria-label={ariaLabel}>
      <svg viewBox={`0 0 ${w} ${h}`} className="w-full" style={{ height }} preserveAspectRatio="none">
        <defs>
          <linearGradient id={id} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#6366F1" stopOpacity="0.28" />
            <stop offset="100%" stopColor="#8B5CF6" stopOpacity="0.02" />
          </linearGradient>
          <linearGradient id={`${id}-stroke`} x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%" stopColor="#6366F1" />
            <stop offset="100%" stopColor="#8B5CF6" />
          </linearGradient>
        </defs>
        {[0.25, 0.5, 0.75].map((f) => (
          <line
            key={f}
            x1={pad.left}
            x2={w - pad.right}
            y1={pad.top + innerH * f}
            y2={pad.top + innerH * f}
            stroke="currentColor"
            className="text-border"
            strokeDasharray="3 5"
            strokeWidth="1"
          />
        ))}
        <path d={area} fill={`url(#${id})`} />
        <path d={line} fill="none" stroke={`url(#${id}-stroke)`} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
      <div className="flex justify-between text-[10px] text-muted-foreground mt-1" dir="ltr">
        {points
          .filter((_, i) => i % Math.max(1, Math.floor(points.length / 5)) === 0 || i === points.length - 1)
          .map((p) => (
            <span key={p.date}>{formatJalaliShort(p.date)}</span>
          ))}
      </div>
    </div>
  )
}

// ───────────────────── Donut Chart (subject distribution) ─────────────────────

export type DonutDatum = { name: string; value: number; color: string }

export function DonutChart({ data, size = 170 }: { data: DonutDatum[]; size?: number }) {
  const total = data.reduce((a, d) => a + d.value, 0)
  const strokeWidth = 22
  const r = (size - strokeWidth) / 2
  const c = 2 * Math.PI * r

  // precompute cumulative offsets (pure — no mutation during render)
  const fractions = data.map((d) => d.value / total)
  const segments = data.map((d, i) => ({
    ...d,
    frac: fractions[i],
    startOffset: fractions.slice(0, i).reduce((a, f) => a + f, 0),
  }))

  if (total === 0) {
    return <div className="text-sm text-muted-foreground py-8 text-center">هنوز داده‌ای ثبت نشده است.</div>
  }

  return (
    <div className="flex items-center gap-5 flex-wrap justify-center">
      <div className="relative" style={{ width: size, height: size }} role="img" aria-label="توزیع زمان مطالعه بین درس‌ها">
        <svg width={size} height={size} className="-rotate-90">
          <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="currentColor" className="text-muted" strokeWidth={strokeWidth} />
          {segments.map((seg) => (
            <circle
              key={seg.name}
              cx={size / 2}
              cy={size / 2}
              r={r}
              fill="none"
              stroke={seg.color}
              strokeWidth={strokeWidth}
              strokeDasharray={`${seg.frac * c} ${c - seg.frac * c}`}
              strokeDashoffset={-seg.startOffset * c}
              strokeLinecap="butt"
            />
          ))}
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-xl font-extrabold ltr-num">{toFa(Math.round(total / 60))}</span>
          <span className="text-[10px] text-muted-foreground">ساعت (۳۰ روز)</span>
        </div>
      </div>
      <ul className="space-y-2 min-w-36">
        {data.slice(0, 6).map((d) => (
          <li key={d.name} className="flex items-center gap-2 text-sm">
            <span className="w-3 h-3 rounded-full shrink-0" style={{ backgroundColor: d.color }} aria-hidden />
            <span className="flex-1 truncate">{d.name}</span>
            <span className="text-xs text-muted-foreground ltr-num">{toFa(Math.round((d.value / total) * 100))}٪</span>
          </li>
        ))}
      </ul>
    </div>
  )
}
