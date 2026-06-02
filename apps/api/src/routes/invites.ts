import { Router } from "express"
import crypto from "crypto"
import { prisma } from "../lib/prisma"
import { validateJWT } from "../middleware/auth"
import { sendInviteEmail } from "../lib/email"
import { createNotification } from "../lib/notifications"
import { isOwnerOrAdmin, roleAtLeast } from "../lib/roles"
import { env } from "../config/env"
import type { Role } from "../../generated/prisma"

const router = Router()

const INVITE_TTL_MS = 7 * 24 * 60 * 60 * 1000 // 7 days
const ASSIGNABLE_ROLES: Role[] = ["ADMIN", "MEMBER", "VIEWER"]

function newToken() {
  return crypto.randomBytes(32).toString("hex")
}

function expiresAt() {
  return new Date(Date.now() + INVITE_TTL_MS)
}

// GET /api/invites?workspaceId= — list pending invites (OWNER | ADMIN)
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
    if (!isOwnerOrAdmin(membership.role)) {
      res.status(403).json({ error: { message: "Only owners and admins can view pending invites", status: 403 } })
      return
    }

    const workspace = await prisma.workspace.findUnique({ where: { id: workspaceId }, select: { deletedAt: true } })
    if (!workspace || workspace.deletedAt !== null) {
      res.status(404).json({ error: { message: "Workspace not found", status: 404 } })
      return
    }

    const invites = await prisma.workspaceInvite.findMany({
      where: { workspaceId, status: "PENDING" },
      orderBy: { createdAt: "desc" },
      select: { id: true, email: true, role: true, status: true, expiresAt: true, createdAt: true, token: true },
    })

    const invitesWithUrl = invites.map((inv) => ({
      ...inv,
      inviteUrl: `${env.APP_URL}/invite/accept?token=${inv.token}`,
      token: undefined,
    }))
    res.json({ invites: invitesWithUrl })
  } catch {
    res.status(500).json({ error: { message: "Failed to fetch invites", status: 500 } })
  }
})

// POST /api/invites — create or upsert an invite (OWNER | ADMIN)
router.post("/", validateJWT, async (req, res) => {
  const { workspaceId, email, role } = req.body as { workspaceId?: string; email?: string; role?: string }

  if (!workspaceId || typeof workspaceId !== "string") {
    res.status(400).json({ error: { message: "workspaceId is required", status: 400 } })
    return
  }
  if (!email || typeof email !== "string" || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
    res.status(400).json({ error: { message: "A valid email address is required", status: 400 } })
    return
  }
  const normalizedEmail = email.trim().toLowerCase()
  const assignableRole = (role?.toUpperCase() as Role) ?? "MEMBER"
  if (!ASSIGNABLE_ROLES.includes(assignableRole)) {
    res.status(400).json({ error: { message: "role must be ADMIN, MEMBER, or VIEWER", status: 400 } })
    return
  }

  try {
    const inviterMembership = await prisma.workspaceMember.findUnique({
      where: { workspaceId_userId: { workspaceId, userId: req.user!.id } },
      include: { user: { select: { name: true, email: true } } },
    })
    if (!inviterMembership) {
      res.status(404).json({ error: { message: "Workspace not found", status: 404 } })
      return
    }
    if (!isOwnerOrAdmin(inviterMembership.role)) {
      res.status(403).json({ error: { message: "Only owners and admins can send invites", status: 403 } })
      return
    }
    // Admin cannot invite a role higher than their own
    if (!roleAtLeast(inviterMembership.role, assignableRole)) {
      res.status(403).json({ error: { message: "You cannot assign a role higher than your own", status: 403 } })
      return
    }

    const workspace = await prisma.workspace.findUnique({
      where: { id: workspaceId },
      select: { name: true, deletedAt: true },
    })
    if (!workspace || workspace.deletedAt !== null) {
      res.status(404).json({ error: { message: "Workspace not found", status: 404 } })
      return
    }

    // Check if email already belongs to a workspace member
    const existingMember = await prisma.workspaceMember.findFirst({
      where: { workspaceId, user: { email: normalizedEmail } },
    })
    if (existingMember) {
      res.status(409).json({ error: { code: "ALREADY_MEMBER", message: `${normalizedEmail} is already a workspace member.`, status: 409 } })
      return
    }

    const token = newToken()
    const invite = await prisma.workspaceInvite.upsert({
      where: { workspaceId_email: { workspaceId, email: normalizedEmail } },
      create: {
        workspaceId,
        email: normalizedEmail,
        role: assignableRole,
        token,
        invitedById: req.user!.id,
        status: "PENDING",
        expiresAt: expiresAt(),
      },
      update: {
        role: assignableRole,
        token,
        invitedById: req.user!.id,
        status: "PENDING",
        expiresAt: expiresAt(),
      },
      select: { id: true, email: true, role: true, status: true, expiresAt: true, createdAt: true },
    })

    const inviterName = inviterMembership.user.name ?? inviterMembership.user.email
    const inviteUrl = `${env.APP_URL}/invite/accept?token=${token}`
    void sendInviteEmail({ to: normalizedEmail, inviterName, workspaceName: workspace.name, role: assignableRole, inviteUrl })

    // Notify invitee in-app if they already have an account
    const invitee = await prisma.user.findUnique({ where: { email: normalizedEmail }, select: { id: true } })
    if (invitee) {
      void createNotification({
        userId: invitee.id,
        type: "WORKSPACE_INVITE",
        title: `${inviterName} invited you to ${workspace.name}`,
        body: `You've been invited as ${assignableRole.charAt(0) + assignableRole.slice(1).toLowerCase()}`,
        data: { inviteUrl, workspaceName: workspace.name, inviterName },
      })
    }

    res.json({ invite, inviteUrl })
  } catch {
    res.status(500).json({ error: { message: "Failed to create invite", status: 500 } })
  }
})

