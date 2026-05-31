import { Router } from "express"
import { redis } from "../lib/redis"

const router = Router()

router.get("/health", async (_req, res) => {
  try {
    await redis.ping()
    res.status(200).json({
      status: "ok",
      redis: "connected",
      timestamp: new Date().toISOString(),
    })
  } catch {
    // HTTP 200 intentionally — returning 500 would cause load balancers to
    // kill the pod over a transient Redis hiccup. Use redis:"error" for alerting.
    res.status(200).json({
      status: "degraded",
      redis: "error",
      timestamp: new Date().toISOString(),
    })
  }
})

export { router as healthRouter }
