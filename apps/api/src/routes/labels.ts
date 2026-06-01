import { Router } from "express"
import { prisma } from "../lib/prisma"
import { validateJWT } from "../middleware/auth"
import { canWrite } from "../lib/roles"

const router = Router()

const HEX_COLOR_RE = /^#[0-9a-fA-F]{6}$/

// GET /api/labels?boardId=xxx — list all labels for a board (any workspace member)
router.get("/", validateJWT, async (req, res) => {
  const boardId = req.query.boardId as string | undefined
  if (!boardId) {
    res.status(400).json({ error: { message: "boardId is required", status: 400 } })
    return
  }

  try {
    const board = await prisma.board.findUnique({
      where: { id: boardId },
      select: { id: true, workspaceId: true, visibility: true, deletedAt: true },
    })
    if (!board || board.deletedAt !== null) {
      res.status(404).json({ error: { message: "Board not found", status: 404 } })
      return
    }

    const membership = await prisma.workspaceMember.findUnique({
      where: { workspaceId_userId: { workspaceId: board.workspaceId, userId: req.user!.id } },
    })
    if (!membership) {
      res.status(404).json({ error: { message: "Board not found", status: 404 } })
      return
    }

    if (board.visibility === "PRIVATE") {
      const boardMember = await prisma.boardMember.findUnique({
        where: { boardId_userId: { boardId: board.id, userId: req.user!.id } },
      })
      if (!boardMember) {
        res.status(404).json({ error: { message: "Board not found", status: 404 } })
        return
      }
    }

    const labels = await prisma.label.findMany({
      where: { boardId },
      orderBy: { createdAt: "asc" },
      select: { id: true, name: true, color: true },
    })
    res.json({ labels })
  } catch {
    res.status(500).json({ error: { message: "Failed to fetch labels", status: 500 } })
  }
})

// POST /api/labels — create a label for a board (OWNER | ADMIN)
router.post("/", validateJWT, async (req, res) => {
  const { boardId, name, color } = req.body as { boardId?: string; name?: string; color?: string }

  if (!boardId || typeof boardId !== "string") {
    res.status(400).json({ error: { message: "boardId is required", status: 400 } })
    return
  }
  if (!name || typeof name !== "string" || name.trim().length === 0) {
    res.status(400).json({ error: { message: "name is required", status: 400 } })
    return
  }
  if (name.trim().length > 32) {
    res.status(400).json({ error: { message: "name must be 32 characters or fewer", status: 400 } })
    return
  }
  if (!color || typeof color !== "string" || !HEX_COLOR_RE.test(color)) {
    res.status(400).json({ error: { message: "color must be a 6-digit hex color (e.g. #ef4444)", status: 400 } })
    return
  }

  try {
    const board = await prisma.board.findUnique({
      where: { id: boardId },
      select: { id: true, workspaceId: true, deletedAt: true },
    })
    if (!board || board.deletedAt !== null) {
      res.status(404).json({ error: { message: "Board not found", status: 404 } })
      return
    }

    const membership = await prisma.workspaceMember.findUnique({
      where: { workspaceId_userId: { workspaceId: board.workspaceId, userId: req.user!.id } },
    })
    if (!membership) {
      res.status(404).json({ error: { message: "Board not found", status: 404 } })
      return
    }
    if (!canWrite(membership.role)) {
      res.status(403).json({ error: { message: "Viewers cannot create labels", status: 403 } })
      return
    }

    const label = await prisma.label.create({
      data: { boardId, name: name.trim(), color },
      select: { id: true, name: true, color: true },
    })
    res.status(201).json({ label })
  } catch {
    res.status(500).json({ error: { message: "Failed to create label", status: 500 } })
  }
})

export { router as labelsRouter }
