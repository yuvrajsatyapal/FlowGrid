import { PrismaClient } from "../../generated/prisma"
import { env } from "../config/env"

// Singleton pattern — prevents exhausting DB connections in dev hot-reload
const globalForPrisma = globalThis as unknown as { prisma: PrismaClient | undefined }

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: env.NODE_ENV === "development" ? ["query", "error", "warn"] : ["error"],
  })

if (env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma
}
