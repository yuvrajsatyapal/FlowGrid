# FlowGrid — Handoff Document
**Date**: 2026-06-01 | **Repo**: `/Users/yuvrajsatyapal/Desktop/FlowGrid` | **Branch**: `main`
---
## Feature #9 — DONE ✅

Cards / Tasks CRUD + DnD merged to main. All worktrees cleaned up.

### What was shipped
- `apps/api/src/routes/cards.ts` — 6 Express routes: POST /cards, GET /cards, POST /cards/update, POST /cards/reorder, POST /cards/move, POST /cards/delete
- `apps/web/src/api/cards.ts` — `cardsApi` client (6 methods)
- `apps/web/src/components/boards/CardItem.tsx` — `useSortable` + priority color dot + overlay prop
- `apps/web/src/components/boards/CreateCardInline.tsx` — textarea expand/collapse, error feedback, saving guard
- `apps/web/src/components/boards/ListColumn.tsx` — `SortableContext` + `useDroppable` + cards + CreateCardInline
- `apps/web/src/pages/BoardPage.tsx` — `DndContext` + `boardCards` state + `onDragEnd` (same/cross-list) + `DragOverlay`
- `@dnd-kit/core`, `@dnd-kit/sortable`, `@dnd-kit/utilities` installed in `apps/web`

### Key decisions made during review
- `/move` uses **interactive** `$transaction(async tx => { ... })` (NOT batch array) — sequential listId update THEN position updates ensures WHERE listId=targetListId is satisfied for the moved card
- `cardIds` input validated for: non-empty strings, membership in correct list, **no duplicates**
- `CreateCardInline.handleSave` has `if (saving) return` guard to prevent onBlur double-submit
- Error displayed inline in `CreateCardInline` when create fails (user keeps form open to retry)

---
## NEXT: Feature #10 — Card Details

**Epic entry**: Card Details (rich text, due dates, labels, priority UI)
**Depends on**: #9 (done)

### What #10 needs to build
- Card detail modal/drawer — clicking a card opens full detail view
- Rich text description (likely Tiptap or similar)
- Due date picker
- Priority selector (NONE/LOW/MEDIUM/HIGH/URGENT — enum exists, CardItem shows dot but no selector)
- Label CRUD (Label model exists in schema)
- Assignee picker (assigneeId exists on Card, User model exists)
- Cover color picker (coverColor exists on Card)

### To start Feature #10
```
/spartan:spec "card details modal — rich text, due date, priority, labels, assignee"
```
Then plan + build.

---
## Architecture context (unchanged from Feature #9 handoff)

See full handoff above. Key points:
- `boardCards: Record<listId, CardSummary[]>` lives in `BoardPage` — pass down to card detail modal
- `CardItem` already accepts `card: CardSummary` — clicking it should `onCardClick(card)` → opens modal
- `cardsApi.update(id, { title?, description?, priority? })` is ready
- No label/assignee API endpoints yet (Feature #10 will add them)
- Backend stack: Node.js + Express + Prisma (NOT Micronaut — Kotlin rules don't apply here)
- No path params — `?id=xxx` only, POST for all mutations

### Current routes on main
```
GET  /api/health
GET  /api/auth/google, /api/auth/google/callback
POST /api/auth/refresh, /api/auth/logout
PATCH /api/users/me, GET /api/users/me
POST /api/workspaces, GET /api/workspaces, GET /api/workspaces/one?id=
POST /api/workspaces/update?id=, /api/workspaces/delete?id=
POST /api/boards, GET /api/boards?workspaceId=, GET /api/boards/one?id=
POST /api/boards/update?id=, /api/boards/delete?id=
POST /api/lists, GET /api/lists?boardId=, POST /api/lists/update?id=
POST /api/lists/reorder, /api/lists/delete?id=
POST /api/cards, GET /api/cards?listId=
POST /api/cards/update?id=, /api/cards/reorder, /api/cards/move, /api/cards/delete?id=
```

### Git log (last 5)
```
096f016 chore(epic): mark Feature #9 done
af6c7e5 fix(cards): address review round 2 — duplicate cardIds, interactive move tx, onBlur guard
b9db9fc fix(cards): address review round 1 — dead ternary, null assertion, cardId validation, create error feedback
e743922 feat(cards): cards CRUD + dnd-kit drag and drop
c4f1674 merge feature/lists-crud into main
```
