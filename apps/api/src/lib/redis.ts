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
  boardPresenceUsers: (boardId: string) => `board:${boardId}:presence:users`,
  boardPresenceCounts: (boardId: string) => `board:${boardId}:presence:counts`,
  // Global user online presence: a set of online user IDs + a hash of connection counts per user.
  // Both are reset on server boot (no sockets are connected yet) to self-heal stale entries
  // left behind by an unclean shutdown.
  onlineUsers: () => `presence:online:users`,
  onlineCounts: () => `presence:online:counts`,
}