// POST /api/invites/accept?token= — accept an invite (authenticated user)
router.post("/accept", validateJWT, async (req, res) => {
  const token = req.query.token as string | undefined
  if (!token) {
    res.status(400).json({ error: { message: "token is required", status: 400 } })
    return
  }

  try {
    const invite = await prisma.workspaceInvite.findUnique({
      where: { token },
      include: { workspace: { select: { id: true, name: true, deletedAt: true } } },
    })

    if (!invite || invite.workspace.deletedAt !== null) {
      res.status(410).json({ error: { code: "INVITE_INVALID", message: "This invite is no longer valid.", status: 410 } })
      return
    }
    if (invite.status === "EXPIRED" || (invite.status === "PENDING" && invite.expiresAt < new Date())) {
      // Mark as expired if not already
      if (invite.status === "PENDING") {
        await prisma.workspaceInvite.update({ where: { id: invite.id }, data: { status: "EXPIRED" } })
      }
      res.status(410).json({ error: { code: "INVITE_EXPIRED", message: "Invite expired. Ask the workspace owner to resend.", status: 410 } })
      return
    }
    if (invite.status !== "PENDING") {
      res.status(410).json({ error: { code: "INVITE_INVALID", message: "This invite is no longer valid.", status: 410 } })
      return
    }

    // Verify the authenticated user's email matches the invite email
    const user = await prisma.user.findUnique({ where: { id: req.user!.id }, select: { email: true } })
    if (!user || user.email.toLowerCase() !== invite.email.toLowerCase()) {
      res.status(403).json({ error: { code: "EMAIL_MISMATCH", message: "This invite was sent to a different email address.", status: 403 } })
      return
    }

    // Check if already a member (race condition guard)
    const existingMember = await prisma.workspaceMember.findUnique({
      where: { workspaceId_userId: { workspaceId: invite.workspaceId, userId: req.user!.id } },
    })
    if (existingMember) {
      // Already a member — mark invite accepted and return success
      await prisma.workspaceInvite.update({ where: { id: invite.id }, data: { status: "ACCEPTED" } })
      res.json({ workspaceId: invite.workspaceId, workspaceName: invite.workspace.name, role: existingMember.role })
      return
    }

    await prisma.$transaction([
      prisma.workspaceMember.create({
        data: { workspaceId: invite.workspaceId, userId: req.user!.id, role: invite.role },
      }),
      prisma.workspaceInvite.update({ where: { id: invite.id }, data: { status: "ACCEPTED" } }),
    ])

    // Notify workspace OWNER + ADMINs that someone joined.
    // WorkspaceMember has no deletedAt — members are hard-deleted on removal.
    const inviteeId = req.user!.id
    const inviteeName = user.email
    const admins = await prisma.workspaceMember.findMany({
      where: { workspaceId: invite.workspaceId, role: { in: ["OWNER", "ADMIN"] } },
      select: { userId: true },
    })
    for (const admin of admins) {
      if (admin.userId === inviteeId) continue
      void createNotification({
        userId: admin.userId,
        type: "INVITE_ACCEPTED",
        title: `${inviteeName} joined ${invite.workspace.name}`,
        data: { workspaceId: invite.workspaceId, workspaceName: invite.workspace.name, inviteeName },
      })
    }

    res.json({ workspaceId: invite.workspaceId, workspaceName: invite.workspace.name, role: invite.role })
  } catch {
    res.status(500).json({ error: { message: "Failed to accept invite", status: 500 } })
  }
})

