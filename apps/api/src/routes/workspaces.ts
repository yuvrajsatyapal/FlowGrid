import { Router } from "express"
import { Prisma } from "../../generated/prisma"
import { prisma } from "../lib/prisma"
import { validateJWT } from "../middleware/auth"
import crypto from "crypto"

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

  // Idempotency guard — prevent duplicate workspace creation after onboarding
  const currentUser = await prisma.user.findUnique({
    where: { id: userId },
    select: { onboardingCompleted: true },
  })
  if (currentUser?.onboardingCompleted) {
    res.status(409).json({ error: { message: "Onboarding already completed", status: 409 } })
    return
  }

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
      res.status(409).json({ error: { message: "A workspace with a similar name already exists. Try a different name.", status: 409 } })
      return
    }
    console.warn("[workspaces] create failed:", err instanceof Error ? err.message : err)
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
          select: { id: true, name: true, slug: true, organizationId: true, deletedAt: true },
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
      }))

    res.json({ workspaces })
  } catch {
    res.status(500).json({ error: { message: "Failed to fetch workspaces", status: 500 } })
  }
})

export { router as workspacesRouter }
