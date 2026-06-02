import { Router } from "express"
import { prisma } from "../lib/prisma"
import { validateJWT } from "../middleware/auth"
import type { AnalyticsData, CardsByPriority, CardsByBoard, ActivityByDay, TopMember } from "@flowgrid/types"
import type { Priority } from "../../generated/prisma"
import logger from "../lib/logger"

export const analyticsRouter = Router()

const PRIORITY_ORDER: Priority[] = ["NONE", "LOW", "MEDIUM", "HIGH", "URGENT"]

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

  try {
    // RBAC — must be a workspace member
    const [membership, boards, totalMembers] = await Promise.all([
      prisma.workspaceMember.findUnique({
        where: { workspaceId_userId: { workspaceId, userId } },
        select: { role: true },
      }),
      prisma.board.findMany({
        where: { workspaceId, deletedAt: null },
        select: { id: true, name: true },
      }),
      prisma.workspaceMember.count({ where: { workspaceId } }),
    ])

    if (!membership) {
      res.status(403).json({ error: { message: "Forbidden", status: 403 } })
      return
    }

    const boardIds = boards.map((b) => b.id)

    // Short-circuit: no boards → empty analytics (avoids $queryRaw with empty array)
    if (boardIds.length === 0) {
      res.json({
        totals: { totalCards: 0, totalBoards: 0, totalMembers, totalActivities: 0 },
        cardsByPriority: PRIORITY_ORDER.map((p) => ({ priority: p, count: 0 })),
        cardsByBoard: [],
        activityOverTime: [],
        topMembers: [],
      } satisfies AnalyticsData)
      return
    }

    // All active lists in those boards
    const lists = await prisma.list.findMany({
      where: { boardId: { in: boardIds }, deletedAt: null },
      select: { id: true, boardId: true },
    })
    const listIds = lists.map((l) => l.id)

    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)

    // Run all aggregations in parallel — $queryRaw uses ::uuid[] for proper index usage
    const [
      totalCards,
      totalActivities,
      rawCardsByPriority,
      rawCardsByBoard,
      rawActivityOverTime,
      rawTopMembers,
    ] = await Promise.all([
      // Total active cards across workspace
      listIds.length > 0
        ? prisma.card.count({ where: { listId: { in: listIds }, deletedAt: null } })
        : Promise.resolve(0),

      // Total activities in workspace boards last 30 days
      prisma.activity.count({
        where: { boardId: { in: boardIds }, createdAt: { gte: thirtyDaysAgo } },
      }),

      // Cards grouped by priority
      listIds.length > 0
        ? prisma.card.groupBy({
            by: ["priority"],
            where: { listId: { in: listIds }, deletedAt: null },
            _count: { id: true },
            orderBy: { priority: "asc" },
          })
        : Promise.resolve([]),

      // Cards per board — single aggregation query (avoids unbounded findMany)
      listIds.length > 0
        ? prisma.$queryRaw<{ boardId: string; count: bigint }[]>`
            SELECT l."boardId", COUNT(*) AS count
            FROM "Card" c
            JOIN "List" l ON l.id = c."listId"
            WHERE c."listId" = ANY(${listIds}::text[])
              AND c."deletedAt" IS NULL
            GROUP BY l."boardId"
          `
        : Promise.resolve([]),

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

    // Shape responses
    const priorityMap = Object.fromEntries(
      (rawCardsByPriority as { priority: Priority; _count: { id: number } }[]).map((r) => [r.priority, r._count.id])
    )
    const cardsByPriority: CardsByPriority[] = PRIORITY_ORDER.map((p) => ({
      priority: p,
      count: priorityMap[p] ?? 0,
    }))

    const boardCountMap = Object.fromEntries(
      (rawCardsByBoard as { boardId: string; count: bigint }[]).map((r) => [r.boardId, Number(r.count)])
    )
    const cardsByBoard: CardsByBoard[] = boards
      .map((b) => ({ boardId: b.id, boardName: b.name, count: boardCountMap[b.id] ?? 0 }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 8)

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
  } catch (err) {
    logger.error("Analytics query failed", { error: err instanceof Error ? err.message : err })
    res.status(500).json({ error: { message: "Failed to load analytics", status: 500 } })
  }
})