// POST /api/invites/resend?id= — resend invite, new token + reset expiry (OWNER | ADMIN)
router.post("/resend", validateJWT, async (req, res) => {
  const inviteId = req.query.id as string | undefined
  if (!inviteId) {
    res.status(400).json({ error: { message: "id is required", status: 400 } })
    return
  }

  try {
    const invite = await prisma.workspaceInvite.findUnique({
      where: { id: inviteId },
      include: { workspace: { select: { id: true, name: true, deletedAt: true } } },
    })
    if (!invite || invite.workspace.deletedAt !== null) {
      res.status(404).json({ error: { message: "Invite not found", status: 404 } })
      return
    }

    const inviterMembership = await prisma.workspaceMember.findUnique({
      where: { workspaceId_userId: { workspaceId: invite.workspaceId, userId: req.user!.id } },
      include: { user: { select: { name: true, email: true } } },
    })
    if (!inviterMembership || !isOwnerOrAdmin(inviterMembership.role)) {
      res.status(403).json({ error: { message: "Only owners and admins can resend invites", status: 403 } })
      return
    }

    const token = newToken()
    const updated = await prisma.workspaceInvite.update({
      where: { id: inviteId },
      data: { token, status: "PENDING", expiresAt: expiresAt(), invitedById: req.user!.id },
      select: { id: true, email: true, role: true, status: true, expiresAt: true, createdAt: true },
    })

    const inviterName = inviterMembership.user.name ?? inviterMembership.user.email
    const inviteUrl = `${env.APP_URL}/invite/accept?token=${token}`
    void sendInviteEmail({ to: invite.email, inviterName, workspaceName: invite.workspace.name, role: invite.role, inviteUrl })

    // Notify invitee in-app if they already have an account
    const invitee = await prisma.user.findUnique({ where: { email: invite.email }, select: { id: true } })
    if (invitee) {
      void createNotification({
        userId: invitee.id,
        type: "WORKSPACE_INVITE",
        title: `${inviterName} invited you to ${invite.workspace.name}`,
        body: `You've been invited as ${invite.role.charAt(0) + invite.role.slice(1).toLowerCase()}`,
        data: { inviteUrl, workspaceName: invite.workspace.name, inviterName },
      })
    }

    res.json({ invite: updated, inviteUrl })
  } catch {
    res.status(500).json({ error: { message: "Failed to resend invite", status: 500 } })
  }
})

// POST /api/invites/revoke?id= — revoke a pending invite (OWNER | ADMIN)
router.post("/revoke", validateJWT, async (req, res) => {
  const inviteId = req.query.id as string | undefined
  if (!inviteId) {
    res.status(400).json({ error: { message: "id is required", status: 400 } })
    return
  }

  try {
    const invite = await prisma.workspaceInvite.findUnique({
      where: { id: inviteId },
      select: { id: true, workspaceId: true, status: true },
    })
    if (!invite) {
      res.status(404).json({ error: { message: "Invite not found", status: 404 } })
      return
    }

    const membership = await prisma.workspaceMember.findUnique({
      where: { workspaceId_userId: { workspaceId: invite.workspaceId, userId: req.user!.id } },
    })
    if (!membership || !isOwnerOrAdmin(membership.role)) {
      res.status(403).json({ error: { message: "Only owners and admins can revoke invites", status: 403 } })
      return
    }
    if (invite.status !== "PENDING") {
      res.status(409).json({ error: { code: "INVITE_NOT_PENDING", message: `This invite has already been ${invite.status.toLowerCase()}.`, status: 409 } })
      return
    }

    await prisma.workspaceInvite.update({ where: { id: inviteId }, data: { status: "REVOKED" } })

    res.json({ success: true })
  } catch {
    res.status(500).json({ error: { message: "Failed to revoke invite", status: 500 } })
  }
})

export { router as invitesRouter }
