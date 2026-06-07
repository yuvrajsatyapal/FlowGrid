import { Router } from "express"
import { prisma } from "../lib/prisma"
import { validateJWT } from "../middleware/auth"
import { canWrite, isOwnerOrAdmin } from "../lib/roles"
import { createNotification } from "../lib/notifications"
import { newInviteToken, inviteExpiresAt, autoExpireBoardInvites, canManageBoardInvites } from "../lib/invites"
import { emitWorkspaceEvent } from "../lib/socket"

const router = Router()

const VALID_VISIBILITIES = ["WORKSPACE", "PRIVATE"] as const
type BoardVisibility = (typeof VALID_VISIBILITIES)[number]

// ─── Permission helper ────────────────────────────────────────────────────────

// Returns the workspace membership for the requesting user, or null if not found.
// For PRIVATE boards, also checks that the user has a BoardMember row OR is a
// workspace OWNER/ADMIN (who implicitly see all boards).
// Writes 403/404 to res and returns null when access is denied.
async function checkBoardAccess(
  res: Parameters<Parameters<typeof router.get>[1]>[1],
  board: { id: string; workspaceId: string; visibility: string },
  userId: string,
  opts: { write?: boolean } = {},
) {
  const membership = await prisma.workspaceMember.findUnique({
    where: { workspaceId_userId: { workspaceId: board.workspaceId, userId } },
  })
  if (!membership) {
    res.status(404).json({ error: { message: "Board not found", status: 404 } })
    return null
  }

  if (opts.write && !canWrite(membership.role)) {
    res.status(403).json({ error: { message: "Viewers cannot modify boards", status: 403 } })
    return null
  }

  // OWNER and ADMIN on the workspace can always see private boards
  if (board.visibility === "PRIVATE" && membership.role !== "OWNER" && membership.role !== "ADMIN") {
    const boardMember = await prisma.boardMember.findUnique({
      where: { boardId_userId: { boardId: board.id, userId } },
    })
    if (!boardMember) {
      res.status(403).json({ error: { message: "You don't have access to this board", status: 403 } })
      return null
    }
  }

  return membership
}

