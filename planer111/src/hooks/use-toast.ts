"use client"

import type { ReactNode } from "react"
import { toast as sonner } from "sonner"

/**
 * Toast hook backed by sonner (Toaster mounted in app/layout.tsx).
 * API-compatible with the shadcn useToast usage across the app:
 *   toast({ title, description?, variant?: "default" | "destructive" })
 */

export type ToasterToast = {
  id: string
  title?: ReactNode
  description?: ReactNode
  action?: ReactNode
  open?: boolean
  onOpenChange?: (open: boolean) => void
  [key: string]: unknown
}

export function useToast() {
  return {
    toast: (opts: { title?: string; description?: string; variant?: "default" | "destructive" }) => {
      const payload = { description: opts.description }
      if (opts.variant === "destructive") {
        sonner.error(opts.title ?? "", payload)
      } else {
        sonner.success(opts.title ?? "", payload)
      }
    },
    // radix-compat surface (unused by StudyFlow views but keeps the UI kit type-safe)
    dismiss: () => undefined,
    toasts: [] as ToasterToast[],
  }
}

export { sonner as toastFn }
