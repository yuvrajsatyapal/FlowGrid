import crypto from "crypto"
import { prisma } from "./prisma"
import type { Role } from "../../generated/prisma"

// ─── Constants ────────────────────────────────────────────────────────────────

export const INVITE_TTL_MS = 7 * 24 * 60 * 60 * 1000 // 7 days

export function newInviteToken(): string {
  // 64-char hex string — stored internally for future email/deep-link flows.
  // Never returned to frontend clients in the current notification-first flow.
  return crypto.randomBytes(32).toString("hex")
}

export function inviteExpiresAt(): Date {
  return new Date(Date.now() + INVITE_TTL_MS)
}

// ─── Auto-expire ──────────────────────────────────────────────────────────────

// Call before creating a new workspace invite to unblock re-inviting when a
// previous PENDING invite has passed its expiry date.
export async function autoExpireWorkspaceInvites(workspaceId: string, inviteeId: string): Promise<void> {
  await prisma.workspaceInvite.updateMany({
    where: { workspaceId, inviteeId, status: "PENDING", expiresAt: { lt: new Date() } },
    data: { status: "EXPIRED" },
  })
}

// Call before creating a new board invite for the same reason.
export async function autoExpireBoardInvites(boardId: string, inviteeId: string): Promise<void> {
  await prisma.boardInvite.updateMany({
    where: { boardId, inviteeId, status: "PENDING", expiresAt: { lt: new Date() } },
    data: { status: "EXPIRED" },
  })
}

// ─── Authorization ────────────────────────────────────────────────────────────

// Centralised board-invite permission check.
// Currently: workspace OWNER/ADMIN or the board creator.
// Extend this function when board-level manager roles are introduced.
export function canManageBoardInvites(
  actorRole: Role,
  boardCreatedById: string | null,
  actorId: string,
): boolean {
  return actorRole === "OWNER" || actorRole === "ADMIN" || boardCreatedById === actorId
}
