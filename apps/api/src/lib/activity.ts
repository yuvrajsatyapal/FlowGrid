import { prisma } from "./prisma"
import type { Prisma } from "../../generated/prisma"

export async function logActivity(params: {
  cardId: string
  userId: string
  action: string
  metadata: Record<string, unknown>
}): Promise<void> {
  try {
    await prisma.activity.create({
      data: {
        cardId: params.cardId,
        userId: params.userId,
        action: params.action,
        metadata: params.metadata as Prisma.InputJsonValue,
      },
    })
  } catch (err) {
    // Activity logging must never block primary actions
    console.error("[activity] failed to log:", params.action, err)
  }
}
