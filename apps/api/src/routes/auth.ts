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
import type { User } from "../../generated/prisma"
import crypto from "crypto"
import { env } from "../config/env"

const router = Router()

const REFRESH_COOKIE = "fg_refresh"
const COOKIE_OPTIONS = {
  httpOnly: true,
  secure: env.NODE_ENV === "production",
  sameSite: "lax" as const,
  path: "/api/auth",
  maxAge: REFRESH_TOKEN_TTL_SECONDS * 1000,
}

function issueTokens(user: Pick<User, "id" | "email">) {
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
  passport.authenticate("google", { session: false, failureRedirect: `${env.APP_URL}/login?error=oauth_failed` }),
  async (req, res) => {
    try {
      const user = req.user as Pick<User, "id" | "email">
      const { accessToken, refreshToken, jti } = issueTokens(user)

      // Write session and refresh tokens sequentially to avoid partial-write inconsistency
      await redis.set(redisKeys.session(user.id), accessToken, { ex: ACCESS_TOKEN_TTL_SECONDS })
      await redis.set(redisKeys.refresh(jti), user.id, { ex: REFRESH_TOKEN_TTL_SECONDS })

      res.cookie(REFRESH_COOKIE, refreshToken, COOKIE_OPTIONS)
      // Redirect without the access token in the URL — the httpOnly cookie is already set.
      // The SPA's AuthCallbackPage will call /api/auth/refresh to retrieve the access token
      // and user profile via the cookie, keeping the token out of browser history and logs.
      res.redirect(`${env.APP_URL}/auth/callback`)
    } catch (err) {
      console.warn("[auth] OAuth callback error:", err instanceof Error ? err.message : err)
      res.redirect(`${env.APP_URL}/login?error=server_error`)
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

    // Rotate: revoke old token first, then write new pair sequentially
    await redis.del(redisKeys.refresh(payload.jti))
    const { accessToken, refreshToken: newRefresh, jti: newJti } = issueTokens(user)
    await redis.set(redisKeys.session(user.id), accessToken, { ex: ACCESS_TOKEN_TTL_SECONDS })
    await redis.set(redisKeys.refresh(newJti), user.id, { ex: REFRESH_TOKEN_TTL_SECONDS })

    res.cookie(REFRESH_COOKIE, newRefresh, COOKIE_OPTIONS)
    res.json({
      accessToken,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        avatarUrl: user.avatarUrl,
        onboardingCompleted: user.onboardingCompleted,
      },
    })
  } catch (err) {
    console.warn("[auth] refresh failed:", err instanceof Error ? err.message : "unknown")
    res.status(401).json({ error: { message: "Invalid or expired refresh token", status: 401 } })
  }
})

// POST /api/auth/logout — clear session and refresh token
router.post("/logout", authRateLimit, async (req, res) => {
  const refreshToken = req.cookies?.[REFRESH_COOKIE] as string | undefined

  if (refreshToken) {
    try {
      const payload = verifyRefreshToken(refreshToken)
      await redis.del(redisKeys.refresh(payload.jti))
      await redis.del(redisKeys.session(payload.sub))
    } catch (err) {
      console.warn("[auth] logout token cleanup failed:", err instanceof Error ? err.message : "unknown")
    }
  }

  res.clearCookie(REFRESH_COOKIE, { ...COOKIE_OPTIONS, maxAge: 0 })
  res.json({ message: "Logged out" })
})

export { router as authRouter }
