import { Router } from "express"
import { prisma } from "../lib/prisma"
import { validateJWT } from "../middleware/auth"
import { createNotification } from "../lib/notifications"
import { isOwnerOrAdmin, roleAtLeast } from "../lib/roles"
import { newInviteToken, inviteExpiresAt, autoExpireWorkspaceInvites } from "../lib/invites"
import type { Role } from "../../generated/prisma"

const router = Router()

const ASSIGNABLE_ROLES: Role[] = ["ADMIN", "MEMBER", "VIEWER"]

// ─── POST /api/invites — create a workspace invite ────────────────────────────
// Invitee must already have an account. Notification is the delivery surface.
// No email is sent; no invite URL is generated.
router.post("/", validateJWT, async (req, res) => {
  const { workspaceId, userId: inviteeUserId, role } = req.body as {
    workspaceId?: string
    userId?: string
    role?: string
  }

  if (!workspaceId || typeof workspaceId !== "string") {
    res.status(400).json({ error: { message: "workspaceId is required", status: 400 } })
    return
  }
  if (!inviteeUserId || typeof inviteeUserId !== "string") {
    res.status(400).json({ error: { message: "userId is required", status: 400 } })
    return
  }
  const assignableRole = (role?.toUpperCase() as Role) ?? "MEMBER"
  if (!ASSIGNABLE_ROLES.includes(assignableRole)) {
    res.status(400).json({ error: { message: "role must be ADMIN, MEMBER, or VIEWER", status: 400 } })
    return
  }

  try {
    // Verify actor is an OWNER or ADMIN of the workspace
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

    // Invitee must have an account
    const invitee = await prisma.user.findUnique({
      where: { id: inviteeUserId },
      select: { id: true, name: true, email: true },
    })
    if (!invitee) {
      res.status(404).json({ error: { message: "User not found", status: 404 } })
      return
    }

    // Cannot invite someone who is already a member
    const existingMember = await prisma.workspaceMember.findUnique({
      where: { workspaceId_userId: { workspaceId, userId: inviteeUserId } },
    })
    if (existingMember) {
      res.status(409).json({ error: { code: "ALREADY_MEMBER", message: "This user is already a workspace member.", status: 409 } })
      return
    }

    // Auto-expire any stale PENDING invites before the duplicate check
    await autoExpireWorkspaceInvites(workspaceId, inviteeUserId)

    // Block if a fresh PENDING invite already exists
    const existingPending = await prisma.workspaceInvite.findFirst({
      where: { workspaceId, inviteeId: inviteeUserId, status: "PENDING" },
    })
    if (existingPending) {
      res.status(409).json({ error: { code: "INVITE_PENDING", message: "A pending invite already exists for this user.", status: 409 } })
      return
    }

    const inviterName = inviterMembership.user.name ?? inviterMembership.user.email
    const invite = await prisma.workspaceInvite.create({
      data: {
        workspaceId,
        inviteeId: inviteeUserId,
        invitedById: req.user!.id,
        role: assignableRole,
        token: newInviteToken(), // internal only
        status: "PENDING",
        expiresAt: inviteExpiresAt(),
      },
      select: { id: true, inviteeId: true, role: true, status: true, expiresAt: true, createdAt: true },
    })

    void createNotification({
      userId: inviteeUserId,
      type: "WORKSPACE_INVITE",
      source: "SYSTEM",
      title: `${inviterName} invited you to ${workspace.name}`,
      body: `You've been invited as ${assignableRole.charAt(0) + assignableRole.slice(1).toLowerCase()}`,
      data: {
        workspaceInviteId: invite.id,
        workspaceId,
        workspaceName: workspace.name,
        inviterName,
        role: assignableRole,
      },
    })

    res.json({ invite })
  } catch {
    res.status(500).json({ error: { message: "Failed to create invite", status: 500 } })
  }
})

// ─── GET /api/invites?workspaceId= — list pending invites (OWNER | ADMIN) ────
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
      select: {
        id: true,
        role: true,
        status: true,
        expiresAt: true,
        createdAt: true,
        invitee: { select: { id: true, name: true, email: true, avatarUrl: true } },
      },
    })

    res.json({ invites })
  } catch {
    res.status(500).json({ error: { message: "Failed to fetch invites", status: 500 } })
  }
})