// ─── POST /api/boards — create board ─────────────────────────────────────────
// When visibility is PRIVATE:
//   - A BoardMember row is created for the creator automatically.
//   - Optional invitedMemberIds creates BoardMember rows + fires invite notifications.
router.post("/", validateJWT, async (req, res) => {
  const { workspaceId, name, visibility, coverColor, invitedMemberIds } = req.body as {
    workspaceId?: string
    name?: string
    visibility?: string
    coverColor?: string
    invitedMemberIds?: string[]
  }

  if (!workspaceId || typeof workspaceId !== "string") {
    res.status(400).json({ error: { message: "workspaceId is required", status: 400 } })
    return
  }
  if (!name || typeof name !== "string" || name.trim().length === 0) {
    res.status(400).json({ error: { message: "name is required", status: 400 } })
    return
  }
  if (name.trim().length > 100) {
    res.status(400).json({ error: { message: "name must be 100 characters or fewer", status: 400 } })
    return
  }

  const boardVisibility: BoardVisibility = (visibility as BoardVisibility) ?? "WORKSPACE"
  if (!VALID_VISIBILITIES.includes(boardVisibility)) {
    res.status(400).json({ error: { message: "visibility must be WORKSPACE or PRIVATE", status: 400 } })
    return
  }

  if (coverColor !== undefined && coverColor !== null) {
    if (typeof coverColor !== "string" || coverColor.trim().length > 50) {
      res.status(400).json({ error: { message: "coverColor must be 50 characters or fewer", status: 400 } })
      return
    }
  }

  try {
    const membership = await prisma.workspaceMember.findUnique({
      where: { workspaceId_userId: { workspaceId, userId: req.user!.id } },
    })
    if (!membership) {
      res.status(404).json({ error: { message: "Workspace not found", status: 404 } })
      return
    }
    if (!canWrite(membership.role)) {
      res.status(403).json({ error: { message: "Viewers cannot create boards", status: 403 } })
      return
    }

    const workspace = await prisma.workspace.findUnique({
      where: { id: workspaceId },
      select: { deletedAt: true, name: true },
    })
    if (!workspace || workspace.deletedAt !== null) {
      res.status(404).json({ error: { message: "Workspace not found", status: 404 } })
      return
    }

    // Validate invited member IDs are real workspace members (and not the creator)
    const rawInvited = Array.isArray(invitedMemberIds) ? invitedMemberIds : []
    const dedupedInvited = [...new Set(rawInvited.filter((id) => id !== req.user!.id))]

    if (boardVisibility === "PRIVATE" && dedupedInvited.length > 0) {
      const validMembers = await prisma.workspaceMember.findMany({
        where: { workspaceId, userId: { in: dedupedInvited } },
        select: { userId: true },
      })
      const validIds = new Set(validMembers.map((m) => m.userId))
      const invalid = dedupedInvited.filter((id) => !validIds.has(id))
      if (invalid.length > 0) {
        res.status(400).json({ error: { message: "Some invited users are not workspace members", status: 400 } })
        return
      }
    }

    // Create board + BoardMember rows in a single transaction
    const board = await prisma.$transaction(async (tx) => {
      const created = await tx.board.create({
        data: {
          workspaceId,
          name: name.trim(),
          visibility: boardVisibility,
          coverColor: coverColor?.trim() || null,
          createdById: req.user!.id,
        },
      })

      // For PRIVATE boards: creator always gets a BoardMember row first
      if (boardVisibility === "PRIVATE") {
        await tx.boardMember.create({
          data: { boardId: created.id, userId: req.user!.id, role: "OWNER" },
        })

        // Invited members get MEMBER role
        if (dedupedInvited.length > 0) {
          await tx.boardMember.createMany({
            data: dedupedInvited.map((userId) => ({
              boardId: created.id,
              userId,
              role: "MEMBER" as const,
            })),
            skipDuplicates: true,
          })
        }
      }

      return created
    })

    // Fire invite notifications after the transaction succeeds (fire-and-forget)
    if (boardVisibility === "PRIVATE" && dedupedInvited.length > 0) {
      const creator = await prisma.user.findUnique({
        where: { id: req.user!.id },
        select: { name: true },
      })
      const inviterName = creator?.name ?? "Someone"

      for (const userId of dedupedInvited) {
        void createNotification({
          userId,
          type: "BOARD_INVITE",
          source: "SYSTEM",
          title: `${inviterName} invited you to join "${board.name}"`,
          body: `You've been invited to the private board "${board.name}" in ${workspace.name}.`,
          data: {
            boardId: board.id,
            boardName: board.name,
            workspaceId: board.workspaceId,
            workspaceName: workspace.name,
            invitedBy: req.user!.id,
            inviterName,
            createdAt: new Date().toISOString(),
          },
        })
      }
    }

    const boardPayload = {
      id: board.id,
      workspaceId: board.workspaceId,
      name: board.name,
      description: board.description,
      visibility: board.visibility,
      coverColor: board.coverColor,
      createdAt: board.createdAt,
      updatedAt: board.updatedAt,
      deletedAt: board.deletedAt,
      listCount: 0,
      cardCount: 0,
      members: [],
      memberCount: 0,
      isOwner: true,
    }

    res.status(201).json({ board: boardPayload })

    // Notify all workspace members watching the workspace page.
    // Only emit WORKSPACE boards — PRIVATE boards are invitation-only and
    // should not appear in other users' lists without explicit access.
    if (boardVisibility === "WORKSPACE") {
      emitWorkspaceEvent(workspaceId, "workspace:board:created", { board: { ...boardPayload, isOwner: false } })
    }
  } catch {
    res.status(500).json({ error: { message: "Failed to create board", status: 500 } })
  }
})

