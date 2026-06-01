# Spec: Feature #14 — Notifications System

**Created**: 2026-06-01
**Status**: draft
**Author**: team
**Epic**: flowgrid-saas.md (#14)

---

## Problem

Users miss important events — being assigned a card, receiving a comment on their work, or a team invite being accepted — because there is no in-app signal. They must manually poll boards and refresh pages to discover changes. This breaks the collaborative flow that the real-time WebSocket layer (#13) was built to enable.

---

## Goal

Deliver a persistent, real-time notification system that alerts users to the three highest-signal events immediately, both when they are actively using the app and when they reconnect after being offline. A badge-count bell and dropdown panel give users a quick way to stay aware without navigating away.

**Success looks like**: A user assigned to a card sees a badge appear on the bell within 1 second; opening the dropdown shows the notification; clicking it closes the dropdown. All notifications persist across refresh. Unread count resets to zero after mark-all-read.

---

## User Stories

- **As a workspace member**, when someone assigns a card to me, I see a notification badge on the bell icon immediately (< 1s) so I know I have a new task.
- **As a card author or assignee**, when someone comments on my card, I get a notification so I can respond without watching every board I'm on.
- **As a workspace admin/owner**, when an invited member accepts their invite, I see a notification so I know the team is growing without checking the members page.

---

## Requirements

### Must-Have
- Notification model already exists in schema — no new migration required
- Three trigger types: `CARD_ASSIGNED`, `COMMENT_ADDED`, `INVITE_ACCEPTED`
- `POST /api/notifications` is **not** a public endpoint — notifications are created server-side only by trigger hooks inside existing route handlers
- `GET /api/notifications` — paginated list for current user (offset/limit, default limit 20)
- `POST /api/notifications/read?id=` — mark one notification as read
- `POST /api/notifications/read-all` — mark all unread for current user as read
- Real-time delivery: `notification:new` socket event pushed to a per-user Socket.IO room (`socket.join(userId)` on connect)
- Bell icon in `AppLayout` header with unread count badge
- Dropdown panel showing last 20 notifications with type icon, title, body, relative timestamp
- Mark-all-read button in dropdown header
- Self-notification guard: skip creating a notification if actor === target (e.g., user assigns themselves)
- Offline resilience: notifications stored in DB; on page load, `GET /api/notifications` hydrates the list

### Nice-to-Have (not in #14)
- Individual notification delete
- Click-to-navigate (deep-linking to specific card/board from notification)
- Notification sound toggle
- Toast pop-up on `notification:new` (low priority — bell badge is sufficient signal)

### Out of Scope
- @mention notifications (requires @mention parsing — defer to Feature #18)
- Due-date / reminder cron job (requires background scheduler — defer to Feature #18)
- Notification preferences / per-type mute settings
- Email notifications (Resend integration deferred)
- Push notifications (mobile/browser)

---

## Data Model

**Existing `Notification` table** — already migrated to Neon. No changes required.

```prisma
model Notification {
  id        String   @id @default(cuid())
  userId    String           -- recipient
  type      String           -- see NotificationType below
  title     String
  body      String?
  data      Json?            -- contextual IDs (cardId, boardId, etc.)
  read      Boolean  @default(false)
  createdAt DateTime @default(now()) @db.Timestamptz()

  user User @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@index([userId])
  @@index([userId, read])
}
```

**Notification type values** (stored as plain strings in `type` column):

| Type | Trigger |
|------|---------|
| `CARD_ASSIGNED` | `assigneeId` changes to a user in `POST /api/cards/update` |
| `COMMENT_ADDED` | New comment created in `POST /api/comments` on a card the recipient created or is assigned to |
| `INVITE_ACCEPTED` | Invite accepted in `POST /api/invites/accept` — notifies workspace owner + admins |

**`data` Json payload per type:**

```typescript
// CARD_ASSIGNED
{ cardId: string; cardTitle: string; boardId: string; workspaceId: string; actorName: string }

// COMMENT_ADDED
{ cardId: string; cardTitle: string; boardId: string; workspaceId: string; actorName: string; commentSnippet: string }

// INVITE_ACCEPTED
{ workspaceId: string; workspaceName: string; inviteeName: string }
```

**Shared types** — add to `packages/types/src/index.ts`:

```typescript
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
```

---

## API Changes

All endpoints require `Authorization: Bearer <token>` (existing `validateJWT` middleware).

### GET /api/notifications

Returns paginated notifications for the current user, newest first.

**Query params**: `offset` (default 0), `limit` (default 20, max 50)

**Response**:
```json
{
  "notifications": [
    {
      "id": "clxxx",
      "type": "CARD_ASSIGNED",
      "title": "You were assigned to Fix login bug",
      "body": "MyWorkspace · Sprint Board",
      "data": { "cardId": "...", "boardId": "...", "workspaceId": "..." },
      "read": false,
      "createdAt": "2026-06-01T10:30:00Z"
    }
  ],
  "total": 5,
  "unreadCount": 2
}
```

### POST /api/notifications/read?id=

Marks a single notification as read. Returns `{ success: true }`. 404 if not found or belongs to another user.

### POST /api/notifications/read-all

Marks all unread notifications for current user as read. Returns `{ updated: <count> }`.

### Internal helper (not a route)

```typescript
// apps/api/src/lib/notifications.ts
createNotification(params: {
  userId: string
  type: string
  title: string
  body?: string
  data?: object
}): Promise<void>
```

Fire-and-forget (non-blocking). After DB insert, emit `notification:new` to Socket.IO room `userId`.

---

## UI Changes

### New files

| File | Purpose |
|------|---------|
| `apps/web/src/api/notifications.ts` | API client — `list`, `markRead`, `markAllRead` |
| `apps/web/src/components/notifications/NotificationBell.tsx` | Bell icon + unread badge, toggles dropdown |
| `apps/web/src/components/notifications/NotificationDropdown.tsx` | Scrollable list, mark-all-read button, empty state |
| `apps/web/src/hooks/useNotifications.ts` | React Query fetch + socket `notification:new` subscription |

### Changed files

| File | Change |
|------|--------|
| `apps/web/src/lib/socket.ts` | `socket.join(userId)` on connect (server side: in `initSocket`) |
| `apps/api/src/routes/cards.ts` | Call `createNotification` in `POST /api/cards/update` when `assigneeId` changes |
| `apps/api/src/routes/comments.ts` | Call `createNotification` in `POST /api/comments` |
| `apps/api/src/routes/invites.ts` | Call `createNotification` in `POST /api/invites/accept` |
| `apps/api/src/lib/socket.ts` | `socket.join(socket.data.userId)` on `connection` event |
| `apps/web/src/pages/AppLayout.tsx` (or wherever the layout lives) | Add `<NotificationBell>` to header |
| `packages/types/src/index.ts` | Add `AppNotification`, `NotificationType` |

### Component layout

**`NotificationBell`** — sits in the `AppLayout` top-right header area (or sidebar footer, wherever the user avatar lives). Shows a filled bell icon. Unread count badge (red dot with number) when `unreadCount > 0`. Clicking toggles the `NotificationDropdown`.

**`NotificationDropdown`** — fixed-width (360px) dropdown panel below the bell. Header row: "Notifications" label + "Mark all read" button (disabled if unreadCount === 0). List of notifications, each showing:
- Type icon (small, uses OKLCH token colors — assigned=blue, comment=green, invite=purple)
- Title (semibold) + body (secondary text, truncated at 2 lines)
- Relative timestamp (e.g. "2m ago", "3h ago")
- Unread dot on left edge if `read === false`

Click outside → close dropdown. Empty state: "You're all caught up" with a check icon.

---

## Socket Changes

**Server (`apps/api/src/lib/socket.ts`)**:
```typescript
io.on('connection', (socket) => {
  // existing code ...
  socket.join(socket.data.userId)  // per-user room for notifications
})
```

**`createNotification` helper** emits after DB insert:
```typescript
io.to(userId).emit('notification:new', notification)
```

**Client (`useBoardSocket` / new `useNotifications` hook)**:
- `useNotifications` manages its own socket subscription to `notification:new`
- Prepends new notification to React Query cache (optimistic UI, no refetch)
- Increments unread count locally

The existing `createBoardSocket(token)` factory can be reused — per-user room join happens server-side on `connection`, no client action needed.

---

## Edge Cases

1. **Self-notification**: actor === recipient (user assigns themselves, comments on own card) → skip `createNotification` entirely. Check `actorId !== recipientId` before inserting.

2. **User offline at event time**: notification written to DB by the server; `io.to(userId).emit` is a no-op if the user has no socket. On next login/page load, `GET /api/notifications` delivers the full list.

3. **Multiple open tabs (same user)**: user joins the `userId` room from each tab. `notification:new` is received by all tabs simultaneously. React Query cache update in each tab is idempotent (dedup by `id` before prepend).

4. **Mark-all-read race with incoming notification**: `POST /api/notifications/read-all` runs `UPDATE WHERE read = false`. If a new notification arrives < 1ms after, it lands with `read = false` and will appear as unread on next fetch — correct behaviour.

5. **Deleted card referenced in notification**: `data.cardId` may point to a deleted card. Frontend must not crash — render title/body from the notification row itself (already denormalized into `title`/`body`), never re-fetch the card from a notification item.

6. **`COMMENT_ADDED` recipient**: The `Card` model has no `createdById` field, so only the card's current `assigneeId` is notified. Skip notification if `assigneeId` is null or equals the commenter. (Card creator notifications would require a schema migration — deferred.)

7. **`INVITE_ACCEPTED` recipient list**: Notify workspace OWNER + all ADMINs (not all members). Query `WorkspaceMember` WHERE `role IN ['OWNER', 'ADMIN']`. Skip the invitee themselves if they happen to be listed (shouldn't happen but guard anyway).

---

## Testing Criteria

**Happy path**
- Assign a card to user B while logged in as user A → user B sees badge increment + notification in dropdown
- Comment on a card assigned to user B while logged in as user A → user B sees notification with comment snippet
- Accept a workspace invite → workspace owner sees "X joined Y" notification
- Open dropdown → all unread items show blue dot; click "Mark all read" → dots disappear, badge clears

**Edge cases**
- Assign a card to yourself → no notification created
- Comment on your own assigned card → no notification created
- Mark-all-read on empty notification list → 200 response, `updated: 0`, no error
- Load notification with deleted card data → title/body still render correctly from DB columns

---

## Dependencies

- **Feature #13** ✅ — Socket.IO infrastructure, `emitBoardEvent`, per-user rooms can be added to existing `initSocket`
- **Feature #10** ✅ — Card `assigneeId` field on card update
- **Feature #11** ✅ — `POST /api/comments` route to hook into
- **Feature #6** ✅ — `POST /api/invites/accept` route and WorkspaceMember roles
- `Notification` Prisma model ✅ — already migrated, no schema change needed
- No new npm packages required
