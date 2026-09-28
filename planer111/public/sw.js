/* StudyFlow Service Worker — offline shell + runtime caching */
const VERSION = "studyflow-v1"
const STATIC_CACHE = `${VERSION}-static`
const RUNTIME_CACHE = `${VERSION}-runtime`

// App shell: pages + critical assets (hashed chunks are cached on first fetch)
const SHELL_ASSETS = [
  "/",
  "/manifest.webmanifest",
  "/fonts/Vazirmatn-Regular.woff2",
  "/fonts/Vazirmatn-Medium.woff2",
  "/fonts/Vazirmatn-SemiBold.woff2",
  "/fonts/Vazirmatn-Bold.woff2",
  "/fonts/Vazirmatn-ExtraBold.woff2",
  "/icons/icon-192.png",
  "/icons/icon-512.png",
]

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(STATIC_CACHE)
      .then((cache) => cache.addAll(SHELL_ASSETS))
      .then(() => self.skipWaiting())
  )
})

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(keys.filter((k) => !k.startsWith(VERSION)).map((k) => caches.delete(k)))
      )
      .then(() => self.clients.claim())
  )
})

self.addEventListener("fetch", (event) => {
  const { request } = event
  const url = new URL(request.url)

  if (request.method !== "GET" || url.origin !== self.location.origin) return

  // API: network-first, fall back to cache when offline (read-only fallback)
  if (url.pathname.startsWith("/api/")) {
    event.respondWith(
      fetch(request)
        .then((res) => {
          if (res.ok && request.method === "GET") {
            const clone = res.clone()
            caches.open(RUNTIME_CACHE).then((cache) => cache.put(request, clone))
          }
          return res
        })
        .catch(() => caches.match(request).then((cached) => cached ?? new Response(
          JSON.stringify({ error: "شما آفلاین هستید و این داده در دسترس نیست." }),
          { status: 503, headers: { "Content-Type": "application/json" } }
        )))
    )
    return
  }

  // Static assets & fonts & pages: cache-first with background refresh
  event.respondWith(
    caches.match(request).then((cached) => {
      const network = fetch(request)
        .then((res) => {
          if (res.ok) {
            const clone = res.clone()
            caches.open(STATIC_CACHE).then((cache) => cache.put(request, clone))
          }
          return res
        })
        .catch(() => cached)
      return cached || network
    })
  )
})
