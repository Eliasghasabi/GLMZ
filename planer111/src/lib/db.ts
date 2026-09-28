import { PrismaClient } from '@prisma/client'
import { PrismaD1 } from '@prisma/adapter-d1'

/**
 * Database client — one API, two runtimes.
 *
 * ── Cloudflare Workers (production) ──
 * On Workers the PrismaClient is driven by the official D1 driver adapter
 * through the `DB` binding declared in wrangler.jsonc. Driver adapters run on
 * the Workers-native client engine: no Rust binary, no VPS — fully compatible
 * with the Cloudflare FREE plan.
 *
 * ── Node.js (local development) ──
 * Falls back to the standard Prisma engine over SQLite (DATABASE_URL in .env).
 *
 * All queries across the app are identical in both modes.
 */

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined
  __studyflowD1Warned?: boolean
}

function isCloudflareWorkers(): boolean {
  return (globalThis as { navigator?: { userAgent?: string } }).navigator?.userAgent === 'Cloudflare-Workers'
}

function createSqliteClient(): PrismaClient {
  return new PrismaClient({
    log: process.env.NODE_ENV === 'production' ? ['error'] : ['query'],
  })
}

async function createD1Client(): Promise<PrismaClient> {
  const { getCloudflareContext } = await import('@opennextjs/cloudflare')
  // async variant also works at worker-init scope (outside a request)
  const { env } = await getCloudflareContext({ async: true })
  return new PrismaClient({ adapter: new PrismaD1(env.DB), log: ['error'] })
}

export const db: PrismaClient =
  globalForPrisma.prisma ??
  (isCloudflareWorkers() ? await createD1Client() : createSqliteClient())

// Cache on the global object in Node.js to survive dev HMR reloads
if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = db