// ─── GET /api/boards — list boards ───────────────────────────────────────────
// PRIVATE boards: visible to workspace OWNER/ADMIN and users with a BoardMember row.
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

    const isPrivileged = membership.role === "OWNER" || membership.role === "ADMIN"

    const [boards, wsMembersRaw, memberCount] = await Promise.all([
      prisma.board.findMany({
        where: {
          workspaceId,
          deletedAt: null,
          // OWNERs/ADMINs see every board (including PRIVATE ones).
          // Everyone else sees: any non-PRIVATE board (WORKSPACE or legacy PUBLIC)
          // OR a PRIVATE board they have an explicit BoardMember row for.
          OR: isPrivileged
            ? undefined
            : [
                { visibility: { not: "PRIVATE" } },
                { visibility: "PRIVATE", members: { some: { userId: req.user!.id } } },
              ],
        },
        orderBy: { createdAt: "asc" },
        select: {
          id: true,
          workspaceId: true,
          name: true,
          description: true,
          visibility: true,
          coverColor: true,
          createdById: true,
          createdAt: true,
          updatedAt: true,
          deletedAt: true,
          lists: {
            where: { deletedAt: null },
            select: {
              _count: { select: { cards: { where: { deletedAt: null } } } },
            },
          },
          // Board-level members for PRIVATE boards (avatar cluster + count)
          // Filter to only workspace members to exclude stale rows from removed members.
          members: {
            where: {
              user: { workspaceMemberships: { some: { workspaceId } } },
            },
            take: 2,
            orderBy: { createdAt: "asc" as const },
            select: {
              user: { select: { id: true, name: true, avatarUrl: true } },
            },
          },
          _count: {
            select: {
              members: {
                where: {
                  user: { workspaceMemberships: { some: { workspaceId } } },
                },
              },
            },
          },
        },
      }),
      // Oldest 2 workspace members for avatar cluster on WORKSPACE boards
      prisma.workspaceMember.findMany({
        where: { workspaceId },
        take: 2,
        orderBy: { createdAt: "asc" },
        include: { user: { select: { id: true, name: true, avatarUrl: true } } },
      }),
      prisma.workspaceMember.count({ where: { workspaceId } }),
    ])

    const wsMembers = wsMembersRaw.map((m) => ({ id: m.user.id, name: m.user.name, avatarUrl: m.user.avatarUrl }))

    res.json({
      boards: boards.map((b) => {
        const isPrivate = b.visibility === "PRIVATE"
        const displayMembers = isPrivate
          ? b.members.map((m) => ({ id: m.user.id, name: m.user.name, avatarUrl: m.user.avatarUrl }))
          : wsMembers
        const displayMemberCount = isPrivate ? b._count.members : memberCount
        return {
          id: b.id,
          workspaceId: b.workspaceId,
          name: b.name,
          description: b.description,
          visibility: b.visibility,
          coverColor: b.coverColor,
          createdAt: b.createdAt,
          updatedAt: b.updatedAt,
          deletedAt: b.deletedAt,
          listCount: b.lists.length,
          cardCount: b.lists.reduce((acc, l) => acc + l._count.cards, 0),
          members: displayMembers,
          memberCount: displayMemberCount,
          isOwner: b.createdById === req.user!.id,
        }
      }),
    })
  } catch {
    res.status(500).json({ error: { message: "Failed to fetch boards", status: 500 } })
  }
})

// ─── GET /api/boards/one?id=xxx — board detail ───────────────────────────────
router.get("/one", validateJWT, async (req, res) => {
  const boardId = req.query.id as string | undefined
  if (!boardId) {
    res.status(400).json({ error: { message: "id is required", status: 400 } })
    return
  }

  try {
    const board = await prisma.board.findUnique({
      where: { id: boardId },
      include: { _count: { select: { lists: true } } },
    })
    if (!board || board.deletedAt !== null) {
      res.status(404).json({ error: { message: "Board not found", status: 404 } })
      return
    }

    const membership = await checkBoardAccess(res, board, req.user!.id)
    if (!membership) return

    res.json({
      board: {
        id: board.id,
        workspaceId: board.workspaceId,
        name: board.name,
        description: board.description,
        visibility: board.visibility,
        coverColor: board.coverColor,
        createdAt: board.createdAt,
        updatedAt: board.updatedAt,
        deletedAt: board.deletedAt,
        listCount: board._count.lists,
        role: membership.role,
        createdById: board.createdById,
      },
    })
  } catch {
    res.status(500).json({ error: { message: "Failed to fetch board", status: 500 } })
  }
})

