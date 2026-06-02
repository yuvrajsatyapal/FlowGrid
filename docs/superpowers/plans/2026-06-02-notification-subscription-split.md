# Notification Subscription Split Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a `source` field (`ASSIGNMENT | WATCHER | SYSTEM`) to every notification record so subscription origin is explicit, queryable, and enforced at both TypeScript and database levels.

**Architecture:** Change `getCardRecipients` to return `{ userId, source }[]` instead of `string[]`. Change `createNotification` to require a typed `source` field. Update all call sites. The TypeScript compiler acts as the test suite — changing the helper signatures causes compile errors at every unupdated call site, which are resolved task-by-task.

**Tech Stack:** Prisma 5 (PostgreSQL), TypeScript, Express, `@flowgrid/types` workspace package, `pnpm` monorepo.

---

## File Map

| File | Action | What changes |
|---|---|---|
| `apps/api/prisma/schema.prisma` | Modify | Add `source String`, remove `user` FK relation, add `@@index([userId, source])` |
| `apps/api/prisma/migrations/20260602200000_add_notification_source/migration.sql` | Create | ADD COLUMN with temp default, DROP DEFAULT |
| `packages/types/src/index.ts` | Modify | Add `NotificationSource`, expand `NotificationType`, add `source` to `AppNotification` |
| `apps/api/src/lib/notifications.ts` | Modify | `getCardRecipients` → `CardRecipient[]`; `createNotification` typed params |
| `apps/api/src/routes/cards.ts` | Modify | Destructure `{ userId, source }`, exclusion set, typed `source` on CARD_ASSIGNED |
| `apps/api/src/routes/comments.ts` | Modify | Destructure `{ userId, source }`, pass through to `createNotification` |
| `apps/api/src/routes/invites.ts` | Modify | Add `source: 'SYSTEM'` to three `createNotification` calls |
| `apps/api/src/routes/notifications.ts` | Verify only | Uses `...n` spread — `source` included automatically after schema change |

---

## Task 1: Prisma Schema — add `source`, remove FK, add index

**Files:**
- Modify: `apps/api/prisma/schema.prisma`

**Context:** The current `Notification` model has a `user User @relation(...)` with `onDelete: Cascade`. Project rule (SCHEMA.md) prohibits FK constraints. It must be removed. The `User` model also has a back-relation `notifications Notification[]` that must be removed at the same time. The new `source` column has no `@default` in the schema — the migration handles backfilling manually so the DB column also ends with no default.

- [ ] **Step 1: Update the Notification model in `apps/api/prisma/schema.prisma`**

Find (lines ~398–415):
```prisma
model Notification {
  id        String   @id @default(cuid())
  userId    String
  type      String
  title     String
  body      String?
  data      Json?
  read      Boolean  @default(false)
  createdAt DateTime @default(now()) @db.Timestamptz()

  user User @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@index([userId])
  @@index([userId, read])
}
```

Replace with:
```prisma
model Notification {
  id        String   @id @default(cuid())
  userId    String
  type      String
  source    String
  title     String
  body      String?
  data      Json?
  read      Boolean  @default(false)
  createdAt DateTime @default(now()) @db.Timestamptz()

  // No FK relation — project rule: no REFERENCES, no ON DELETE CASCADE (SCHEMA.md)

  @@index([userId])
  @@index([userId, read])
  @@index([userId, source])
}
```

- [ ] **Step 2: Remove the back-relation from the `User` model**

Find in the `User` model (around line 72):
```prisma
  notifications        Notification[]
```

Delete that line entirely. The `User` model should have no `notifications` relation after this.

- [ ] **Step 3: Verify no other model references the removed relation**

```bash
grep -n "notifications\s*Notification\|user.*Notification\|Notification.*user" apps/api/prisma/schema.prisma
```

Expected: no output.

---

## Task 2: Create the migration file

**Files:**
- Create: `apps/api/prisma/migrations/20260602200000_add_notification_source/migration.sql`

**Context:** Prisma needs a migrations directory entry for every schema change. We create this manually (not via `migrate dev --create-only`) because the auto-generated SQL would be `ADD COLUMN TEXT NOT NULL` which fails on existing rows. The two-step SQL is required: add with temp default to backfill, then drop the default so future inserts must be explicit at the DB level.

