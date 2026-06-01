import { Redis } from "@upstash/redis"
import { env } from "../config/env"

export const redis = new Redis({
  url: env.UPSTASH_REDIS_REST_URL,
  token: env.UPSTASH_REDIS_REST_TOKEN,
})

// Key schema — all Redis keys are defined here to avoid typos
export const redisKeys = {
  session: (userId: string) => `session:${userId}`,
  refresh: (token: string) => `refresh:${token}`,
  rateLimit: (ip: string) => `rl:${ip}`,
  boardPresence: (boardId: string) => `board:${boardId}:presence`,
  boardPresenceUsers: (boardId: string) => `board:${boardId}:presence:users`,
  boardPresenceCounts: (boardId: string) => `board:${boardId}:presence:counts`,
}
