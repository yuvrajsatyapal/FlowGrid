import type { Role } from "../../generated/prisma"

// Ascending order: lowest permissions first
const ROLE_ORDER: Role[] = ["VIEWER", "MEMBER", "ADMIN", "OWNER"]

/** Returns true if the role can perform write operations on content (boards, lists, cards, comments). */
export function canWrite(role: Role): boolean {
  return role !== "VIEWER"
}

/** Returns true if the role is at least `min` in the hierarchy. */
export function roleAtLeast(role: Role, min: Role): boolean {
  return ROLE_ORDER.indexOf(role) >= ROLE_ORDER.indexOf(min)
}

/** Returns true if the role is OWNER or ADMIN (workspace management actions). */
export function isOwnerOrAdmin(role: Role): boolean {
  return role === "OWNER" || role === "ADMIN"
}