- [ ] **Step 1: Create the migration directory and SQL file**

```bash
mkdir -p apps/api/prisma/migrations/20260602200000_add_notification_source
```

Create `apps/api/prisma/migrations/20260602200000_add_notification_source/migration.sql` with exactly:

```sql
-- Add source column with temporary default to backfill existing rows
ALTER TABLE "Notification" ADD COLUMN "source" TEXT NOT NULL DEFAULT 'SYSTEM';

-- Add index for future source-filtered queries
CREATE INDEX "Notification_userId_source_idx" ON "Notification"("userId", "source");

-- Drop the default — new inserts must provide source explicitly
ALTER TABLE "Notification" ALTER COLUMN "source" DROP DEFAULT;
```

- [ ] **Step 2: Apply the migration**

```bash
cd apps/api && pnpm prisma migrate dev
```

Prisma will detect the new migration directory and ask to name it — accept the default or press Enter. Expected output ends with:
```
✔ Generated Prisma Client
```

If Prisma complains about schema drift (existing migrations vs schema), run:
```bash
cd apps/api && pnpm prisma migrate resolve --applied 20260602200000_add_notification_source
```
Then regenerate:
```bash
cd apps/api && pnpm prisma generate
```

- [ ] **Step 3: Verify column exists in DB**

```bash
cd apps/api && pnpm prisma studio
```

Open the `Notification` table. Confirm `source` column exists. Or via psql if you have it:
```bash
psql $DATABASE_URL -c "\d \"Notification\""
```
Confirm `source` column shows `character varying` with **no default** listed.

---

## Task 3: Update shared types

**Files:**
- Modify: `packages/types/src/index.ts`

**Context:** `AppNotification` currently has `type: NotificationType` where `NotificationType` is missing `CARD_UPDATED` (used in `cards.ts`) and has no `source` field. Frontend `NotificationDropdown` and `useNotifications` both consume `AppNotification` — the new `source` field will be available to them after this change.

- [ ] **Step 1: Update the Notifications section in `packages/types/src/index.ts`**

Find:
```ts
// ─── Notifications ────────────────────────────────────────────────────────────

export type NotificationType = 'CARD_ASSIGNED' | 'COMMENT_ADDED' | 'INVITE_ACCEPTED' | 'WORKSPACE_INVITE'

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
```

Replace with:
```ts
// ─── Notifications ────────────────────────────────────────────────────────────

export type NotificationSource =
  | 'ASSIGNMENT'
  | 'WATCHER'
  | 'SYSTEM'

export type NotificationType =
  | 'CARD_ASSIGNED'
  | 'CARD_UPDATED'       // field changes on a card
  | 'COMMENT_ADDED'
  | 'INVITE_ACCEPTED'
  | 'WORKSPACE_INVITE'
  | 'CARD_DUE_SOON'      // Feature #14 — due date reminders
  | 'SYSTEM'             // catch-all for admin/announcement notifications

export interface AppNotification {
  id: string
  userId: string
  type: NotificationType
  source: NotificationSource
  title: string
  body: string | null
  data: Record<string, unknown> | null
  read: boolean
  createdAt: string
}
```

- [ ] **Step 2: Typecheck the types package**

```bash
cd packages/types && npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add packages/types/src/index.ts apps/api/prisma/schema.prisma apps/api/prisma/migrations/20260602200000_add_notification_source/migration.sql
git commit -m "feat(notifications): add source field to schema, types, and migration"
```

---

## Task 4: Refactor `notifications.ts` helpers

**Files:**
- Modify: `apps/api/src/lib/notifications.ts`

**Context:** This is the change that makes the compiler enforce updates across all call sites. After this task, `tsc --noEmit` in `apps/api` will produce errors at every `createNotification` call that omits `source` and every place that iterates `getCardRecipients` as `string[]`. Those errors are resolved in Tasks 5–7. Do NOT run the full typecheck until Task 7 is complete.

- [ ] **Step 1: Replace `apps/api/src/lib/notifications.ts` entirely**

