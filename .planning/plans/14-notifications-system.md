# Plan: Feature #14 — Notifications System

**Spec**: .planning/specs/14-notifications-system.md
**Epic**: flowgrid-saas.md (#14)
**Created**: 2026-06-01
**Status**: draft
**Stack**: Full-stack (Node/Express + React/Vite)

---

## Architecture

### Component Table

| Component | Type | Purpose |
|-----------|------|---------|
| `lib/notifications.ts` | Backend helper | Fire-and-forget `createNotification()` — inserts DB row, emits socket event |
| `lib/socket.ts` (extend) | Backend lib | Add `socket.join(userId)` on connect; add `emitToUser()` export |
| `routes/notifications.ts` | Backend route | `GET /api/notifications`, `POST /api/notifications/read`, `POST /api/notifications/read-all` |
| `routes/cards.ts` (extend) | Backend route | Inject CARD_ASSIGNED trigger after `assigneeId` change is persisted |
| `routes/comments.ts` (extend) | Backend route | Inject COMMENT_ADDED trigger after comment is created |
| `routes/invites.ts` (extend) | Backend route | Inject INVITE_ACCEPTED trigger after WorkspaceMember row is created |
| `AppNotification` / `NotificationType` | Shared type | Typed interface in `packages/types` used by API + frontend |
| `api/notifications.ts` | Frontend API client | `list`, `markRead`, `markAllRead` — mirrors `api/comments.ts` pattern |
| `useNotifications` | Frontend hook | React Query for fetch; dedicated socket for `notification:new` push |
| `NotificationBell` | Frontend component | Bell icon with unread-count badge, toggles dropdown |
| `NotificationDropdown` | Frontend component | Scrollable notification list, mark-all-read button, empty state |
| `AppLayout` (extend) | Frontend layout | Add `<NotificationBell>` to the user section of the sidebar |

---

### New Files

| File | Location | Purpose |
|------|----------|---------|
| `notifications.ts` | `apps/api/src/lib/` | `createNotification()` helper — same pattern as `activity.ts` |
| `notifications.ts` | `apps/api/src/routes/` | 3-endpoint notifications router |
| `notifications.ts` | `apps/web/src/api/` | Frontend API client |
| `useNotifications.ts` | `apps/web/src/hooks/` | React Query + socket subscription hook |
| `NotificationBell.tsx` | `apps/web/src/components/notifications/` | Bell icon + badge |
| `NotificationDropdown.tsx` | `apps/web/src/components/notifications/` | Notification list dropdown |

---

### Files to Change

| File | What Changes | Why |
|------|-------------|-----|
| `apps/api/src/lib/socket.ts` | Add `socket.join(userId)` inside `io.on('connection', ...)` handler; export `emitToUser(userId, event, payload)` | Enables per-user rooms for notification push |
| `apps/api/src/index.ts` | Import + mount `notificationsRouter` at `/api/notifications` | Register new route |
| `apps/api/src/routes/cards.ts` | After `assigneeId !== card.assigneeId` branch: call `void createNotification(...)` | CARD_ASSIGNED trigger |
| `apps/api/src/routes/comments.ts` | After comment creation + response: call `void createNotification(...)` | COMMENT_ADDED trigger |
| `apps/api/src/routes/invites.ts` | After `prisma.$transaction([...])` in accept handler: call `void createNotification(...)` for workspace OWNER + ADMINs | INVITE_ACCEPTED trigger |
| `packages/types/src/index.ts` | Add `AppNotification` interface + `NotificationType` union type | Shared contract for API ↔ frontend |
| `apps/web/src/components/layout/AppLayout.tsx` | Import + render `<NotificationBell>` above the user section in the sidebar | Surface the bell in the UI |

---

## Task Breakdown

### Phase 1 — Backend Infrastructure
_These two tasks are independent and can be worked in parallel._

| # | Task | Files | What to Test |
|---|------|-------|-------------|
| 1 | Extend `lib/socket.ts` — add `socket.join(userId)` on connect + export `emitToUser(userId, event, payload)` | `apps/api/src/lib/socket.ts` | `tsc --noEmit` passes; no runtime breakage on `board:join` flow |
| 2 | Create `lib/notifications.ts` — `createNotification({ userId, type, title, body?, data? })`: inserts Prisma row, calls `emitToUser` (fire-and-forget with try/catch, mirrors `logActivity` pattern) | `apps/api/src/lib/notifications.ts` | `tsc --noEmit`; function is exported and importable |

### Phase 2 — Backend Notifications Route
_Depends on Task 2 (needs `createNotification` import)._

| # | Task | Files | What to Test |
|---|------|-------|-------------|
| 3 | Create `routes/notifications.ts` — `GET /api/notifications?offset=&limit=`, `POST /api/notifications/read?id=`, `POST /api/notifications/read-all`; register in `index.ts` | `apps/api/src/routes/notifications.ts`, `apps/api/src/index.ts` | `tsc --noEmit`; `GET /api/notifications` returns `{ notifications, total, unreadCount }` for an authenticated user |

### Phase 3 — Backend Triggers
_All three tasks are independent of each other; all depend on Task 2 (Phase 1)._

| # | Task | Files | What to Test |
|---|------|-------|-------------|
| 4 | `cards.ts` — CARD_ASSIGNED trigger: inside `POST /api/cards/update`, after `assigneeId !== card.assigneeId` activity log, add self-guard then `void createNotification({ userId: assigneeId, type: 'CARD_ASSIGNED', ... })` | `apps/api/src/routes/cards.ts` | Assign card to another user → notification row appears in DB; assign to self → no row |
| 5 | `comments.ts` — COMMENT_ADDED trigger: after comment is created and formatted, fetch card `{ creatorId, assigneeId }`, build recipient set (dedup creator + assignee, skip commenter), fire `void createNotification` for each | `apps/api/src/routes/comments.ts` | Comment on card assigned to user B (as user A) → notification for B in DB; comment on own card → no notification |
| 6 | `invites.ts` — INVITE_ACCEPTED trigger: after `prisma.$transaction` in accept handler, query `WorkspaceMember WHERE role IN ['OWNER','ADMIN'] AND workspaceId = ...`, skip invitee, fire `void createNotification` for each admin | `apps/api/src/routes/invites.ts` | Accept invite → notification rows for workspace OWNER + ADMINs; invitee doesn't get notified about themselves |

### Phase 4 — Frontend Types + API Client
_Independent of Phases 1–3. Can start immediately._

| # | Task | Files | What to Test |
|---|------|-------|-------------|
| 7 | Add `AppNotification` interface + `NotificationType` union to shared types | `packages/types/src/index.ts` | `tsc --noEmit` across packages |
| 8 | Create `api/notifications.ts` — `list(offset, limit)`, `markRead(id)`, `markAllRead()` mirroring `api/comments.ts` pattern | `apps/web/src/api/notifications.ts` | `tsc --noEmit`; type signatures match `AppNotification` |

### Phase 5 — Frontend Hook
_Depends on Tasks 7 + 8._

| # | Task | Files | What to Test |
|---|------|-------|-------------|
| 9 | Create `useNotifications.ts` — React Query query key `['notifications']`, fetch via `notificationsApi.list()`; create dedicated socket (reuse `createBoardSocket` factory) subscribed to `notification:new`; on event: prepend to cache, increment `unreadCount` (optimistic, no refetch); expose `{ notifications, unreadCount, total, markRead, markAllRead, isLoading }` | `apps/web/src/hooks/useNotifications.ts` | `tsc --noEmit`; hook returns correct shape |

### Phase 6 — Frontend UI
_Tasks 10 + 11 can be built in parallel; Task 12 depends on both._

| # | Task | Files | What to Test |
|---|------|-------|-------------|
| 10 | `NotificationBell.tsx` — bell SVG icon button; red badge with `unreadCount` when > 0 (hide at 0); onClick toggles open state; passes `open`/`onClose`/`notifications`/`unreadCount`/`markRead`/`markAllRead` props to `NotificationDropdown`; uses `useNotifications()` | `apps/web/src/components/notifications/NotificationBell.tsx` | Bell renders; badge visible at count=1; hidden at count=0 |
| 11 | `NotificationDropdown.tsx` — fixed 360px panel; header "Notifications" + "Mark all read" button (disabled when `unreadCount===0`); list maps notifications to rows: type icon, title (semibold), body (2-line clamp), relative timestamp, unread dot; empty state "You're all caught up"; click-outside closes | `apps/web/src/components/notifications/NotificationDropdown.tsx` | Renders 0/1/N notifications; mark-all-read disables button after click |
| 12 | Wire bell into `AppLayout.tsx` — import `NotificationBell`, render above the user section divider in the sidebar | `apps/web/src/components/layout/AppLayout.tsx` | Bell visible in sidebar; does not break existing layout |

### Phase 7 — Build Verification

| # | Task | Files | What to Test |
|---|------|-------|-------------|
| 13 | Run `tsc --noEmit` (API) + `vite build` (web) — fix any type errors | Both apps | Both builds pass clean |

---

## Parallelism Map

| Parallel Group | Tasks | Reason |
|----------------|-------|--------|
| A | 1, 2 | Different files in `lib/`, no shared state |
| B | 4, 5, 6 | Different route files, all depend only on Task 2 |
| C | 7, 8 | Frontend types + client, no backend dependency |
| D | 10, 11 | Independent UI components (bell and dropdown) |

| Sequential Chain | Tasks | Reason |
|-----------------|-------|--------|
| 1 → 2 (recommended, not required) | 2 calls `emitToUser` | Write `emitToUser` first so notifications.ts can import it cleanly |
| 2 → 4,5,6 | Triggers import `createNotification` | Must exist before injection |
| 7,8 → 9 | Hook types depend on `AppNotification`, client on `api/notifications.ts` | Type correctness |
| 9 → 10,11 | Bell and Dropdown consume the hook | Data must be available |
| 10,11 → 12 | AppLayout imports the Bell | Component must exist |
| 12 → 13 | Build verification last | Catches cross-file type errors |

---

## Implementation Details

### `createNotification` (mirrors `logActivity`)

```typescript
// apps/api/src/lib/notifications.ts
import { prisma } from "./prisma"
import { emitToUser } from "./socket"
import type { Prisma } from "../../generated/prisma"

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
        data: (params.data ?? null) as Prisma.InputJsonValue | null,
      },
    })
    emitToUser(params.userId, "notification:new", {
      id: n.id, userId: n.userId, type: n.type,
      title: n.title, body: n.body, data: n.data,
      read: n.read, createdAt: n.createdAt,
    })
  } catch (err) {
    console.error("[notification] failed to create:", params.type, err)
  }
}
```

### `emitToUser` addition to `socket.ts`

```typescript
// Add inside io.on('connection', ...) — after userId guard:
socket.join(userId)  // per-user room for notifications

// New export at bottom of socket.ts:
export function emitToUser(userId: string, event: string, payload: unknown): void {
  if (!io) return
  io.to(userId).emit(event, payload)
}
```

### CARD_ASSIGNED trigger insertion point in `cards.ts`

Insert after the existing `logActivity` call for `assignee_changed` (line ~308), before `emitBoardEvent`:
```typescript
// Inside: if (assigneeId !== undefined && assigneeId !== card.assigneeId) { ... }
if (assigneeId && assigneeId !== req.user!.id) {
  void createNotification({
    userId: assigneeId,
    type: "CARD_ASSIGNED",
    title: `You were assigned to ${updated.title}`,
    body: `${access.board.workspaceId}`,  // replaced with workspace name via join below
    data: { cardId: card.id, boardId: access.board.id, workspaceId: access.board.workspaceId },
  })
}
```
Note: fetch `board.name` + `workspace.name` in the cards update query to populate `body` properly (single extra `include` on the board fetch, or use existing `access` data — workspaceId is already available; workspace name requires one extra lookup OR just omit body for MVP).

**MVP simplification**: For `CARD_ASSIGNED`, `body` is optional per spec — ship without body initially. Workspace name lookup can be added in polish.

### COMMENT_ADDED trigger (in `comments.ts`)

The `Card` model has **no `createdById` field** — only `assigneeId`. Notify only the card's current assignee (if different from the commenter):

```typescript
// After comment is persisted and before res.json(...)
const cardForNotify = await prisma.card.findUnique({
  where: { id: cardId },
  select: { assigneeId: true, title: true },
})
if (cardForNotify?.assigneeId && cardForNotify.assigneeId !== req.user!.id) {
  // Strip HTML tags for comment snippet in body
  const snippet = sanitizeHtml(content, { allowedTags: [], allowedAttributes: {} })
    .trim()
    .slice(0, 80)
  void createNotification({
    userId: cardForNotify.assigneeId,
    type: "COMMENT_ADDED",
    title: `New comment on "${cardForNotify.title}"`,
    body: snippet || undefined,
    data: { cardId, boardId: access.board.id, workspaceId: access.board.workspaceId },
  })
}
```

Note: `access.board` is already resolved by `resolveCardAccess` earlier in the handler — no extra DB query needed.

### INVITE_ACCEPTED trigger (in `invites.ts`)

After `prisma.$transaction([...])` succeeds, query workspace OWNER + ADMINs, skip the invitee:

```typescript
const admins = await prisma.workspaceMember.findMany({
  where: { workspaceId: invite.workspaceId, role: { in: ["OWNER", "ADMIN"] }, deletedAt: null },
  select: { userId: true },
})
const inviteeName = req.user!.email  // name not available here without extra fetch
for (const admin of admins) {
  if (admin.userId === req.user!.id) continue  // skip if invitee is somehow an admin already
  void createNotification({
    userId: admin.userId,
    type: "INVITE_ACCEPTED",
    title: `${inviteeName} joined ${invite.workspace.name}`,
    data: { workspaceId: invite.workspaceId },
  })
}
```

Note: `invite.workspace` is already included in the existing `findUnique` call — no extra query needed. Use `req.user!.email` as invitee name since the User name requires an extra lookup; for MVP this is acceptable.

---

## Testing Plan

All tests are manual (no test runner in repo) — verify via running `apps/api` + `apps/web` and using the browser.

### Backend tests (manual via curl / app)

| Scenario | Expected |
|----------|----------|
| `GET /api/notifications` — authenticated user with no notifications | `{ notifications: [], total: 0, unreadCount: 0 }` |
| `GET /api/notifications` — after trigger fires | Returns notification row, `unreadCount: 1` |
| `GET /api/notifications` — unauthenticated | 401 |
| `POST /api/notifications/read?id=<valid>` | `{ success: true }`, row has `read: true` |
| `POST /api/notifications/read?id=<other user's>` | 404 (no leaking other users' data) |
| `POST /api/notifications/read-all` | `{ updated: N }`, all rows have `read: true` |
| Assign card to self → no notification row | Pass |
| Assign card to other user → row in DB + `notification:new` socket event | Pass |
| Comment on card with no assignee → no notification | Pass |
| Comment on assigned card (as assignee) → no notification (self) | Pass |
| Comment on assigned card (as other user) → notification for assignee | Pass |
| Accept invite → notifications for workspace OWNER + ADMINs | Pass |
| `tsc --noEmit` (API) | 0 errors |

### Frontend tests (manual in browser)

| Scenario | Expected |
|----------|----------|
| Bell renders in sidebar | Visible icon, no badge when 0 unread |
| Bell badge shows count | Red badge appears with correct number |
| Click bell → dropdown opens | Panel visible with notification list |
| Click outside dropdown → closes | Panel hidden |
| Unread dot visible per item | Blue dot on unread items only |
| "Mark all read" button | Dots disappear, badge clears, button disables |
| Notification arrives via socket (real-time) | Badge increments without page refresh |
| Empty state | "You're all caught up" message |
| `vite build` | 0 type errors |

### Edge cases (spec → test mapping)

| Edge Case | Test |
|-----------|------|
| Self-assignment | Assign card to yourself → no DB row |
| Self-comment | Comment on own assigned card → no DB row |
| Null assignee | Comment on unassigned card → no DB row |
| Already-a-member (invite race guard) | Accept invite when already member → no INVITE_ACCEPTED notification (early return before $transaction) |
| Deleted card data in notification | Notification renders from `title`/`body` columns — does not re-fetch card |

---

## Gate 2 Checklist

**Architecture:**
- [x] Follows project architecture — helper in `lib/`, router in `routes/`, components in `components/notifications/`
- [x] Each layer calls only the layer below — routes call `lib/notifications.ts`, frontend hook calls `api/notifications.ts`
- [x] Components in correct directories — `notifications/` subfolder under `components/`

**Task Breakdown:**
- [x] All new files listed with locations (6 new files)
- [x] All changed files listed (7 existing files)
- [x] Each task touches max 2 files
- [x] Dependencies between tasks are explicit (sequential chain table)
- [x] Parallel vs sequential tasks mapped

**Implementation Correctness:**
- [x] No `createdById` used — Card schema confirmed, only `assigneeId`
- [x] `access.board` reused in COMMENT_ADDED trigger — no extra DB query
- [x] `invite.workspace` already included — no extra DB query in INVITE_ACCEPTED trigger
- [x] Self-notification guard documented for all 3 triggers
- [x] `WorkspaceMember.deletedAt` filtered in INVITE_ACCEPTED admin query

**Testing:**
- [x] Backend manual test cases mapped to spec requirements
- [x] Frontend manual test cases cover all 3 states (0, 1, N notifications)
- [x] All 5 edge cases from spec have corresponding test scenarios
- [x] Build verification task (Task 13) is the final gate
