import { Router } from "express"
import passport from "../lib/passport"
import { redis, redisKeys } from "../lib/redis"
import {
  signAccessToken,
  signRefreshToken,
  verifyRefreshToken,
  ACCESS_TOKEN_TTL_SECONDS,
  REFRESH_TOKEN_TTL_SECONDS,
} from "../lib/jwt"
import { prisma } from "../lib/prisma"
import { authRateLimit } from "../middleware/rateLimit"
import crypto from "crypto"

const router = Router()

const REFRESH_COOKIE = "fg_refresh"
const COOKIE_OPTIONS = {
  httpOnly: true,
  secure: process.env.NODE_ENV === "production",
  sameSite: "lax" as const,
  path: "/api/auth",
  maxAge: REFRESH_TOKEN_TTL_SECONDS * 1000,
}

interface UserLike {
  id: string
  email: string
  name?: string | null
  avatarUrl?: string | null
}

function issueTokens(user: UserLike) {
  const jti = crypto.randomUUID()
  const accessToken = signAccessToken({ sub: user.id, email: user.email })
  const refreshToken = signRefreshToken({ sub: user.id, jti })
  return { accessToken, refreshToken, jti }
}

// GET /api/auth/google — redirect to Google
router.get("/google", authRateLimit, passport.authenticate("google", { scope: ["email", "profile"], session: false }))

// GET /api/auth/google/callback — Google redirects here after auth
router.get(
  "/google/callback",
  authRateLimit,
  passport.authenticate("google", { session: false, failureRedirect: "/login?error=oauth_failed" }),
  async (req, res) => {
    try {
      const user = req.user as UserLike
      const { accessToken, refreshToken, jti } = issueTokens(user)

      await Promise.all([
        redis.set(redisKeys.session(user.id), accessToken, { ex: ACCESS_TOKEN_TTL_SECONDS }),
        redis.set(redisKeys.refresh(jti), user.id, { ex: REFRESH_TOKEN_TTL_SECONDS }),
      ])

      res.cookie(REFRESH_COOKIE, refreshToken, COOKIE_OPTIONS)
      // Redirect to frontend with access token; SPA reads it once then discards the URL param
      res.redirect(`/auth/callback?token=${accessToken}`)
    } catch {
      res.redirect("/login?error=server_error")
    }
  }
)

// POST /api/auth/refresh — exchange httpOnly cookie for new access token
router.post("/refresh", authRateLimit, async (req, res) => {
  const refreshToken = req.cookies?.[REFRESH_COOKIE] as string | undefined
  if (!refreshToken) {
    res.status(401).json({ error: { message: "No refresh token", status: 401 } })
    return
  }

  try {
    const payload = verifyRefreshToken(refreshToken)
    const storedUserId = await redis.get<string>(redisKeys.refresh(payload.jti))

    if (!storedUserId || storedUserId !== payload.sub) {
      res.status(401).json({ error: { message: "Invalid or expired refresh token", status: 401 } })
      return
    }

    const user = await prisma.user.findUnique({ where: { id: payload.sub } })
    if (!user) {
      res.status(401).json({ error: { message: "User not found", status: 401 } })
      return
    }

    // Rotate: revoke old refresh token, issue new pair
    const { accessToken, refreshToken: newRefresh, jti: newJti } = issueTokens(user)
    await Promise.all([
      redis.del(redisKeys.refresh(payload.jti)),
      redis.set(redisKeys.session(user.id), accessToken, { ex: ACCESS_TOKEN_TTL_SECONDS }),
      redis.set(redisKeys.refresh(newJti), user.id, { ex: REFRESH_TOKEN_TTL_SECONDS }),
    ])

    res.cookie(REFRESH_COOKIE, newRefresh, COOKIE_OPTIONS)
    res.json({ accessToken, user: { id: user.id, email: user.email, name: user.name, avatarUrl: user.avatarUrl } })
  } catch {
    res.status(401).json({ error: { message: "Invalid or expired refresh token", status: 401 } })
  }
})

// POST /api/auth/logout — clear session and refresh token
router.post("/logout", async (req, res) => {
  const refreshToken = req.cookies?.[REFRESH_COOKIE] as string | undefined

  if (refreshToken) {
    try {
      const payload = verifyRefreshToken(refreshToken)
      await Promise.all([
        redis.del(redisKeys.refresh(payload.jti)),
        redis.del(redisKeys.session(payload.sub)),
      ])
    } catch {
      // Token already invalid — still clear the cookie
    }
  }

  res.clearCookie(REFRESH_COOKIE, { ...COOKIE_OPTIONS, maxAge: 0 })
  res.json({ message: "Logged out" })
})

export { router as authRouter }
