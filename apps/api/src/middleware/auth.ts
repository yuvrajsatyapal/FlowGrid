import type { RequestHandler } from "express"
import { verifyAccessToken } from "../lib/jwt"

export const validateJWT: RequestHandler = (req, res, next) => {
  const header = req.headers.authorization
  if (!header?.startsWith("Bearer ")) {
    res.status(401).json({ error: { message: "Missing or malformed Authorization header", status: 401 } })
    return
  }

  const token = header.slice(7)
  try {
    const payload = verifyAccessToken(token)
    req.user = { id: payload.sub, email: payload.email }
    next()
  } catch (err) {
    console.warn("[auth] JWT verification failed:", err instanceof Error ? err.message : "unknown")
    res.status(401).json({ error: { message: "Access token is invalid or expired", status: 401 } })
  }
}
