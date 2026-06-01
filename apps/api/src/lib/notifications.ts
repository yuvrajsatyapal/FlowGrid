import { prisma } from "./prisma"
import { emitToUser } from "./socket"
import { Prisma } from "../../generated/prisma"
import logger from "./logger"

export async function createNotification(params: {
  userId: string
  type: string
  title: string
  body?: string
  data?: Record<string, unknown>
}): Promise<void> {
  try {
    const n = await prisma.notification.create({
      data: {
        userId: params.userId,
        type: params.type,
        title: params.title,
        body: params.body ?? null,
        data: (params.data ?? Prisma.JsonNull) as Prisma.InputJsonValue | Prisma.NullableJsonNullValueInput,
      },
    })
    emitToUser(params.userId, "notification:new", {
      id: n.id,
      userId: n.userId,
      type: n.type,
      title: n.title,
      body: n.body,
      data: n.data,
      read: n.read,
      createdAt: n.createdAt,
    })
  } catch (err) {
    // Notification creation must never block primary actions
    logger.error("Failed to create notification", { type: params.type, error: err instanceof Error ? err.message : err })
  }
}