// ─── POST /api/boards/update?id=xxx — rename, visibility, coverColor ─────────
router.post("/update", validateJWT, async (req, res) => {
  const boardId = req.query.id as string | undefined
  if (!boardId) {
    res.status(400).json({ error: { message: "id is required", status: 400 } })
    return
  }

  const { name, visibility, coverColor } = req.body as {
    name?: string
    visibility?: string
    coverColor?: string | null
  }

  if (name === undefined && visibility === undefined && coverColor === undefined) {
    res.status(400).json({ error: { message: "At least one of name, visibility, or coverColor is required", status: 400 } })
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

  if (visibility !== undefined && !VALID_VISIBILITIES.includes(visibility as BoardVisibility)) {
    res.status(400).json({ error: { message: "visibility must be WORKSPACE or PRIVATE", status: 400 } })
    return
  }

  if (coverColor !== undefined && coverColor !== null) {
    if (typeof coverColor !== "string" || coverColor.trim().length > 50) {
      res.status(400).json({ error: { message: "coverColor must be 50 characters or fewer", status: 400 } })
      return
    }
  }

  try {
    const board = await prisma.board.findUnique({ where: { id: boardId } })
    if (!board || board.deletedAt !== null) {
      res.status(404).json({ error: { message: "Board not found", status: 404 } })
      return
    }

    const membership = await checkBoardAccess(res, board, req.user!.id, { write: true })
    if (!membership) return

    if (!isOwnerOrAdmin(membership.role)) {
      res.status(403).json({ error: { message: "Only admins and owners can edit board settings", status: 403 } })
      return
    }

    const updateData: Record<string, unknown> = {}
    if (name !== undefined) updateData.name = name.trim()
    if (visibility !== undefined) updateData.visibility = visibility
    if (coverColor !== undefined) updateData.coverColor = coverColor === null ? null : coverColor.trim() || null

    const noChange =
      (name === undefined || name.trim() === board.name) &&
      (visibility === undefined || visibility === board.visibility) &&
      (coverColor === undefined || (coverColor === null ? board.coverColor === null : coverColor.trim() === board.coverColor))
    if (noChange) {
      res.json({
        board: {
          id: board.id,
          workspaceId: board.workspaceId,
          name: board.name,
          description: board.description,
          visibility: board.visibility,
          coverColor: board.coverColor,
          createdAt: board.createdAt,
          updatedAt: board.updatedAt,
          deletedAt: board.deletedAt,
        },
      })
      return
    }

    // When a board transitions WORKSPACE → PRIVATE, both the original creator and the
    // user making the change must keep access (either might differ, and createdById can be null).
    const becomingPrivate = visibility === "PRIVATE" && board.visibility !== "PRIVATE"
    const privilegedIds = new Set<string>()
    if (becomingPrivate) {
      if (board.createdById) privilegedIds.add(board.createdById)
      privilegedIds.add(req.user!.id)
    }

    const updated = await prisma.$transaction(async (tx) => {
      const result = await tx.board.update({ where: { id: boardId }, data: updateData })
      if (becomingPrivate) {
        for (const userId of privilegedIds) {
          const role = userId === board.createdById ? "OWNER" : membership.role
          await tx.boardMember.upsert({
            where: { boardId_userId: { boardId, userId } },
            update: {},
            create: { boardId, userId, role },
          })
        }
      }
      return result
    })

    res.json({
      board: {
        id: updated.id,
        workspaceId: updated.workspaceId,
        name: updated.name,
        description: updated.description,
        visibility: updated.visibility,
        coverColor: updated.coverColor,
        createdAt: updated.createdAt,
        updatedAt: updated.updatedAt,
        deletedAt: updated.deletedAt,
      },
    })

    emitWorkspaceEvent(updated.workspaceId, "workspace:board:updated", {
      id: updated.id,
      name: updated.name,
      visibility: updated.visibility,
      coverColor: updated.coverColor,
      updatedAt: updated.updatedAt,
    })
  } catch {
    res.status(500).json({ error: { message: "Failed to update board", status: 500 } })
  }
})

// ─── POST /api/boards/delete?id=xxx — soft delete (OWNER only) ───────────────
router.post("/delete", validateJWT, async (req, res) => {
  const boardId = req.query.id as string | undefined
  if (!boardId) {
    res.status(400).json({ error: { message: "id is required", status: 400 } })
    return
  }

  try {
    const board = await prisma.board.findUnique({ where: { id: boardId } })
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
    if (membership.role !== "OWNER") {
      res.status(403).json({ error: { message: "Only workspace owners can delete boards", status: 403 } })
      return
    }

    await prisma.board.update({ where: { id: boardId }, data: { deletedAt: new Date() } })

    res.json({ success: true })

    emitWorkspaceEvent(board.workspaceId, "workspace:board:deleted", { id: boardId })
  } catch {
    res.status(500).json({ error: { message: "Failed to delete board", status: 500 } })
  }
})

// ─── GET /api/boards/calendar?boardId=xxx ────────────────────────────────────
router.get("/calendar", validateJWT, async (req, res) => {
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

    const membership = await checkBoardAccess(res, board, req.user!.id)
    if (!membership) return

    const cards = await prisma.card.findMany({
      where: {
        deletedAt: null,
        list: { boardId, deletedAt: null },
      },
      orderBy: { dueDate: "asc" },
      select: {
        id: true,
        listId: true,
        title: true,
        priority: true,
        startDate: true,
        dueDate: true,
        assigneeId: true,
        coverColor: true,
        list: { select: { id: true, name: true } },
        assignee: { select: { id: true, name: true, avatarUrl: true } },
        labels: { select: { label: { select: { id: true, name: true, color: true } } } },
      },
    })

    const formatted = cards.map((card) => ({
      id: card.id,
      listId: card.listId,
      listTitle: card.list.name,
      title: card.title,
      priority: card.priority,
      startDate: card.startDate,
      dueDate: card.dueDate,
      assigneeId: card.assigneeId,
      assignee: card.assignee ? { id: card.assignee.id, name: card.assignee.name, avatarUrl: card.assignee.avatarUrl } : null,
      labels: card.labels.map((cl) => ({ id: cl.label.id, name: cl.label.name, color: cl.label.color })),
      coverColor: card.coverColor,
    }))

    res.json({ cards: formatted })
  } catch {
    res.status(500).json({ error: { message: "Failed to fetch calendar cards", status: 500 } })
  }
})

