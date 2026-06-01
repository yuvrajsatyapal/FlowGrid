import { Router } from "express"
import { prisma } from "../lib/prisma"
import { validateJWT } from "../middleware/auth"
import type { CardSearchResult } from "@flowgrid/types"

export const searchRouter = Router()

const MAX_LIMIT = 50
const DEFAULT_LIMIT = 20
const MIN_QUERY_LENGTH = 2
const MAX_QUERY_LENGTH = 200

// Raw query row shape returned from $queryRaw (FTS path only)
interface RawFtsRow {
  id: string
  title: string
  boardId: string
  boardName: string
  listId: string
  listName: string
  priority: string
  dueDate: Date | null
  rank: number
}

// GET /api/search?q=<query>&workspace_id=<uuid>&limit=20&offset=0
searchRouter.get("/", validateJWT, async (req, res) => {
  const userId = req.user?.id
  if (!userId) {
    res.status(401).json({ error: { message: "Unauthorized", status: 401 } })
    return
  }

  const q = ((req.query.q as string) ?? "").trim()
  const workspaceId = req.query.workspace_id as string | undefined

  if (q.length < MIN_QUERY_LENGTH) {
    res.status(400).json({ error: { message: "Query must be at least 2 characters", status: 400 } })
    return
  }
  if (q.length > MAX_QUERY_LENGTH) {
    res.status(400).json({ error: { message: "Query must be at most 200 characters", status: 400 } })
    return
  }
  if (!workspaceId) {
    res.status(400).json({ error: { message: "workspace_id is required", status: 400 } })
    return
  }

  const offset = Math.max(0, parseInt((req.query.offset as string) ?? "0", 10) || 0)
  const limit = Math.min(MAX_LIMIT, Math.max(1, parseInt((req.query.limit as string) ?? String(DEFAULT_LIMIT), 10) || DEFAULT_LIMIT))

  // Verify user is a workspace member (permission gate before any query)
  const membership = await prisma.workspaceMember.findUnique({
    where: { workspaceId_userId: { workspaceId, userId } },
    select: { id: true },
  })
  if (!membership) {
    res.status(403).json({ error: { message: "You do not have access to this workspace", status: 403 } })
    return
  }

  try {
    let cardIds: string[] = []
    let total = 0
    let usedFts = false

    // Phase A: full-text search via tsvector (PostgreSQL $queryRaw — Prisma has no FTS API)
    try {
      const ftsRows = await prisma.$queryRaw<RawFtsRow[]>`
        SELECT
          c.id,
          c.title,
          b.id        AS "boardId",
          b.name      AS "boardName",
          l.id        AS "listId",
          l.name      AS "listName",
          c.priority,
          c."dueDate",
          ts_rank(c."searchVector", websearch_to_tsquery('english', ${q})) AS rank
        FROM "Card" c
        JOIN "List" l  ON l.id = c."listId"  AND l."deletedAt" IS NULL
        JOIN "Board" b ON b.id = l."boardId" AND b."deletedAt" IS NULL
        JOIN "WorkspaceMember" wm
          ON wm."workspaceId" = b."workspaceId" AND wm."userId" = ${userId}
        WHERE c."deletedAt" IS NULL
          AND b."workspaceId" = ${workspaceId}::uuid
          AND c."searchVector" @@ websearch_to_tsquery('english', ${q})
          AND (
            b.visibility != 'PRIVATE'
            OR EXISTS (
              SELECT 1 FROM "BoardMember" bm
              WHERE bm."boardId" = b.id AND bm."userId" = ${userId}
            )
          )
        ORDER BY rank DESC
        LIMIT ${limit} OFFSET ${offset}
      `

      if (ftsRows.length > 0) {
        cardIds = ftsRows.map((r) => r.id)
        usedFts = true

        // Count: same FTS predicate only (not unioned with ILIKE)
        const countRows = await prisma.$queryRaw<[{ count: bigint }]>`
          SELECT COUNT(*)::bigint AS count
          FROM "Card" c
          JOIN "List" l  ON l.id = c."listId"  AND l."deletedAt" IS NULL
          JOIN "Board" b ON b.id = l."boardId" AND b."deletedAt" IS NULL
          JOIN "WorkspaceMember" wm
            ON wm."workspaceId" = b."workspaceId" AND wm."userId" = ${userId}
          WHERE c."deletedAt" IS NULL
            AND b."workspaceId" = ${workspaceId}::uuid
            AND c."searchVector" @@ websearch_to_tsquery('english', ${q})
            AND (
              b.visibility != 'PRIVATE'
              OR EXISTS (
                SELECT 1 FROM "BoardMember" bm
                WHERE bm."boardId" = b.id AND bm."userId" = ${userId}
              )
            )
        `
        total = Number(countRows[0]?.count ?? 0)
      }
    } catch {
      // websearch_to_tsquery can throw on empty stop-word queries — fall through to ILIKE
    }

    // Phase B: ILIKE fallback when FTS returns nothing — uses Prisma ORM (permission JOINs via nested where)
    if (!usedFts) {
      const ilikeWhere = {
        deletedAt: null,
        title: { contains: q, mode: "insensitive" as const },
        list: {
          deletedAt: null,
          board: {
            deletedAt: null,
            workspaceId,
            // PRIVATE board access: only include if user is a BoardMember
            OR: [
              { visibility: { not: "PRIVATE" as const } },
              {
                visibility: "PRIVATE" as const,
                members: { some: { userId } },
              },
            ],
            workspace: {
              members: { some: { userId } },
            },
          },
        },
      }

      const [ilikeCards, ilikeTotal] = await Promise.all([
        prisma.card.findMany({
          where: ilikeWhere,
          select: {
            id: true,
            title: true,
            priority: true,
            dueDate: true,
            list: {
              select: {
                id: true,
                name: true,
                board: { select: { id: true, name: true } },
              },
            },
          },
          orderBy: { createdAt: "desc" },
          take: limit,
          skip: offset,
        }),
        prisma.card.count({ where: ilikeWhere }),
      ])

      cardIds = ilikeCards.map((c) => c.id)
      total = ilikeTotal

      if (cardIds.length === 0) {
        res.json({ cards: [], total: 0, limit, offset })
        return
      }
    }

    // Batch-fetch labels and assignees for the returned card IDs (keeps FTS SQL clean)
    const [cardLabels, cardAssignees] = await Promise.all([
      prisma.cardLabel.findMany({
        where: { cardId: { in: cardIds } },
        select: {
          cardId: true,
          label: { select: { id: true, name: true, color: true } },
        },
      }),
      prisma.card.findMany({
        where: { id: { in: cardIds } },
        select: {
          id: true,
          title: true,
          priority: true,
          dueDate: true,
          assignee: { select: { id: true, name: true, avatarUrl: true } },
          list: {
            select: {
              id: true,
              name: true,
              board: { select: { id: true, name: true } },
            },
          },
        },
      }),
    ])

    // Build lookup maps keyed by card id
    const labelsByCard = new Map<string, { id: string; name: string; color: string }[]>()
    for (const cl of cardLabels) {
      const existing = labelsByCard.get(cl.cardId) ?? []
      existing.push(cl.label)
      labelsByCard.set(cl.cardId, existing)
    }

    const cardDataById = new Map(cardAssignees.map((c) => [c.id, c]))

    // Preserve result ordering from the query (FTS rank order or ILIKE recency order)
    const cards: CardSearchResult[] = cardIds.map((id) => {
      const data = cardDataById.get(id)
      if (!data) {
        return null
      }
      return {
        id: data.id,
        title: data.title,
        descriptionSnippet: null as string | null,
        boardId: data.list.board.id,
        boardName: data.list.board.name,
        listId: data.list.id,
        listName: data.list.name,
        priority: data.priority as CardSearchResult["priority"],
        labels: labelsByCard.get(id) ?? [],
        assignees: data.assignee ? [data.assignee] : [],
        dueDate: data.dueDate ? data.dueDate.toISOString() : null,
        rank: 0,
      }
    }).filter((c): c is CardSearchResult => c !== null)

    res.json({ cards, total, limit, offset })
  } catch {
    res.status(500).json({ error: { message: "Search failed", status: 500 } })
  }
})
