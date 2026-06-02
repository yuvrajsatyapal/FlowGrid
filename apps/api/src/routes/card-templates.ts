import { Router } from "express"
import { prisma } from "../lib/prisma"
import { validateJWT } from "../middleware/auth"

const router = Router()

// GET /api/card-templates?workspaceId=xxx
router.get("/", validateJWT, async (req, res) => {
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
    const templates = await prisma.cardTemplate.findMany({
      where: { workspaceId },
      orderBy: { name: "asc" },
      select: {
        id: true,
        name: true,
        description: true,
        priority: true,
        checklistsData: true,
        createdAt: true,
        createdBy: { select: { id: true, name: true, avatarUrl: true } },
      },
    })
    res.json({ templates })
  } catch {
    res.status(500).json({ error: { message: "Failed to fetch templates", status: 500 } })
  }
})

// POST /api/card-templates — create template
router.post("/", validateJWT, async (req, res) => {
  const { workspaceId, name, description, priority, checklistsData } = req.body as {
    workspaceId?: string
    name?: string
    description?: string | null
    priority?: string
    checklistsData?: unknown
  }
  if (!workspaceId) {
    res.status(400).json({ error: { message: "workspaceId is required", status: 400 } })
    return
  }
  if (!name || typeof name !== "string" || name.trim().length === 0) {
    res.status(400).json({ error: { message: "name is required", status: 400 } })
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

    const template = await prisma.cardTemplate.create({
      data: {
        workspaceId,
        name: name.trim(),
        description: description ?? null,
        priority: (priority as "NONE" | "LOW" | "MEDIUM" | "HIGH" | "URGENT") ?? "NONE",
        ...(checklistsData !== undefined && { checklistsData: checklistsData as object }),
        createdById: req.user!.id,
      },
      select: {
        id: true,
        name: true,
        description: true,
        priority: true,
        checklistsData: true,
        createdAt: true,
        createdBy: { select: { id: true, name: true, avatarUrl: true } },
      },
    })
    res.status(201).json({ template })
  } catch {
    res.status(500).json({ error: { message: "Failed to create template", status: 500 } })
  }
})

// POST /api/card-templates/delete?id=xxx
router.post("/delete", validateJWT, async (req, res) => {
  const id = req.query.id as string | undefined
  if (!id) {
    res.status(400).json({ error: { message: "id is required", status: 400 } })
    return
  }
  try {
    const template = await prisma.cardTemplate.findUnique({ where: { id }, select: { workspaceId: true, createdById: true } })
    if (!template) {
      res.status(404).json({ error: { message: "Template not found", status: 404 } })
      return
    }
    const membership = await prisma.workspaceMember.findUnique({
      where: { workspaceId_userId: { workspaceId: template.workspaceId, userId: req.user!.id } },
    })
    if (!membership) {
      res.status(404).json({ error: { message: "Template not found", status: 404 } })
      return
    }
    // Only creator or workspace owner/admin can delete
    if (template.createdById !== req.user!.id && membership.role === "MEMBER" || membership.role === "VIEWER") {
      res.status(403).json({ error: { message: "Only the creator or an admin can delete templates", status: 403 } })
      return
    }
    await prisma.cardTemplate.delete({ where: { id } })
    res.json({ success: true })
  } catch {
    res.status(500).json({ error: { message: "Failed to delete template", status: 500 } })
  }
})

export { router as cardTemplatesRouter }