// ─── GET /api/boards/members?boardId=xxx — list BoardMember rows ──────────────
// Only meaningful for PRIVATE boards. Workspace OWNER/ADMIN and board creator can view.
router.get("/members", validateJWT, async (req, res) => {
  const boardId = req.query.boardId as string | undefined
  if (!boardId) {
    res.status(400).json({ error: { message: "boardId is required", status: 400 } })
    return
  }

  try {
    const board = await prisma.board.findUnique({
      where: { id: boardId },
      select: { id: true, workspaceId: true, visibility: true, deletedAt: true, createdById: true },
    })
    if (!board || board.deletedAt !== null) {
      res.status(404).json({ error: { message: "Board not found", status: 404 } })
      return
    }

    const membership = await checkBoardAccess(res, board, req.user!.id)
    if (!membership) return

    const members = await prisma.boardMember.findMany({
      where: { boardId },
      orderBy: { createdAt: "asc" },
      include: {
        user: { select: { id: true, name: true, email: true, avatarUrl: true } },
      },
    })

    res.json({
      members: members.map((m) => ({
        id: m.id,
        userId: m.user.id,
        name: m.user.name,
        email: m.user.email,
        avatarUrl: m.user.avatarUrl,
        role: m.role,
        createdAt: m.createdAt,
      })),
    })
  } catch {
    res.status(500).json({ error: { message: "Failed to fetch board members", status: 500 } })
  }
})

