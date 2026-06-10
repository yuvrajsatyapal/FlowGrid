import { Ratelimit } from "@upstash/ratelimit"
import { redis } from "../lib/redis"
import type { RequestHandler } from "express"
import logger from "../lib/logger"
import { env } from "../config/env"

// A single login is several requests against this middleware (/google → /google/callback
// → /refresh), so in local dev — where every account shares the localhost IP — a strict
// limit blocks rapid multi-account testing. Keep production protected, relax dev.
const AUTH_RATE_LIMIT = env.NODE_ENV === "production" ? 30 : 300

// Per-IP sliding window on auth endpoints.
const authRatelimit = new Ratelimit({
  redis,
  limiter: Ratelimit.slidingWindow(AUTH_RATE_LIMIT, "1 m"),
  prefix: "rl:auth",
})

export const authRateLimit: RequestHandler = async (req, res, next) => {
  const ip = (req.headers["x-forwarded-for"] as string)?.split(",")[0].trim() ?? req.ip ?? "unknown"

  try {
    const { success, limit, remaining, reset } = await authRatelimit.limit(ip)

    res.setHeader("X-RateLimit-Limit", limit)
    res.setHeader("X-RateLimit-Remaining", remaining)
    res.setHeader("X-RateLimit-Reset", reset)

    if (!success) {
      res.status(429).json({ error: { message: "Too many requests. Please try again later.", status: 429 } })
      return
    }
  } catch (err) {
    // Upstash unavailable — log and allow through rather than blocking all auth
    logger.error("Upstash rate limit check failed — allowing request through", { error: err instanceof Error ? err.message : err })
  }

  next()
}
