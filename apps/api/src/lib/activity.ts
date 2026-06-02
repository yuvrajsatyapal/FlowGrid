import { prisma } from "./prisma"
import type { Prisma } from "../../generated/prisma"
import logger from "./logger"

export async function logActivity(params: {
  cardId: string
  userId: string
  action: string
  metadata: Record<string, unknown>
  boardId?: string
}): Promise<void> {
  try {
    await prisma.activity.create({
      data: {
        cardId: params.cardId,
        userId: params.userId,
        action: params.action,
        metadata: params.metadata as Prisma.InputJsonValue,
        boardId: params.boardId,
      },
    })
  } catch (err) {
    // Activity logging must never block primary actions
    logger.error("Failed to log activity", { action: params.action, error: err instanceof Error ? err.message : err })
  }
}
