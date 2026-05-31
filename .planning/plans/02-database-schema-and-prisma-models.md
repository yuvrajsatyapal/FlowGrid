# Plan: Database Schema & Prisma Models

**Spec**: .planning/specs/02-database-schema-and-prisma-models.md
**Epic**: FlowGrid — Production-Grade Project Management SaaS
**Created**: 2026-05-31
**Status**: draft

---

## Stack

Node.js + Express + Prisma 5 + PostgreSQL 16. Backend only — no frontend changes in this feature. `packages/types` is a shared package consumed by both `apps/api` and `apps/web`.

---

## Architecture

This feature has no layers (no controllers, managers, or repositories). It is purely:
1. Schema definition → `prisma/schema.prisma`
2. Migration execution → generates `prisma/migrations/`
3. Type export → `packages/types/src/index.ts`

All downstream features build on top of this. Nothing builds on top of this feature except the Prisma-generated client, which is an auto-generated artifact.

---

## Components

| Component | Type | Purpose |
|-----------|------|---------|
| `schema.prisma` | Prisma schema | 15 models, 3 enums, all relations, all indexes |
| `init_schema` migration | Auto-generated SQL | Creates all tables and enums in PostgreSQL |
| `packages/types/src/index.ts` | TypeScript barrel | Shared model interfaces + enum types for use in both apps |
| `prisma/seed.ts` | Dev script (nice-to-have) | Inserts sample data chain: org → workspace → board → list → 3 cards |

---

## File Map

### Files to Modify

| File | Change | Why |
|------|--------|-----|
| `apps/api/prisma/schema.prisma` | Replace skeleton with all models + enums | Currently has generator + datasource only |
| `packages/types/src/index.ts` | Replace placeholder export with TypeScript interfaces | Currently `export type {}` placeholder |

### Files Created (auto-generated)

| File | How Created |
|------|------------|
| `apps/api/prisma/migrations/{ts}_init_schema/migration.sql` | `prisma migrate dev --name init_schema` |
| `apps/api/node_modules/.prisma/client/` | `prisma generate` (auto-runs after migrate) |

### Files Created (manual, nice-to-have)

| File | Purpose |
|------|---------|
| `apps/api/prisma/seed.ts` | Sample data for local dev / Prisma Studio |

---

## Task Breakdown

### Phase 1: Prisma Schema (single file, write complete)

> Prisma validates ALL relations at once — partial schemas fail `prisma validate`. Write the full schema in one task.

| # | Task | File(s) | Test |
|---|------|---------|------|
| 1 | Write all 3 enums: `Priority`, `Role`, `BoardVisibility` | `apps/api/prisma/schema.prisma` | `pnpm --filter api exec prisma validate` passes |
| 2 | Write User tier: `User` + `OAuthAccount` models with relations + indexes | `apps/api/prisma/schema.prisma` | `prisma validate` passes |
| 3 | Write Org tier: `Organization` + `OrganizationMember` + `Workspace` + `WorkspaceMember` | `apps/api/prisma/schema.prisma` | `prisma validate` passes |
| 4 | Write Board tier: `Board` + `BoardMember` + `List` | `apps/api/prisma/schema.prisma` | `prisma validate` passes |
| 5 | Write Card tier: `Card` + `Label` + `CardLabel` with LexoRank position fields | `apps/api/prisma/schema.prisma` | `prisma validate` passes, `position` is `String` not `Float` |
| 6 | Write supporting models: `Comment` + `Attachment` + `Notification` + `Activity` | `apps/api/prisma/schema.prisma` | `prisma validate` passes; `Activity` has no `updatedAt` |

> Note: Tasks 1–6 all touch the same file. They represent logical writing order (top-down by dependency), not separate commits. Commit once after all 6 pass `prisma validate`.

### Phase 2: Migration (depends on Phase 1)

