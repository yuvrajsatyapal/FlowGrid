import { Router } from "express"
import { prisma } from "../lib/prisma"
import { validateJWT } from "../middleware/auth"

const router = Router()

// PATCH /api/users/me — update display name and/or avatarUrl
router.patch("/me", validateJWT, async (req, res) => {
  const { name, avatarUrl } = req.body as { name?: string; avatarUrl?: string }

  if (name !== undefined && (typeof name !== "string" || name.trim().length === 0)) {
    res.status(400).json({ error: { message: "name must be a non-empty string", status: 400 } })
    return
  }
  if (name !== undefined && name.trim().length > 100) {
    res.status(400).json({ error: { message: "name must be 100 characters or fewer", status: 400 } })
    return
  }
  if (avatarUrl !== undefined) {
    if (typeof avatarUrl !== "string" || avatarUrl.trim().length === 0) {
      res.status(400).json({ error: { message: "avatarUrl must be a non-empty string", status: 400 } })
      return
    }
    // Only allow https:// URLs — prevents javascript: URIs and protocol-relative URLs
    try {
      const parsed = new URL(avatarUrl.trim())
      if (parsed.protocol !== "https:") {
        throw new Error("protocol not https")
      }
    } catch {
      res.status(400).json({ error: { message: "avatarUrl must be a valid https:// URL", status: 400 } })
      return
    }
  }

  try {
    const updated = await prisma.user.update({
      where: { id: req.user!.id },
      data: {
        ...(name !== undefined && { name: name.trim() }),
        ...(avatarUrl !== undefined && { avatarUrl }),
      },
      select: { id: true, email: true, name: true, avatarUrl: true, onboardingCompleted: true },
    })
    res.json({ user: updated })
  } catch {
    res.status(500).json({ error: { message: "Failed to update user", status: 500 } })
  }
})

// GET /api/users/me — current user profile
router.get("/me", validateJWT, async (req, res) => {
  try {
    const user = await prisma.user.findUnique({
      where: { id: req.user!.id },
      select: { id: true, email: true, name: true, avatarUrl: true, onboardingCompleted: true },
    })
    if (!user) {
      res.status(404).json({ error: { message: "User not found", status: 404 } })
      return
    }
    res.json({ user })
  } catch {
    res.status(500).json({ error: { message: "Failed to fetch user", status: 500 } })
  }
})

export { router as usersRouter }