```ts
import { prisma } from "./prisma"
import { emitToUser } from "./socket"
import { Prisma } from "../../generated/prisma"
import logger from "./logger"
import type { NotificationSource, NotificationType } from "@flowgrid/types"

export type CardRecipient = {
  userId: string
  source: 'ASSIGNMENT' | 'WATCHER'
}

/**
 * Returns all notification recipients for a card: assignee + watchers, deduplicated,
 * with the actor excluded (no self-notifications).
 *
 * Dedup rule: ASSIGNMENT wins — if a user is both assignee and watcher they appear
 * once with source 'ASSIGNMENT'. Never cache the result; always re-fetches current state.
 *
 * Two parallel queries (card + watchers) — no sequential N+1.
 */
export async function getCardRecipients(cardId: string, actorId: string): Promise<CardRecipient[]> {
  const [card, watchers] = await Promise.all([
    prisma.card.findUnique({ where: { id: cardId }, select: { assigneeId: true } }),
    prisma.cardWatcher.findMany({ where: { cardId }, select: { userId: true } }),
  ])

  const result: CardRecipient[] = []
  const seen = new Set<string>()

  // Assignee first — ASSIGNMENT source takes priority
  if (card?.assigneeId && card.assigneeId !== actorId) {
    seen.add(card.assigneeId)
    result.push({ userId: card.assigneeId, source: 'ASSIGNMENT' })
  }

  // Watchers — skip actor and any user already added as assignee
  for (const w of watchers) {
    if (w.userId === actorId || seen.has(w.userId)) continue
    seen.add(w.userId)
    result.push({ userId: w.userId, source: 'WATCHER' })
  }

  return result
}

export async function createNotification(params: {
  userId: string
  type: NotificationType
  source: NotificationSource
  title: string
  body?: string
  data?: Record<string, unknown>
}): Promise<void> {
  try {
    const n = await prisma.notification.create({
      data: {
        userId: params.userId,
        type: params.type,
        source: params.source,
        title: params.title,
        body: params.body ?? null,
        data: (params.data ?? Prisma.JsonNull) as Prisma.InputJsonValue | Prisma.NullableJsonNullValueInput,
      },
    })
    emitToUser(params.userId, "notification:new", {
      id: n.id,
      userId: n.userId,
      type: n.type,
      source: n.source,
      title: n.title,
      body: n.body,
      data: n.data,
      read: n.read,
      createdAt: n.createdAt,
    })
  } catch (err) {
    logger.error("Failed to create notification", { type: params.type, source: params.source, error: err instanceof Error ? err.message : err })
  }
}
```

- [ ] **Step 2: Verify this file alone type-checks**

```bash
cd apps/api && npx tsc --noEmit 2>&1 | grep "notifications.ts"
```

Expected: no errors on `notifications.ts` itself. Errors on `cards.ts`, `comments.ts`, `invites.ts` are expected and will be fixed in the next tasks.

---

## Task 5: Update `cards.ts` call sites

**Files:**
- Modify: `apps/api/src/routes/cards.ts`

**Context:** There are two `createNotification` calls in `cards.ts`: one for `CARD_ASSIGNED` (hardcoded `source: 'ASSIGNMENT'`) and four `CARD_UPDATED` calls inside the recipient loop. The recipient loop currently iterates `string[]`; after Task 4, `getCardRecipients` returns `CardRecipient[]`, so the loop variable must be destructured as `{ userId, source }`. The exclusion set replaces the existing `if (userId === assigneeId) continue` guard.

- [ ] **Step 1: Find the full IIFE notification block in `apps/api/src/routes/cards.ts`**

Locate the block starting with:
```ts
    // Activity + notifications — fire-and-forget, never block the response
    const actorId = req.user!.id
    const notifyData = ...

    void (async () => {
```

And ending with:
```ts
    })()
```

- [ ] **Step 2: Replace the IIFE block**

Replace that entire block with:

