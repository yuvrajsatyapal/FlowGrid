import { Ratelimit } from "@upstash/ratelimit"
import { redis } from "../lib/redis"
import type { RequestHandler } from "express"

// 10 requests per minute per IP on auth endpoints (sliding window)
const authRatelimit = new Ratelimit({
  redis,
  limiter: Ratelimit.slidingWindow(10, "1 m"),
  prefix: "rl:auth",
})

export const authRateLimit: RequestHandler = async (req, res, next) => {
  const ip = (req.headers["x-forwarded-for"] as string)?.split(",")[0].trim() ?? req.ip ?? "unknown"
  const { success, limit, remaining, reset } = await authRatelimit.limit(ip)

  res.setHeader("X-RateLimit-Limit", limit)
  res.setHeader("X-RateLimit-Remaining", remaining)
  res.setHeader("X-RateLimit-Reset", reset)

  if (!success) {
    res.status(429).json({ error: { message: "Too many requests. Please try again later.", status: 429 } })
    return
  }

  next()
}
