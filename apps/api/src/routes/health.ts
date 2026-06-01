import { Router } from "express"
import { redis } from "../lib/redis"
import { prisma } from "../lib/prisma"

const router = Router()

router.get("/health", async (_req, res) => {
  const checks = await Promise.allSettled([
    redis.ping(),
    prisma.$queryRaw`SELECT 1`,
  ])

  const redisOk = checks[0].status === "fulfilled"
  const dbOk = checks[1].status === "fulfilled"
  const allOk = redisOk && dbOk

  // Always return 200 — load balancers use this to keep the pod alive.
  // Consumers check the individual service fields for alerting.
  res.status(200).json({
    status: allOk ? "ok" : "degraded",
    redis: redisOk ? "connected" : "error",
    db: dbOk ? "connected" : "error",
    timestamp: new Date().toISOString(),
  })
})

export { router as healthRouter }
