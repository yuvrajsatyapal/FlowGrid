# Spec: Feature #11 — Comments & Activity History

**Created**: 2026-06-01
**Status**: draft
**Author**: Yuvraj Satyapal
**Epic**: flowgrid-saas.md

---

## Problem

Cards currently store tasks but do not store collaboration or history. Team conversations about work move to Slack, WhatsApp, and calls, becoming disconnected from the tasks they reference. When a card changes — priority, due date, assignee, labels — there is no record of who changed it or why, making accountability and retrospective debugging impossible.

**Core problem statement**: "Cards currently store tasks but do not store collaboration or history, which makes teamwork, context sharing, and accountability difficult."

---

## Goal

- Team members can discuss work directly on a card using a rich text comment editor
- Managers and teammates can see a chronological activity log of everything that changed on a card
- Both features live inside the existing `CardDetailModal`, requiring zero navigation changes
- Activity logging is invisible to the user — it happens automatically as a side-effect of existing actions

---

## User Stories

**US-1**: As a team member, I want to leave a comment on a card so that my questions, updates, and discussions stay attached to the task instead of being scattered across external tools.

**US-2**: As a project manager, I want to see the history of a card (who changed what and when) so I can understand task evolution and maintain accountability without asking team members manually.

*(US-3: Notification on new comment — out of scope; depends on Feature #14)*

---

## Requirements

### Must-Have
- Comment creation with TipTap rich text editor (consistent with card description editor)
- Comment edit (own comments only, or board OWNER/ADMIN)
- Comment soft-delete (own comments only, or board OWNER/ADMIN)
- Comment list: newest last, paginated (default limit=50)
- Activity log: append-only, auto-logged on card mutations, newest last, paginated (default limit=100)
- Auto-logged activity events: `card_created`, `title_changed`, `priority_changed`, `due_date_changed`, `assignee_changed`, `label_added`, `label_removed`, `card_moved`, `card_archived`, `card_unarchived`, `comment_added`, `comment_edited`, `comment_deleted`
- Access control: read open to all workspace members (PRIVATE board requires BoardMember), write gated per rule
- TipTap HTML sanitization on the backend before persist
- Activity logging must be fire-and-forget — failure must never block the primary action

### Nice-to-Have
- Character count indicator when comment nears 10,000 char limit
- Relative timestamps ("2 minutes ago") for comments and activity entries
- "Edited" indicator on a comment that has been modified

### Out of Scope
- @mentions → Feature #18
- Comment reactions (👍, etc.)
- Comment attachments → Feature #12
- Notifications on new comment → Feature #14
- Real-time comment sync → Feature #13
- Activity for board/list/workspace-level events (card-scoped only)
- Threaded comments / replies
- Comment pinning, sorting, or filtering
- Advanced editor features (slash commands, embeds, tables)
- Infinite scroll / cursor-based pagination (plain offset/limit is sufficient for #11)

---

## Data Model

Both models already exist in `prisma/schema.prisma`. **No migration needed.**

```prisma
model Comment {
  id        String    @id @default(cuid())
  cardId    String
  authorId  String
  content   String    // TipTap HTML, sanitized before storage
  createdAt DateTime  @default(now()) @db.Timestamptz()
  updatedAt DateTime  @updatedAt @db.Timestamptz()
  deletedAt DateTime? @db.Timestamptz()  // soft delete
}

model Activity {
  id        String   @id @default(cuid())
  cardId    String
  userId    String
  type      String   // see activity event type table below
  data      Json?    // structured payload per event type
  createdAt DateTime @default(now()) @db.Timestamptz()
  // append-only: no updatedAt, no deletedAt
}
```

### Activity Event Types

| `type` | `data` shape | Triggered by |
|--------|-------------|--------------|
| `card_created` | `{}` | `POST /api/cards` |
| `title_changed` | `{ from: string, to: string }` | `POST /api/cards/update` |
| `priority_changed` | `{ from: Priority, to: Priority }` | `POST /api/cards/update` |
| `due_date_changed` | `{ from: string\|null, to: string\|null }` | `POST /api/cards/update` |
| `assignee_changed` | `{ from: userId\|null, to: userId\|null }` | `POST /api/cards/update` |
| `label_added` | `{ labelId: string, labelName: string }` | `POST /api/cards/labels/add` |
| `label_removed` | `{ labelId: string, labelName: string }` | `POST /api/cards/labels/remove` |
| `card_moved` | `{ fromListId: string, toListId: string }` | `POST /api/cards/move` (cross-list only) |
| `card_archived` | `{}` | `POST /api/cards/delete` |
| `card_unarchived` | `{}` | future restore endpoint |
| `comment_added` | `{ commentId: string }` | `POST /api/comments` |
| `comment_edited` | `{ commentId: string }` | `POST /api/comments/update` |
| `comment_deleted` | `{ commentId: string }` | `POST /api/comments/delete` |

---

## API Changes

All new endpoints follow project conventions: RPC-style POST for mutations, GET for reads, `?id=` query params (no path params), `snake_case` JSON.

### Comments

```
GET  /api/comments?cardId=&offset=0&limit=50
     → { items: Comment[], total: number, offset: number, limit: number }
     Comment: { id, cardId, author: {id, name, avatarUrl}|null, content, createdAt, updatedAt, deletedAt }

POST /api/comments
     Body: { cardId: string, content: string }  // content = sanitized TipTap HTML
     → Comment (same shape as above)
     Auth: any WorkspaceMember; PRIVATE board requires BoardMember

POST /api/comments/update?id=
     Body: { content: string }
     → Comment
     Auth: comment.authorId === req.user.id OR board OWNER/ADMIN

POST /api/comments/delete?id=
     → { success: true }
     Auth: comment.authorId === req.user.id OR board OWNER/ADMIN
     Behavior: soft delete (sets deletedAt), logs comment_deleted activity
```

### Activities

```
GET  /api/activities?cardId=&offset=0&limit=100
     → { items: Activity[], total: number, offset: number, limit: number }
     Activity: { id, cardId, user: {id, name, avatarUrl}|null, type, data, createdAt }
     Note: read-only; no direct write endpoint
```

### Existing endpoints updated (activity side-effects)

No signature changes. The following existing endpoints gain an internal `logActivity()` call after their primary operation succeeds:

- `POST /api/cards` — logs `card_created`
- `POST /api/cards/update` — logs any changed fields (diff against current values)
- `POST /api/cards/labels/add` — logs `label_added`
- `POST /api/cards/labels/remove` — logs `label_removed`
- `POST /api/cards/move` — logs `card_moved` (cross-list only; `/reorder` does NOT log)
- `POST /api/cards/delete` — logs `card_archived`

`logActivity()` is fire-and-forget: wrapped in `try/catch`, failure is logged to console but does not throw or affect the response.

### Access Control Summary

| Action | Required |
|--------|----------|
| Read comments / activities | WorkspaceMember (+ BoardMember for PRIVATE) |
| Create comment | WorkspaceMember (+ BoardMember for PRIVATE) |
| Edit/delete own comment | Author of comment |
| Edit/delete any comment | Board OWNER or ADMIN |
| Write activity | Internal only (no external endpoint) |

---

## UI Changes

All UI changes are contained within `CardDetailModal.tsx` and new child components. No new pages or routes.

### Files to create
- `apps/web/src/components/boards/CommentThread.tsx` — comment list + TipTap new-comment editor
- `apps/web/src/components/boards/ActivityFeed.tsx` — read-only timeline of activity events
- `apps/web/src/api/comments.ts` — API client
- `apps/web/src/api/activities.ts` — API client

### Files to modify
- `apps/web/src/components/boards/CardDetailModal.tsx` — add `<CommentThread>` and `<ActivityFeed>` below the labels section
- `packages/types/src/index.ts` — add `Comment` and `Activity` interfaces

### Layout

Bottom section of `CardDetailModal` (below Labels panel):

```
─── Comments ─────────────────────────
[ Avatar ] [ TipTap mini editor        ]
           [ Cancel ]  [ Save Comment  ]

  Avatar  Author name · 2h ago
  Comment content (rich text)
  [ Edit ] [ Delete ]  ← only shown to author or OWNER/ADMIN

  Avatar  Author name · 1d ago
  ...

─── Activity ─────────────────────────
  Avatar  Yuvraj changed priority from NONE to HIGH · 3h ago
  Avatar  Yuvraj added label "Backend" · 1d ago
  ...
```

### TypeScript interfaces to add

```typescript
export interface CommentAuthor {
  id: string
  name: string
  avatarUrl: string | null
}

export interface Comment {
  id: string
  cardId: string
  author: CommentAuthor | null  // null if user deleted
  content: string               // TipTap HTML
  createdAt: string
  updatedAt: string
  deletedAt: string | null
}

export interface ActivityUser {
  id: string
  name: string
  avatarUrl: string | null
}

export interface Activity {
  id: string
  cardId: string
  user: ActivityUser | null     // null if user deleted
  type: string
  data: Record<string, unknown> | null
  createdAt: string
}
```

---

## Edge Cases

1. **Empty comment submitted** — TipTap HTML `<p></p>` or whitespace-only must be rejected. Backend validates, frontend disables submit button when editor is empty.
2. **Comment exceeds 10,000 chars** — backend validates and returns 400; frontend shows character count indicator near limit.
3. **Edit/delete comment you don't own** — backend enforces `authorId === req.user.id || role === OWNER/ADMIN`; returns 403. Frontend hides Edit/Delete buttons for non-authors but does not rely on UI alone.
4. **Card soft-deleted while modal is open** — comment/activity GETs return 404; frontend shows graceful "card no longer available" message, does not crash.
5. **Activity list grows large** — endpoint uses `offset/limit` (default 100). Redesign not required later; pagination is already built in.
6. **Concurrent comment edits** — two tabs editing the same comment; last-write-wins is acceptable for MVP. No locking.
7. **`card_moved` on reorder vs move** — `/api/cards/reorder` (same-list position change) must NOT log `card_moved`. Only `/api/cards/move` (cross-list) logs it.
8. **Deleted user as author** — comments and activities must still render. `author` and `user` fields are nullable; frontend renders "Deleted User" with a gray placeholder avatar when null.
9. **Permission change while modal is open** — if user loses workspace access or role is demoted mid-session, subsequent mutations return 403. Frontend catches 403 and shows "You no longer have access to this card" state.
10. **Duplicate comment submissions** — slow network or rapid re-clicks. Submit button is disabled immediately on submit and re-enabled only on success or error. No server-side idempotency key needed for MVP.
11. **TipTap HTML injection** — backend sanitizes comment `content` before persisting. Use a safe-HTML library (e.g., `sanitize-html`) to strip unsafe tags/attributes. Frontend renders comment HTML via `dangerouslySetInnerHTML` only after trusting the sanitized value from the API.
12. **Activity logging failure** — if `logActivity()` throws, the primary action (card update, comment create, etc.) has already succeeded. The catch block logs the error to console but does not rethrow. The user never sees an error due to activity logging.

---

## Testing Criteria

### Happy Path
- Create a comment on a card → appears in comment list, `comment_added` activity logged
- Edit own comment → content updates, `comment_edited` activity logged, "Edited" marker shown
- Delete own comment → soft-deleted, no longer shown in list, `comment_deleted` activity logged
- Change card priority → `priority_changed` activity entry appears with from/to values
- Move card to another list → `card_moved` activity entry appears
- OWNER/ADMIN can delete another user's comment
- Activity feed shows correct user name and avatar for each event

### Edge Case Tests
- Submit empty comment → button disabled, no API call made
- Submit comment at 10,001 chars → backend returns 400
- Non-author attempts to delete another user's comment → API returns 403
- Fetch comments/activities on a PRIVATE board without BoardMember → 404 (consistent with card reads)
- Deleted user's comment still renders with "Deleted User" fallback
- Reorder cards within same list → NO `card_moved` activity
- Move card to different list → `card_moved` activity logged once
- Rapid submit button clicks → only one comment created

---

## Dependencies

- **Feature #10b** (CardDetailModal) — comments and activity live inside this modal ✅ done
- **`Comment` and `Activity` Prisma models** — already in schema, applied to Neon ✅ done
- **TipTap** (`@tiptap/react`, `@tiptap/starter-kit`) — already installed ✅ done
- **`sanitize-html`** (or equivalent) — new backend dependency to add
- **Feature #14** (Notifications) — comment notification (US-3) deferred here
- **Feature #13** (Real-time) — live comment sync deferred here