// ─── POST /api/boards/members/add — add a workspace member to a private board ─
// Only workspace OWNER/ADMIN or the board creator can add members.
router.post("/members/add", validateJWT, async (req, res) => {
  const { boardId, userId: targetUserId } = req.body as { boardId?: string; userId?: string }
  if (!boardId || !targetUserId) {
    res.status(400).json({ error: { message: "boardId and userId are required", status: 400 } })
    return
  }

  try {
    const board = await prisma.board.findUnique({
      where: { id: boardId },
      select: { id: true, workspaceId: true, visibility: true, deletedAt: true, createdById: true, name: true },
    })
    if (!board || board.deletedAt !== null) {
      res.status(404).json({ error: { message: "Board not found", status: 404 } })
      return
    }
    if (board.visibility !== "PRIVATE") {
      res.status(400).json({ error: { message: "Board access management is only for private boards", status: 400 } })
      return
    }

    const actorMembership = await prisma.workspaceMember.findUnique({
      where: { workspaceId_userId: { workspaceId: board.workspaceId, userId: req.user!.id } },
    })
    if (!actorMembership) {
      res.status(404).json({ error: { message: "Board not found", status: 404 } })
      return
    }

    // Only OWNER/ADMIN or the board creator can manage board members
    const canManage =
      actorMembership.role === "OWNER" ||
      actorMembership.role === "ADMIN" ||
      board.createdById === req.user!.id
    if (!canManage) {
      res.status(403).json({ error: { message: "Only the board creator or workspace admins can manage board access", status: 403 } })
      return
    }

    // Target user must be a workspace member
    const targetMembership = await prisma.workspaceMember.findUnique({
      where: { workspaceId_userId: { workspaceId: board.workspaceId, userId: targetUserId } },
    })
    if (!targetMembership) {
      res.status(404).json({ error: { message: "User is not a workspace member", status: 404 } })
      return
    }

    // Upsert — idempotent if already a member
    const boardMember = await prisma.boardMember.upsert({
      where: { boardId_userId: { boardId, userId: targetUserId } },
      update: {},
      create: { boardId, userId: targetUserId, role: "MEMBER" },
      include: { user: { select: { id: true, name: true, email: true, avatarUrl: true } } },
    })

    // Notify the added user (fire-and-forget)
    const [actor, workspace] = await Promise.all([
      prisma.user.findUnique({ where: { id: req.user!.id }, select: { name: true } }),
      prisma.workspace.findUnique({ where: { id: board.workspaceId }, select: { name: true } }),
    ])
    const inviterName = actor?.name ?? "Someone"
    void createNotification({
      userId: targetUserId,
      type: "BOARD_MEMBER_ADDED",
      source: "SYSTEM",
      title: `${inviterName} added you to the board "${board.name}"`,
      body: `You now have access to the private board "${board.name}" in ${workspace?.name ?? "the workspace"}.`,
      data: {
        boardId: board.id,
        boardName: board.name,
        workspaceId: board.workspaceId,
        workspaceName: workspace?.name ?? "",
        addedBy: req.user!.id,
        inviterName,
        createdAt: new Date().toISOString(),
      },
    })

    res.status(201).json({
      member: {
        id: boardMember.id,
        userId: boardMember.user.id,
        name: boardMember.user.name,
        email: boardMember.user.email,
        avatarUrl: boardMember.user.avatarUrl,
        role: boardMember.role,
        createdAt: boardMember.createdAt,
      },
    })
  } catch {
    res.status(500).json({ error: { message: "Failed to add board member", status: 500 } })
  }
})

// ─── POST /api/boards/members/remove — remove a member from a private board ───
// OWNER/ADMIN or board creator can remove any member. Board creator cannot be removed.
router.post("/members/remove", validateJWT, async (req, res) => {
  const { boardId, userId: targetUserId } = req.body as { boardId?: string; userId?: string }
  if (!boardId || !targetUserId) {
    res.status(400).json({ error: { message: "boardId and userId are required", status: 400 } })
    return
  }

  try {
    const board = await prisma.board.findUnique({
      where: { id: boardId },
      select: { id: true, workspaceId: true, visibility: true, deletedAt: true, createdById: true },
    })
    if (!board || board.deletedAt !== null) {
      res.status(404).json({ error: { message: "Board not found", status: 404 } })
      return
    }
    if (board.visibility !== "PRIVATE") {
      res.status(400).json({ error: { message: "Board access management is only for private boards", status: 400 } })
      return
    }

    const actorMembership = await prisma.workspaceMember.findUnique({
      where: { workspaceId_userId: { workspaceId: board.workspaceId, userId: req.user!.id } },
    })
    if (!actorMembership) {
      res.status(404).json({ error: { message: "Board not found", status: 404 } })
      return
    }

    const canManage =
      actorMembership.role === "OWNER" ||
      actorMembership.role === "ADMIN" ||
      board.createdById === req.user!.id
    if (!canManage) {
      res.status(403).json({ error: { message: "Only the board creator or workspace admins can manage board access", status: 403 } })
      return
    }

    // Protect the board creator — they cannot be removed from their own private board
    if (targetUserId === board.createdById) {
      res.status(403).json({ error: { message: "The board creator cannot be removed from the board", status: 403 } })
      return
    }

    await prisma.boardMember.deleteMany({ where: { boardId, userId: targetUserId } })

    res.json({ success: true })
  } catch {
    res.status(500).json({ error: { message: "Failed to remove board member", status: 500 } })
  }
})

