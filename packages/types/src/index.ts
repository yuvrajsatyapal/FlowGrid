// Shared FlowGrid types — mirrors prisma/schema.prisma
// Plain TypeScript interfaces (no Prisma import) so apps/web can safely use them.
// Optional fields use `T | null` to match Prisma's output convention.

// ─── Enums ────────────────────────────────────────────────────────────────────

export type Priority = 'NONE' | 'LOW' | 'MEDIUM' | 'HIGH' | 'URGENT'

export type Role = 'OWNER' | 'ADMIN' | 'MEMBER' | 'VIEWER'

export type BoardVisibility = 'WORKSPACE' | 'PRIVATE' | 'PUBLIC'

export type InviteStatus = 'PENDING' | 'ACCEPTED' | 'REVOKED' | 'EXPIRED'

// ─── User tier ────────────────────────────────────────────────────────────────

export interface User {
  id: string
  email: string
  name: string | null
  avatarUrl: string | null
  onboardingCompleted: boolean
  createdAt: Date
  updatedAt: Date
}

export interface OAuthAccount {
  id: string
  userId: string
  provider: string
  providerAccountId: string
  accessToken: string | null
  refreshToken: string | null
  expiresAt: Date | null
  createdAt: Date
  updatedAt: Date
}

// ─── Organization tier ────────────────────────────────────────────────────────

export interface Organization {
  id: string
  name: string
  slug: string
  logoUrl: string | null
  ownerId: string
  createdAt: Date
  updatedAt: Date
}

export interface OrganizationMember {
  id: string
  organizationId: string
  userId: string
  role: Role
  createdAt: Date
  updatedAt: Date
}

// ─── Workspace tier ───────────────────────────────────────────────────────────

export interface Workspace {
  id: string
  organizationId: string
  name: string
  slug: string
  description: string | null
  createdAt: Date
  updatedAt: Date
  deletedAt: Date | null
}

export interface WorkspaceMember {
  id: string
  workspaceId: string
  userId: string
  role: Role
  createdAt: Date
  updatedAt: Date
}

// API response shape for member list (includes enriched user object)
export interface WorkspaceMemberResponse {
  id: string
  userId: string
  workspaceId: string
  role: Role
  user: {
    id: string
    name: string | null
    email: string
    avatarUrl: string | null
  }
}

// API response shape for workspace invites
export interface WorkspaceInvite {
  id: string
  workspaceId: string
  email: string
  role: Role
  status: InviteStatus
  expiresAt: string
  createdAt: string
}


// ─── Board tier ───────────────────────────────────────────────────────────────

export interface Board {
  id: string
  workspaceId: string
  name: string
  description: string | null
  visibility: BoardVisibility
  coverColor: string | null
  createdAt: Date
  updatedAt: Date
  deletedAt: Date | null
}

// BoardMember is exceptions-only (PRIVATE boards + guest overrides).
// Permission precedence: BoardMember.role > WorkspaceMember.role for that board.
export interface BoardMember {
  id: string
  boardId: string
  userId: string
  role: Role
  createdAt: Date
  updatedAt: Date
}

// ─── List & Card ──────────────────────────────────────────────────────────────

export interface List {
  id: string
  boardId: string
  name: string
  position: string // LexoRank string — never a number
  createdAt: Date
  updatedAt: Date
  deletedAt: Date | null
}

export interface Card {
  id: string
  listId: string
  title: string
  description: string | null
  position: string // LexoRank string — never a number
  priority: Priority
  dueDate: Date | null
  assigneeId: string | null
  coverColor: string | null
  createdAt: Date
  updatedAt: Date
  deletedAt: Date | null
}

// ─── Labels ───────────────────────────────────────────────────────────────────

export interface Label {
  id: string
  boardId: string
  name: string
  color: string
  createdAt: Date
  updatedAt: Date
}

export interface CardLabel {
  id: string
  cardId: string
  labelId: string
  createdAt: Date
}

// ─── Comments & Attachments ───────────────────────────────────────────────────

export interface Comment {
  id: string
  cardId: string
  userId: string
  content: string
  createdAt: Date
  updatedAt: Date
  deletedAt: Date | null
}

// API response shapes (string ISO dates, enriched author/user objects)

export interface CommentAuthor {
  id: string
  name: string | null
  avatarUrl: string | null
}

export interface CommentResponse {
  id: string
  cardId: string
  author: CommentAuthor | null // null if user deleted
  content: string              // sanitized TipTap HTML
  createdAt: string
  updatedAt: string
  deletedAt: string | null
}

export interface Attachment {
  id: string
  cardId: string
  userId: string
  name: string
  url: string
  mimeType: string | null
  size: number | null
  createdAt: Date
  updatedAt: Date
}

// ─── Notifications ────────────────────────────────────────────────────────────

export type NotificationType = 'CARD_ASSIGNED' | 'COMMENT_ADDED' | 'INVITE_ACCEPTED'

export interface AppNotification {
  id: string
  userId: string
  type: NotificationType
  title: string
  body: string | null
  data: Record<string, unknown> | null
  read: boolean
  createdAt: string
}

// ─── Notifications ────────────────────────────────────────────────────────────

export interface Notification {
  id: string
  userId: string
  type: string
  title: string
  body: string | null
  data: Record<string, unknown> | null
  read: boolean
  createdAt: Date
}

// ─── Activity (append-only) ───────────────────────────────────────────────────

export interface Activity {
  id: string
  boardId: string | null
  cardId: string | null
  userId: string
  action: string
  metadata: Record<string, unknown>
  createdAt: Date
  // No updatedAt — append-only, never modified
}

export interface ActivityUser {
  id: string
  name: string | null
  avatarUrl: string | null
}

export interface ActivityResponse {
  id: string
  cardId: string | null
  user: ActivityUser | null // null if user deleted
  action: string
  metadata: Record<string, unknown>
  createdAt: string
}

// ─── Real-time Presence ───────────────────────────────────────────────────────

export interface PresenceUser {
  userId: string
  name: string | null
  avatarUrl: string | null
}
