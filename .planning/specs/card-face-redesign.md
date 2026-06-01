# Spec: Card Face Redesign (Enriched Compact Tile)

**Created**: 2026-06-01
**Status**: deprecated
**Deprecated**: 2026-06-01
**Replaced by**: `.planning/specs/card-face.md` — Card Face — Compact Kanban Board Tile (authoritative final spec)
**Author**: team
**Epic**: FlowGrid SaaS (#10a — precedes card details modal)

---

## Problem

Cards on the kanban board display only a title and a priority color dot. A user scanning a dense board cannot determine assignee, urgency, or labels without clicking into every card. This forces extra clicks and breaks the "at-a-glance" promise of a kanban board.

## Goal

Redesign the compact card face to surface title, assignee, due date, labels, and priority as a single scannable unit — in under one second of reading — while keeping cards compact and draggable. No structural layout changes to the board itself.

---

## User Stories

**As a team member** scanning a dense kanban board, I want to see who owns a card, when it's due, and what labels it carries — without clicking — so I can triage work and spot blockers in seconds.

**As a board admin** reviewing sprint health, I want overdue cards to be visually prominent (red) and nearly-due cards flagged (amber) so I can intervene before deadlines slip.

---

## Requirements

### Must Have
- Title rendered with 2-line clamp; full title shown on hover tooltip (desktop)
- Priority dot (existing colors: NONE=none, LOW=blue, MEDIUM=yellow, HIGH=orange, URGENT=red)
- Due date chip — shown only if `dueDate` is set:
  - Overdue (`dueDate < today`): red text, optional ⚠ icon
  - Due within 48 hours: amber/yellow text
  - Otherwise: muted ink color
- Assignee avatar — shown only if `assigneeId` is set:
  - Image if `avatarUrl` exists
  - Fallback: initials in deterministically colored circle (hash of userId/name → hue)
- Label chips — shown only if labels exist:
  - Display max 3; if 4+ labels assigned, show first 2 + "+N" overflow chip
  - Each chip: small colored dot or pill with label name
- Fields that are null/empty are silently omitted (no placeholder, no empty row)
- Card remains draggable; visual weight must not grow to the point it disrupts dense boards
- All styling via Hallmark OKLCH custom properties — no Tailwind class names in JSX

### Nice to Have
- Mobile long-press to reveal full title (defer to later)
- Comment count / attachment count indicator (out of scope here — no schema join needed yet)

### Out of Scope
- Click-to-open card details modal (separate feature)
- Blocked / dependency status (not in schema)
- Comment count, attachment count
- Inline editing on the card face
- Board-level filtering or grouping by label/assignee

---

## Data Model

No schema migrations required. The `Card`, `User`, `Label`, and `CardLabel` models already exist.

**CardLabel join table** (existing):
```prisma
model CardLabel {
  id      String @id @default(cuid())
  cardId  String
  labelId String
  createdAt DateTime @default(now()) @db.Timestamptz()
}

model Label {
  id      String @id @default(cuid())
  boardId String
  name    String
  color   String  // hex or CSS color string
  ...
}
```

No new tables or columns needed.

---

## API Changes

### Enrich `GET /api/cards?listId=xxx`

Currently returns flat `Card` fields only. Must be extended to include nested assignee and labels.

**New response shape per card:**
```json
{
  "id": "clx...",
  "listId": "clx...",
  "title": "Design landing page",
  "description": null,
  "position": "00000001",
  "priority": "HIGH",
  "dueDate": "2026-06-03T00:00:00.000Z",
  "assigneeId": "clx...",
  "assignee": {
    "id": "clx...",
    "name": "Yuvraj Satyapal",
    "avatarUrl": "https://..."
  },
  "labels": [
    { "id": "clx...", "name": "Design", "color": "#6366f1" },
    { "id": "clx...", "name": "Frontend", "color": "#10b981" }
  ],
  "coverColor": null,
  "createdAt": "...",
  "updatedAt": "...",
  "deletedAt": null
}
```

- `assignee` is `null` when `assigneeId` is null
- `labels` is `[]` when no labels are assigned

**Backend changes (`apps/api/src/routes/cards.ts`):**
- In `GET /api/cards`, use `prisma.card.findMany` with `include: { cardLabels: { include: { label: true } } }` and a separate `prisma.user.findMany` lookup (or `include` via a relation) for the assignee
- Extend `formatCard()` to accept and embed the enriched fields
- No new routes; no breaking change to existing callers

**Frontend changes (`apps/web/src/api/cards.ts`):**
- Extend `CardSummary` interface:
```typescript
export interface CardAssignee {
  id: string
  name: string | null
  avatarUrl: string | null
}

export interface CardLabel {
  id: string
  name: string
  color: string
}

export interface CardSummary {
  // ... existing fields unchanged ...
  assignee: CardAssignee | null   // new
  labels: CardLabel[]             // new
}
```

---

## UI Changes

### Card Layout

```
┌─────────────────────────────────────┐
│ ● [Title — 2-line clamp]            │  ← priority dot + title
│                                     │
│ [🏷 Design] [🏷 FE] [+1]  📅 Jun 3  │  ← labels row + due date
│                                    👤│  ← assignee avatar (bottom-right)
└─────────────────────────────────────┘
```

- **Row 1**: priority dot (left, vertically centered to first line) + title (flex-1, 2-line clamp)
- **Row 2** (only if any of these exist): label chips left-aligned, due date chip right-aligned, assignee avatar far-right or end of row 2
- Row 2 is omitted entirely if card has no assignee, no due date, and no labels

### Priority Dot
| Priority | Color |
|----------|-------|
| NONE | hidden |
| LOW | `oklch(0.62 0.17 237)` blue |
| MEDIUM | `oklch(0.77 0.15 85)` yellow |
| HIGH | `oklch(0.67 0.19 48)` orange |
| URGENT | `oklch(0.59 0.22 27)` red |

### Due Date Chip
- Font: `var(--text-xs)`, icon: `📅` or calendar SVG
- Overdue: `color: oklch(var(--color-error))`, optional ⚠ prefix
- Due ≤ 48h: amber — `oklch(0.77 0.15 85)`
- Otherwise: `oklch(var(--color-ink-3))`

### Assignee Avatar
- Size: 20×20px, `border-radius: 50%`
- Image: `<img src={avatarUrl} />` with `alt={name}`
- Fallback initials: first letter of first + last name; background = `hsl(hash(userId) * 137.5, 60%, 55%)`

### Label Chips
- Small pills: colored left-border dot (4px) + label name in `var(--text-xs)`
- OR: solid colored dot (8px circle) only, no text — to save space on dense cards
- Max 3; if 4+: show 2 + "+N" chip in `var(--color-ink-3)`
- Never overflow the card width horizontally

### Files to Change
| File | Change |
|------|--------|
| `apps/api/src/routes/cards.ts` | Enrich `GET /api/cards` query + extend `formatCard()` |
| `apps/web/src/api/cards.ts` | Add `CardAssignee`, `CardLabel` types; extend `CardSummary` |
| `apps/web/src/components/boards/CardItem.tsx` | Full redesign with new layout |

`BoardPage.tsx`, `ListColumn.tsx`, `CreateCardInline.tsx` — no changes needed. Card state already flows through `boardCards[listId]`.

---

## Edge Cases

| Case | Behavior |
|------|----------|
| Title ≥ 200 chars | Clamp at 2 lines (`-webkit-line-clamp: 2`); show full on hover (`title` attribute) |
| No assignee | Avatar row element is not rendered |
| No due date | Due date chip is not rendered |
| No labels | Label area is not rendered |
| All three absent | Row 2 is not rendered; card is title + priority dot only |
| Overdue by days | Red text on due date chip |
| Due within 48 hours | Amber text on due date chip |
| 4+ labels assigned | First 2 shown + "+N" chip (e.g. "+2") |
| Assignee has no avatarUrl | Initials in deterministically colored circle |
| Assignee has no name | Single initial "?" or use email first char |
| Label color is missing/invalid | Fall back to `var(--color-ink-3)` |
| Card is being dragged (isDragging) | Opacity 0.35, no layout change |
| DragOverlay clone | `overlay` prop true: no transform, shadow elevated, full opacity |

---

## Testing Criteria

### Happy Path
- Card with title + HIGH priority + assignee + due date + 2 labels renders all fields
- Due date tomorrow renders in amber
- Due date yesterday renders in red
- Assignee avatar image renders when `avatarUrl` is set
- Labels render as colored chips

### Edge Cases
- Card with only a title + NONE priority: single row, no dot, no row 2
- Card with 5 labels: shows 2 + "+3" chip
- Card with null `avatarUrl`: initials circle with deterministic color
- Title of 250 chars: visible text ends at 2 lines, no overflow
- Hover on 250-char title shows `title` attribute tooltip (browser native)
- Card with dueDate = null: no date chip rendered

### Regression
- Drag and drop still works (cards still draggable, SortableContext not broken)
- Create card inline still works
- Board with 20+ cards still scrollable and not sluggish

---

## Dependencies

- Feature #9 (Cards CRUD + DnD) — **DONE** (merged to main)
- `Label` and `CardLabel` models exist in schema — no migration needed
- Prisma client already generated
- Hallmark design tokens already wired in CSS (`--color-error`, `--color-ink-3`, `--radius-badge`, etc.)
