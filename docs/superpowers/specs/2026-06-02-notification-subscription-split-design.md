# Notification Subscription Split — Design Spec

**Date:** 2026-06-02
**Status:** Approved (corrections applied 2026-06-02)
**Scope:** Backend logic split + schema column + shared types update

---

## Problem

The current `getCardRecipients` helper merges assignees and watchers into a flat `string[]` and sends every recipient an identical notification with no record of why they received it. This creates three problems:

1. No auditability — a notification record has no indication of subscription source
2. Future preference controls (e.g. "mute watcher notifications") have no data to act on
3. Analytics across notification origin are impossible without re-deriving source from card/watcher state at query time

---

## Goal

Assignment and watching are independent subscription sources. A notification record must explicitly store which source triggered it. The display text is identical regardless of source — the split is backend-only.

---

## Recipient Model

```
Assigned only          → ASSIGNMENT notification
Watching only          → WATCHER notification
Assigned + Watching    → ONE notification, source = ASSIGNMENT (assignee wins)
Actor themselves       → never notified
Unassigned, still watching → getCardRecipients re-fetches current state each call; WATCHER notification continues
```

**Dedup rule:** If a user is both assignee and watcher, `ASSIGNMENT` wins. This prevents duplicate notifications, respects the stronger ownership relationship, and makes future preference resolution unambiguous (`mute WATCHER` never suppresses `ASSIGNMENT`).

**Stale state rule:** `getCardRecipients` must never be cached between requests. Each call queries the current `assigneeId` and `CardWatcher` rows from the DB. This ensures unassignment is reflected immediately — a user who was unassigned but remains a watcher transitions from `ASSIGNMENT` to `WATCHER` source on the next event without any extra logic.

---

## Data Model

### `Notification` — new column

```prisma
model Notification {
  id        String   @id @default(cuid())
  userId    String
  type      String
  source    String                         // "ASSIGNMENT" | "WATCHER" | "SYSTEM" — required, no DB default after migration
  title     String
  body      String?
  data      Json?
  read      Boolean  @default(false)
  createdAt DateTime @default(now()) @db.Timestamptz()

  // No FK relation — per project rule (SCHEMA.md: no REFERENCES, no ON DELETE CASCADE)
  // Application layer handles consistency; Cascade via Prisma is not used

  @@index([userId])
  @@index([userId, read])
  @@index([userId, source])               // cheap; enables future WHERE source = 'WATCHER' filters
}
```

**No `user User @relation(...)` field.** Project rule (database/SCHEMA.md) prohibits FK constraints and `onDelete: Cascade`. Existing `Notification` model already has this relation — it must be removed as part of this migration.

**No permanent DB default on `source`.** The migration adds a temporary `DEFAULT 'SYSTEM'` to backfill existing rows, then drops it. After migration, the DB column has no default — inserts that omit `source` fail at the database level, not just TypeScript.

### Migration

```sql
-- Step 1: add column with temporary default to backfill existing rows
ALTER TABLE "Notification"
ADD COLUMN "source" TEXT NOT NULL DEFAULT 'SYSTEM';

-- Step 2: remove the temporary default so future inserts must be explicit
ALTER TABLE "Notification"
ALTER COLUMN "source" DROP DEFAULT;
```

Two steps, one migration file. Existing rows get `'SYSTEM'` — correct for invite-type notifications. New inserts require explicit `source` at both TypeScript and DB levels.

---

## Shared Types (`packages/types/src/index.ts`)

```ts
export type NotificationSource =
  | 'ASSIGNMENT'
  | 'WATCHER'
  | 'SYSTEM'

export type NotificationType =
  | 'CARD_ASSIGNED'
  | 'CARD_UPDATED'       // was missing from union; used in cards.ts
  | 'COMMENT_ADDED'
  | 'INVITE_ACCEPTED'
  | 'WORKSPACE_INVITE'
  | 'CARD_DUE_SOON'      // pre-added for Feature #14
  | 'SYSTEM'             // generic system announcements / future admin messages

export interface AppNotification {
  id: string
  userId: string
  type: NotificationType
  source: NotificationSource   // new
  title: string
  body: string | null
  data: Record<string, unknown> | null
  read: boolean
  createdAt: string
}
```

`type` is now `NotificationType` (was `string`) everywhere in the shared interface. Compile-time protection against typos at every call site. `SYSTEM` is added to `NotificationType` as a forward-looking catch-all for admin/announcement notifications, preventing type drift when they're added.

---

## `notifications.ts` Changes

### `CardRecipient` type

```ts
import type { NotificationSource, NotificationType } from "@flowgrid/types"

// Explicit union — easier to read than Exclude<NotificationSource, 'SYSTEM'>
type CardRecipient = {
  userId: string
  source: 'ASSIGNMENT' | 'WATCHER'
}
```

`NotificationSource` is imported from shared types. `CardRecipient` uses an explicit `'ASSIGNMENT' | 'WATCHER'` union rather than `Exclude<>` — same safety, clearer intent.

### `getCardRecipients` — new return shape

```ts
export async function getCardRecipients(
  cardId: string,
  actorId: string
): Promise<CardRecipient[]>
```

Internal logic (queries unchanged — same `Promise.all`):

```ts
const result: CardRecipient[] = []
const seen = new Set<string>()

// Assignee first — ASSIGNMENT source, highest priority
if (card?.assigneeId && card.assigneeId !== actorId) {
  seen.add(card.assigneeId)
  result.push({ userId: card.assigneeId, source: 'ASSIGNMENT' })
}

// Watchers — skip actor and anyone already seen (assignee wins)
for (const w of watchers) {
  if (w.userId === actorId || seen.has(w.userId)) continue
  seen.add(w.userId)
  result.push({ userId: w.userId, source: 'WATCHER' })
}

return result
```

