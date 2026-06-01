import { Router } from "express"
import { prisma } from "../lib/prisma"
import { validateJWT } from "../middleware/auth"
import type { AnalyticsData, CardsByPriority, CardsByBoard, ActivityByDay, TopMember } from "@flowgrid/types"
import type { Priority } from "../../generated/prisma"

export const analyticsRouter = Router()

// GET /api/analytics?workspace_id=<id>
analyticsRouter.get("/", validateJWT, async (req, res) => {
  const userId = req.user?.id
  if (!userId) {
    res.status(401).json({ error: { message: "Unauthorized", status: 401 } })
    return
  }

  const workspaceId = (req.query.workspace_id as string | undefined)?.trim()
  if (!workspaceId) {
    res.status(400).json({ error: { message: "workspace_id is required", status: 400 } })
    return
  }

  // RBAC — must be a workspace member
  const membership = await prisma.workspaceMember.findUnique({
    where: { workspaceId_userId: { workspaceId, userId } },
    select: { role: true },
  })
  if (!membership) {
    res.status(403).json({ error: { message: "Forbidden", status: 403 } })
    return
  }

  // Collect all board IDs in this workspace (used as the scope for card queries)
  const boards = await prisma.board.findMany({
    where: { workspaceId, deletedAt: null },
    select: { id: true, name: true },
  })
  const boardIds = boards.map((b) => b.id)

  // All active lists in those boards
  const lists = await prisma.list.findMany({
    where: { boardId: { in: boardIds }, deletedAt: null },
    select: { id: true, boardId: true },
  })
  const listIds = lists.map((l) => l.id)

  // Run all aggregations in parallel
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)

  const [
    totalCards,
    totalMembers,
    totalActivities,
    rawCardsByPriority,
    rawActivityOverTime,
    rawTopMembers,
  ] = await Promise.all([
    // Total active cards across workspace
    prisma.card.count({
      where: { listId: { in: listIds }, deletedAt: null },
    }),

    // Total workspace members
    prisma.workspaceMember.count({
      where: { workspaceId },
    }),

    // Total activities in workspace boards (last 30 days)
    prisma.activity.count({
      where: { boardId: { in: boardIds }, createdAt: { gte: thirtyDaysAgo } },
    }),

    // Cards grouped by priority
    prisma.card.groupBy({
      by: ["priority"],
      where: { listId: { in: listIds }, deletedAt: null },
      _count: { id: true },
      orderBy: { priority: "asc" },
    }),

    // Activity by day over last 30 days
    prisma.$queryRaw<{ day: Date; count: bigint }[]>`
      SELECT
        DATE_TRUNC('day', "createdAt") AS day,
        COUNT(*) AS count
      FROM "Activity"
      WHERE "boardId" = ANY(${boardIds}::text[])
        AND "createdAt" >= ${thirtyDaysAgo}
      GROUP BY day
      ORDER BY day ASC
    `,

    // Top 5 members by activity count
    prisma.$queryRaw<{ userId: string; name: string | null; avatarUrl: string | null; count: bigint }[]>`
      SELECT
        a."userId",
        u.name,
        u."avatarUrl",
        COUNT(*) AS count
      FROM "Activity" a
      JOIN "User" u ON u.id = a."userId"
      WHERE a."boardId" = ANY(${boardIds}::text[])
        AND a."createdAt" >= ${thirtyDaysAgo}
      GROUP BY a."userId", u.name, u."avatarUrl"
      ORDER BY count DESC
      LIMIT 5
    `,
  ])

  // Build cards-by-board map: boardId → count of active cards
  const listToBoardMap = Object.fromEntries(lists.map((l) => [l.id, l.boardId]))
  const cardRows = await prisma.card.findMany({
    where: { listId: { in: listIds }, deletedAt: null },
    select: { listId: true },
  })
  const boardCardCounts: Record<string, number> = {}
  for (const card of cardRows) {
    const bid = listToBoardMap[card.listId]
    if (bid) boardCardCounts[bid] = (boardCardCounts[bid] ?? 0) + 1
  }

  const cardsByBoard: CardsByBoard[] = boards
    .map((b) => ({ boardId: b.id, boardName: b.name, count: boardCardCounts[b.id] ?? 0 }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 8)

  // Shape responses
  const PRIORITY_ORDER: Priority[] = ["NONE", "LOW", "MEDIUM", "HIGH", "URGENT"]
  const priorityMap = Object.fromEntries(
    rawCardsByPriority.map((r) => [r.priority, r._count.id])
  )
  const cardsByPriority: CardsByPriority[] = PRIORITY_ORDER.map((p) => ({
    priority: p,
    count: priorityMap[p] ?? 0,
  }))

  const activityOverTime: ActivityByDay[] = rawActivityOverTime.map((r) => ({
    date: r.day.toISOString().slice(0, 10),
    count: Number(r.count),
  }))

  const topMembers: TopMember[] = rawTopMembers.map((r) => ({
    userId: r.userId,
    name: r.name,
    avatarUrl: r.avatarUrl,
    count: Number(r.count),
  }))

  const data: AnalyticsData = {
    totals: {
      totalCards,
      totalBoards: boards.length,
      totalMembers,
      totalActivities,
    },
    cardsByPriority,
    cardsByBoard,
    activityOverTime,
    topMembers,
  }

  res.json(data)
})
