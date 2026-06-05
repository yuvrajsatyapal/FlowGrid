import { Router } from "express"
import { Prisma } from "../../generated/prisma"
import { prisma } from "../lib/prisma"
import { validateJWT } from "../middleware/auth"
import { isOwnerOrAdmin, roleAtLeast } from "../lib/roles"
import crypto from "crypto"
import logger from "../lib/logger"
import type { Role } from "../../generated/prisma"
import multer from "multer"
import { storage, keyFromUrl } from "../lib/storage"
import { getOnlineUserIds } from "../lib/socket"

const ASSIGNABLE_ROLES: Role[] = ["ADMIN", "MEMBER", "VIEWER"]

const ALLOWED_IMAGE_MIMETYPES = new Set([
  "image/jpeg", "image/png", "image/gif", "image/webp", "image/avif",
])
const MAX_LOGO_SIZE = 2 * 1024 * 1024

const logoUploadMiddleware = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_LOGO_SIZE },
})

const VALID_COLORS = new Set([
  "blue", "teal", "purple", "orange", "pink", "yellow", "slate", "red",
])

const router = Router()

function toSlug(text: string): string {
  return text
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
}

// POST /api/workspaces — create org + workspace, mark onboarding complete
router.post("/", validateJWT, async (req, res) => {
  const { name } = req.body as { name?: string }

  if (!name || typeof name !== "string" || name.trim().length === 0) {
    res.status(400).json({ error: { message: "name is required", status: 400 } })
    return
  }
  if (name.trim().length > 100) {
    res.status(400).json({ error: { message: "name must be 100 characters or fewer", status: 400 } })
    return
  }

  const workspaceName = name.trim()
  const userId = req.user!.id

  // Build slug inside the transaction to avoid TOCTOU race; catch P2002 on collision
  const baseSlug = toSlug(workspaceName) || "workspace"
  const candidateSlug = `${baseSlug}-${crypto.randomUUID().slice(0, 8)}`

  try {
    const result = await prisma.$transaction(async (tx) => {
      const org = await tx.organization.create({
        data: { name: workspaceName, slug: candidateSlug, ownerId: userId },
      })

      await tx.organizationMember.create({
        data: { organizationId: org.id, userId, role: "OWNER" },
      })

      const workspace = await tx.workspace.create({
        data: {
          organizationId: org.id,
          name: workspaceName,
          slug: candidateSlug,
        },
      })

      await tx.workspaceMember.create({
        data: { workspaceId: workspace.id, userId, role: "OWNER" },
      })

      await tx.user.update({
        where: { id: userId },
        data: { onboardingCompleted: true },
      })

      return { org, workspace }
    })

    res.status(201).json({
      workspace: {
        id: result.workspace.id,
        name: result.workspace.name,
        slug: result.workspace.slug,
        organizationId: result.org.id,
      },
    })
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
      // Slug collision — extremely unlikely with UUID suffix, but handle gracefully
      res.status(409).json({ error: { message: "A workspace with that name already exists. Try a different name.", status: 409 } })
      return
    }
    logger.warn("Workspace create failed", { error: err instanceof Error ? err.message : err })
    res.status(500).json({ error: { message: "Failed to create workspace", status: 500 } })
  }
})

// GET /api/workspaces — list workspaces the current user belongs to
router.get("/", validateJWT, async (req, res) => {
  try {
    const memberships = await prisma.workspaceMember.findMany({
      where: { userId: req.user!.id },
      include: {
        workspace: {
          select: { id: true, name: true, slug: true, organizationId: true, deletedAt: true, logoUrl: true, color: true },
        },
      },
    })

    const workspaces = memberships
      .filter((m) => m.workspace.deletedAt === null)
      .map((m) => ({
        id: m.workspace.id,
        name: m.workspace.name,
        slug: m.workspace.slug,
        organizationId: m.workspace.organizationId,
        role: m.role,
        logoUrl: m.workspace.logoUrl,
        color: m.workspace.color,
      }))

    res.json({ workspaces })
  } catch {
    res.status(500).json({ error: { message: "Failed to fetch workspaces", status: 500 } })
  }
})

