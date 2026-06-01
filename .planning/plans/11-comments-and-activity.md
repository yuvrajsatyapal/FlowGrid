# Plan: Feature #11 — Comments & Activity History

**Spec**: .planning/specs/11-comments-and-activity.md
**Epic**: flowgrid-saas.md
**Created**: 2026-06-01
**Status**: draft

---

## Stack Detection

Full-stack: Express + Prisma (API) + React + Vite (web). Backend built first, then frontend.

---

## Schema Alignment Notes

The Prisma `Activity` model uses `action` (not `type`) and `metadata` (not `data`).
The plan uses these schema field names throughout. The spec's `type`/`data` language maps to:
- spec `type` → schema `action`
- spec `data` → schema `metadata`

The Prisma `Comment` model stores `userId`. The API response returns an enriched `author: {id, name, avatarUrl} | null` object (consistent with how cards return `assignee`).

---

## Components

| Component | Type | Purpose |
|-----------|------|---------|
| `logActivity` | Lib helper | Fire-and-forget Activity writer; wraps prisma.activity.create in try/catch |
| `commentsRouter` | Express Router | GET list, POST create/update/delete for comments |
| `activitiesRouter` | Express Router | GET list for card activities |
| `comments.ts` (API client) | Fetch client | Web-side CRUD wrappers for comment endpoints |
| `activities.ts` (API client) | Fetch client | Web-side fetch wrapper for activities endpoint |
| `CommentThread` | React component | Comment list + TipTap new-comment editor |
| `ActivityFeed` | React component | Read-only timeline of activity events |

---

## File Locations

### New files

| File | Location | Purpose |
|------|----------|---------|
| `activity.ts` | `apps/api/src/lib/` | `logActivity()` helper — fire-and-forget activity writer |
| `comments.ts` | `apps/api/src/routes/` | Comments CRUD endpoints |
| `activities.ts` | `apps/api/src/routes/` | Activities read endpoint |
| `comments.ts` | `apps/web/src/api/` | Comments API client |
| `activities.ts` | `apps/web/src/api/` | Activities API client |
| `CommentThread.tsx` | `apps/web/src/components/boards/` | Comment list + editor component |
| `ActivityFeed.tsx` | `apps/web/src/components/boards/` | Activity timeline component |

### Files to modify

| File | What changes | Why |
|------|-------------|-----|
| `apps/api/src/routes/cards.ts` | Add `logActivity()` calls to 6 route handlers | Auto-log card_created, title_changed, priority_changed, due_date_changed, assignee_changed, card_moved, card_archived |
| `apps/api/src/routes/labels.ts` | Add `logActivity()` calls to add/remove handlers | Auto-log label_added, label_removed |
| `apps/api/src/index.ts` | Register `commentsRouter`, `activitiesRouter` | Expose new routes |
| `packages/types/src/index.ts` | Add `CommentResponse`, `ActivityResponse` interfaces; update existing `Comment` + `Activity` to match API shapes | API returns enriched author objects, not raw userId |
| `apps/web/src/components/boards/CardDetailModal.tsx` | Add `<CommentThread>` and `<ActivityFeed>` below labels section | Feature integration |

---

## Task Breakdown

### Phase 1 — Backend infrastructure (no new routes yet)

| # | Task | Files | Test |
|---|------|-------|------|
| 1 | Install `sanitize-html` + `@types/sanitize-html` on API | `apps/api/package.json` | `pnpm install` succeeds, tsc clean |
| 2 | Create `logActivity()` helper — wraps `prisma.activity.create({ data: { cardId, userId, action, metadata, boardId: null } })` in try/catch; never throws | `apps/api/src/lib/activity.ts` | Import in a route, verify tsc clean |
| 3 | Wire `logActivity` into `cards.ts` — after each successful primary operation: `card_created`, `title_changed`, `priority_changed`, `due_date_changed`, `assignee_changed`, `card_moved` (cross-list only), `card_archived` | `apps/api/src/routes/cards.ts` | tsc clean; manual: update a card priority, check DB for activity row |
| 4 | Wire `logActivity` into `labels.ts` — `label_added` and `label_removed`; needs boardId lookup from card→list→board | `apps/api/src/routes/labels.ts` | tsc clean; manual: add a label, check DB for activity row |