// ─── POST /api/boards/invites — send a board invite (notification-first) ──────
// Creates a pending BoardInvite and fires a notification. Does NOT add the
// user as a BoardMember immediately — that happens only when they accept.
router.post("/invites", validateJWT, async (req, res) => {
  const { boardId, userId: inviteeUserId } = req.body as { boardId?: string; userId?: string }
  if (!boardId || !inviteeUserId) {
    res.status(400).json({ error: { message: "boardId and userId are required", status: 400 } })
    return
  }

  try {
    const board = await prisma.board.findUnique({
      where: { id: boardId },
      select: { id: true, workspaceId: true, visibility: true, deletedAt: true, createdById: true, name: true },
    })
    if (!board || board.deletedAt !== null) {
      res.status(404).json({ error: { message: "Board not found", status: 404 } })
      return
    }
    if (board.visibility !== "PRIVATE") {
      res.status(400).json({ error: { message: "Board invites are only for private boards", status: 400 } })
      return
    }

    const actorMembership = await prisma.workspaceMember.findUnique({
      where: { workspaceId_userId: { workspaceId: board.workspaceId, userId: req.user!.id } },
      include: { user: { select: { name: true, email: true } } },
    })
    if (!actorMembership) {
      res.status(404).json({ error: { message: "Board not found", status: 404 } })
      return
    }
    if (!canManageBoardInvites(actorMembership.role, board.createdById, req.user!.id)) {
      res.status(403).json({ error: { message: "Only the board creator or workspace admins can send board invites", status: 403 } })
      return
    }

    // Invitee must be a workspace member
    const inviteeMembership = await prisma.workspaceMember.findUnique({
      where: { workspaceId_userId: { workspaceId: board.workspaceId, userId: inviteeUserId } },
    })
    if (!inviteeMembership) {
      res.status(404).json({ error: { message: "User is not a workspace member", status: 404 } })
      return
    }

    // Cannot invite someone already on the board
    const existingBoardMember = await prisma.boardMember.findUnique({
      where: { boardId_userId: { boardId, userId: inviteeUserId } },
    })
    if (existingBoardMember) {
      res.status(409).json({ error: { code: "ALREADY_MEMBER", message: "This user is already a board member.", status: 409 } })
      return
    }

    // Auto-expire stale PENDING invites before the duplicate check
    await autoExpireBoardInvites(boardId, inviteeUserId)

    // Block if a fresh PENDING invite exists
    const existingPending = await prisma.boardInvite.findFirst({
      where: { boardId, inviteeId: inviteeUserId, status: "PENDING" },
    })
    if (existingPending) {
      res.status(409).json({ error: { code: "INVITE_PENDING", message: "A pending invite already exists for this user.", status: 409 } })
      return
    }

    const workspace = await prisma.workspace.findUnique({
      where: { id: board.workspaceId },
      select: { name: true },
    })
    const inviterName = actorMembership.user.name ?? actorMembership.user.email

    const invite = await prisma.boardInvite.create({
      data: {
        boardId,
        inviteeId: inviteeUserId,
        invitedById: req.user!.id,
        status: "PENDING",
        token: newInviteToken(), // internal only
        expiresAt: inviteExpiresAt(),
      },
      select: { id: true, status: true, expiresAt: true, createdAt: true },
    })

    void createNotification({
      userId: inviteeUserId,
      type: "BOARD_INVITE",
      source: "SYSTEM",
      title: `${inviterName} invited you to "${board.name}"`,
      body: `You've been invited to a private board in ${workspace?.name ?? "the workspace"}`,
      data: {
        boardInviteId: invite.id,
        boardId: board.id,
        boardName: board.name,
        workspaceId: board.workspaceId,
        workspaceName: workspace?.name ?? "",
        inviterName,
      },
    })

    res.status(201).json({ invite })
  } catch {
    res.status(500).json({ error: { message: "Failed to send board invite", status: 500 } })
  }
})

// ─── GET /api/boards/invites?boardId= — list pending board invites ────────────
// Returns all PENDING invites for a board; used by EditBoardModal to show
// "Invited" state for workspace members who have been invited but not yet joined.
router.get("/invites", validateJWT, async (req, res) => {
  const boardId = req.query.boardId as string | undefined
  if (!boardId) {
    res.status(400).json({ error: { message: "boardId is required", status: 400 } })
    return
  }

  try {
    const board = await prisma.board.findUnique({
      where: { id: boardId },
      select: { id: true, workspaceId: true, deletedAt: true, createdById: true },
    })
    if (!board || board.deletedAt !== null) {
      res.status(404).json({ error: { message: "Board not found", status: 404 } })
      return
    }

    const actorMembership = await prisma.workspaceMember.findUnique({
      where: { workspaceId_userId: { workspaceId: board.workspaceId, userId: req.user!.id } },
    })
    if (!actorMembership) {
      res.status(404).json({ error: { message: "Board not found", status: 404 } })
      return
    }
    if (!canManageBoardInvites(actorMembership.role, board.createdById, req.user!.id)) {
      res.status(403).json({ error: { message: "Only the board creator or workspace admins can view board invites", status: 403 } })
      return
    }

    const invites = await prisma.boardInvite.findMany({
      where: { boardId, status: "PENDING" },
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        inviteeId: true,
        status: true,
        expiresAt: true,
        createdAt: true,
        invitee: { select: { id: true, name: true, email: true, avatarUrl: true } },
      },
    })

    res.json({ invites })
  } catch {
    res.status(500).json({ error: { message: "Failed to fetch board invites", status: 500 } })
  }
})