```ts
    // Activity + notifications — fire-and-forget, never block the response
    const actorId = req.user!.id
    const notifyData = { cardId: card.id, cardTitle: updated.title, boardId: access.board.id, workspaceId: access.board.workspaceId }

    void (async () => {
      try {
        // Activity log (per changed field)
        if (title !== undefined && title.trim() !== card.title) {
          void logActivity({ cardId, userId: actorId, action: "title_changed", metadata: { from: card.title, to: title.trim() } })
        }
        if (priority !== undefined && priority !== card.priority) {
          void logActivity({ cardId, userId: actorId, action: "priority_changed", metadata: { from: card.priority, to: priority } })
        }
        if (dueDate !== undefined) {
          const oldDate = card.dueDate ? card.dueDate.toISOString() : null
          const newDate = dueDate === null ? null : new Date(dueDate).toISOString()
          if (oldDate !== newDate) {
            void logActivity({ cardId, userId: actorId, action: "due_date_changed", metadata: { from: oldDate, to: newDate } })
          }
        }
        if (assigneeId !== undefined && assigneeId !== card.assigneeId) {
          void logActivity({ cardId, userId: actorId, action: "assignee_changed", metadata: { from: card.assigneeId, to: assigneeId } })
          // New assignee gets a targeted CARD_ASSIGNED notification — source is always ASSIGNMENT
          if (assigneeId && assigneeId !== actorId) {
            void createNotification({
              userId: assigneeId,
              type: "CARD_ASSIGNED",
              source: "ASSIGNMENT",
              title: `You were assigned to "${updated.title}"`,
              data: notifyData,
            })
          }
        }

        // Fetch recipients once — shared across all field notifications
        const recipients = await getCardRecipients(cardId, actorId)
        if (recipients.length === 0) return

        // Users who already received a targeted notification — exclude from CARD_UPDATED
        const excludeFromUpdate = new Set<string>()
        if (assigneeId !== undefined && assigneeId !== card.assigneeId && assigneeId) {
          excludeFromUpdate.add(assigneeId)
        }

        for (const { userId, source } of recipients) {
          if (excludeFromUpdate.has(userId)) continue

          if (title !== undefined && title.trim() !== card.title) {
            void createNotification({ userId, source, type: "CARD_UPDATED", title: `"${updated.title}" was renamed`, data: notifyData })
          }
          if (priority !== undefined && priority !== card.priority) {
            void createNotification({ userId, source, type: "CARD_UPDATED", title: `Priority changed on "${updated.title}"`, data: notifyData })
          }
          if (dueDate !== undefined) {
            const oldDate = card.dueDate ? card.dueDate.toISOString() : null
            const newDate = dueDate === null ? null : new Date(dueDate).toISOString()
            if (oldDate !== newDate) {
              void createNotification({ userId, source, type: "CARD_UPDATED", title: `Due date changed on "${updated.title}"`, data: notifyData })
            }
          }
          if (assigneeId !== undefined && assigneeId !== card.assigneeId) {
            void createNotification({ userId, source, type: "CARD_UPDATED", title: `Assignee changed on "${updated.title}"`, data: notifyData })
          }
        }
      } catch (err) {
        logger.error("Failed to send card update notifications", { cardId, error: err instanceof Error ? err.message : err })
      }
    })()
```

- [ ] **Step 3: Check no errors remain on cards.ts**

```bash
cd apps/api && npx tsc --noEmit 2>&1 | grep "cards.ts"
```

Expected: no errors on `cards.ts`.

---

## Task 6: Update `comments.ts` call sites

**Files:**
- Modify: `apps/api/src/routes/comments.ts`

**Context:** One `createNotification` call inside the recipient loop. The loop currently iterates `string[]` (from the old `getCardRecipients`). After Task 4, it must destructure `{ userId, source }` from `CardRecipient[]`.

- [ ] **Step 1: Find and replace the notification block in `apps/api/src/routes/comments.ts`**

Find:
```ts
    // Notify assignee + watchers (excludes commenter) — parallel fetch
    const [cardForNotify, recipients] = await Promise.all([
      prisma.card.findUnique({ where: { id: cardId }, select: { title: true } }),
      getCardRecipients(cardId, req.user!.id),
    ])
    if (cardForNotify && recipients.length > 0) {
      const snippet = textOnly.slice(0, 80)
      for (const userId of recipients) {
        void createNotification({
          userId,
          type: "COMMENT_ADDED",
          title: `New comment on "${cardForNotify.title}"`,
          body: snippet || undefined,
          data: { cardId, cardTitle: cardForNotify.title, boardId: access.board.id, workspaceId: access.board.workspaceId },
        })
      }
    }
```