### `createNotification` — required `source` + typed `type`

```ts
export async function createNotification(params: {
  userId: string
  type: NotificationType       // was string — now compile-time checked
  source: NotificationSource   // required — no default, enforced at TypeScript and DB levels
  title: string
  body?: string
  data?: Record<string, unknown>
}): Promise<void>
```

`source` is required. No default. Any new call site that omits it is a TypeScript compile error and a DB constraint violation.

---

## Call Site Updates

### `cards.ts` — card update IIFE

Destructure `{ userId, source }` from recipients. Build an exclusion set before the loop to prevent double-notification when assignee changes:

```ts
const recipients = await getCardRecipients(cardId, actorId)
if (recipients.length === 0) return

// Users who already received a targeted notification — skip from CARD_UPDATED
const excludeFromUpdate = new Set<string>()

// Assignee change — send CARD_ASSIGNED directly, exclude from the generic loop
if (assigneeId !== undefined && assigneeId !== card.assigneeId && assigneeId) {
  if (assigneeId !== actorId) {
    void createNotification({
      userId: assigneeId,
      type: 'CARD_ASSIGNED',
      source: 'ASSIGNMENT',   // explicit — not from recipient loop
      title: `You were assigned to "${updated.title}"`,
      data: notifyData,
    })
  }
  excludeFromUpdate.add(assigneeId)
}

// Generic field-change notifications — one loop, source travels with each recipient
for (const { userId, source } of recipients) {
  if (excludeFromUpdate.has(userId)) continue
  if (title !== undefined && title.trim() !== card.title) {
    void createNotification({ userId, source, type: 'CARD_UPDATED', title: `"${updated.title}" was renamed`, data: notifyData })
  }
  if (priority !== undefined && priority !== card.priority) {
    void createNotification({ userId, source, type: 'CARD_UPDATED', title: `Priority changed on "${updated.title}"`, data: notifyData })
  }
  // dueDate, assignee follow the same pattern
}
```

`excludeFromUpdate` is extensible — future targeted notifications (e.g. `CARD_DUE_SOON` to assignee only) just add to the set before the loop.

### `comments.ts` — comment created

Card existence is validated earlier in the route (returns 404 if not found) before the notification block is reached. The `cardForNotify` null check in the notification block is a secondary guard only.

```ts
const [cardForNotify, recipients] = await Promise.all([
  prisma.card.findUnique({ where: { id: cardId }, select: { title: true } }),
  getCardRecipients(cardId, req.user!.id),
])
if (cardForNotify && recipients.length > 0) {
  for (const { userId, source } of recipients) {
    void createNotification({
      userId,
      source,          // ASSIGNMENT or WATCHER, from recipient
      type: 'COMMENT_ADDED',
      title: `New comment on "${cardForNotify.title}"`,
      body: snippet || undefined,
      data: notifyData,
    })
  }
}
```

### `invites.ts` — existing calls

Two calls, add `source: 'SYSTEM'` to each. No other changes.

---

## Source Assignment Reference

| Trigger | Type | Source |
|---|---|---|
| User assigned to card | `CARD_ASSIGNED` | `ASSIGNMENT` (hardcoded) |
| Card field updated (title/priority/dueDate/assignee) | `CARD_UPDATED` | from `getCardRecipients` |
| Comment posted on card | `COMMENT_ADDED` | from `getCardRecipients` |
| Workspace invite sent | `WORKSPACE_INVITE` | `SYSTEM` |
| Workspace invite accepted | `INVITE_ACCEPTED` | `SYSTEM` |
| Due date approaching (Feature #14) | `CARD_DUE_SOON` | `ASSIGNMENT` (scheduled job) |

---

## Files Changed

| File | Change |
|---|---|
| `apps/api/prisma/schema.prisma` | Add `source String` (no default), remove `user` relation from `Notification`, add `@@index([userId, source])` |
| `apps/api/prisma/migrations/…` | `ADD COLUMN DEFAULT 'SYSTEM'` then `DROP DEFAULT` |
| `packages/types/src/index.ts` | Add `NotificationSource`, expand `NotificationType` (+ `CARD_UPDATED`, `CARD_DUE_SOON`, `SYSTEM`), add `source` to `AppNotification` |
| `apps/api/src/lib/notifications.ts` | `getCardRecipients` returns `CardRecipient[]`; `createNotification` typed `type: NotificationType` + required `source: NotificationSource` |
| `apps/api/src/routes/cards.ts` | Destructure `{ userId, source }`, exclusion set pattern, explicit `source: 'ASSIGNMENT'` for `CARD_ASSIGNED` |
| `apps/api/src/routes/comments.ts` | Destructure `{ userId, source }`, pass through |
| `apps/api/src/routes/invites.ts` | Add `source: 'SYSTEM'` to two existing calls |

---

## What This Does Not Change

- Notification display text — identical regardless of source
- `NotificationDropdown` — no UI changes in this spec
- `useNotifications` hook — no changes beyond the new `source` field being available on `AppNotification`
- Socket emission — `emitToUser` payload gains `source` automatically since `createNotification` persists and returns the full row

---

## Future Work Enabled

- **Notification preferences:** `mute watcher notifications` filters on `source = 'WATCHER'` without touching routing logic
- **Analytics:** `COUNT(*) GROUP BY source` gives accurate breakdown with no backfill needed
- **Debugging:** every notification record is self-describing — source is explicit, never derived
- **`CARD_DUE_SOON`:** scheduled job creates with `source: 'ASSIGNMENT'` and type `CARD_DUE_SOON`; fits the model unchanged
- **`@@index([userId, source])`:** already added — `WHERE userId = ? AND source = 'WATCHER'` queries are index-covered from day one
