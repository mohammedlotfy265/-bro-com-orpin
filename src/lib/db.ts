import { PrismaClient } from '@prisma/client'

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined
}

export const db =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === 'development' ? ['query'] : [],
  })

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = db

export function userPublic(u: any) {
  return {
    id: u.id,
    name: u.name,
    phone: u.phone,
    role: u.role,
    points: u.points,
    active: u.active,
    approved: u.approved,
  }
}