> **Task 3 detail — detecting changes for `title_changed` etc.:**
> Read the current card BEFORE the update (`card` is already fetched in the update handler for the `404` check). After `prisma.card.update` succeeds, compare old vs new for each field. Only log entries for fields that actually changed. Use a single `logActivity` call per changed field, or batch into one activity with `action: "card_updated"` and `metadata: { changes: [{field, from, to}] }`. **Recommended: one activity per changed field** — matches the spec event type table and keeps the feed readable.

> **Task 3 note — `card_moved`:** Only fires in the `/move` handler (`POST /api/cards/move`), not in `/reorder`. The move handler already has `targetListId` and the original `card.listId`.

---

### Phase 2 — Comments API

| # | Task | Files | Test |
|---|------|-------|------|
| 5 | Create `comments.ts` route — `GET /api/comments` (paginated, with author join, filters deletedAt) + local `resolveCardAccess()` helper (card→list→board→workspace, same pattern as `resolveListAccess` in cards.ts) | `apps/api/src/routes/comments.ts` | GET returns `{ items, total, offset, limit }`, author is `{id, name, avatarUrl}` or null |
| 6 | Add `POST /api/comments` (create) to comments route — validate content non-empty and ≤10,000 chars, sanitize with `sanitize-html`, log `comment_added` activity; add `POST /api/comments/update` — author-or-admin check, sanitize, log `comment_edited` | `apps/api/src/routes/comments.ts` | POST creates comment + activity row; non-author update returns 403 |
| 7 | Add `POST /api/comments/delete` to comments route — soft delete (sets `deletedAt`), author-or-admin check, log `comment_deleted` | `apps/api/src/routes/comments.ts` | Soft delete; non-author delete returns 403; deleted comment excluded from GET |

> **`sanitize-html` config**: allow tags `p, strong, em, ul, ol, li, blockquote, br, a` with `href` only. Strip everything else. Apply in create AND update handlers before `prisma.comment.create/update`.

> **`resolveCardAccess` pattern** (inline in comments.ts, same as labels.ts pattern):
> 1. `prisma.card.findUnique({ where: { id: cardId } })` — 404 if not found or deletedAt set
> 2. `prisma.list.findUnique` on `card.listId`
> 3. `prisma.board.findUnique` on `list.boardId` — check workspace membership
> 4. PRIVATE board → check `boardMember` row
> Returns `{ card, list, board, membership }` or writes 404 and returns null.

---

### Phase 3 — Activities API

| # | Task | Files | Test |
|---|------|-------|------|
| 8 | Create `activities.ts` route — `GET /api/activities?cardId=&offset=&limit=` with user join (returns `user: {id, name, avatarUrl} | null`); same `resolveCardAccess` pattern inline | `apps/api/src/routes/activities.ts` | GET returns chronological list; PRIVATE board without BoardMember returns 404 |

---

### Phase 4 — Register routes

| # | Task | Files | Test |
|---|------|-------|------|
| 9 | Register `commentsRouter` at `/api/comments` and `activitiesRouter` at `/api/activities` in `index.ts` | `apps/api/src/index.ts` | Server starts, routes respond |

> After Phase 4: full backend tsc check (`pnpm --filter api tsc --noEmit`). All 4 phases must be clean before frontend starts.

---

### Phase 5 — Types

| # | Task | Files | Test |
|---|------|-------|------|
| 10 | Add `CommentResponse` and `ActivityResponse` interfaces to types package; update existing `Comment` and `Activity` interfaces (they use `Date`-typed fields — API clients will use `string` ISO dates, so new interfaces use `string`) | `packages/types/src/index.ts` | tsc clean across packages |

