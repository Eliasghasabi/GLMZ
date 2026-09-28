/**
 * Creates (or resets) the demo user with a fully seeded dataset.
 * Run: node scripts/seed-demo.mjs
 * Login: demo@studyflow.ir / demo12345
 */
import { PrismaClient } from '@prisma/client'
import { pbkdf2Sync, randomBytes } from 'node:crypto'

const db = new PrismaClient()

const ITERATIONS = 100_000

function hashPassword(password) {
  const salt = randomBytes(16)
  const hash = pbkdf2Sync(password, salt, ITERATIONS, 32, 'sha256')
  return `pbkdf2$${ITERATIONS}$${salt.toString('hex')}$${hash.toString('hex')}`
}

const DEMO_EMAIL = 'demo@studyflow.ir'
const DEMO_PASSWORD = 'demo12345'

async function main() {
  const existing = await db.user.findUnique({ where: { email: DEMO_EMAIL } })
  if (existing) {
    await db.user.delete({ where: { id: existing.id } })
    console.log('existing demo user removed')
  }

  const user = await db.user.create({
    data: {
      name: 'الیاس',
      email: DEMO_EMAIL,
      passwordHash: hashPassword(DEMO_PASSWORD),
      avatarEmoji: '🦉',
      avatarColor: '#6366F1',
      settings: { create: {} },
    },
  })
  console.log('demo user created:', user.id, DEMO_EMAIL, '/', DEMO_PASSWORD)
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(() => db.$disconnect())
