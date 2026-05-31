# Feature Spec: Database Schema & Prisma Models

**Feature**: #2
**Created**: 2026-05-31
**Status**: draft
**Author**: team
**Epic**: FlowGrid — Production-Grade Project Management SaaS

---

## Problem

FlowGrid's Prisma schema is empty — no models, no migrations, no types. Every feature from #3 (auth) through #20 (infra) is blocked until a stable data layer exists. The schema must be designed correctly now: the hierarchy (org → workspace → board), card ordering strategy, soft-delete scope, and membership model are architectural decisions that become expensive to change once downstream features are built on top of them.

---

## Goal

A complete, production-ready Prisma schema with all core models, enums, and relations. The first migration runs cleanly against PostgreSQL. `packages/types` exports matching TypeScript interfaces for all models. Every downstream feature (#3–#19) can start without needing schema changes.

**Success looks like:**
- `pnpm --filter api prisma migrate dev` runs without errors
- `pnpm --filter api prisma generate` generates the Prisma client
- `packages/types/src/index.ts` exports all shared TypeScript interfaces
- `GET /api/health` still returns 200 after migration

---

## User Stories

1. **As a workspace admin**, I invite a teammate by email so they can see and edit our boards — the schema must support workspace membership with roles.
2. **As a card assignee**, I move a card from "In Progress" to "Done" — the schema must support ordered cards with LexoRank string positions across lists.
3. **As an organization owner**, I create multiple workspaces for different teams (engineering, marketing, design) — the schema must support a 3-tier Organization → Workspace → Board hierarchy.

---

## Requirements

### Must-Have
- All 15 models: `User`, `OAuthAccount`, `Organization`, `OrganizationMember`, `Workspace`, `WorkspaceMember`, `Board`, `BoardMember`, `List`, `Card`, `Label`, `CardLabel`, `Comment`, `Attachment`, `Notification`, `Activity`
- All 3 enums: `Priority` (NONE/LOW/MEDIUM/HIGH/URGENT), `Role` (OWNER/ADMIN/MEMBER/VIEWER), `BoardVisibility` (WORKSPACE/PRIVATE/PUBLIC)
- **LexoRank string positions** on `List.position` and `Card.position` (type: `String`, not `Float`)
- **Soft delete** (`deletedAt DateTime?`) on: `Workspace`, `Board`, `List`, `Card`, `Comment`
- `OAuthAccount` model with provider + providerAccountId (needed by Feature #3)
- `Activity` model: append-only rows, `action String` + `metadata Json`
- First Prisma migration (`init_schema`) runs against PostgreSQL 16
- `packages/types/src/index.ts` populated with TypeScript interfaces matching all models
- Standard columns on every model: `id String @id @default(cuid())`, `createdAt DateTime @default(now())`, `updatedAt DateTime @updatedAt`
- Indexes on all foreign key columns and common query patterns

### Nice-to-Have
- Prisma seed script (`prisma/seed.ts`) with sample org → workspace → board → list → cards for local dev

### Out of Scope
- Billing / subscription tier fields (Feature #20)
- Card sub-tasks / checklist items (Feature #10)
- API endpoints — no routes added in this feature
- Auth middleware (Feature #3)
- Background job for permanent deletion after soft-delete retention period
- OAuth providers beyond Google (future feature)

---

## Data Model

### Enums

```prisma
enum Priority {
  NONE
  LOW
  MEDIUM
  HIGH
  URGENT
}

enum Role {
  OWNER
  ADMIN
  MEMBER
  VIEWER
}

enum BoardVisibility {
  WORKSPACE   // all workspace members can see/edit
  PRIVATE     // explicit BoardMember rows required
  PUBLIC      // anyone with link can view
}
```

### Models

**User** — Core account. Created on first OAuth login. No org required at creation.
```
id, email (unique), name?, avatarUrl?, createdAt, updatedAt
Relations: OAuthAccount[], OrganizationMember[], WorkspaceMember[], BoardMember[],
           Card[] (assignedCards), Comment[], Notification[], Activity[]
```

**OAuthAccount** — OAuth provider links. One user can have multiple providers.
```
id, userId, provider ("google"|"github"), providerAccountId,
accessToken?, refreshToken?, expiresAt?, createdAt, updatedAt
Unique: [provider, providerAccountId]
Index: userId
```

**Organization** — Top-level billing/tenant unit. Has an owner (User).
```
id, name, slug (unique), logoUrl?, ownerId, createdAt, updatedAt
Relations: OrganizationMember[], Workspace[]
```

**OrganizationMember** — User's membership in an org with a role.
```
id, organizationId, userId, role (Role, default MEMBER), createdAt, updatedAt
Unique: [organizationId, userId]
Index: userId
```

**Workspace** — Collaboration unit under an org. Teams work here.
```
id, organizationId, name, slug, description?, createdAt, updatedAt, deletedAt?
Unique: [organizationId, slug]
Index: organizationId
Relations: WorkspaceMember[], Board[]
```

**WorkspaceMember** — Grants default access to all non-private boards in the workspace.
```
id, workspaceId, userId, role (Role, default MEMBER), createdAt, updatedAt
Unique: [workspaceId, userId]
Index: userId
```

**Board** — A project board. Visibility controls access model.
```
id, workspaceId, name, description?, visibility (BoardVisibility, default WORKSPACE),
coverColor?, createdAt, updatedAt, deletedAt?
Index: workspaceId
Relations: BoardMember[], List[], Label[], Activity[]
```

**BoardMember** — Override entries only. Used for PRIVATE boards or guest access.
Permission check: if BoardMember row exists for user+board → use that role; else fall back to WorkspaceMember role.
```
id, boardId, userId, role (Role, default MEMBER), createdAt, updatedAt
Unique: [boardId, userId]
Index: userId
```

**List** — Column/swimlane on a board. Ordered by LexoRank string.
```
id, boardId, name, position (String — LexoRank), createdAt, updatedAt, deletedAt?
Index: boardId
Relations: Card[]
```

**Card** — Task item in a list. Ordered within its list by LexoRank string.
```
id, listId, title, description?, position (String — LexoRank), priority (Priority, default NONE),
dueDate?, assigneeId?, coverColor?, createdAt, updatedAt, deletedAt?
Index: listId, assigneeId
Relations: CardLabel[], Comment[], Attachment[], Activity[]
```

**Label** — Reusable tag scoped to a board.
```
id, boardId, name, color, createdAt, updatedAt
Index: boardId
Relations: CardLabel[]
```

**CardLabel** — Junction table, card ↔ label many-to-many.
```
id, cardId, labelId, createdAt
Unique: [cardId, labelId]
```

**Comment** — Text comment on a card. Soft-deleteable.
```
id, cardId, userId, content (String), createdAt, updatedAt, deletedAt?
Index: cardId
```

**Attachment** — File reference on a card. URL stored; actual file in local/S3 (Feature #12).
```
id, cardId, userId, name, url, mimeType?, size (Int)?, createdAt, updatedAt
Index: cardId
```

**Notification** — Per-user inbox item.
```
id, userId, type (String), title, body?, data (Json)?, read (Boolean, default false), createdAt
Index: userId, [userId, read]
```

**Activity** — Append-only audit log. Never updated or soft-deleted.
```
id, boardId?, cardId?, userId, action (String e.g. "card.moved"), metadata (Json), createdAt
Index: boardId, cardId, userId
Note: no updatedAt — append-only by design
```

---

## API Changes

None. This feature adds no endpoints. Schema + types only.

---

## UI Changes

None. Backend only.

---

## Edge Cases

1. **LexoRank collision** — Two concurrent DnD operations assign the same position string. Resolution: server-side position assignment only; client sends intended neighbors, server computes final LexoRank value. Never trust client-sent positions directly. Implementation deferred to Feature #9.

2. **Workspace soft-delete with active boards** — When a workspace is soft-deleted (`deletedAt` set), child boards, lists, and cards must be hidden via application-level `WHERE deletedAt IS NULL` filtering — they are NOT cascaded. The data is preserved for recovery.

3. **Permission precedence: BoardMember vs WorkspaceMember** — If a `BoardMember` row exists for a given user+board combination, that role takes precedence over the user's `WorkspaceMember` role for that board. This enables a VIEWER workspace member to have ADMIN access on one specific private board.

4. **Card moved between lists** — `Card.listId` changes, `Card.position` must be recalculated using LexoRank relative to the target list's neighbors. The source list's remaining cards are unaffected and do not need reordering.

5. **User with no organization** — A freshly OAuth'd user (Feature #3) has no org membership yet. `User` must be creatable with no org. Org creation and workspace setup happen in Features #4/#5.

6. **Activity rows with no boardId or cardId** — Both fields are optional (e.g., workspace-level activities). Schema allows `null` for both. Application must pass at least one context field but this is not enforced at DB level.

---

## Testing Criteria

### Happy Path
- [ ] `prisma migrate dev --name init_schema` creates all 15 tables and 3 enums without errors
- [ ] `prisma generate` completes and Prisma client is importable from `apps/api`
- [ ] Can insert a full chain: Organization → Workspace → Board → List → Card in Prisma Studio
- [ ] Soft delete: set `deletedAt` on a Card, confirm a filtered `findMany({ where: { deletedAt: null } })` excludes it
- [ ] OAuthAccount can be created and linked to a User without error
- [ ] Activity row inserts with null `boardId` and null `cardId` successfully

### Edge Cases
- [ ] Create two cards with the same `position` string in the same list — DB allows it (no unique constraint on position; uniqueness is a concern of the LexoRank algorithm)
- [ ] Soft-delete a Workspace — its boards still exist in the DB with `deletedAt: null`
- [ ] Create a User with no OrgMembership — succeeds
- [ ] Insert a PRIVATE board and a WORKSPACE board in the same workspace — both insert without error

---

## Dependencies

- **Feature #1** ✓ — monorepo scaffold, Prisma 5 installed, `docker-compose.yml` for PostgreSQL 16
- **PostgreSQL running** — `docker compose up -d` must be run before migration
- **`packages/types/src/index.ts`** — currently empty barrel; this feature populates it
- **No auth, no routes** — this feature touches only `prisma/schema.prisma`, `packages/types`, and runs `prisma migrate`

---

## Implementation Notes

- `id` uses `cuid()` — Prisma-idiomatic, shorter than UUID, URL-safe. Consistent across all models.
- Prisma FK constraints are used (this is a Node.js/Prisma project — the "no FK constraints" rule in global CLAUDE.md applies to the Kotlin/Exposed ORM backend only).
- LexoRank library selection (`lexorank` npm package vs custom midpoint algorithm) is deferred to Feature #9 (DnD). This feature only defines `position String` columns.
- `Activity.updatedAt` is intentionally omitted — the model is append-only and should never be modified.
- Migration name: `init_schema`