```typescript
// New interfaces to add (API response shapes — strings, not Dates)
export interface CommentAuthor {
  id: string; name: string; avatarUrl: string | null
}
export interface CommentResponse {
  id: string; cardId: string
  author: CommentAuthor | null  // null if user deleted
  content: string               // sanitized TipTap HTML
  createdAt: string; updatedAt: string; deletedAt: string | null
}
export interface ActivityUser {
  id: string; name: string; avatarUrl: string | null
}
export interface ActivityResponse {
  id: string; cardId: string
  user: ActivityUser | null     // null if user deleted
  action: string                // matches Prisma field name
  metadata: Record<string, unknown>
  createdAt: string
}
```

---

### Phase 6 — API clients

| # | Task | Files | Test |
|---|------|-------|------|
| 11 | Create `apps/web/src/api/comments.ts` — `listComments`, `createComment`, `updateComment`, `deleteComment` | `apps/web/src/api/comments.ts` | tsc clean |
| 12 | Create `apps/web/src/api/activities.ts` — `listActivities` | `apps/web/src/api/activities.ts` | tsc clean |

```typescript
// comments.ts shape
listComments(cardId: string, offset?: number, limit?: number): Promise<{ items: CommentResponse[], total: number, offset: number, limit: number }>
createComment(cardId: string, content: string): Promise<CommentResponse>
updateComment(id: string, content: string): Promise<CommentResponse>
deleteComment(id: string): Promise<{ success: boolean }>

// activities.ts shape
listActivities(cardId: string, offset?: number, limit?: number): Promise<{ items: ActivityResponse[], total: number, offset: number, limit: number }>
```

---

### Phase 7 — Frontend components

| # | Task | Files | Test |
|---|------|-------|------|
| 13 | Create `CommentThread.tsx` — comment list (map over items, show author avatar + name + relative time + sanitized HTML via dangerouslySetInnerHTML + Edit/Delete for author/admin), + TipTap mini editor + submit button; `canEdit` prop disables submit | `apps/web/src/components/boards/CommentThread.tsx` | Renders with empty state; submit disabled when editor empty |
| 14 | Create `ActivityFeed.tsx` — read-only timeline list; renders human-readable string per `action` type (e.g., "changed priority from NONE to HIGH"); shows `user.name` or "Deleted User" + relative time | `apps/web/src/components/boards/ActivityFeed.tsx` | Renders all known action types without crashing; unknown actions show generic fallback |
| 15 | Wire `CommentThread` and `ActivityFeed` into `CardDetailModal.tsx` — add below labels section in the left (body) column; fetch on `cardId` change using `useEffect`; pass `canEdit` from existing modal logic | `apps/web/src/components/boards/CardDetailModal.tsx` | Modal opens, both sections load; new comment appears inline after submit |

> **Task 15 layout detail**: Comments and Activity go in the **left body column** of the modal (below the description + labels area), not the right sidebar. The right sidebar (priority, due date, assignee, labels) stays as-is. This gives comments enough horizontal space for readable text.

> **Task 13 TipTap config**: `useEditor({ extensions: [StarterKit, Placeholder.configure({ placeholder: "Write a comment…" })], content: "" })`. Reuse the same packages already installed for card description. Do NOT add Placeholder extension import unless already present — check imports before adding.

> **Task 13 empty-check**: TipTap `editor.isEmpty` returns `true` for `<p></p>`. Disable submit button when `editor.isEmpty`. On submit: `editor.getHTML()` → send to API → `editor.commands.clearContent()` on success.

> **Task 14 action string map**: Define a `const ACTION_LABELS: Record<string, (metadata: ...) => string>` map for all 13 action types. Unknown actions fall back to `action.replace(/_/g, " ")`. Keep the map in the same file.

---

### Phase 8 — Validation

| # | Task | Files | Test |
|---|------|-------|------|
| 16 | `pnpm --filter api tsc --noEmit` + `pnpm --filter web build` — fix all errors | All touched files | Both pass with zero errors |