// GET /api/workspaces/one?id=xxx — workspace detail + member count (membership required)
router.get("/one", validateJWT, async (req, res) => {
  const workspaceId = req.query.id as string | undefined
  if (!workspaceId) {
    res.status(400).json({ error: { message: "id is required", status: 400 } })
    return
  }

  try {
    const membership = await prisma.workspaceMember.findUnique({
      where: { workspaceId_userId: { workspaceId, userId: req.user!.id } },
    })
    if (!membership) {
      res.status(404).json({ error: { message: "Workspace not found", status: 404 } })
      return
    }

    const workspace = await prisma.workspace.findUnique({
      where: { id: workspaceId },
      include: {
        _count: { select: { members: true, boards: true } },
        organization: { select: { id: true, name: true, slug: true, ownerId: true } },
      },
    })
    if (!workspace || workspace.deletedAt !== null) {
      res.status(404).json({ error: { message: "Workspace not found", status: 404 } })
      return
    }

    res.json({
      workspace: {
        id: workspace.id,
        name: workspace.name,
        slug: workspace.slug,
        description: workspace.description,
        organizationId: workspace.organizationId,
        logoUrl: workspace.logoUrl,
        color: workspace.color,
        organization: workspace.organization,
        memberCount: workspace._count.members,
        boardCount: workspace._count.boards,
        role: membership.role,
        createdAt: workspace.createdAt,
      },
    })
  } catch {
    res.status(500).json({ error: { message: "Failed to fetch workspace", status: 500 } })
  }
})

// POST /api/workspaces/update?id=xxx — rename/description (OWNER or ADMIN only)
router.post("/update", validateJWT, async (req, res) => {
  const workspaceId = req.query.id as string | undefined
  if (!workspaceId) {
    res.status(400).json({ error: { message: "id is required", status: 400 } })
    return
  }

  const { name, description, color } = req.body as { name?: string; description?: string; color?: string }

  if (name === undefined && description === undefined && color === undefined) {
    res.status(400).json({ error: { message: "At least one field is required", status: 400 } })
    return
  }
  if (name !== undefined) {
    if (typeof name !== "string" || name.trim().length === 0) {
      res.status(400).json({ error: { message: "name must be a non-empty string", status: 400 } })
      return
    }
    if (name.trim().length > 100) {
      res.status(400).json({ error: { message: "name must be 100 characters or fewer", status: 400 } })
      return
    }
  }

  if (color !== undefined && !VALID_COLORS.has(color)) {
    res.status(400).json({ error: { message: "color must be one of: blue, teal, purple, orange, pink, yellow, slate, red", status: 400 } })
    return
  }

  try {
    const membership = await prisma.workspaceMember.findUnique({
      where: { workspaceId_userId: { workspaceId, userId: req.user!.id } },
    })
    if (!membership) {
      res.status(404).json({ error: { message: "Workspace not found", status: 404 } })
      return
    }
    if (!isOwnerOrAdmin(membership.role)) {
      res.status(403).json({ error: { message: "You don't have permission to update this workspace", status: 403 } })
      return
    }

    const workspace = await prisma.workspace.findUnique({
      where: { id: workspaceId },
      select: { deletedAt: true },
    })
    if (!workspace || workspace.deletedAt !== null) {
      res.status(404).json({ error: { message: "Workspace not found", status: 404 } })
      return
    }

    const updated = await prisma.workspace.update({
      where: { id: workspaceId },
      data: {
        ...(name !== undefined && { name: name.trim() }),
        ...(description !== undefined && { description: description.trim() || null }),
        ...(color !== undefined && { color }),
      },
      select: { id: true, name: true, slug: true, description: true, organizationId: true, logoUrl: true, color: true },
    })

    res.json({ workspace: updated })
  } catch {
    res.status(500).json({ error: { message: "Failed to update workspace", status: 500 } })
  }
})

