"use client"

import { type ReactNode } from "react"
import { Button } from "@/components/ui/button"

type Props = {
  icon?: ReactNode
  emoji?: string
  title: string
  description?: string
  actionLabel?: string
  onAction?: () => void
}

export function EmptyState({ icon, emoji, title, description, actionLabel, onAction }: Props) {
  return (
    <div className="flex flex-col items-center justify-center text-center py-14 px-6">
      <div
        className="w-20 h-20 rounded-3xl flex items-center justify-center text-4xl mb-5 shadow-soft"
        style={{ background: "linear-gradient(135deg, rgba(99,102,241,0.12), rgba(139,92,246,0.12))" }}
        aria-hidden
      >
        {icon ?? emoji ?? "✨"}
      </div>
      <h3 className="font-bold text-lg mb-1.5">{title}</h3>
      {description && <p className="text-sm text-muted-foreground max-w-sm leading-6 mb-5">{description}</p>}
      {actionLabel && onAction && (
        <Button onClick={onAction} className="gradient-primary text-white border-0 rounded-xl shadow-lift hover:opacity-90">
          {actionLabel}
        </Button>
      )}
    </div>
  )
}