| # | Task | Command | Test |
|---|------|---------|------|
| 7 | Run first migration | `pnpm --filter api prisma:migrate` (with `--name init_schema`) | Exit 0, migration.sql generated, all 15 tables visible in `psql` or Prisma Studio |
| 8 | Verify Prisma client import works | Add `import { PrismaClient } from '@prisma/client'` to a temp file; run `tsc --noEmit` | No TypeScript errors |

### Phase 3: Shared Types (depends on Phase 2)

| # | Task | File(s) | Test |
|---|------|---------|------|
| 9 | Replace `packages/types/src/index.ts` placeholder with TypeScript interfaces for all 15 models + 3 enum types | `packages/types/src/index.ts` | `pnpm --filter @flowgrid/types typecheck` passes |
| 10 | Verify `@flowgrid/types` imports compile in `apps/api` | Run `pnpm --filter api typecheck` | No errors on `import type { User, Card } from '@flowgrid/types'` |

### Phase 4: Verification (depends on Phase 2 + 3)

| # | Task | How | Test |
|---|------|-----|------|
| 11 | Confirm health endpoint still works after migration | `curl http://localhost:3001/api/health` | Returns `{ "status": "ok" }` |
| 12 | (nice-to-have) Write seed script | `apps/api/prisma/seed.ts` | `pnpm --filter api exec prisma db seed` inserts org → workspace → board → list → 3 cards |

---

## Parallel vs Sequential

| Sequential Chain | Depends On | Why |
|-----------------|-----------|-----|
| Phase 1 (tasks 1–6) | Nothing | Start here |
| Phase 2 (tasks 7–8) | Phase 1 complete | Can't migrate until schema is valid |
| Phase 3 (tasks 9–10) | Phase 2 (task 7) | Types should mirror what Prisma generates; confirm after migration |
| Phase 4 (task 11) | Phase 2 | Health check needs the server running post-migration |
| Phase 4 (task 12) | Phase 2 | Seed needs the tables to exist |

Tasks 9 and 11 can run in parallel once Phase 2 is done.

---

## Schema Reference

### Enums

```prisma
enum Priority { NONE LOW MEDIUM HIGH URGENT }
enum Role { OWNER ADMIN MEMBER VIEWER }
enum BoardVisibility { WORKSPACE PRIVATE PUBLIC }
```

### Model Summary (complete field list for implementation)

```
User            id, email(unique), name?, avatarUrl?, createdAt, updatedAt
OAuthAccount    id, userId(idx), provider, providerAccountId, accessToken?, refreshToken?,
                expiresAt?, createdAt, updatedAt
                @@unique([provider, providerAccountId])

Organization    id, name, slug(unique), logoUrl?, ownerId, createdAt, updatedAt
OrganizationMember  id, organizationId, userId(idx), role(MEMBER), createdAt, updatedAt
                    @@unique([organizationId, userId])

Workspace       id, organizationId(idx), name, slug, description?, createdAt, updatedAt, deletedAt?
                @@unique([organizationId, slug])
WorkspaceMember id, workspaceId, userId(idx), role(MEMBER), createdAt, updatedAt
                @@unique([workspaceId, userId])

Board           id, workspaceId(idx), name, description?, visibility(WORKSPACE),
                coverColor?, createdAt, updatedAt, deletedAt?
BoardMember     id, boardId, userId(idx), role(MEMBER), createdAt, updatedAt
                @@unique([boardId, userId])

List            id, boardId(idx), name, position(String), createdAt, updatedAt, deletedAt?
Card            id, listId(idx), title, description?, position(String), priority(NONE),
                dueDate?, assigneeId?(idx), coverColor?, createdAt, updatedAt, deletedAt?

Label           id, boardId(idx), name, color, createdAt, updatedAt
CardLabel       id, cardId, labelId, createdAt
                @@unique([cardId, labelId])

Comment         id, cardId(idx), userId, content, createdAt, updatedAt, deletedAt?
Attachment      id, cardId(idx), userId, name, url, mimeType?, size?, createdAt, updatedAt
Notification    id, userId(idx), type, title, body?, data(Json)?, read(false), createdAt
                @@index([userId, read])
Activity        id, boardId?(idx), cardId?(idx), userId(idx), action, metadata(Json), createdAt
                NOTE: no updatedAt — append-only
```