// POST /api/workspaces/delete?id=xxx — soft delete (OWNER only)
router.post("/delete", validateJWT, async (req, res) => {
  const workspaceId = req.query.id as string | undefined
  if (!workspaceId) {
    res.status(400).json({ error: { message: "id is required", status: 400 } })
    return
  }

  try {
    const membership = await prisma.workspaceMember.findUnique({
      where: { workspaceId_userId: { workspaceId, userId: req.user!.id } },
    })
    if (!membership) {
      res.status(404).json({ error: { message: "Workspace not found", status: 404 } })
      return
    }
    if (membership.role !== "OWNER") {
      res.status(403).json({ error: { message: "Only the workspace owner can delete it", status: 403 } })
      return
    }

    const workspace = await prisma.workspace.findUnique({
      where: { id: workspaceId },
      select: { deletedAt: true },
    })
    if (!workspace || workspace.deletedAt !== null) {
      res.status(404).json({ error: { message: "Workspace not found", status: 404 } })
      return
    }

    await prisma.workspace.update({
      where: { id: workspaceId },
      data: { deletedAt: new Date() },
    })

    res.json({ message: "Workspace deleted" })
  } catch {
    res.status(500).json({ error: { message: "Failed to delete workspace", status: 500 } })
  }
})

// GET /api/workspaces/members?workspaceId=xxx — list members for assignee picker (any member)
router.get("/members", validateJWT, async (req, res) => {
  const workspaceId = req.query.workspaceId as string | undefined
  if (!workspaceId) {
    res.status(400).json({ error: { message: "workspaceId is required", status: 400 } })
    return
  }

  try {
    const membership = await prisma.workspaceMember.findUnique({
      where: { workspaceId_userId: { workspaceId, userId: req.user!.id } },
    })
    if (!membership) {
      res.status(404).json({ error: { message: "Workspace not found", status: 404 } })
      return
    }

    const workspace = await prisma.workspace.findUnique({
      where: { id: workspaceId },
      select: { deletedAt: true },
    })
    if (!workspace || workspace.deletedAt !== null) {
      res.status(404).json({ error: { message: "Workspace not found", status: 404 } })
      return
    }

    const memberships = await prisma.workspaceMember.findMany({
      where: { workspaceId },
      include: { user: { select: { id: true, name: true, email: true, avatarUrl: true } } },
      orderBy: { user: { name: "asc" } },
    })

    const onlineIds = new Set(await getOnlineUserIds(memberships.map((m) => m.user.id)))

    const members = memberships.map((m) => ({
      id: m.id,           // WorkspaceMember.id — used for update/remove calls
      userId: m.user.id,  // User.id — used for identity comparisons
      name: m.user.name,
      email: m.user.email,
      avatarUrl: m.user.avatarUrl,
      role: m.role,
      online: onlineIds.has(m.user.id),
      createdAt: m.createdAt.toISOString(),
    }))

    res.json({ members })
  } catch {
    res.status(500).json({ error: { message: "Failed to fetch members", status: 500 } })
  }
})