Replace with:
```ts
    // Notify assignee + watchers (excludes commenter) — parallel fetch
    const [cardForNotify, recipients] = await Promise.all([
      prisma.card.findUnique({ where: { id: cardId }, select: { title: true } }),
      getCardRecipients(cardId, req.user!.id),
    ])
    if (cardForNotify && recipients.length > 0) {
      const snippet = textOnly.slice(0, 80)
      for (const { userId, source } of recipients) {
        void createNotification({
          userId,
          source,
          type: "COMMENT_ADDED",
          title: `New comment on "${cardForNotify.title}"`,
          body: snippet || undefined,
          data: { cardId, cardTitle: cardForNotify.title, boardId: access.board.id, workspaceId: access.board.workspaceId },
        })
      }
    }
```

- [ ] **Step 2: Check no errors remain on comments.ts**

```bash
cd apps/api && npx tsc --noEmit 2>&1 | grep "comments.ts"
```

Expected: no errors on `comments.ts`.

---

## Task 7: Update `invites.ts` call sites

**Files:**
- Modify: `apps/api/src/routes/invites.ts`

**Context:** Three `createNotification` calls — two for `WORKSPACE_INVITE` (one when creating an invite, one when resending) and one for `INVITE_ACCEPTED`. All three are system-initiated events, so `source: 'SYSTEM'`.

- [ ] **Step 1: Add `source: 'SYSTEM'` to the first WORKSPACE_INVITE call (around line 153)**

Find:
```ts
      void createNotification({
        userId: invitee.id,
        type: "WORKSPACE_INVITE",
        title: `${inviterName} invited you to ${workspace.name}`,
        body: `You've been invited as ${assignableRole.charAt(0) + assignableRole.slice(1).toLowerCase()}`,
        data: { inviteUrl, workspaceName: workspace.name, inviterName },
      })
```

Replace with:
```ts
      void createNotification({
        userId: invitee.id,
        type: "WORKSPACE_INVITE",
        source: "SYSTEM",
        title: `${inviterName} invited you to ${workspace.name}`,
        body: `You've been invited as ${assignableRole.charAt(0) + assignableRole.slice(1).toLowerCase()}`,
        data: { inviteUrl, workspaceName: workspace.name, inviterName },
      })
```

- [ ] **Step 2: Add `source: 'SYSTEM'` to the INVITE_ACCEPTED call (around line 234)**

Find:
```ts
      void createNotification({
        userId: admin.userId,
        type: "INVITE_ACCEPTED",
        title: `${inviteeName} joined ${invite.workspace.name}`,
        data: { workspaceId: invite.workspaceId, workspaceName: invite.workspace.name, inviteeName },
      })
```

Replace with:
```ts
      void createNotification({
        userId: admin.userId,
        type: "INVITE_ACCEPTED",
        source: "SYSTEM",
        title: `${inviteeName} joined ${invite.workspace.name}`,
        data: { workspaceId: invite.workspaceId, workspaceName: invite.workspace.name, inviteeName },
      })
```

- [ ] **Step 3: Add `source: 'SYSTEM'` to the second WORKSPACE_INVITE call (around line 289)**

Find:
```ts
      void createNotification({
        userId: invitee.id,
        type: "WORKSPACE_INVITE",
        title: `${inviterName} invited you to ${invite.workspace.name}`,
        body: `You've been invited as ${invite.role.charAt(0) + invite.role.slice(1).toLowerCase()}`,
        data: { inviteUrl, workspaceName: invite.workspace.name, inviterName },
      })
```

Replace with:
```ts
      void createNotification({
        userId: invitee.id,
        type: "WORKSPACE_INVITE",
        source: "SYSTEM",
        title: `${inviterName} invited you to ${invite.workspace.name}`,
        body: `You've been invited as ${invite.role.charAt(0) + invite.role.slice(1).toLowerCase()}`,
        data: { inviteUrl, workspaceName: invite.workspace.name, inviterName },
      })
