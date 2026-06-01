# Spec: Card Details Modal

**Created**: 2026-06-01
**Status**: draft
**Author**: team
**Epic**: FlowGrid SaaS (#10b — follows #10a Card Face)
**Depends on**: Feature #10a (done), Feature #9 (done)

---

## Problem

The card tile (scan layer) shows what a card is at a glance. There is no way to act on it — no way to write a description, change the due date, assign someone, or manage labels without a direct API call. Every team member who needs to edit card details is blocked. The "work layer" of the card does not exist.

## Goal

Open a modal when a user clicks any card on the board. The modal is the complete editing surface for a card's content: title, description (rich text), priority, due date, assignee, and labels. All changes auto-save. The modal does not break the board — the tile beneath it stays in place.

---

## User Stories

**As a team member**, I want to click a card and immediately edit its description in a rich-text editor so I can capture context, acceptance criteria, or notes without leaving the board.

**As a board admin**, I want to assign a due date and assignee directly from the card modal so I can triage cards during a planning session without switching tools.

**As a contributor**, I want to add or remove labels on a card — and create a new label inline if one doesn't exist — so I can categorize work without navigating away to a settings page.

---

## Requirements

### Must Have
- Click on any `CardItem` opens the modal for that card
- Modal displays and allows editing: title, description (TipTap), priority, due date, assignee, labels
- **Auto-save**: description debounced 800ms after last keystroke; all other fields (priority, due date, assignee, label add/remove) save immediately on change
- Label management — hybrid:
  - Assign/unassign existing board labels from within the modal
  - Create a new label inline (name + color from a preset palette) — creates a `Label` record for the board
  - Delete/rename labels: out of scope (board settings, future)
- Assignee picker: shows workspace members (name + avatar). Supports selecting or clearing the assignee.
- Modal closes on Escape, on clicking the backdrop, or on an explicit close button
- After any save, the card tile on the board updates to reflect the change (optimistic or after re-fetch)
- All styling via Hallmark OKLCH tokens — no Tailwind class names

### Nice to Have
- Keyboard shortcut to open card modal (e.g. clicking card with Enter key from keyboard nav)
- "Copy card link" button (deferred — no routing per card yet)

### Out of Scope
- Comments and activity feed (Feature #11)
- Attachments (Feature #12)
- Cover image / cover color picker
- Sub-tasks or checklists
- Card archiving / moving to another list from the modal
- Label delete or rename from the modal
- Multi-assignee (schema is single `assigneeId`)
- Real-time collaborative editing (Feature #13)

---

## Save Behavior

| Field | Save trigger | Debounce |
|-------|-------------|----------|
| Title | On blur | None (immediate on blur) |
| Description | On content change | 800ms |
| Priority | On selection | Immediate |
| Due date | On date pick / clear | Immediate |
| Assignee | On selection / clear | Immediate |
| Label assign | On toggle | Immediate |
| Label create | On form submit (inline) | None |

A visible **save indicator** ("Saving…" → "Saved") appears in the modal header during and after async writes. If a save fails, show an inline error and allow retry.

Pending debounced saves must flush when the modal closes — do not lose in-flight description changes on Escape.

---

## Data Model

No schema migrations required. All necessary models and columns exist:

| Model | Fields used | Already exists |
|-------|------------|----------------|
| `Card` | `title`, `description`, `priority`, `dueDate`, `assigneeId` | ✅ |
| `CardLabel` | `cardId`, `labelId` | ✅ |
| `Label` | `boardId`, `name`, `color` | ✅ |
| `User` | `id`, `name`, `avatarUrl` | ✅ |
| `WorkspaceMember` | `workspaceId`, `userId`, `role` | ✅ |

---

## API Changes

### Extended: `POST /api/cards/update?id=`

Currently accepts `title`, `description`, `priority`. Extend to also accept:
- `dueDate`: `string | null` (ISO 8601) — `null` clears the due date
- `assigneeId`: `string | null` — `null` unassigns

Validation:
- `dueDate`: must be a valid ISO date string when provided as a string
- `assigneeId`: must be a valid user ID that is a member of the workspace when provided

Response shape: same enriched format as `GET /api/cards` (assignee object + labels array already in place from #10a).

---

### New: `GET /api/labels?boardId=`

Returns all labels for a board.

**Auth**: workspace member (any role). PRIVATE board requires board membership.

**Response**:
```json
{
  "labels": [
    { "id": "clx...", "name": "Design", "color": "#6366f1" },
    { "id": "clx...", "name": "Frontend", "color": "#10b981" }
  ]
}
```

---

### New: `POST /api/labels`

Create a new label for a board. (OWNER | ADMIN only — board admins define labels.)

**Body**:
```json
{ "boardId": "clx...", "name": "Bug", "color": "#ef4444" }
```

Validation:
- `name`: non-empty string, max 32 chars
- `color`: valid 6-digit hex (`#rrggbb`)
- `boardId`: board the requester is OWNER or ADMIN of

**Response**:
```json
{ "label": { "id": "clx...", "name": "Bug", "color": "#ef4444" } }
```

---

### New: `POST /api/cards/labels/add`

Assign a label to a card.

**Body**: `{ "cardId": "clx...", "labelId": "clx..." }`

Validation: label must belong to the same board as the card. Creates a `CardLabel` row. If the pair already exists, no-op (return 200).

Auth: OWNER | ADMIN.

**Response**: `{ "success": true }`

---

### New: `POST /api/cards/labels/remove`

Unassign a label from a card.

**Body**: `{ "cardId": "clx...", "labelId": "clx..." }`

Soft-deletes or hard-deletes the `CardLabel` row. (`CardLabel` has no `deletedAt` — hard delete is correct here.)

Auth: OWNER | ADMIN.

**Response**: `{ "success": true }`

---

### New: `GET /api/workspaces/members?workspaceId=`

List workspace members for the assignee picker.

**Auth**: any workspace member.

**Response**:
```json
{
  "members": [
    {
      "id": "clx...",
      "name": "Yuvraj Satyapal",
      "email": "yuvraj@example.com",
      "avatarUrl": "https://...",
      "role": "OWNER"
    }
  ]
}
```

Returns only non-deleted workspace members. Sorted by name.

---

## UI Changes

### New component: `CardDetailModal.tsx`

Location: `apps/web/src/components/boards/CardDetailModal.tsx`

**Trigger**: clicking a `CardItem` (not the drag handle — same element, but dnd-kit distinguishes click from drag via pointer delta threshold).

**Modal structure** (top-to-bottom):

```
┌─ modal overlay ──────────────────────────────────────────────────┐
│ ┌─ modal panel (max-width: 640px, full-height on mobile) ───────┐ │
│ │                                                                │ │
│ │  ● [Title — editable h2 inline]                [✕] [Saved ✓] │ │
│ │  ─────────────────────────────────────────────────────────── │ │
│ │  [Left column — 2/3 width]     [Right column — 1/3 width]    │ │
│ │                                                               │ │
│ │  Description                   Priority                       │ │
│ │  ┌──────────────────────┐      [● NONE ▾]                     │ │
│ │  │ TipTap rich text     │                                     │ │
│ │  │ editor               │      Due Date                       │ │
│ │  │                      │      [📅 Jun 15, 2026 ▾]            │ │
│ │  └──────────────────────┘                                     │ │
│ │                                Assignee                       │ │
│ │                                [○ Unassigned ▾]               │ │
│ │                                                               │ │
│ │                                Labels                         │ │
│ │                                [● Design] [● FE] [+ Add]      │ │
│ │                                                               │ │
│ └───────────────────────────────────────────────────────────────┘ │
└──────────────────────────────────────────────────────────────────┘
```

**Title**: editable plain-text `<h2>` or `contenteditable` element at the top. Saves on blur.

**Priority selector**: dropdown/popover showing NONE / LOW / MEDIUM / HIGH / URGENT with priority color dot per option.

**Due date**: native `<input type="date">` or a minimal date picker. Shows formatted date when set; shows "No due date" placeholder when null. Clearable via an `×` button.

**Assignee picker**: popover showing workspace member list (avatar + name). Selected state shows current assignee. "Unassign" option always available.

**Labels panel**:
- Shows all labels currently assigned to the card (color dot + name, removable via ×)
- "+ Add label" button opens a popover:
  - List of existing board labels with checkbox toggle (add/remove)
  - "Create label" inline form: text input for name + color picker (8 preset OKLCH swatches). Submit → creates label + assigns it.

**Save indicator** (top-right of modal, near close button):
- Idle: nothing
- Saving: `"Saving…"` in `var(--color-ink-3)`, `var(--text-xs)`
- Saved: `"Saved"` for 2 seconds then fades
- Error: `"Failed to save"` in `var(--color-error)` with a retry affordance

---

### Modified: `CardItem.tsx`

Add `onClick` handler that calls a board-level `onCardClick(cardId)` prop.

```tsx
// New prop
interface Props {
  card: CardSummary
  overlay?: boolean
  onCardClick?: (cardId: string) => void  // new
}
```

The dnd-kit drag threshold means a short click fires `onClick`; a drag does not. No extra logic needed — dnd-kit handles this naturally via `activationConstraint` (distance or delay).

---

### Modified: `BoardPage.tsx`

Manages modal open state:

```tsx
const [openCardId, setOpenCardId] = useState<string | null>(null)

// Pass to ListColumn → CardItem
onCardClick={(id) => setOpenCardId(id)}

// Render modal when open
{openCardId && (
  <CardDetailModal
    cardId={openCardId}
    boardId={board.id}
    workspaceId={board.workspaceId}
    onClose={() => setOpenCardId(null)}
    onCardUpdated={(updated) => updateBoardCard(updated)}
  />
)}
```

`onCardUpdated` updates the `boardCards` state in-place — no full board refetch needed.

---

### Modified: `ListColumn.tsx`

Passes `onCardClick` down to each `CardItem`. No other changes.

---

### New API clients

| File | Exports |
|------|---------|
| `apps/web/src/api/labels.ts` | `labelsApi.list(boardId)`, `labelsApi.create(boardId, name, color)` |
| `apps/web/src/api/cards.ts` | Extend `cardsApi.update()` to accept `dueDate`, `assigneeId`; add `cardsApi.addLabel(cardId, labelId)`, `cardsApi.removeLabel(cardId, labelId)` |
| `apps/web/src/api/workspaces.ts` | Add `workspacesApi.listMembers(workspaceId)` |

---

### TipTap dependency

Install in `apps/web`:
```
@tiptap/react
@tiptap/pm
@tiptap/starter-kit
@tiptap/extension-placeholder
```

Starter-kit covers: bold, italic, headings, bullet list, ordered list, blockquote, code block, horizontal rule.
Placeholder extension shows "Add a description…" when the field is empty.

No custom extensions for #10b.

---

## Edge Cases

| Case | Behavior |
|------|----------|
| Modal closes while debounced save is pending | Flush the pending save before unmounting. Show "Saving…" until complete. |
| Save fails (network error / 500) | Show "Failed to save" indicator. Do not revert the field — user can retry or close and accept loss. |
| Card has no description | TipTap shows placeholder "Add a description…". Initial DB value is `null` — first keystroke triggers first save. |
| Due date cleared | Send `dueDate: null` to `POST /api/cards/update`. Clears the field in DB. |
| Assignee cleared | Send `assigneeId: null`. |
| User tries to create a label with a duplicate name | Allow it — same name, different color is valid. No uniqueness constraint on `name` within a board. |
| Non-admin tries to create a label | Backend returns 403. Show toast: "Only owners and admins can create labels." |
| Non-admin tries to assign/remove label | Same — 403, show toast. |
| Workspace has only 1 member (solo use) | Assignee picker shows only the current user + "Unassign". Works fine. |
| Card is being dragged when modal would open | Click vs drag is disambiguated by dnd-kit's activation constraint. Modal does not open during drag. |
| Board has 0 labels | Label panel shows "No labels yet." + "+ Create label" CTA. |
| TipTap receives very long description (>10k chars) | Renders and saves normally. No artificial limit imposed at #10b. |
| Modal opened, card deleted by another user (future #13 concern) | In #10b: not handled — no real-time. On save, 404 response → show "This card no longer exists", close modal. |
| Concurrent save conflict (two browser tabs) | In #10b: last write wins. Real-time conflict resolution is Feature #13. |
| `assigneeId` refers to a user who has since left the workspace | Backend validation in update route catches this. Frontend shows an error toast. |

---

## Testing Criteria

### Happy Path
- Click card → modal opens with card's current data pre-populated
- Edit title, blur → title updates in modal header and card tile
- Type in description → after 800ms, "Saved" indicator appears
- Change priority → tile priority dot updates immediately
- Set due date → tile shows new due date chip
- Assign workspace member → tile shows their avatar
- Toggle existing label on → label chip appears on tile
- Toggle existing label off → label chip disappears from tile
- Create new label inline (name + color) → label created, immediately assigned to card
- Press Escape → modal closes, no unsaved description lost (flush fires)
- Click backdrop → same as Escape

### Edge Cases
- Close modal immediately after typing in description → save flushes before close
- Non-admin opens modal → all fields disabled with a "View only" notice, or fields are not rendered as editable (TBD at design phase)
- Clear due date → tile date chip disappears
- Unassign user → avatar disappears from tile
- 5 labels assigned → label panel shows all 5 (no overflow truncation inside modal)

### Regression
- Drag and drop still works — clicking card opens modal, dragging card still reorders
- `CreateCardInline` still works
- `BoardPage` boardCards state stays consistent after modal saves

---

## Dependencies

| Dependency | Status |
|------------|--------|
| Feature #9 — Cards CRUD + DnD | Done |
| Feature #10a — Card Face + enriched API | Done |
| `Card`, `Label`, `CardLabel`, `User`, `WorkspaceMember` models | Exist |
| Hallmark tokens | Wired |
| `@tiptap/*` packages | Not yet installed — required |
| No schema migration | Confirmed |