// ─── POST /api/invites/accept?id= — accept a workspace invite ────────────────
router.post("/accept", validateJWT, async (req, res) => {
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
      res.status(410).json({ error: { code: "INVITE_INVALID", message: "This invite is no longer valid.", status: 410 } })
      return
    }

    // Only the invitee can accept
    if (invite.inviteeId !== req.user!.id) {
      res.status(403).json({ error: { code: "FORBIDDEN", message: "This invite was not sent to you.", status: 403 } })
      return
    }

    // Auto-expire if past expiry
    if (invite.status === "PENDING" && invite.expiresAt < new Date()) {
      await prisma.workspaceInvite.update({ where: { id: invite.id }, data: { status: "EXPIRED" } })
      res.status(410).json({ error: { code: "INVITE_EXPIRED", message: "This invite has expired. Ask the workspace owner to resend.", status: 410 } })
      return
    }

    if (invite.status !== "PENDING") {
      res.status(410).json({ error: { code: "INVITE_INVALID", message: "This invite is no longer valid.", status: 410 } })
      return
    }

    // Idempotent: already a member — mark accepted and return success
    const existingMember = await prisma.workspaceMember.findUnique({
      where: { workspaceId_userId: { workspaceId: invite.workspaceId, userId: req.user!.id } },
    })
    if (existingMember) {
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

    // Notify workspace OWNER/ADMINs
    const invitee = await prisma.user.findUnique({ where: { id: req.user!.id }, select: { name: true, email: true } })
    const inviteeName = invitee?.name ?? invitee?.email ?? "Someone"
    const admins = await prisma.workspaceMember.findMany({
      where: { workspaceId: invite.workspaceId, role: { in: ["OWNER", "ADMIN"] } },
      select: { userId: true },
    })
    for (const admin of admins) {
      if (admin.userId === req.user!.id) continue
      void createNotification({
        userId: admin.userId,
        type: "INVITE_ACCEPTED",
        source: "SYSTEM",
        title: `${inviteeName} joined ${invite.workspace.name}`,
        data: { workspaceId: invite.workspaceId, workspaceName: invite.workspace.name, inviteeName },
      })
    }

    res.json({ workspaceId: invite.workspaceId, workspaceName: invite.workspace.name, role: invite.role })
  } catch {
    res.status(500).json({ error: { message: "Failed to accept invite", status: 500 } })
  }
})

// ─── POST /api/invites/decline?id= — decline a workspace invite (invitee) ────
router.post("/decline", validateJWT, async (req, res) => {
  const inviteId = req.query.id as string | undefined
  if (!inviteId) {
    res.status(400).json({ error: { message: "id is required", status: 400 } })
    return
  }

  try {
    const invite = await prisma.workspaceInvite.findUnique({ where: { id: inviteId } })
    if (!invite) {
      res.status(404).json({ error: { message: "Invite not found", status: 404 } })
      return
    }
    if (invite.inviteeId !== req.user!.id) {
      res.status(403).json({ error: { code: "FORBIDDEN", message: "This invite was not sent to you.", status: 403 } })
      return
    }
    if (invite.status !== "PENDING") {
      res.status(409).json({ error: { code: "INVITE_NOT_PENDING", message: `This invite has already been ${invite.status.toLowerCase()}.`, status: 409 } })
      return
    }

    await prisma.workspaceInvite.update({ where: { id: inviteId }, data: { status: "DECLINED" } })
    res.json({ success: true })
  } catch {
    res.status(500).json({ error: { message: "Failed to decline invite", status: 500 } })
  }
})

// ─── POST /api/invites/resend?id= — re-notify invitee (OWNER | ADMIN) ────────
router.post("/resend", validateJWT, async (req, res) => {
  const inviteId = req.query.id as string | undefined
  if (!inviteId) {
    res.status(400).json({ error: { message: "id is required", status: 400 } })
    return
  }

  try {
    const invite = await prisma.workspaceInvite.findUnique({
      where: { id: inviteId },
      include: {
        workspace: { select: { id: true, name: true, deletedAt: true } },
        invitee: { select: { id: true } },
      },
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

    const updated = await prisma.workspaceInvite.update({
      where: { id: inviteId },
      data: {
        token: newInviteToken(), // refresh internal token
        status: "PENDING",
        expiresAt: inviteExpiresAt(),
        invitedById: req.user!.id,
      },
      select: { id: true, role: true, status: true, expiresAt: true, createdAt: true },
    })

    const inviterName = inviterMembership.user.name ?? inviterMembership.user.email
    void createNotification({
      userId: invite.invitee.id,
      type: "WORKSPACE_INVITE",
      source: "SYSTEM",
      title: `${inviterName} invited you to ${invite.workspace.name}`,
      body: `You've been invited as ${invite.role.charAt(0) + invite.role.slice(1).toLowerCase()}`,
      data: {
        workspaceInviteId: updated.id,
        workspaceId: invite.workspaceId,
        workspaceName: invite.workspace.name,
        inviterName,
        role: invite.role,
      },
    })

    res.json({ invite: updated })
  } catch {
    res.status(500).json({ error: { message: "Failed to resend invite", status: 500 } })
  }
})

// ─── POST /api/invites/revoke?id= — revoke a pending invite (OWNER | ADMIN) ──
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
