import type { RequestHandler } from "express"
import { verifyAccessToken } from "../lib/jwt"

// Express.User is the minimal shape shared by Passport (Prisma User) and JWT payload
// Both have id + email; downstream routes use req.user.id for authorization
declare global {
  namespace Express {
    interface User {
      id: string
      email: string
    }
  }
}

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
  } catch {
    res.status(401).json({ error: { message: "Access token is invalid or expired", status: 401 } })
  }
}