---

## Parallel vs Sequential

| Parallel Group | Tasks | Why |
|---------------|-------|-----|
| Group A | 5, 6, 7 (sequential within group) | All in comments.ts — must be sequential within file |
| Group B | 11, 12 | Independent API client files |
| Group C | 13, 14 | Independent component files |

| Sequential | Depends On | Why |
|-----------|-----------|-----|
| Task 3 | Task 2 | logActivity must exist before wiring |
| Task 4 | Task 2 | Same reason |
| Task 5–7 | Task 1 | sanitize-html must be installed |
| Task 8 | Task 2 | logActivity needed? No — activities has no write. Phase 3 can start after Phase 1 backend infra |
| Task 9 | Tasks 5–8 | Route files must exist before registration |
| Task 10 | — | Independent; can start anytime |
| Tasks 11, 12 | Task 10 | Import from types |
| Tasks 13, 14 | Tasks 11, 12 | Import from API clients |
| Task 15 | Tasks 13, 14 | Imports components |
| Task 16 | Task 15 | Final validation pass |

**Recommended build order**: Phase 1 → Phase 2 → Phase 3 → Phase 4 (backend complete + tsc check) → Phase 5 → Phase 6 → Phase 7 → Phase 8.

---

## Testing Plan

### Backend (manual + tsc)

| Test | Spec requirement |
|------|-----------------|
| `POST /api/comments` with empty string → 400 | Edge case 1 |
| `POST /api/comments` with 10,001 chars → 400 | Edge case 2 |
| `POST /api/comments/update` as non-author → 403 | Edge case 3 |
| `POST /api/comments/delete` as non-author → 403 | Edge case 3 |
| `GET /api/comments?cardId=` on PRIVATE board without BoardMember → 404 | Access control |
| Change card priority → `activity` row with `action: "priority_changed"` in DB | US-2 |
| Move card to different list → `action: "card_moved"` row created | Activity event |
| Reorder cards within same list → NO `card_moved` row | Edge case 7 |
| `GET /api/activities?cardId=` returns `user: null` for deleted user ID | Edge case 8 |
| `logActivity` failure → primary operation still returns 200 | Edge case 12 |

### Frontend (visual + build)

| Test | Spec requirement |
|------|-----------------|
| Submit button disabled when TipTap editor is empty | Edge case 1 |
| New comment appears in list after submit (no page reload) | US-1 |
| Edit/Delete only shown to comment author | Edge case 3 |
| Activity feed renders all 13 action types without crash | US-2 |
| `author: null` → renders "Deleted User" with gray avatar | Edge case 8 |
| Rapid submit clicks → only one comment created (button disabled on first click) | Edge case 10 |
| `pnpm --filter web build` passes with zero TS errors | Quality gate |

---

## Gate 2 Checklist

**Architecture:**
- [x] Follows existing architecture: Router → prisma (no manager/service layer — matches current Express pattern)
- [x] Each new route file is self-contained; `logActivity` helper is a pure lib utility
- [x] Components placed in `apps/web/src/components/boards/` — consistent with existing board components
- [x] `resolveCardAccess` pattern is inline in route files — consistent with `labels.ts` pattern

**Task Breakdown:**
- [x] All files to change listed with specific change descriptions
- [x] All new files listed with locations and purposes
- [x] Each task is small (1–2 files, 1 commit)
- [x] Dependencies between tasks are explicit in the sequential table
- [x] Parallel vs sequential marked

**Testing:**
- [x] Backend validation tests planned (empty comment, char limit, auth checks)
- [x] Access control tests planned (PRIVATE board, non-author mutation)
- [x] Activity logging tests planned (correct events, no false card_moved on reorder)
- [x] Frontend visual tests planned (empty state, author-only edit/delete, deleted user fallback)
- [x] All 12 spec edge cases covered in test plan

All items pass. ✅
