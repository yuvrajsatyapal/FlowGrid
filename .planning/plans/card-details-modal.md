# Plan: Card Details Modal

**Spec**: .planning/specs/card-details-modal.md
**Epic**: FlowGrid SaaS (#10b)
**Created**: 2026-06-01
**Status**: draft

---

## Stack

Full-stack — Node.js + Express backend (`apps/api`) + React + Vite frontend (`apps/web`).

---

## Architecture Overview

```
BoardPage (openCardId state)
  └── CardDetailModal (receives CardSummary from boardCards, boardId, workspaceId)
        ├── Title (editable, save on blur)
        ├── Description (TipTap, 800ms debounce save)
        ├── Priority selector (immediate save)
        ├── Due date picker (immediate save)
        ├── Assignee picker (fetch workspace members, immediate save)
        └── Label picker (fetch board labels, toggle + inline create)
```

### Key design decisions

**Initial data**: `CardSummary` already contains `description`, `labels`, `assignee`, `dueDate`, `priority` from the enriched `GET /api/cards`. When the user clicks a card, `boardCards[listId].find(c => c.id === openCardId)` provides the full initial state — **no extra GET needed**.

**Local state in modal**: `localCard: CardSummary` mirrors the card, updated optimistically after each save. `onCardUpdated(updatedCard)` propagates changes back to `BoardPage` → `boardCards` to keep the tile in sync.

**Save indicator state machine**: `idle → saving → saved → idle` (saved auto-reverts after 2s). Error state: `idle → saving → error` (stays until next successful save).

**Debounce for description**: `useRef` timer inline — no custom hook. On unmount, flush pending timer immediately (avoid lost saves on Escape).

**Label operations** (`/add`, `/remove`) live in `cards.ts` alongside other card routes. Board-level label CRUD (list, create) lives in new `labels.ts`.

---

## Component Table

| Component | Type | Purpose |
|-----------|------|---------|
| `CardDetailModal` | React component | Full editing surface for a card |
| `CardItem` | Existing — modified | Add `onCardClick` prop |
| `ListColumn` | Existing — modified | Thread `onCardClick` down to each `CardItem` |
| `BoardPage` | Existing — modified | Own `openCardId` state, render `CardDetailModal` |
| `labelsApi` | API client | `list(boardId)`, `create(boardId, name, color)` |
| `workspacesApi` | Existing — extended | Add `listMembers(workspaceId)` |
| `cardsApi` | Existing — extended | Add `addLabel`, `removeLabel`, extend `update` |

---

## File Locations

### New files

| File | Location | Purpose |
|------|----------|---------|
| `CardDetailModal.tsx` | `apps/web/src/components/boards/` | Card editing modal |
| `labels.ts` (route) | `apps/api/src/routes/` | `GET /api/labels`, `POST /api/labels` |
| `labels.ts` (client) | `apps/web/src/api/` | `labelsApi` — list + create |

### Files to change

| File | What changes | Why |
|------|-------------|-----|
| `apps/api/src/routes/cards.ts` | Extend `update` (dueDate, assigneeId) + add `/labels/add` + `/labels/remove` | Modal needs these mutations |
| `apps/api/src/routes/workspaces.ts` | Add `GET /api/workspaces/members?workspaceId=` | Assignee picker needs workspace member list |
| `apps/api/src/index.ts` | Import + register `labelsRouter` at `/api/labels` | New labels route |
| `apps/web/src/api/cards.ts` | Extend `update()` signature; add `addLabel`, `removeLabel` | Match new backend fields |
| `apps/web/src/api/workspaces.ts` | Add `listMembers(workspaceId)` | Assignee picker |
| `apps/web/src/components/boards/CardItem.tsx` | Add `onCardClick?: (cardId: string) => void` prop | Click-to-open modal |
| `apps/web/src/components/boards/ListColumn.tsx` | Add `onCardClick` prop; pass to each `CardItem` | Thread click handler |
| `apps/web/src/pages/BoardPage.tsx` | Add `openCardId` state; render `<CardDetailModal>` | Owns modal lifecycle |

---

## Tasks by Phase

### Phase 1 — Backend (do Task 1 first; Tasks 2 + 3 can run in parallel after)

| # | Task | Files | Tests |
|---|------|-------|-------|
| 1 | Extend `POST /api/cards/update` to accept `dueDate` (`string \| null`) and `assigneeId` (`string \| null`). Validate: dueDate must be a parseable ISO date string when provided; assigneeId must be an active workspace member when provided. Use enriched `include` on update (already in place). | `apps/api/src/routes/cards.ts` | `tsc --noEmit` |
| 2 | Add `POST /api/cards/labels/add` and `POST /api/cards/labels/remove` to `cards.ts`. Body: `{ cardId, labelId }`. Access check: same board (fetch card → list → board → membership). `add`: upsert `CardLabel` (idempotent). `remove`: hard delete `CardLabel` row. Auth: OWNER \| ADMIN. | `apps/api/src/routes/cards.ts` | `tsc --noEmit` |
| 3 | Create `apps/api/src/routes/labels.ts`. `GET /api/labels?boardId=`: any workspace member, returns all labels for the board. `POST /api/labels`: OWNER \| ADMIN, validates name (non-empty, ≤32 chars) + color (6-digit `#rrggbb`). Register router in `index.ts` at `/api/labels`. | `apps/api/src/routes/labels.ts`, `apps/api/src/index.ts` | `tsc --noEmit` |
| 4 | Add `GET /api/workspaces/members?workspaceId=` to `workspaces.ts`. Auth: any workspace member. Returns `{ members: [{ id, name, email, avatarUrl, role }] }` sorted by `name asc`. | `apps/api/src/routes/workspaces.ts` | `tsc --noEmit` |

**Parallelism**: Task 1 and 2 both touch `cards.ts` — do sequentially (1 → 2). Task 3 and 4 touch different files — can be done in parallel with each other, and in parallel with task 2 if using a worktree.

---

### Phase 2 — Frontend API clients (Tasks 5–8 are all independent; can be parallel)

| # | Task | Files | Tests |
|---|------|-------|-------|
| 5 | Install TipTap packages in `apps/web`. `pnpm --filter web add @tiptap/react @tiptap/pm @tiptap/starter-kit @tiptap/extension-placeholder` | `apps/web/package.json`, `pnpm-lock.yaml` | `vite build` after |
| 6 | Extend `cardsApi.update()` to accept `dueDate?: string \| null` and `assigneeId?: string \| null`. Add `cardsApi.addLabel(cardId, labelId)` and `cardsApi.removeLabel(cardId, labelId)`. | `apps/web/src/api/cards.ts` | `tsc -b` |
| 7 | Create `apps/web/src/api/labels.ts` with `labelsApi.list(boardId)` and `labelsApi.create(boardId, name, color)`. | `apps/web/src/api/labels.ts` | `tsc -b` |
| 8 | Add `workspacesApi.listMembers(workspaceId): Promise<WorkspaceMember[]>` to `workspaces.ts`. Add `WorkspaceMember` interface (id, name, email, avatarUrl, role). | `apps/web/src/api/workspaces.ts` | `tsc -b` |

---

### Phase 3 — Component wiring (sequential: 9 → 10 → 11)

| # | Task | Files | Notes |
|---|------|-------|-------|
| 9 | Add `onCardClick?: (cardId: string) => void` prop to `CardItem`. Attach `onClick={(e) => { e.stopPropagation(); onCardClick?.(card.id) }}` to the inner card div. dnd-kit's activation constraint means a drag does not fire click. | `apps/web/src/components/boards/CardItem.tsx` | |
| 10 | Add `onCardClick?: (cardId: string) => void` prop to `ListColumn`. Pass it to each `<CardItem onCardClick={onCardClick}>`. | `apps/web/src/components/boards/ListColumn.tsx` | |
| 11 | In `BoardPage.tsx`: add `const [openCardId, setOpenCardId] = useState<string \| null>(null)`. Derive `openCard` from `boardCards`. Pass `onCardClick={(id) => setOpenCardId(id)}` to each `<ListColumn>`. Render `{openCard && <CardDetailModal card={openCard} boardId={board.id} workspaceId={board.workspaceId} onClose={() => setOpenCardId(null)} onCardUpdated={(updated) => { /* update boardCards in place */ }} />}`. | `apps/web/src/pages/BoardPage.tsx` | |

---

### Phase 4 — CardDetailModal component (build incrementally in one file; commit each sub-task)

All tasks in this phase touch `apps/web/src/components/boards/CardDetailModal.tsx`.

| # | Task | What to build | Notes |
|---|------|--------------|-------|
| 12 | **Modal shell + title + save indicator** | Overlay + dialog (reuse `CreateBoardModal` structural pattern). `role="dialog" aria-modal aria-labelledby`. Escape key + backdrop click → `onClose` (flush pending description save first). `localCard` state (copy of prop). Save indicator: `saveState: 'idle' \| 'saving' \| 'saved' \| 'error'`. Editable title at top (plain `contenteditable` div or controlled input, save on blur). Two-column layout shell (description left, fields right). | |
| 13 | **Description — TipTap** | Left column: `<EditorContent editor={editor} />`. TipTap config: `StarterKit` + `Placeholder.configure({ placeholder: "Add a description…" })`. Initial content: `card.description ?? ""`. On `update`: clear + set 800ms debounce ref; trigger save after timeout. On modal unmount: clear timeout, fire immediate save if content changed. Inline styles for editor container. | Requires Task 5 (TipTap installed) |
| 14 | **Priority selector** | Right column section. Dropdown/`<select>` showing NONE / LOW / MEDIUM / HIGH / URGENT with priority color dot per option. On change: call `cardsApi.update(id, { priority })`, update `localCard`, call `onCardUpdated`. Show `saveState` transitions. | |
| 15 | **Due date picker** | Right column section. `<input type="date">` (native, no library). When null: shows "No due date" placeholder. `×` clear button sets `dueDate: null`. On change / clear: call `cardsApi.update(id, { dueDate })`, update `localCard`, call `onCardUpdated`. | |
| 16 | **Assignee picker** | Right column section. Fetch `workspacesApi.listMembers(workspaceId)` on mount (one-time, store in local state). Render as a `<select>` or inline list popover with avatar + name. "Unassigned" option (value = `""`). On change: call `cardsApi.update(id, { assigneeId: value || null })`, update `localCard`, call `onCardUpdated`. | |
| 17 | **Label picker + inline create** | Right column section. Fetch `labelsApi.list(boardId)` on mount. Show assigned labels (color dot + name + × to remove). "+ Add label" button opens inline popover: list of all board labels with checkbox toggle (calls `addLabel`/`removeLabel`), + "Create label" sub-form (name input + 8 color swatches, on submit calls `labelsApi.create` then immediately calls `addLabel` on the new label). Update `localCard.labels` optimistically after each toggle/create. Call `onCardUpdated` after each change. | |

---

### Phase 5 — Integration + build check

| # | Task | Command |
|---|------|---------|
| 18 | Run `pnpm --filter api exec tsc --noEmit` and `pnpm --filter web run build`. Fix any errors. | Both must pass clean before review. |

---

## Parallel vs Sequential Summary

| Group | Tasks | Constraint |
|-------|-------|-----------|
| Sequential | 1 → 2 | Both touch `cards.ts` |
| Parallel | 3 + 4 | Different files; independent of 1+2 |
| Parallel | 5 + 6 + 7 + 8 | All independent frontend tasks |
| Sequential | 9 → 10 → 11 | Each depends on the previous prop addition |
| Sequential | 12 → 13 → 14 → 15 → 16 → 17 | All build the same `CardDetailModal.tsx` incrementally |
| Parallel (Phase 1 vs Phase 2) | 1–4 and 5–8 | Frontend clients don't depend on backend compiling |

---

## `onCardUpdated` implementation in `BoardPage.tsx`

```tsx
function handleCardUpdated(updated: CardSummary) {
  setBoardCards((prev) => {
    const listCards = prev[updated.listId]
    if (!listCards) return prev
    return {
      ...prev,
      [updated.listId]: listCards.map((c) => (c.id === updated.id ? updated : c)),
    }
  })
}
```

---

## Label color palette (8 swatches, OKLCH)

```ts
const LABEL_COLORS = [
  { name: "Red",    value: "#ef4444" },
  { name: "Orange", value: "#f97316" },
  { name: "Amber",  value: "#f59e0b" },
  { name: "Green",  value: "#10b981" },
  { name: "Blue",   value: "#3b82f6" },
  { name: "Indigo", value: "#6366f1" },
  { name: "Purple", value: "#a855f7" },
  { name: "Slate",  value: "#64748b" },
]
```

Reuse `COVER_COLORS` visual pattern from `CreateBoardModal` — 28px circles, selected state = ring.

---

## Testing Plan

| Test | Traces to spec |
|------|---------------|
| Click card → modal opens with correct title, description, priority, dueDate, assignee, labels | Happy path |
| Edit title, blur → tile title updates | Auto-save: title on blur |
| Type in description, wait 800ms → "Saved" appears, description persists on re-open | Auto-save: description debounce |
| Type in description, immediately press Escape → save fires before modal closes | Edge case: flush on unmount |
| Change priority → tile priority dot updates | Immediate save |
| Set due date → tile shows date chip | Immediate save |
| Clear due date → tile date chip disappears | Edge case: null dueDate |
| Assign member → tile shows avatar | Immediate save |
| Unassign → avatar disappears from tile | Edge case: null assigneeId |
| Toggle label on → chip appears on tile | Label add |
| Toggle label off → chip disappears | Label remove |
| Create new label inline → appears in list, assigned to card | Hybrid label creation |
| Board with 0 labels → label section shows "+ Create label" CTA | Edge case |
| Non-admin opens modal — update returns 403 → error indicator shown | Auth edge case |
| Network save fails → "Failed to save" indicator, field value retained | Save error |
| `tsc --noEmit` clean | Type safety |
| `vite build` clean | No dead imports or type errors |

---

## Gate 2 Checklist

- [x] Follows layered architecture: controller (`cards.ts`) → no manager needed (thin enough) → Prisma
- [x] Each layer only calls the layer below
- [x] All components in correct directories (`components/boards/`, `api/`, `routes/`)
- [x] All files to change are listed
- [x] All new files listed with locations
- [x] Each task touches ≤ 3 files
- [x] Dependencies between tasks are explicit
- [x] Parallel vs sequential marked
- [x] No GET /api/cards/one needed — initial data from boardCards state
- [x] TipTap install is its own task (no silent dependency)
- [x] Data layer: Prisma queries defined inline in routes (project pattern — no separate manager/repo)
- [x] Business logic: validation in route handlers (project pattern)
- [x] API: new endpoints defined with method + path + auth + response shape
- [x] UI tests: 17 test scenarios covering happy path, save states, and edge cases
- [x] All spec edge cases covered in test plan (flush on unmount, null fields, 403, network error)