```

- [ ] **Step 4: Full typecheck — all errors should now be resolved**

```bash
cd apps/api && npx tsc --noEmit
```

Expected: **no output** (zero errors). If any errors remain, they are in the file listed — fix before continuing.

- [ ] **Step 5: Verify `notifications.ts` route includes `source` in response**

```bash
grep -n "source\|\.\.\." apps/api/src/routes/notifications.ts
```

The route uses `...n` spread to return the notification row, so `source` is included automatically with no code change needed. Confirm the grep shows `...n` in the map function.

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/lib/notifications.ts \
        apps/api/src/routes/cards.ts \
        apps/api/src/routes/comments.ts \
        apps/api/src/routes/invites.ts
git commit -m "feat(notifications): split ASSIGNMENT/WATCHER/SYSTEM source on all notification paths"
```

---

## Task 8: Verify end-to-end and update memory

- [ ] **Step 1: Build the API to confirm no emission errors**

```bash
cd apps/api && pnpm build
```

Expected: `dist/` updated, no TypeScript errors.

- [ ] **Step 2: Build the web app to confirm AppNotification consumers still compile**

```bash
cd apps/web && pnpm build
```

Expected: clean build. If `NotificationDropdown.tsx` or `useNotifications.ts` show errors about missing `source`, they are consuming `AppNotification` from `@flowgrid/types` — the new `source` field is additive and optional from the consumer perspective (they don't have to read it), so no errors expected.

- [ ] **Step 3: Manual smoke test**

Start the API and web app locally. Open a board. Perform each action and confirm a notification appears in the bell:
1. Assign yourself a card → should receive no notification (self-notification guard)
2. Have a second user comment on a card you're assigned to → notification appears
3. Watch a card, have another user update the priority → notification appears
4. Watch a card AND be the assignee, have another user comment → exactly ONE notification appears (not two)

- [ ] **Step 4: Update memory**

The `pattern_notifications.md` memory file was partially updated during brainstorming. Update it to reflect the completed implementation:

File: `/Users/yuvrajsatyapal/.claude/projects/-Users-yuvrajsatyapal-Desktop-FlowGrid/memory/pattern_notifications.md`

The key facts to reflect:
- `createNotification` now requires `source: NotificationSource` (was `string`, no source)
- `getCardRecipients` now returns `CardRecipient[]` (was `string[]`)
- `Notification` table has `source TEXT NOT NULL` with no DB default
- `NotificationType` union includes `CARD_UPDATED`, `CARD_DUE_SOON`, `SYSTEM`

- [ ] **Step 5: Final commit**

```bash
git add /Users/yuvrajsatyapal/.claude/projects/-Users-yuvrajsatyapal-Desktop-FlowGrid/memory/pattern_notifications.md
git commit -m "docs: update notification pattern memory after source split implementation"
```

---

## Self-Review Checklist

- [x] **Schema** — `source String` added, FK relation removed, `@@index([userId, source])` added ✓
- [x] **Migration** — ADD COLUMN with temp default, DROP DEFAULT, index creation ✓
- [x] **Shared types** — `NotificationSource`, expanded `NotificationType`, `source` on `AppNotification` ✓
- [x] **`getCardRecipients`** — returns `CardRecipient[]`, ASSIGNMENT wins dedup, actor excluded ✓
- [x] **`createNotification`** — `type: NotificationType`, `source: NotificationSource` required ✓
- [x] **`cards.ts`** — exclusion set, destructure `{ userId, source }`, explicit `source: 'ASSIGNMENT'` for `CARD_ASSIGNED` ✓
- [x] **`comments.ts`** — destructure `{ userId, source }`, pass through ✓
- [x] **`invites.ts`** — all 3 call sites get `source: 'SYSTEM'` ✓
- [x] **`notifications.ts` route** — `...n` spread includes `source` automatically ✓
- [x] **Stale state** — `getCardRecipients` re-fetches every call, no caching ✓
- [x] **Double notify** — new assignee in `excludeFromUpdate` prevents CARD_ASSIGNED + CARD_UPDATED ✓
- [x] **User model** — `notifications Notification[]` back-relation removed ✓