// POST /api/workspaces/members/update?memberId= — change a member's role (OWNER | ADMIN)
router.post("/members/update", validateJWT, async (req, res) => {
  const memberId = req.query.memberId as string | undefined
  if (!memberId) {
    res.status(400).json({ error: { message: "memberId is required", status: 400 } })
    return
  }
  const { role } = req.body as { role?: string }
  const newRole = (role?.toUpperCase() as Role) ?? undefined
  if (!newRole || !ASSIGNABLE_ROLES.includes(newRole)) {
    res.status(400).json({ error: { message: "role must be ADMIN, MEMBER, or VIEWER", status: 400 } })
    return
  }

  try {
    const target = await prisma.workspaceMember.findUnique({
      where: { id: memberId },
      include: { user: { select: { id: true, name: true, email: true, avatarUrl: true } } },
    })
    if (!target) {
      res.status(404).json({ error: { message: "Member not found", status: 404 } })
      return
    }

    const actorMembership = await prisma.workspaceMember.findUnique({
      where: { workspaceId_userId: { workspaceId: target.workspaceId, userId: req.user!.id } },
    })
    if (!actorMembership || !isOwnerOrAdmin(actorMembership.role)) {
      res.status(403).json({ error: { message: "Only owners and admins can change member roles", status: 403 } })
      return
    }
    // Actor cannot promote to a role higher than their own
    if (!roleAtLeast(actorMembership.role, newRole)) {
      res.status(403).json({ error: { message: "You cannot assign a role higher than your own", status: 403 } })
      return
    }
    // Only OWNER can modify another OWNER's role (ADMIN cannot touch OWNER rows)
    if (target.role === "OWNER" && actorMembership.role !== "OWNER") {
      res.status(403).json({ error: { message: "Only owners can modify other owners.", status: 403 } })
      return
    }
    // Protect the last OWNER: block if this would remove the only owner
    if (target.role === "OWNER") {
      const ownerCount = await prisma.workspaceMember.count({
        where: { workspaceId: target.workspaceId, role: "OWNER" },
      })
      if (ownerCount <= 1) {
        res.status(403).json({ error: { code: "LAST_OWNER", message: "Workspace must have at least one owner.", status: 403 } })
        return
      }
    }

    const updated = await prisma.workspaceMember.update({
      where: { id: memberId },
      data: { role: newRole },
      include: { user: { select: { id: true, name: true, email: true, avatarUrl: true } } },
    })

    res.json({
      member: {
        id: updated.id,
        userId: updated.userId,
        workspaceId: updated.workspaceId,
        role: updated.role,
        user: updated.user,
      },
    })
  } catch {
    res.status(500).json({ error: { message: "Failed to update member role", status: 500 } })
  }
})

// POST /api/workspaces/members/remove?memberId= — remove a member (OWNER | ADMIN)
router.post("/members/remove", validateJWT, async (req, res) => {
  const memberId = req.query.memberId as string | undefined
  if (!memberId) {
    res.status(400).json({ error: { message: "memberId is required", status: 400 } })
    return
  }

  try {
    const target = await prisma.workspaceMember.findUnique({ where: { id: memberId } })
    if (!target) {
      res.status(404).json({ error: { message: "Member not found", status: 404 } })
      return
    }

    const actorMembership = await prisma.workspaceMember.findUnique({
      where: { workspaceId_userId: { workspaceId: target.workspaceId, userId: req.user!.id } },
    })
    if (!actorMembership || !isOwnerOrAdmin(actorMembership.role)) {
      res.status(403).json({ error: { message: "Only owners and admins can remove members", status: 403 } })
      return
    }
    // Only OWNER can remove another OWNER (ADMIN cannot touch OWNER rows)
    if (target.role === "OWNER" && actorMembership.role !== "OWNER") {
      res.status(403).json({ error: { message: "Only owners can remove other owners.", status: 403 } })
      return
    }
    // Protect the last OWNER: block removal if this is the only owner
    if (target.role === "OWNER") {
      const ownerCount = await prisma.workspaceMember.count({
        where: { workspaceId: target.workspaceId, role: "OWNER" },
      })
      if (ownerCount <= 1) {
        res.status(403).json({ error: { code: "LAST_OWNER", message: "Workspace must have at least one owner.", status: 403 } })
        return
      }
    }

    await prisma.workspaceMember.delete({ where: { id: memberId } })

    res.json({ success: true })
  } catch {
    res.status(500).json({ error: { message: "Failed to remove member", status: 500 } })
  }
})

