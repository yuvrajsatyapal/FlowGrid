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

  const days = Math.min(Math.max(Number(req.query.days ?? 30), 1), 365)

  try {
    // RBAC — must be a workspace member
    const [membership, totalMembers] = await Promise.all([
      prisma.workspaceMember.findUnique({
        where: { workspaceId_userId: { workspaceId, userId } },
        select: { role: true },
      }),
      prisma.workspaceMember.count({ where: { workspaceId } }),
    ])

    if (!membership) {
      res.status(403).json({ error: { message: "Forbidden", status: 403 } })
      return
    }

    // Private boards: OWNER/ADMIN see all; others only see boards they're a member of
    const isPrivileged = membership.role === "OWNER" || membership.role === "ADMIN"
    const boards = await prisma.board.findMany({
      where: {
        workspaceId,
        deletedAt: null,
        ...(isPrivileged
          ? {}
          : {
              OR: [
                { visibility: { not: "PRIVATE" as const } },
                { visibility: "PRIVATE" as const, members: { some: { userId } } },
              ],
            }),
      },
      select: { id: true, name: true },
    })

    const boardIds = boards.map((b) => b.id)

    // Short-circuit: no boards → empty analytics (avoids $queryRaw with empty array)
    if (boardIds.length === 0) {
      res.json({
        totals: { totalCards: 0, totalBoards: 0, totalMembers, totalActivities: 0, cardsTrendPct: 0, boardsTrendPct: 0, membersTrendPct: 0, activitiesTrendPct: 0 },
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

    const periodStart = new Date(Date.now() - days * 24 * 60 * 60 * 1000)
    const prevPeriodStart = new Date(Date.now() - 2 * days * 24 * 60 * 60 * 1000)
    // keep alias for queries that still reference the old name
    const thirtyDaysAgo = periodStart
    const sixtyDaysAgo = prevPeriodStart

    function trendPct(curr: number, prev: number): number {
      if (prev === 0) return curr > 0 ? 100 : 0
      return Math.round(((curr - prev) / prev) * 100)
    }

    // Run all aggregations in parallel — $queryRaw uses ::uuid[] for proper index usage
    const [
      totalCards,
      totalActivities,
      prevActivities,
      prevTotalMembers,
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

      // Previous period activities (30-60 days ago)
      prisma.activity.count({
        where: { boardId: { in: boardIds }, createdAt: { gte: sixtyDaysAgo, lt: thirtyDaysAgo } },
      }),

      // Previous period member count approximation (members joined before 30 days ago)
      prisma.workspaceMember.count({ where: { workspaceId, createdAt: { lt: thirtyDaysAgo } } }),

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

      // Activity by day over selected period
      prisma.$queryRaw<{ day: Date; count: bigint }[]>`
        SELECT
          DATE_TRUNC('day', "createdAt") AS day,
          COUNT(*) AS count
        FROM "Activity"
        WHERE "boardId" = ANY(${boardIds}::text[])
          AND "createdAt" >= ${periodStart}
        GROUP BY day
        ORDER BY day ASC
      `,

      // All workspace members with their role + activity count in period
      prisma.$queryRaw<{ userId: string; name: string | null; avatarUrl: string | null; role: string; count: bigint }[]>`
        SELECT
          wm."userId",
          u.name,
          u."avatarUrl",
          wm.role,
          COALESCE(act.count, 0) AS count
        FROM "WorkspaceMember" wm
        JOIN "User" u ON u.id = wm."userId"
        LEFT JOIN (
          SELECT "userId", COUNT(*) AS count
          FROM "Activity"
          WHERE "boardId" = ANY(${boardIds}::text[])
            AND "createdAt" >= ${periodStart}
          GROUP BY "userId"
        ) act ON act."userId" = wm."userId"
        WHERE wm."workspaceId" = ${workspaceId}
        ORDER BY count DESC
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
      role: r.role,
      count: Number(r.count),
    }))

    // Previous period card count: cards created before 30 days ago (approximate trend)
    const prevTotalCards = listIds.length > 0
      ? await prisma.card.count({ where: { listId: { in: listIds }, deletedAt: null, createdAt: { lt: thirtyDaysAgo } } })
      : 0
    const prevTotalBoards = await prisma.board.count({ where: { workspaceId, deletedAt: null, createdAt: { lt: thirtyDaysAgo } } })

    const data: AnalyticsData = {
      totals: {
        totalCards,
        totalBoards: boards.length,
        totalMembers,
        totalActivities,
        cardsTrendPct: trendPct(totalCards, prevTotalCards),
        boardsTrendPct: trendPct(boards.length, prevTotalBoards),
        membersTrendPct: trendPct(totalMembers, prevTotalMembers),
        activitiesTrendPct: trendPct(totalActivities, prevActivities),
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