### Key Architectural Constraints (from spec)

- `position` fields on `List` and `Card` are `String` — LexoRank ordering, NOT `Float`
- `Activity` has no `updatedAt` — append-only, never modified
- `BoardMember` is exceptions only — for PRIVATE boards and guest overrides
- Soft delete via `deletedAt DateTime?` on: Workspace, Board, List, Card, Comment
- `id @default(cuid())` on all models — not UUID
- Prisma FK constraints ARE used (this is Node.js/Prisma, not Kotlin/Exposed)

---

## Shared Types Spec (`packages/types/src/index.ts`)

Exports TypeScript types that mirror the Prisma schema. These are plain TypeScript interfaces — not Prisma-generated types — so `apps/web` (which has no Prisma dependency) can safely import them.

```typescript
// Enums as union types (not TypeScript enums — easier to use as values)
export type Priority = 'NONE' | 'LOW' | 'MEDIUM' | 'HIGH' | 'URGENT'
export type Role = 'OWNER' | 'ADMIN' | 'MEMBER' | 'VIEWER'
export type BoardVisibility = 'WORKSPACE' | 'PRIVATE' | 'PUBLIC'

// Example interface shape
export interface User {
  id: string
  email: string
  name: string | null
  avatarUrl: string | null
  createdAt: Date
  updatedAt: Date
}

// ... one interface per model, matching schema fields exactly
// Dates are Date objects (not strings — serialization handled at API boundary)
// Optional fields are `T | null` not `T | undefined` (matches Prisma output)
```

---

## Testing Plan

All tests for this feature are migration/toolchain tests — no unit tests needed.

| Test | Command | Pass Condition |
|------|---------|---------------|
| Schema validation | `pnpm --filter api exec prisma validate` | Exit 0, no errors |
| Migration runs | `pnpm --filter api prisma:migrate` | All 15 tables created |
| Client generates | `pnpm --filter api prisma:generate` | Exit 0 |
| API typecheck | `pnpm --filter api typecheck` | No TS errors |
| Types typecheck | `pnpm --filter @flowgrid/types typecheck` | No TS errors |
| Full monorepo typecheck | `pnpm typecheck` (from root) | No TS errors |
| Health endpoint | `curl http://localhost:3001/api/health` | `{ "status": "ok" }` |
| Schema edge cases | Prisma Studio / psql manual verification | Soft-delete fields present; position is TEXT not FLOAT; Activity has no updated_at |

### Edge Case Validation

| Edge Case from Spec | How to Verify |
|--------------------|--------------|
| `Card.position` is String (not Float) | Inspect `migration.sql` — column type must be `TEXT`, not `DOUBLE PRECISION` |
| `Activity` has no `updatedAt` | Inspect `migration.sql` — no `updated_at` column on `activity` table |
| Soft delete fields exist | Inspect migration — `deleted_at` on workspace, board, list, card, comment tables |
| `OAuthAccount` unique on `[provider, providerAccountId]` | Inspect migration — unique index on those two columns |

---

## Gate 2 Checklist

**Architecture:**
- [x] Follows project architecture — Prisma schema is the correct layer for data definition
- [x] Each layer only calls the layer below — no layers introduced, schema only
- [x] Files in correct directories — schema in `apps/api/prisma/`, types in `packages/types/src/`

**Task Breakdown:**
- [x] All files to change listed — schema.prisma + types/index.ts
- [x] All new files listed — migration.sql (auto), seed.ts (optional)
- [x] Tasks are small — schema written in logical groups, one migration command
- [x] Dependencies between tasks clear — sequential phases with rationale
- [x] Parallel vs sequential tasks marked

**Testing:**
- [x] Data layer tests planned — migration verification, psql/Studio manual check
- [x] No business logic tests needed — feature has no business logic
- [x] No API tests needed — feature adds no endpoints
- [x] Edge cases from spec covered in test plan — position type, Activity no updatedAt, soft deletes

**Gate 2: PASSED**