// ─── POST /api/boards/invites/accept?id= — accept a board invite ─────────────
router.post("/invites/accept", validateJWT, async (req, res) => {
  const inviteId = req.query.id as string | undefined
  if (!inviteId) {
    res.status(400).json({ error: { message: "id is required", status: 400 } })
    return
  }

  try {
    const invite = await prisma.boardInvite.findUnique({
      where: { id: inviteId },
      include: { board: { select: { id: true, workspaceId: true, name: true, deletedAt: true } } },
    })

    if (!invite || invite.board.deletedAt !== null) {
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
      await prisma.boardInvite.update({ where: { id: invite.id }, data: { status: "EXPIRED" } })
      res.status(410).json({ error: { code: "INVITE_EXPIRED", message: "This invite has expired.", status: 410 } })
      return
    }

    if (invite.status !== "PENDING") {
      res.status(410).json({ error: { code: "INVITE_INVALID", message: "This invite is no longer valid.", status: 410 } })
      return
    }

    // Verify invitee is still a workspace member
    const workspaceMember = await prisma.workspaceMember.findUnique({
      where: { workspaceId_userId: { workspaceId: invite.board.workspaceId, userId: req.user!.id } },
    })
    if (!workspaceMember) {
      res.status(403).json({ error: { code: "NOT_WORKSPACE_MEMBER", message: "You are no longer a member of this workspace.", status: 403 } })
      return
    }

    // Idempotent: already a board member — mark accepted and return success
    const existingBoardMember = await prisma.boardMember.findUnique({
      where: { boardId_userId: { boardId: invite.boardId, userId: req.user!.id } },
    })
    if (existingBoardMember) {
      await prisma.boardInvite.update({ where: { id: invite.id }, data: { status: "ACCEPTED" } })
      res.json({ boardId: invite.boardId, boardName: invite.board.name, workspaceId: invite.board.workspaceId })
      return
    }

    await prisma.$transaction([
      prisma.boardMember.create({
        data: { boardId: invite.boardId, userId: req.user!.id, role: "MEMBER" },
      }),
      prisma.boardInvite.update({ where: { id: invite.id }, data: { status: "ACCEPTED" } }),
    ])

    // Notify the inviter
    const invitee = await prisma.user.findUnique({ where: { id: req.user!.id }, select: { name: true, email: true } })
    const inviteeName = invitee?.name ?? invitee?.email ?? "Someone"
    void createNotification({
      userId: invite.invitedById,
      type: "BOARD_INVITE_ACCEPTED",
      source: "SYSTEM",
      title: `${inviteeName} accepted your invite to "${invite.board.name}"`,
      data: {
        boardId: invite.boardId,
        boardName: invite.board.name,
        workspaceId: invite.board.workspaceId,
        inviteeName,
      },
    })

    res.json({ boardId: invite.boardId, boardName: invite.board.name, workspaceId: invite.board.workspaceId })
  } catch {
    res.status(500).json({ error: { message: "Failed to accept board invite", status: 500 } })
  }
})

// ─── POST /api/boards/invites/decline?id= — decline a board invite ───────────
router.post("/invites/decline", validateJWT, async (req, res) => {
  const inviteId = req.query.id as string | undefined
  if (!inviteId) {
    res.status(400).json({ error: { message: "id is required", status: 400 } })
    return
  }

  try {
    const invite = await prisma.boardInvite.findUnique({
      where: { id: inviteId },
      select: { id: true, inviteeId: true, status: true },
    })
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

    await prisma.boardInvite.update({ where: { id: inviteId }, data: { status: "DECLINED" } })
    res.json({ success: true })
  } catch {
    res.status(500).json({ error: { message: "Failed to decline board invite", status: 500 } })
  }
})

export { router as boardsRouter }
