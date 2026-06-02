# Notification Subscription Split — Design Spec

**Date:** 2026-06-02
**Status:** Approved
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
```

**Dedup rule:** If a user is both assignee and watcher, `ASSIGNMENT` wins. This prevents duplicate notifications, respects the stronger ownership relationship, and makes future preference resolution unambiguous (`mute WATCHER` never suppresses `ASSIGNMENT`).

---

## Data Model

### `Notification` — new column

```prisma
model Notification {
  id        String   @id @default(cuid())
  userId    String
  type      String
  source    String   @default("SYSTEM")   // "ASSIGNMENT" | "WATCHER" | "SYSTEM"
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

**Default is `"SYSTEM"` — not `"ASSIGNMENT"`.** Any notification created without an explicit source is classified as a system event. This prevents silent misclassification: a future developer who forgets to pass `source` gets a safe fallback rather than corrupting assignment analytics.

Existing rows (invite notifications) are already semantically `SYSTEM`, so no `UPDATE` is needed after the column is added.

### Migration

```sql
ALTER TABLE "Notification"
ADD COLUMN "source" TEXT NOT NULL DEFAULT 'SYSTEM';
```

Single statement. No backfill required — the default is correct for all existing rows.

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

`type` is now `NotificationType` (was `string`) everywhere in the shared interface. Compile-time protection against typos at every call site.

---

## `notifications.ts` Changes

### `CardRecipient` type

```ts
import type { NotificationSource, NotificationType } from "@flowgrid/types"

type CardRecipient = {
  userId: string
  source: Exclude<NotificationSource, 'SYSTEM'>  // only ASSIGNMENT | WATCHER from cards
}
```

`NotificationSource` is imported from shared types — the `CardRecipient` type cannot drift out of sync.

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
  source: NotificationSource   // required — no default
  title: string
  body?: string
  data?: Record<string, unknown>
}): Promise<void>
```

`source` is required. No default. Any new call site that omits it is a compile error.

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
      source: 'ASSIGNMENT',
      title: `You were assigned to "${updated.title}"`,
      data: notifyData,
    })
  }
  excludeFromUpdate.add(assigneeId)
}

// Generic field-change notifications — one loop, source travels with each recipient
for (const { userId, source } of recipients) {
  if (excludeFromUpdate.has(userId)) continue
  // Per-field checks (title, priority, dueDate, assignee) each produce a CARD_UPDATED notification.
  // Title example:
  if (title !== undefined && title.trim() !== card.title) {
    void createNotification({ userId, source, type: 'CARD_UPDATED', title: `"${updated.title}" was renamed`, data: notifyData })
  }
  // priority, dueDate, assignee follow the same pattern.
}
```

`excludeFromUpdate` is extensible — future targeted notifications (e.g. `CARD_DUE_SOON` to assignee only) just add to the set before the loop.

### `comments.ts` — comment created

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
| `apps/api/prisma/schema.prisma` | Add `source String @default("SYSTEM")` to `Notification` |
| `apps/api/prisma/migrations/…` | `ADD COLUMN source TEXT NOT NULL DEFAULT 'SYSTEM'` |
| `packages/types/src/index.ts` | Add `NotificationSource`, expand `NotificationType`, add `source` to `AppNotification` |
| `apps/api/src/lib/notifications.ts` | `getCardRecipients` returns `CardRecipient[]`; `createNotification` typed `type` + required `source` |
| `apps/api/src/routes/cards.ts` | Destructure `{ userId, source }`, exclusion set pattern, explicit `source: 'ASSIGNMENT'` for `CARD_ASSIGNED` |
| `apps/api/src/routes/comments.ts` | Destructure `{ userId, source }`, pass through |
| `apps/api/src/routes/invites.ts` | Add `source: 'SYSTEM'` to two existing calls |

---

## What This Does Not Change

- Notification display text — identical regardless of source
- `NotificationDropdown` — no UI changes in this spec
- `useNotifications` hook — no changes beyond the new `source` field being available on `AppNotification`
- Socket emission — `emitToUser` payload gains `source` automatically since `createNotification` persists it and returns the full row

---

## Future Work Enabled

- **Notification preferences:** `mute watcher notifications` can filter on `source = 'WATCHER'` without touching routing logic
- **Analytics:** query `COUNT(*) GROUP BY source` gives accurate breakdown
- **Debugging:** any notification record is self-describing — source is explicit, not derived
- **`CARD_DUE_SOON`:** scheduled job creates notifications with `source: 'ASSIGNMENT'` and type `CARD_DUE_SOON`; fits the model without changes
