import { Router } from "express"
import { prisma } from "../lib/prisma"
import { validateJWT } from "../middleware/auth"
import type { CardSearchResult } from "@flowgrid/types"

export const searchRouter = Router()

const MAX_LIMIT = 50
const DEFAULT_LIMIT = 20
const MIN_QUERY_LENGTH = 2

// Raw query row shape returned from $queryRaw
interface RawSearchRow {
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
  const userId = req.user!.id
  const q = ((req.query.q as string) ?? "").trim()
  const workspaceId = req.query.workspace_id as string | undefined

  if (q.length < MIN_QUERY_LENGTH) {
    res.status(400).json({ error: { message: "Query must be at least 2 characters", status: 400 } })
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
    res.status(404).json({ error: { message: "Workspace not found", status: 404 } })
    return
  }

  try {
    // Phase A: full-text search via tsvector
    let rawRows: RawSearchRow[] = []
    let total = 0

    try {
      const ftsRows = await prisma.$queryRaw<RawSearchRow[]>`
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
      rawRows = ftsRows
    } catch {
      // websearch_to_tsquery can throw on completely empty stop-word queries — fall through to ILIKE
    }

    // Phase B: ILIKE fallback when FTS returns nothing
    if (rawRows.length === 0) {
      const ilikeRows = await prisma.$queryRaw<RawSearchRow[]>`
        SELECT
          c.id,
          c.title,
          b.id        AS "boardId",
          b.name      AS "boardName",
          l.id        AS "listId",
          l.name      AS "listName",
          c.priority,
          c."dueDate",
          0.0::float  AS rank
        FROM "Card" c
        JOIN "List" l  ON l.id = c."listId"  AND l."deletedAt" IS NULL
        JOIN "Board" b ON b.id = l."boardId" AND b."deletedAt" IS NULL
        JOIN "WorkspaceMember" wm
          ON wm."workspaceId" = b."workspaceId" AND wm."userId" = ${userId}
        WHERE c."deletedAt" IS NULL
          AND b."workspaceId" = ${workspaceId}::uuid
          AND c.title ILIKE ${"%" + q + "%"}
          AND (
            b.visibility != 'PRIVATE'
            OR EXISTS (
              SELECT 1 FROM "BoardMember" bm
              WHERE bm."boardId" = b.id AND bm."userId" = ${userId}
            )
          )
        ORDER BY c."createdAt" DESC
        LIMIT ${limit} OFFSET ${offset}
      `
      rawRows = ilikeRows
    }

    // Count total matching cards (re-run without LIMIT for total)
    if (rawRows.length > 0) {
      const countRows = await prisma.$queryRaw<[{ count: bigint }]>`
        SELECT COUNT(*)::bigint AS count
        FROM "Card" c
        JOIN "List" l  ON l.id = c."listId"  AND l."deletedAt" IS NULL
        JOIN "Board" b ON b.id = l."boardId" AND b."deletedAt" IS NULL
        JOIN "WorkspaceMember" wm
          ON wm."workspaceId" = b."workspaceId" AND wm."userId" = ${userId}
        WHERE c."deletedAt" IS NULL
          AND b."workspaceId" = ${workspaceId}::uuid
          AND (
            c."searchVector" @@ websearch_to_tsquery('english', ${q})
            OR c.title ILIKE ${"%" + q + "%"}
          )
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

    if (rawRows.length === 0) {
      res.json({ cards: [], total: 0, limit, offset })
      return
    }

    // Batch-fetch labels and assignees for the returned card IDs
    const cardIds = rawRows.map((r) => r.id)

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
          assignee: { select: { id: true, name: true, avatarUrl: true } },
        },
      }),
    ])

    // Build lookup maps
    const labelsByCard = new Map<string, { id: string; name: string; color: string }[]>()
    for (const cl of cardLabels) {
      const existing = labelsByCard.get(cl.cardId) ?? []
      existing.push(cl.label)
      labelsByCard.set(cl.cardId, existing)
    }

    const assigneeByCard = new Map<string, { id: string; name: string | null; avatarUrl: string | null } | null>()
    for (const c of cardAssignees) {
      assigneeByCard.set(c.id, c.assignee)
    }

    const cards: CardSearchResult[] = rawRows.map((row) => {
      const assignee = assigneeByCard.get(row.id) ?? null
      return {
        id: row.id,
        title: row.title,
        boardId: row.boardId,
        boardName: row.boardName,
        listId: row.listId,
        listName: row.listName,
        priority: row.priority as CardSearchResult["priority"],
        labels: labelsByCard.get(row.id) ?? [],
        assignees: assignee ? [assignee] : [],
        dueDate: row.dueDate ? row.dueDate.toISOString() : null,
        rank: Number(row.rank),
      }
    })

    res.json({ cards, total, limit, offset })
  } catch {
    res.status(500).json({ error: { message: "Search failed", status: 500 } })
  }
})