// POST /api/workspaces/logo — upload workspace logo (OWNER | ADMIN)
router.post(
  "/logo",
  validateJWT,
  (req, res, next) => {
    logoUploadMiddleware.single("file")(req, res, (err) => {
      if (err instanceof multer.MulterError && err.code === "LIMIT_FILE_SIZE") {
        res.status(400).json({ error: { message: "Logo must be 2 MB or smaller", status: 400 } })
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
    const workspaceId = req.query.id as string | undefined
    if (!workspaceId) {
      res.status(400).json({ error: { message: "id is required", status: 400 } })
      return
    }
    if (!req.file) {
      res.status(400).json({ error: { message: "file is required", status: 400 } })
      return
    }
    if (!ALLOWED_IMAGE_MIMETYPES.has(req.file.mimetype)) {
      res.status(400).json({ error: { message: "Only image files are allowed", status: 400 } })
      return
    }

    try {
      const membership = await prisma.workspaceMember.findUnique({
        where: { workspaceId_userId: { workspaceId, userId: req.user!.id } },
      })
      if (!membership || !isOwnerOrAdmin(membership.role)) {
        res.status(403).json({ error: { message: "Only owners and admins can update workspace logo", status: 403 } })
        return
      }

      const workspace = await prisma.workspace.findUnique({
        where: { id: workspaceId, deletedAt: null },
        select: { logoUrl: true },
      })
      if (!workspace) {
        res.status(404).json({ error: { message: "Workspace not found", status: 404 } })
        return
      }

      if (workspace.logoUrl) {
        try {
          await storage.delete(keyFromUrl(workspace.logoUrl))
        } catch (err) {
          logger.warn("Failed to delete old workspace logo", { workspaceId, error: err instanceof Error ? err.message : err })
        }
      }

      const ext = req.file.originalname.split(".").pop()?.toLowerCase() ?? "jpg"
      const key = `workspace/${workspaceId}/logo-${crypto.randomBytes(8).toString("hex")}.${ext}`
      const url = await storage.upload(key, req.file.buffer, req.file.mimetype)

      const updated = await prisma.workspace.update({
        where: { id: workspaceId },
        data: { logoUrl: url },
        select: { id: true, name: true, slug: true, organizationId: true, logoUrl: true, color: true },
      })

      res.json({ workspace: updated })
    } catch {
      res.status(500).json({ error: { message: "Failed to upload logo", status: 500 } })
    }
  },
)

// POST /api/workspaces/logo/remove — delete logo and clear logoUrl (OWNER | ADMIN)
router.post("/logo/remove", validateJWT, async (req, res) => {
  const workspaceId = req.query.id as string | undefined
  if (!workspaceId) {
    res.status(400).json({ error: { message: "id is required", status: 400 } })
    return
  }
  try {
    const membership = await prisma.workspaceMember.findUnique({
      where: { workspaceId_userId: { workspaceId, userId: req.user!.id } },
    })
    if (!membership || !isOwnerOrAdmin(membership.role)) {
      res.status(403).json({ error: { message: "Only owners and admins can update workspace logo", status: 403 } })
      return
    }
    const workspace = await prisma.workspace.findUnique({
      where: { id: workspaceId, deletedAt: null },
      select: { logoUrl: true },
    })
    if (!workspace) {
      res.status(404).json({ error: { message: "Workspace not found", status: 404 } })
      return
    }
    if (workspace.logoUrl) {
      try {
        await storage.delete(keyFromUrl(workspace.logoUrl))
      } catch (err) {
        logger.warn("Failed to delete workspace logo from storage", { workspaceId, error: err instanceof Error ? err.message : err })
      }
    }
    const updated = await prisma.workspace.update({
      where: { id: workspaceId },
      data: { logoUrl: null },
      select: { id: true, name: true, slug: true, organizationId: true, logoUrl: true, color: true },
    })
    res.json({ workspace: updated })
  } catch {
    res.status(500).json({ error: { message: "Failed to remove logo", status: 500 } })
  }
})

export { router as workspacesRouter }
