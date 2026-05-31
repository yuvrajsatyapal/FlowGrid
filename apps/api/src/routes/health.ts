import { Router } from "express"
import { redis } from "../lib/redis"

const router = Router()

router.get("/health", async (_req, res) => {
  try {
    await redis.ping()
    res.json({
      status: "ok",
      redis: "connected",
      timestamp: new Date().toISOString(),
    })
  } catch {
    // Return degraded (not 500) so load balancers don't kill the pod on Redis hiccup
    res.json({
      status: "degraded",
      redis: "error",
      timestamp: new Date().toISOString(),
    })
  }
})

export { router as healthRouter }
