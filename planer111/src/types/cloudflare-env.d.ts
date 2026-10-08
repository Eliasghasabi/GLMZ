/// <reference types="@cloudflare/workers-types" />

// StudyFlow's Cloudflare bindings — matches wrangler.jsonc
declare global {
  interface CloudflareEnv {
    /** Primary database (Cloudflare D1) */
    DB: D1Database
  }
}

export {}
