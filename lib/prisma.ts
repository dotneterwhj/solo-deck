import path from 'path'
import { PrismaBetterSqlite3 } from '@prisma/adapter-better-sqlite3'
import { PrismaClient } from './prisma-client/client'

const dbPath = path.resolve(process.cwd(), 'data/solodeck.db')
const dbUrl = `file:${dbPath.replace(/\\/g, '/')}`

const adapter = new PrismaBetterSqlite3(
  {
    url: process.env.DATABASE_URL || dbUrl,
  },
  {
    timestampFormat: 'iso8601',
  }
)

const globalForPrisma = globalThis as unknown as {
  prisma: InstanceType<typeof PrismaClient> | undefined
}

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({ adapter })

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = prisma
