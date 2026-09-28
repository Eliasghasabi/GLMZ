"use client"

import { useEffect, useState } from "react"
import { WifiOff } from "lucide-react"

export function OfflineBanner() {
  const [offline, setOffline] = useState(false)

  useEffect(() => {
    const update = () => setOffline(!navigator.onLine)
    update()
    window.addEventListener("online", update)
    window.addEventListener("offline", update)
    return () => {
      window.removeEventListener("online", update)
      window.removeEventListener("offline", update)
    }
  }, [])

  if (!offline) return null
  return (
    <div className="sticky top-0 z-50 bg-amber-500/95 dark:bg-amber-600/95 text-white text-sm py-1.5 px-4 text-center flex items-center justify-center gap-2">
      <WifiOff className="w-4 h-4" aria-hidden />
      اتصال اینترنت قطع است؛ تغییرات شما پس از آنلاین شدن ذخیره می‌شود.
    </div>
  )
}
