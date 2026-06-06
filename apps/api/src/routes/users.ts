import crypto from "crypto"
import { Router } from "express"
import multer from "multer"
import { prisma } from "../lib/prisma"
import { storage, keyFromUrl } from "../lib/storage"
import logger from "../lib/logger"
import { validateJWT } from "../middleware/auth"

const ALLOWED_IMAGE_MIMETYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/gif",
  "image/webp",
  "image/avif",
])

const MAX_AVATAR_SIZE = 2 * 1024 * 1024 // 2 MB

const uploadMiddleware = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_AVATAR_SIZE },
})

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
        ...(avatarUrl !== undefined && { avatarUrl: avatarUrl.trim() }),
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

// POST /api/users/avatar — upload or replace profile photo
router.post(
  "/avatar",
  validateJWT,
  (req, res, next) => {
    uploadMiddleware.single("file")(req, res, (err) => {
      if (err instanceof multer.MulterError && err.code === "LIMIT_FILE_SIZE") {
        res.status(400).json({ error: { message: "Avatar must be 2 MB or smaller", status: 400 } })
        return
      }
      if (err) {
        res.status(400).json({ error: { message: "File upload failed", status: 400 } })
        return
      }
      next()
    })
  },
  async (req, res) => {
    if (!req.file) {
      res.status(400).json({ error: { message: "file is required", status: 400 } })
      return
    }
    if (!ALLOWED_IMAGE_MIMETYPES.has(req.file.mimetype)) {
      res.status(400).json({ error: { message: "Only image files are allowed", status: 400 } })
      return
    }

    try {
      const userId = req.user!.id

      // Delete old avatar from storage if one exists
      const existing = await prisma.user.findUnique({
        where: { id: userId },
        select: { avatarUrl: true },
      })
      if (existing?.avatarUrl) {
        try {
          await storage.delete(keyFromUrl(existing.avatarUrl))
        } catch (err) {
          logger.warn("Failed to delete old avatar", { userId, error: err instanceof Error ? err.message : err })
        }
      }

      const ext = req.file.originalname.split(".").pop()?.toLowerCase() ?? "jpg"
      const key = `user/${userId}/avatar-${crypto.randomBytes(8).toString("hex")}.${ext}`
      const url = await storage.upload(key, req.file.buffer, req.file.mimetype)

      const updated = await prisma.user.update({
        where: { id: userId },
        data: { avatarUrl: url },
        select: { id: true, email: true, name: true, avatarUrl: true, onboardingCompleted: true },
      })

      res.json({ user: updated })
    } catch {
      res.status(500).json({ error: { message: "Failed to upload avatar", status: 500 } })
    }
  },
)

// POST /api/users/avatar/remove — delete profile photo and clear avatarUrl
router.post("/avatar/remove", validateJWT, async (req, res) => {
  try {
    const userId = req.user!.id
    const existing = await prisma.user.findUnique({
      where: { id: userId },
      select: { avatarUrl: true },
    })
    if (existing?.avatarUrl) {
      try {
        await storage.delete(keyFromUrl(existing.avatarUrl))
      } catch (err) {
        logger.warn("Failed to delete avatar from storage", { userId, error: err instanceof Error ? err.message : err })
      }
    }
    const updated = await prisma.user.update({
      where: { id: userId },
      data: { avatarUrl: null },
      select: { id: true, email: true, name: true, avatarUrl: true, onboardingCompleted: true },
    })
    res.json({ user: updated })
  } catch {
    res.status(500).json({ error: { message: "Failed to remove avatar", status: 500 } })
  }
})

// ─── GET /api/users/search?q=&workspaceId= ────────────────────────────────────
// Searches for existing users who are NOT already members of the workspace.
// Used by WorkspaceMembersPage to find people to invite.
// Requires the actor to be a workspace member. Returns at most 10 results.
router.get("/search", validateJWT, async (req, res) => {
  const q = (req.query.q as string | undefined)?.trim() ?? ""
  const workspaceId = req.query.workspaceId as string | undefined

  if (!workspaceId) {
    res.status(400).json({ error: { message: "workspaceId is required", status: 400 } })
    return
  }
  if (q.length < 2) {
    res.status(400).json({ error: { message: "q must be at least 2 characters", status: 400 } })
    return
  }

  try {
    // Actor must be a workspace member
    const actorMembership = await prisma.workspaceMember.findUnique({
      where: { workspaceId_userId: { workspaceId, userId: req.user!.id } },
    })
    if (!actorMembership) {
      res.status(403).json({ error: { message: "Access denied", status: 403 } })
      return
    }

    // Find existing workspace member IDs to exclude
    const existingMembers = await prisma.workspaceMember.findMany({
      where: { workspaceId },
      select: { userId: true },
    })
    const excludedIds = new Set(existingMembers.map((m) => m.userId))
    excludedIds.add(req.user!.id) // exclude self

    const users = await prisma.user.findMany({
      where: {
        AND: [
          { id: { notIn: [...excludedIds] } },
          {
            OR: [
              { name: { contains: q, mode: "insensitive" } },
              { email: { contains: q, mode: "insensitive" } },
            ],
          },
        ],
      },
      select: { id: true, name: true, email: true, avatarUrl: true },
      take: 10,
      orderBy: { name: "asc" },
    })

    res.json({ users })
  } catch {
    res.status(500).json({ error: { message: "Search failed", status: 500 } })
  }
})

export { router as usersRouter }
